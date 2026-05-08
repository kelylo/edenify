import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Task } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function requestMediaPermission(): Promise<boolean> {
  // Check if permissions API is available
  if (!navigator.permissions || !navigator.permissions.query) {
    // Permissions API not available, assume granted and return true
    return true;
  }

  try {
    // Try to query microphone/media permissions
    // Note: actual file upload doesn't need microphone, but we're indicating media access
    const permissionStatus = await navigator.permissions.query({ name: 'microphone' as any });
    
    if (permissionStatus.state === 'granted') {
      return true;
    }

    if (permissionStatus.state === 'denied') {
      return false;
    }

    // For 'prompt' state, return true to allow user to grant on first use
    return true;
  } catch {
    // If permission check fails, assume access is available
    return true;
  }
}

export function formatXP(xp: number, maxXp: number) {
  return `${xp.toLocaleString()} / ${maxXp.toLocaleString()}`;
}

export function getProgress(xp: number, maxXp: number) {
  return Math.min(100, Math.max(0, (xp / maxXp) * 100));
}

export function getTimeOfDay(): 'morning' | 'midday' | 'evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'midday';
  return 'evening';
}

export interface DailyTaskStats {
  completed: number;
  total: number;
  percentage: number;
}

export function getDailyTaskStats(tasks: Task[], dailyTaskGoal: number): DailyTaskStats {
  const todaysTasks = tasks.filter((t) => isTaskScheduledForToday(t));

  const completed = todaysTasks.filter((t) => isTaskCompletedForToday(t)).length;
  const total = Math.min(todaysTasks.length, dailyTaskGoal);
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { completed, total, percentage };
}

export function parseTaskDueDate(task: Task): Date | null {
  const normalized = task.time.trim().replace(/\s+/g, ' ').toUpperCase();
  const match12 = normalized.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
  const match24 = normalized.match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/);

  let hours = 0;
  let minutes = 0;

  if (match12) {
    hours = Number(match12[1]);
    minutes = Number(match12[2]);
    const period = match12[3];
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
  } else if (match24) {
    hours = Number(match24[1]);
    minutes = Number(match24[2]);
  } else {
    return null;
  }

  const now = new Date();
  const baseDate = new Date(task.date || now.toISOString());
  if (Number.isNaN(baseDate.getTime())) return null;

  if (task.repeat === 'daily') {
    const due = new Date(now);
    due.setHours(hours, minutes, 0, 0);
    return due;
  }

  if (task.repeat === 'weekly') {
    const due = new Date(now);
    const anchorWeekday = baseDate.getDay();
    const dayDelta = (anchorWeekday - due.getDay() + 7) % 7;
    due.setDate(due.getDate() + dayDelta);
    due.setHours(hours, minutes, 0, 0);
    return due;
  }

  baseDate.setHours(hours, minutes, 0, 0);
  return baseDate;
}

export function isTaskScheduledForToday(task: Task, now = new Date()): boolean {
  const today = now.toDateString();

  if (task.repeat === 'daily') {
    return true;
  }

  const baseDate = new Date(task.date || now.toISOString());
  if (Number.isNaN(baseDate.getTime())) return false;

  if (task.repeat === 'weekly') {
    return baseDate.getDay() === now.getDay();
  }

  return baseDate.toDateString() === today;
}

export function isTaskCompletedForToday(task: Task, now = new Date()): boolean {
  if (!task.completed) return false;
  if (!isTaskScheduledForToday(task, now)) return false;

  const taskDate = new Date(task.date || now.toISOString());
  if (Number.isNaN(taskDate.getTime())) return false;

  if (task.repeat === 'daily') {
    return taskDate.toDateString() === now.toDateString();
  }

  if (task.repeat === 'weekly') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfTaskDate = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate()).getTime();
    const diffDays = Math.floor((startOfToday - startOfTaskDate) / (24 * 60 * 60 * 1000));
    return diffDays >= 0 && diffDays < 7 && taskDate.getDay() === now.getDay();
  }

  return taskDate.toDateString() === now.toDateString();
}

export function isTaskFailedByDuration(task: Task): boolean {
  if (!task.durationStartedAt || !task.estimatedDuration || task.completed) return false;
  const started = new Date(task.durationStartedAt).getTime();
  const nowTime = Date.now();
  const durationMs = task.estimatedDuration * 60 * 1000;
  return (nowTime - started > durationMs);
}

export function highlightSearch(text: string, query: string): (string | { match: string })[] {
  if (!query) return [text];
  const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part)
      ? { match: part }
      : part
  );
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
