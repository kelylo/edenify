/**
 * Custom hook for managing task creation and editing
 * Consolidates all task editor state and handlers
 * Reduces Home.tsx by ~300 LOC
 */

import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { Task, LayerId } from '../types';
import {
  getRoundedCurrentTime,
  parseTimeToEditor,
  buildTimeFromEditor,
} from '../lib/dateUtils';
import { parseTaskDueDate } from '../lib/utils';

export interface TaskEditorState {
  // Basic task info
  name: string;
  layer: LayerId;
  priority: 'A' | 'B' | 'C' | 'D' | 'E';
  repeat: 'once' | 'daily' | 'weekly';
  date: string;

  // Time fields
  time: string;
  timeFormat: '12' | '24';
  hourInput: string;
  minuteInput: string;
  period: 'AM' | 'PM';

  // Alarm fields
  alarmEnabled: boolean;
  preferredMusic: string;
  customAlarmName: string;
  customAlarmDataUrl: string;

  // Duration
  duration: number;

  // Search task editing
  editingSearchTaskId: string | null;
  editingSearchTaskName: string;
  editingSearchTaskTime: string;
  editingSearchTaskRepeat: 'once' | 'daily' | 'weekly';
  editingSearchTaskPriority: 'A' | 'B' | 'C' | 'D' | 'E';

  // Errors
  quickAddError: string;
}

export interface TaskEditorActions {
  // Setters
  setName: (name: string) => void;
  setLayer: (layer: LayerId) => void;
  setPriority: (priority: 'A' | 'B' | 'C' | 'D' | 'E') => void;
  setRepeat: (repeat: 'once' | 'daily' | 'weekly') => void;
  setDate: (date: string) => void;
  setTime: (time: string) => void;
  setTimeFormat: (format: '12' | '24') => void;
  setHourInput: (hour: string) => void;
  setMinuteInput: (minute: string) => void;
  setPeriod: (period: 'AM' | 'PM') => void;
  setAlarmEnabled: (enabled: boolean) => void;
  setPreferredMusic: (music: string) => void;
  setCustomAlarmName: (name: string) => void;
  setCustomAlarmDataUrl: (url: string) => void;
  setDuration: (duration: number) => void;
  setQuickAddError: (error: string) => void;

  // Search task editing
  startEditingSearchTask: (task: Task) => void;
  setEditingSearchTaskId: (id: string | null) => void;
  setEditingSearchTaskName: (name: string) => void;
  setEditingSearchTaskTime: (time: string) => void;
  setEditingSearchTaskRepeat: (repeat: 'once' | 'daily' | 'weekly') => void;
  setEditingSearchTaskPriority: (priority: 'A' | 'B' | 'C' | 'D' | 'E') => void;

  // Complex actions
  resetTaskForm: () => void;
  buildDraftTask: () => Task | null;
  loadFromPreferences: (prefs: any) => void;
}

/**
 * Initialize default state for task editor
 */
const getInitialState = (): TaskEditorState => {
  const rounded = getRoundedCurrentTime();
  const roundedParts = parseTimeToEditor(rounded);

  return {
    name: '',
    layer: 'general',
    priority: 'C',
    repeat: 'once',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: rounded,
    timeFormat: '24',
    hourInput: roundedParts.hour24,
    minuteInput: roundedParts.minute,
    period: roundedParts.period,
    alarmEnabled: true,
    preferredMusic: 'Instrumental Warmth',
    customAlarmName: '',
    customAlarmDataUrl: '',
    duration: 25,
    editingSearchTaskId: null,
    editingSearchTaskName: '',
    editingSearchTaskTime: '',
    editingSearchTaskRepeat: 'once',
    editingSearchTaskPriority: 'C',
    quickAddError: '',
  };
};

/**
 * Hook for managing task editor state
 */
export const useTaskEditor = (): [TaskEditorState, TaskEditorActions] => {
  const [state, setState] = useState<TaskEditorState>(getInitialState());

  // Individual setters
  const setName = useCallback((name: string) => {
    setState(prev => ({ ...prev, name }));
  }, []);

  const setLayer = useCallback((layer: LayerId) => {
    setState(prev => ({ ...prev, layer }));
  }, []);

  const setPriority = useCallback((priority: TaskEditorState['priority']) => {
    setState(prev => ({ ...prev, priority }));
  }, []);

  const setRepeat = useCallback((repeat: TaskEditorState['repeat']) => {
    setState(prev => ({ ...prev, repeat }));
  }, []);

  const setDate = useCallback((date: string) => {
    setState(prev => ({ ...prev, date }));
  }, []);

  const setTime = useCallback((time: string) => {
    setState(prev => ({ ...prev, time }));
  }, []);

  const setTimeFormat = useCallback((timeFormat: '12' | '24') => {
    setState(prev => ({ ...prev, timeFormat }));
  }, []);

  const setHourInput = useCallback((hourInput: string) => {
    setState(prev => ({ ...prev, hourInput }));
  }, []);

  const setMinuteInput = useCallback((minuteInput: string) => {
    setState(prev => ({ ...prev, minuteInput }));
  }, []);

  const setPeriod = useCallback((period: 'AM' | 'PM') => {
    setState(prev => ({ ...prev, period }));
  }, []);

  const setAlarmEnabled = useCallback((alarmEnabled: boolean) => {
    setState(prev => ({ ...prev, alarmEnabled }));
  }, []);

  const setPreferredMusic = useCallback((preferredMusic: string) => {
    setState(prev => ({ ...prev, preferredMusic }));
  }, []);

  const setCustomAlarmName = useCallback((customAlarmName: string) => {
    setState(prev => ({ ...prev, customAlarmName }));
  }, []);

  const setCustomAlarmDataUrl = useCallback((customAlarmDataUrl: string) => {
    setState(prev => ({ ...prev, customAlarmDataUrl }));
  }, []);

  const setDuration = useCallback((duration: number) => {
    setState(prev => ({ ...prev, duration }));
  }, []);

  const setQuickAddError = useCallback((quickAddError: string) => {
    setState(prev => ({ ...prev, quickAddError }));
  }, []);

  // Search task editing
  const startEditingSearchTask = useCallback((task: Task) => {
    setState(prev => ({
      ...prev,
      editingSearchTaskId: task.id,
      editingSearchTaskName: task.name,
      editingSearchTaskTime: task.time,
      editingSearchTaskRepeat: task.repeat || 'once',
      editingSearchTaskPriority: task.priority,
    }));
  }, []);

  const setEditingSearchTaskId = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, editingSearchTaskId: id }));
  }, []);

  const setEditingSearchTaskName = useCallback((name: string) => {
    setState(prev => ({ ...prev, editingSearchTaskName: name }));
  }, []);

  const setEditingSearchTaskTime = useCallback((time: string) => {
    setState(prev => ({ ...prev, editingSearchTaskTime: time }));
  }, []);

  const setEditingSearchTaskRepeat = useCallback((repeat: 'once' | 'daily' | 'weekly') => {
    setState(prev => ({ ...prev, editingSearchTaskRepeat: repeat }));
  }, []);

  const setEditingSearchTaskPriority = useCallback((priority: 'A' | 'B' | 'C' | 'D' | 'E') => {
    setState(prev => ({ ...prev, editingSearchTaskPriority: priority }));
  }, []);

  // Complex actions
  const resetTaskForm = useCallback(() => {
    const rounded = getRoundedCurrentTime();
    const roundedParts = parseTimeToEditor(rounded);
    setState(prev => ({
      ...prev,
      name: '',
      layer: 'general',
      priority: 'C',
      repeat: 'once',
      date: format(new Date(), 'yyyy-MM-dd'),
      time: rounded,
      timeFormat: '24',
      hourInput: roundedParts.hour24,
      minuteInput: roundedParts.minute,
      period: roundedParts.period,
      customAlarmName: '',
      customAlarmDataUrl: '',
      quickAddError: '',
    }));
  }, []);

  /**
   * Build a draft task from current editor state
   * Returns null if validation fails
   */
  const buildDraftTask = useCallback((): Task | null => {
    const trimmedName = state.name.trim();
    if (!trimmedName) {
      setState(prev => ({ ...prev, quickAddError: 'Task name is required.' }));
      return null;
    }

    if (state.repeat === 'weekly' && !state.date) {
      setState(prev => ({
        ...prev,
        quickAddError: 'Please choose a calendar date for weekly tasks.',
      }));
      return null;
    }

    const resolvedTime = buildTimeFromEditor(
      state.timeFormat,
      state.hourInput,
      state.minuteInput,
      state.period
    );

    if (!resolvedTime) {
      setState(prev => ({
        ...prev,
        quickAddError: 'Please enter a valid time (hour and minute).',
      }));
      return null;
    }

    const baseDate = state.repeat === 'weekly' ? new Date(`${state.date}T00:00:00`) : new Date();
    const dueDate = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;

    const draftTask: Task = {
      id: `task-${Date.now()}`,
      name: trimmedName,
      layerId: state.layer,
      priority: state.priority,
      repeat: state.repeat,
      time: resolvedTime,
      completed: false,
      date: dueDate.toISOString(),
      alarmEnabled: state.alarmEnabled,
      preferredMusic: state.preferredMusic || state.customAlarmName || 'Uploaded Song',
      customAlarmAudioName: state.customAlarmName || 'Uploaded Song',
      customAlarmAudioDataUrl: state.customAlarmDataUrl || undefined,
      estimatedDuration: state.duration,
      durationStartedAt: new Date().toISOString(),
    };

    const due = parseTaskDueDate(draftTask);
    if (!due) {
      setState(prev => ({
        ...prev,
        quickAddError: 'Could not understand this time. Please check hour/minute values.',
      }));
      return null;
    }

    if (state.repeat === 'once' && due.getTime() <= Date.now()) {
      setState(prev => ({
        ...prev,
        quickAddError: 'Please choose a future time. Past times cannot be used.',
      }));
      return null;
    }

    return draftTask;
  }, [state]);

  /**
   * Load saved preferences (from localStorage)
   */
  const loadFromPreferences = useCallback((prefs: any) => {
    setState(prev => ({
      ...prev,
      hourInput: prefs.taskHour || prev.hourInput,
      minuteInput: prefs.taskMinute || prev.minuteInput,
      period: (prefs.taskPeriod === 'AM' || prefs.taskPeriod === 'PM' ? prefs.taskPeriod : prev.period) as 'AM' | 'PM',
      timeFormat: (prefs.taskTimeFormat === '12' || prefs.taskTimeFormat === '24' ? prefs.taskTimeFormat : prev.timeFormat) as '12' | '24',
      duration: prefs.taskDuration ? Math.max(1, Math.min(1000, prefs.taskDuration)) : prev.duration,
      customAlarmName: prefs.lastAlarmSongName || prev.customAlarmName,
      customAlarmDataUrl: prefs.lastAlarmSongDataUrl || prev.customAlarmDataUrl,
    }));
  }, []);

  const actions: TaskEditorActions = {
    setName,
    setLayer,
    setPriority,
    setRepeat,
    setDate,
    setTime,
    setTimeFormat,
    setHourInput,
    setMinuteInput,
    setPeriod,
    setAlarmEnabled,
    setPreferredMusic,
    setCustomAlarmName,
    setCustomAlarmDataUrl,
    setDuration,
    setQuickAddError,
    startEditingSearchTask,
    setEditingSearchTaskId,
    setEditingSearchTaskName,
    setEditingSearchTaskTime,
    setEditingSearchTaskRepeat,
    setEditingSearchTaskPriority,
    resetTaskForm,
    buildDraftTask,
    loadFromPreferences,
  };

  return [state, actions];
};
