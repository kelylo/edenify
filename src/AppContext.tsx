import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Layer, Habit, Task, JournalEntry, LayerId, BibleReading } from './types';
import { INITIAL_USER, INITIAL_LAYERS, INITIAL_HABITS, INITIAL_TASKS, INITIAL_BIBLE_READING } from './constants';
import { getDayReading, getTotalReadingDays } from './services/bible';
import { loadBackendUserState, loadUserState, saveBackendUserState, saveUserState } from './services/supabase';
import { syncNativeTaskAlarms } from './services/native-alarms';
import { removeTaskFromGoogleCalendar, syncTaskToGoogleCalendar } from './services/google-calendar';

interface AppState {
  user: User | null;
  authReady: boolean;
  layers: Layer[];
  habits: Habit[];
  tasks: Task[];
  journal: JournalEntry[];
  bibleReading: BibleReading;
  dailyTaskGoal: number;
  stats: {
    overallProgress: number;
    longestStreak: number;
    taskCompletionRate: number;
  };
  setUser: (user: User | null) => void;
  updateLayer: (layerId: LayerId, updates: Partial<Layer>) => void;
  addHabit: (habit: Habit) => void;
  toggleHabit: (habitId: string) => void;
  addTask: (task: Task) => void;
  toggleTask: (taskId: string) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  deleteTask: (taskId: string) => void;
  addJournalEntry: (entry: JournalEntry) => void;
  completeBibleDay: (completed?: boolean) => Promise<void>;
  refreshBibleReading: () => Promise<void>;
  goToBibleDay: (day: number) => Promise<void>;
  setDailyTaskGoal: (goal: number) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);
const MAX_PERSISTED_DATA_URL_LENGTH = 4_500_000;
const DAILY_BIBLE_TASK_ID = 'daily-bible-reading-task';
const DEFAULT_REVISION_TASK_ID = 'default-academic-revision-task';
const DEFAULT_REVISION_HABIT_ID = 'default-academic-revision-habit';
const DEFAULT_REVISION_TIME = '19:00';
const MEDIA_FALLBACK_FIELDS = ['customFocusSongDataUrl', 'customFocusPlaylistDataUrls'] as const;

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getYesterdayDateKey = (date = new Date()) => {
  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  return getLocalDateKey(yesterday);
};

const getDayDiff = (fromKey: string, toKey: string) => {
  const from = new Date(`${fromKey}T00:00:00`);
  const to = new Date(`${toKey}T00:00:00`);
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.floor((toMs - fromMs) / (24 * 60 * 60 * 1000));
};

const shiftDateKey = (dateKey: string, days: number) => {
  const base = new Date(`${dateKey}T00:00:00`);
  if (!Number.isFinite(base.getTime())) return getLocalDateKey();
  base.setDate(base.getDate() + days);
  return getLocalDateKey(base);
};

const sanitizeTaskForPersistence = (task: Task): Task => {
  const audio = task.customAlarmAudioDataUrl || '';
  if (audio.length <= MAX_PERSISTED_DATA_URL_LENGTH) return task;

  return {
    ...task,
    customAlarmAudioDataUrl: undefined,
    customAlarmAudioName: undefined,
  };
};

const sanitizeUserForPersistence = (baseUser: User | null): User | null => {
  if (!baseUser) return null;

  const nextPreferences = {
    ...baseUser.preferences,
  };

  if ((nextPreferences.customFocusSongDataUrl || '').length > MAX_PERSISTED_DATA_URL_LENGTH) {
    nextPreferences.customFocusSongDataUrl = '';
    nextPreferences.customFocusSongName = '';
  }

  if (Array.isArray(nextPreferences.customFocusPlaylistDataUrls)) {
    const safePairs = nextPreferences.customFocusPlaylistDataUrls
      .map((url, index) => ({
        url,
        name: nextPreferences.customFocusPlaylistNames?.[index] || `Track ${index + 1}`,
      }))
      .filter((entry) => (entry.url || '').length <= MAX_PERSISTED_DATA_URL_LENGTH);

    nextPreferences.customFocusPlaylistDataUrls = safePairs.map((entry) => entry.url);
    nextPreferences.customFocusPlaylistNames = safePairs.map((entry) => entry.name);
  }

  return {
    ...baseUser,
    preferences: nextPreferences,
  };
};

const stripHeavyMediaFromUser = (baseUser: User | null): User | null => {
  if (!baseUser) return null;

  const nextUser = sanitizeUserForPersistence(baseUser) || baseUser;
  const nextAvatar = String(nextUser.avatar || '');

  return {
    ...nextUser,
    avatar: nextAvatar.startsWith('data:') ? '' : nextAvatar,
    preferences: {
      ...nextUser.preferences,
      customFocusSongDataUrl: '',
      customFocusPlaylistDataUrls: [],
    },
  };
};

const stripHeavyMediaFromTasks = (rawTasks: Task[]): Task[] =>
  rawTasks.map((task) => ({
    ...sanitizeTaskForPersistence(task),
    customAlarmAudioDataUrl: undefined,
    customAlarmAudioName: undefined,
  }));

const buildEssentialStatePayload = (
  baseUser: User | null,
  layers: Layer[],
  habits: Habit[],
  tasks: Task[],
  journal: JournalEntry[],
  bibleReading: BibleReading,
  dailyTaskGoal: number
) => ({
  user: stripHeavyMediaFromUser(baseUser),
  layers,
  habits,
  tasks: stripHeavyMediaFromTasks(tasks),
  journal,
  bibleReading,
  dailyTaskGoal,
});

const normalizeUser = (user: User): User => ({
  ...INITIAL_USER,
  ...user,
  preferences: {
    ...INITIAL_USER.preferences,
    ...(user.preferences || {}),
    notifications: {
      ...INITIAL_USER.preferences.notifications,
      ...(user.preferences?.notifications || {}),
    },
  },
});

const normalizeBibleReading = (reading?: Partial<BibleReading> | null): BibleReading => {
  const safeTotalDays = INITIAL_BIBLE_READING.totalDays;
  const safeCompleted = Math.min(safeTotalDays, Math.max(0, Number(reading?.highestCompletedDay || INITIAL_BIBLE_READING.highestCompletedDay || 0)));
  const safeDay = Math.min(safeTotalDays, Math.max(1, Number(reading?.day || INITIAL_BIBLE_READING.day)));

  return {
    ...INITIAL_BIBLE_READING,
    ...(reading || {}),
    totalDays: safeTotalDays,
    day: safeDay,
    highestCompletedDay: safeCompleted,
    completed: safeDay <= safeCompleted,
    currentStreak: Math.max(0, Number(reading?.currentStreak || 0)),
    lastCompletedDate: String(reading?.lastCompletedDate || ''),
  };
};

const ensureTaskId = (task: Task): Task => {
  if (task.id && task.id.trim()) return task;
  const seed = `${task.name || 'task'}|${task.layerId || 'general'}|${task.time || '00:00'}|${task.date || ''}`;
  const compact = seed.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 64).toLowerCase();
  return { ...task, id: `task-${compact || Date.now().toString()}` };
};

const mergeTasksByIdentity = (
  currentTasks: Task[],
  incomingTasks: Task[],
  recentlyDeletedIds: Set<string>,
  preferIncoming = false
) => {
  const merged = new Map<string, Task>();

  currentTasks.forEach((rawTask) => {
    const task = ensureTaskId(rawTask);
    if (recentlyDeletedIds.has(task.id)) return; // Skip recently deleted
    const key = task.id || `${task.name}|${task.layerId}|${task.time}`;
    merged.set(key, task);
  });

  incomingTasks.forEach((rawTask) => {
    const task = ensureTaskId(rawTask);
    if (recentlyDeletedIds.has(task.id)) return; // Don't re-add recently deleted from cloud
    const key = task.id || `${task.name}|${task.layerId}|${task.time}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, task);
    } else {
      const merged_task = preferIncoming ? { ...existing, ...task } : { ...task, ...existing };

      if (!preferIncoming && existing.completed && !task.completed) {
        merged_task.completed = true;
      }

      merged.set(key, merged_task);
    }
  });

  return Array.from(merged.values());
};

const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T | null> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const loadTaskDeletionTombstones = (accountKey: string): Record<string, number> => {
  if (!accountKey) return {};
  try {
    const raw = localStorage.getItem(`edenify_deleted_tasks_${accountKey}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    const maxAgeMs = 14 * 24 * 60 * 60 * 1000;
    return Object.fromEntries(
      Object.entries(parsed).filter(([id, ts]) => Boolean(id) && Number.isFinite(ts) && now - Number(ts) <= maxAgeMs)
    );
  } catch {
    return {};
  }
};

const saveTaskDeletionTombstones = (accountKey: string, tombstones: Record<string, number>) => {
  if (!accountKey) return;
  try {
    localStorage.setItem(`edenify_deleted_tasks_${accountKey}`, JSON.stringify(tombstones));
  } catch {
    // Ignore local cache write failures.
  }
};

const scoreCloudState = (state: any) => {
  if (!state || typeof state !== 'object') return -1;
  const taskCount = Array.isArray(state.tasks) ? state.tasks.length : 0;
  const habitCount = Array.isArray(state.habits) ? state.habits.length : 0;
  const journalCount = Array.isArray(state.journal) ? state.journal.length : 0;
  const hasUser = Boolean(state.user?.id || state.user?.email || state.user?.preferences);
  const hasBible = Boolean(state.bibleReading?.passage || state.bibleReading?.day);
  const hasGoal = Number.isFinite(Number(state.dailyTaskGoal));
  return taskCount * 10 + habitCount * 4 + journalCount * 2 + (hasUser ? 3 : 0) + (hasBible ? 2 : 0) + (hasGoal ? 1 : 0);
};

const mergeCloudStates = (supabaseState: any | null, backendState: any | null) => {
  if (!supabaseState && !backendState) return null;
  if (!supabaseState) return backendState;
  if (!backendState) return supabaseState;

  const preferredState = scoreCloudState(backendState) >= scoreCloudState(supabaseState) ? backendState : supabaseState;
  const secondaryState = preferredState === backendState ? supabaseState : backendState;
  const chooseArray = <T,>(a: T[] | undefined, b: T[] | undefined, fallback: T[] = []) => {
    const safeA = Array.isArray(a) ? a : [];
    const safeB = Array.isArray(b) ? b : [];
    if (safeA.length === 0 && safeB.length === 0) return fallback;
    return safeA.length >= safeB.length ? safeA : safeB;
  };

  return {
    user: normalizeUser({
      ...(supabaseState.user || {}),
      ...(backendState.user || {}),
      preferences: {
        ...(supabaseState.user?.preferences || {}),
        ...(backendState.user?.preferences || {}),
        notifications: {
          ...(supabaseState.user?.preferences?.notifications || {}),
          ...(backendState.user?.preferences?.notifications || {}),
        },
      },
    }),
    layers: chooseArray(secondaryState?.layers, preferredState?.layers),
    habits: chooseArray(secondaryState?.habits, preferredState?.habits),
    tasks: mergeTasksByIdentity(
      Array.isArray(supabaseState.tasks) ? supabaseState.tasks : [],
      Array.isArray(backendState.tasks) ? backendState.tasks : [],
      new Set<string>(),
      true
    ),
    journal: chooseArray(secondaryState?.journal, preferredState?.journal),
    bibleReading: normalizeBibleReading(secondaryState?.bibleReading || preferredState.bibleReading || null),
    dailyTaskGoal: Number(secondaryState?.dailyTaskGoal ?? preferredState.dailyTaskGoal ?? 3),
  };
};

const mergeUserWithMediaFallback = (previous: User, remote: any): User => {
  const normalized = normalizeUser({
    ...previous,
    ...(remote || {}),
    preferences: {
      ...(previous.preferences || {}),
      ...(remote?.preferences || {}),
      notifications: {
        ...(previous.preferences?.notifications || {}),
        ...(remote?.preferences?.notifications || {}),
      },
    },
  } as User);

  const remotePrefs = remote?.preferences || {};
  const mergedPrefs = { ...normalized.preferences };

  for (const field of MEDIA_FALLBACK_FIELDS) {
    const remoteValue = remotePrefs[field];
    const previousValue = previous.preferences?.[field];
    const remoteEmpty = Array.isArray(remoteValue)
      ? remoteValue.length === 0
      : String(remoteValue || '').trim().length === 0;
    const previousHasValue = Array.isArray(previousValue)
      ? previousValue.length > 0
      : String(previousValue || '').trim().length > 0;

    if (remoteEmpty && previousHasValue) {
      (mergedPrefs as any)[field] = previousValue;
    }
  }

  const remoteAvatar = String(remote?.avatar || '').trim();
  const previousAvatar = String(previous.avatar || '').trim();
  const shouldKeepPreviousAvatar = previousAvatar.length > 0 && (remoteAvatar.length === 0 || remoteAvatar === previousAvatar);

  return {
    ...normalized,
    avatar: shouldKeepPreviousAvatar ? previousAvatar : normalized.avatar,
    preferences: mergedPrefs,
  };
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const getAccountKey = (currentUser: User | null) => String(currentUser?.email || currentUser?.id || '').trim().toLowerCase();
  const getCachedUserKey = (accountKey: string) => `edenify_cached_user_${accountKey || 'guest'}`;
  const getLastAccountKey = () => {
    try {
      return String(localStorage.getItem('edenify_last_account_key') || '').trim().toLowerCase();
    } catch {
      return '';
    }
  };

  // Cache management for session persistence
  const cacheUser = (user: User | null) => {
    if (!user) {
      localStorage.removeItem('edenify_cached_user');
      const lastKey = getLastAccountKey();
      if (lastKey) {
        localStorage.removeItem(getCachedUserKey(lastKey));
      }
      return;
    }

    const accountKey = getAccountKey(user);
    if (accountKey) {
      try {
        localStorage.setItem('edenify_last_account_key', accountKey);
      } catch {
        // Ignore account-key cache failures.
      }
    }

    const lightUser: User = {
      ...user,
      avatar: String(user.avatar || '').startsWith('data:') ? '' : user.avatar,
      preferences: {
        ...user.preferences,
        customFocusSongDataUrl: '',
        customFocusPlaylistDataUrls: [],
      },
    };

    try {
      localStorage.setItem(getCachedUserKey(accountKey), JSON.stringify(lightUser));
      localStorage.setItem('edenify_cached_user', JSON.stringify(lightUser));
    } catch (error) {
      console.warn('Failed to cache user session:', error);
    }
  };

  const getCachedUser = (): User | null => {
    try {
      const lastKey = getLastAccountKey();
      const cached = (lastKey ? localStorage.getItem(getCachedUserKey(lastKey)) : null)
        || localStorage.getItem('edenify_cached_user');
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.warn('Failed to restore cached user:', error);
      const lastKey = getLastAccountKey();
      if (lastKey) {
        localStorage.removeItem(getCachedUserKey(lastKey));
      }
      localStorage.removeItem('edenify_cached_user');
      return null;
    }
  };

  const [user, setUserState] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [layers, setLayers] = useState<Layer[]>(INITIAL_LAYERS);
  const [habits, setHabits] = useState<Habit[]>(INITIAL_HABITS);
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [bibleReading, setBibleReading] = useState<BibleReading>(INITIAL_BIBLE_READING);
  const [dailyTaskGoal, setDailyTaskGoalState] = useState<number>(9);
  const [cloudSyncReady, setCloudSyncReady] = useState(false);
  const [localRestoreReady, setLocalRestoreReady] = useState(false);
  const hasCompletedInitialCloudSyncRef = useRef(false);
  const applyingCloudStateRef = useRef(false);
  const lastCloudStateHashRef = useRef('');
  const isCloudPullingRef = useRef(false);
  const recentlyDeletedTaskIdsRef = useRef<Set<string>>(new Set());
  const deletedTaskTombstonesRef = useRef<Record<string, number>>({});
  const deletionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const pullCloudState = async (accountKey: string) => {
    if (!accountKey || isCloudPullingRef.current) return;
    isCloudPullingRef.current = true;

    try {
      const [supabaseState, backendState] = await Promise.all([
        withTimeout(loadUserState(accountKey), 2500),
        withTimeout(loadBackendUserState(accountKey), 2500),
      ]);

      const remoteState = mergeCloudStates(supabaseState, backendState);
      if (!remoteState) return;

      const remoteHash = JSON.stringify(remoteState || {});
      if (remoteHash === lastCloudStateHashRef.current) return;

      applyingCloudStateRef.current = true;

      if (remoteState.user) {
        setUser((prev) => {
          if (!prev) return normalizeUser(remoteState.user);
          return mergeUserWithMediaFallback(prev, remoteState.user);
        });
      }

      if (remoteState.layers) setLayers(remoteState.layers);
      if (remoteState.habits) setHabits(remoteState.habits);
      if (remoteState.tasks) {
        const blockedTaskIds = new Set([
          ...Array.from(recentlyDeletedTaskIdsRef.current),
          ...Object.keys(deletedTaskTombstonesRef.current),
        ]);
        setTasks((prev) => mergeTasksByIdentity(prev, remoteState.tasks, blockedTaskIds, false));
      }
      if (remoteState.journal) setJournal(remoteState.journal);
      if (remoteState.bibleReading) setBibleReading(normalizeBibleReading(remoteState.bibleReading));
      if (remoteState.dailyTaskGoal) setDailyTaskGoalState(remoteState.dailyTaskGoal);

      lastCloudStateHashRef.current = remoteHash;
      window.setTimeout(() => {
        applyingCloudStateRef.current = false;
      }, 0);
    } finally {
      isCloudPullingRef.current = false;
    }
  };

  // Wrapper for setUser that also caches on localStorage (supports both value and function updates)
  const setUser = (nextUser: User | null | ((prev: User | null) => User | null)) => {
    if (typeof nextUser === 'function') {
      setUserState((prev) => {
        const result = nextUser(prev);
        cacheUser(result);
        return result;
      });
    } else {
      setUserState(nextUser);
      cacheUser(nextUser);
    }
  };

  // Load from localStorage on init
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        // Step 1: Try to restore from cached user first (enables offline session persistence)
        const cachedUser = getCachedUser();
        if (cachedUser) {
          setUserState(normalizeUser(cachedUser));
        }

        // Step 2: Check server session to validate/update cached user
        const sessionResponse = await fetch('/api/auth/session');
        const sessionData = await sessionResponse.json();
        if (sessionResponse.ok && sessionData?.success && sessionData?.user) {
          setUserState(normalizeUser(sessionData.user));
          cacheUser(normalizeUser(sessionData.user));
        } else if (!cachedUser) {
          // Only clear user if there's no cache to fall back on
          setUserState(null);
        }

        // Don't load guest state yet - let cloud sync initialize first.
      } catch (error) {
        console.warn('Session restore failed:', error);
        // If offline or error, still try cached user as fallback
        const cachedUser = getCachedUser();
        if (cachedUser && !cancelled) {
          setUserState(normalizeUser(cachedUser));
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    };

    restore();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setLocalRestoreReady(false);
  }, [user?.id, user?.email]);

  useEffect(() => {
    const accountKey = getAccountKey(user);
    if (!accountKey) return;

    // Skip loading from localStorage until cloud sync completes.
    if (!cloudSyncReady) {
      return;
    }

    try {
      const saved = localStorage.getItem(`edenify_state_${accountKey}`);
      if (!saved) return;
      const parsed = JSON.parse(saved);

      if (Array.isArray(parsed.layers) && parsed.layers.length > 0) {
        setLayers((prev) => (prev.length >= parsed.layers.length ? prev : parsed.layers));
      }

      if (Array.isArray(parsed.habits) && parsed.habits.length > 0) {
        setHabits((prev) => (prev.length >= parsed.habits.length ? prev : parsed.habits));
      }

      if (Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
        const blockedTaskIds = new Set([
          ...Array.from(recentlyDeletedTaskIdsRef.current),
          ...Object.keys(deletedTaskTombstonesRef.current),
        ]);
        setTasks((prev) => mergeTasksByIdentity(prev, parsed.tasks, blockedTaskIds, true));
      }

      if (Array.isArray(parsed.journal) && parsed.journal.length > 0) {
        setJournal((prev) => (prev.length >= parsed.journal.length ? prev : parsed.journal));
      }

      if (parsed.bibleReading) {
        setBibleReading((prev) => normalizeBibleReading(parsed.bibleReading || prev));
      }

      if (Number.isFinite(Number(parsed.dailyTaskGoal))) {
        setDailyTaskGoalState(Number(parsed.dailyTaskGoal));
      }

      const savedPrefs = parsed?.user?.preferences;
      if (savedPrefs && user) {
        setUser((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            preferences: {
              ...prev.preferences,
              ...savedPrefs,
              notifications: {
                ...prev.preferences.notifications,
                ...(savedPrefs.notifications || {}),
              },
            },
          };
        });
      }
    } catch (error) {
      console.warn('Failed to restore account-scoped local state:', error);
    } finally {
      setLocalRestoreReady(true);
    }
  }, [user?.id, user?.email, cloudSyncReady]);

  useEffect(() => {
    if (!authReady) return;
    if (getAccountKey(user)) return;

    try {
      const fallbackAccountKey = getLastAccountKey();
      const preferredKey = fallbackAccountKey ? `edenify_state_${fallbackAccountKey}` : 'edenify_state_guest';
      const saved = localStorage.getItem(preferredKey) || localStorage.getItem('edenify_state_guest');
      if (!saved) return;
      const parsed = JSON.parse(saved);

      if (Array.isArray(parsed.layers) && parsed.layers.length > 0) {
        setLayers((prev) => (prev.length >= parsed.layers.length ? prev : parsed.layers));
      }

      if (Array.isArray(parsed.habits) && parsed.habits.length > 0) {
        setHabits((prev) => (prev.length >= parsed.habits.length ? prev : parsed.habits));
      }

      if (Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
        setTasks((prev) => mergeTasksByIdentity(prev, parsed.tasks, new Set<string>(), true));
      }

      if (Array.isArray(parsed.journal) && parsed.journal.length > 0) {
        setJournal((prev) => (prev.length >= parsed.journal.length ? prev : parsed.journal));
      }

      if (parsed.bibleReading) {
        setBibleReading((prev) => normalizeBibleReading(parsed.bibleReading || prev));
      }

      if (Number.isFinite(Number(parsed.dailyTaskGoal))) {
        setDailyTaskGoalState(Number(parsed.dailyTaskGoal));
      }
    } catch (error) {
      console.warn('Failed to restore guest local state:', error);
    } finally {
      setLocalRestoreReady(true);
    }
  }, [authReady, user?.id, user?.email]);

  useEffect(() => {
    const accountKey = getAccountKey(user);
    deletedTaskTombstonesRef.current = loadTaskDeletionTombstones(accountKey);
    recentlyDeletedTaskIdsRef.current = new Set(Object.keys(deletedTaskTombstonesRef.current));
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (!user) return;

    const today = getLocalDateKey();

    setUser((prev) => {
      if (!prev) return prev;

      const nextReadingStartDate = prev.preferences?.readingPlanStartDate || today;
      const needsReadingStart = prev.preferences?.readingPlanStartDate !== nextReadingStartDate;

      if (!needsReadingStart) return prev;

      return {
        ...prev,
        preferences: {
          ...prev.preferences,
          readingPlanStartDate: nextReadingStartDate,
        },
      };
    });
  }, [user?.id, user?.email, user?.preferences?.readingPlanStartDate, bibleReading.day]);

  useEffect(() => {
    if (!user?.id) return;
    if (user.preferences?.revisionDefaultsApplied) return;

    setTasks((prev) => {
      const hasRevisionTask = prev.some((task) => task.id === DEFAULT_REVISION_TASK_ID);
      if (hasRevisionTask) return prev;

      const revisionTask: Task = {
        id: DEFAULT_REVISION_TASK_ID,
        name: 'Revision',
        layerId: 'academic',
        priority: 'A',
        repeat: 'daily',
        time: DEFAULT_REVISION_TIME,
        completed: false,
        date: new Date().toISOString(),
        alarmEnabled: true,
      };

      return [...prev, revisionTask];
    });

    setHabits((prev) => {
      const hasRevisionHabit = prev.some((habit) => habit.id === DEFAULT_REVISION_HABIT_ID);
      if (hasRevisionHabit) return prev;

      const revisionHabit: Habit = {
        id: DEFAULT_REVISION_HABIT_ID,
        name: 'Revision',
        layerId: 'academic',
        frequency: 'daily',
        durationMinutes: 60,
        streak: 0,
        history: [],
        completedToday: false,
        timeOfDay: 'evening',
        time: DEFAULT_REVISION_TIME,
        linkedTaskId: DEFAULT_REVISION_TASK_ID,
      };

      return [...prev, revisionHabit];
    });

    setUser((prev) => {
      if (!prev) return prev;
      if (prev.preferences?.revisionDefaultsApplied) return prev;

      return {
        ...prev,
        preferences: {
          ...prev.preferences,
          revisionDefaultsApplied: true,
        },
      };
    });
  }, [user?.id, user?.preferences?.revisionDefaultsApplied]);

  useEffect(() => {
    let cancelled = false;

    const hydrateBiblePlanState = async () => {
      try {
        const totalDays = await getTotalReadingDays();
        console.log('[Bible] Total reading days:', totalDays);
        
        const highest = Math.min(totalDays, Math.max(0, bibleReading.highestCompletedDay || 0));
        const todayKey = getLocalDateKey();
        const completedToday = bibleReading.lastCompletedDate === todayKey && highest > 0;
        const targetDay = Math.min(totalDays, Math.max(1, highest + (completedToday ? 0 : 1)));
        
        console.log('[Bible] Fetching reading for day:', targetDay, 'today:', todayKey);
        
        const reading = await getDayReading(targetDay);
        
        console.log('[Bible] Fetched reading:', { day: targetDay, passage: reading.passage, text: reading.text });
        
        if (cancelled) return;

        setBibleReading((prev) => {
          // Keep the user's currently browsed day when possible.
          const boundedCurrentDay = Math.min(totalDays, Math.max(1, Number(prev.day || targetDay)));
          const shouldKeepCurrentPassage = boundedCurrentDay !== targetDay;
          const hasNoPassageYet = !String(prev.passage || '').trim() || !String(prev.text || '').trim();

          if (
            prev.totalDays === totalDays &&
            prev.day === boundedCurrentDay &&
            prev.highestCompletedDay === highest &&
            (shouldKeepCurrentPassage || prev.passage === reading.passage) &&
            (shouldKeepCurrentPassage || prev.text === reading.text)
          ) {
            return prev;
          }

          console.log('[Bible] Updating reading state');

          return {
            ...prev,
            totalDays,
            day: boundedCurrentDay,
            highestCompletedDay: highest,
            passage: shouldKeepCurrentPassage && !hasNoPassageYet ? prev.passage : reading.passage,
            text: shouldKeepCurrentPassage && !hasNoPassageYet ? prev.text : reading.text,
          };
        });
      } catch (error) {
        console.error('[Bible] Error hydrating Bible plan:', error);
      }
    };

    void hydrateBiblePlanState();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email, user?.preferences?.readingPlanStartDate]);

  // Load cloud state from Supabase when user is available, then keep it synced.
  useEffect(() => {
    const accountKey = getAccountKey(user);
    if (!accountKey) {
      hasCompletedInitialCloudSyncRef.current = false;
      setCloudSyncReady(false);
      lastCloudStateHashRef.current = '';
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      try {
        await pullCloudState(accountKey);
      } finally {
        if (!cancelled) {
          hasCompletedInitialCloudSyncRef.current = true;
          setCloudSyncReady(true);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [user?.email, user?.id]);

  useEffect(() => {
    const accountKey = getAccountKey(user);
    if (!accountKey || !cloudSyncReady) return;

    const refresh = () => {
      void pullCloudState(accountKey);
    };

    const visibilityListener = () => {
      if (document.visibilityState !== 'visible') return;
      refresh();
    };

    const intervalId = window.setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', visibilityListener);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', visibilityListener);
    };
  }, [user?.id, user?.email, cloudSyncReady]);

  // Save to localStorage on change
  useEffect(() => {
    if (!authReady) return;
    if (!localRestoreReady) return;

    const accountKey = getAccountKey(user);
    const localCacheUser = user
      ? {
          id: '',
          email: '',
          name: user.name,
          avatar: user.avatar,
          preferences: user.preferences,
        }
      : null;
    const localCacheTasks = tasks;
    const localCacheStatePayload = {
      user: localCacheUser,
      layers,
      habits,
      tasks: localCacheTasks,
      journal,
      bibleReading,
      dailyTaskGoal,
    };
    const cloudTasks = stripHeavyMediaFromTasks(tasks);
    const cloudStatePayload = {
      user: sanitizeUserForPersistence(user),
      layers,
      habits,
      tasks: cloudTasks,
      journal,
      bibleReading,
      dailyTaskGoal,
    };

    try {
      // Keep browser cache without persisted user identity (but keep user preferences).
      localStorage.setItem(accountKey ? `edenify_state_${accountKey}` : 'edenify_state_guest', JSON.stringify(localCacheStatePayload));
    } catch (error) {
      try {
        const degradedPayload = {
          ...localCacheStatePayload,
          tasks: stripHeavyMediaFromTasks(localCacheTasks),
          user: sanitizeUserForPersistence(user)
            ? {
                id: '',
                email: '',
                name: user?.name,
                avatar: user?.avatar,
                preferences: sanitizeUserForPersistence(user)?.preferences,
              }
            : null,
        };
        localStorage.setItem(accountKey ? `edenify_state_${accountKey}` : 'edenify_state_guest', JSON.stringify(degradedPayload));
      } catch {
        try {
          const essentialPayload = buildEssentialStatePayload(user, layers, habits, tasks, journal, bibleReading, dailyTaskGoal);
          localStorage.setItem(accountKey ? `edenify_state_${accountKey}` : 'edenify_state_guest', JSON.stringify(essentialPayload));
        } catch {
          console.warn('Local cache save skipped (likely storage quota reached):', error);
        }
      }
    }

    if (accountKey) {
      const syncState = async () => {
        if (!cloudSyncReady) return;
        if (applyingCloudStateRef.current) return;

        const supabaseSaved = await saveUserState(accountKey, cloudStatePayload);
        const backendSaved = await saveBackendUserState(accountKey, cloudStatePayload);

        if (!supabaseSaved && !backendSaved) {
          return;
        }

        lastCloudStateHashRef.current = JSON.stringify(cloudStatePayload);
      };

      syncState();
    }
  }, [authReady, localRestoreReady, user, layers, habits, tasks, journal, bibleReading, dailyTaskGoal, cloudSyncReady]);

  useEffect(() => {
    void syncNativeTaskAlarms(tasks, user);
  }, [tasks, user?.id, user?.email, user?.preferences.notifications.taskReminders]);

  useEffect(() => {
    const applyTaskCompletionWindow = () => {
      const now = new Date();
      const todayString = now.toDateString();
      const nowWeekday = now.getDay();
      const nowMs = now.getTime();

      setTasks((prev) => prev.map((task) => {
        if (!task.completed) return task;

        const taskDate = new Date(task.date || now.toISOString());
        if (Number.isNaN(taskDate.getTime())) return task;

        // Habit-linked loop tasks reset with the new day at midnight.
        const isHabitTask = String(task.id || '').startsWith('habit-task-');
        if (isHabitTask) {
          if (taskDate.toDateString() !== todayString) {
            return { ...task, completed: false };
          }
          return task;
        }

        if (task.repeat === 'daily' && taskDate.toDateString() !== todayString) {
          return { ...task, completed: false };
        }

        if (task.repeat === 'weekly') {
          const taskDay = taskDate.getDay();
          const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
          const startTask = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate()).getTime();
          const diffDays = Math.floor((startToday - startTask) / (24 * 60 * 60 * 1000));
          if (taskDay === nowWeekday && diffDays >= 7) {
            return { ...task, completed: false };
          }
        }

        return task;
      }));
    };

    applyTaskCompletionWindow();
    const id = window.setInterval(applyTaskCompletionWindow, 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const syncBibleCompletionWithCalendar = () => {
      const today = getLocalDateKey();
      setBibleReading((prev) => {
        if (!prev.completed) return prev;
        if (prev.lastCompletedDate === today) return prev;
        return { ...prev, completed: false };
      });
    };

    syncBibleCompletionWithCalendar();
    const id = window.setInterval(syncBibleCompletionWithCalendar, 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const normalizedTime = user?.preferences?.bibleReminderTime || INITIAL_USER.preferences.bibleReminderTime || '06:30 AM';

    setTasks((prev) => {
      const existing = prev.find((task) => task.id === DAILY_BIBLE_TASK_ID);
      const nextTask: Task = {
        id: DAILY_BIBLE_TASK_ID,
        name: `Read Scripture (Day ${bibleReading.day})`,
        layerId: 'spiritual',
        priority: 'B',
        repeat: 'daily',
        time: normalizedTime,
        completed: Boolean(bibleReading.completed),
        date: new Date().toISOString(),
        alarmEnabled: Boolean(user?.preferences.bibleReminderAlarm ?? true),
        preferredMusic: 'Scripture Reflection',
      };

      if (!existing) {
        return [...prev, nextTask];
      }

      return prev.map((task) => task.id === DAILY_BIBLE_TASK_ID ? { ...existing, ...nextTask } : task);
    });
  }, [bibleReading.day, bibleReading.completed, user?.preferences.bibleReminderAlarm, user?.preferences.bibleReminderTime]);

  const updateLayer = (layerId: LayerId, updates: Partial<Layer>) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, ...updates } : l));
  };

  const addHabit = (habit: Habit) => {
    setHabits(prev => [...prev, habit]);
  };

  const toggleHabit = (habitId: string) => {
    let linkedTaskId: string | undefined;
    let nextCompleted = false;

    setHabits(prev => prev.map((habit) => {
      if (habit.id !== habitId) return habit;

      nextCompleted = !habit.completedToday;
      linkedTaskId = habit.linkedTaskId;

      if (!nextCompleted) {
        return {
          ...habit,
          completedToday: false,
          streak: Math.max(0, habit.streak - 1),
        };
      }

      const now = new Date();
      const last = habit.lastCompletedAt ? new Date(habit.lastCompletedAt) : null;
      const validLast = last && !Number.isNaN(last.getTime()) ? last : null;

      let nextStreak = 1;
      if (validLast) {
        const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startLast = new Date(validLast.getFullYear(), validLast.getMonth(), validLast.getDate()).getTime();
        const diffDays = Math.floor((startToday - startLast) / (24 * 60 * 60 * 1000));

        if (habit.frequency === 'weekly') {
          const sameWeekday = now.getDay() === validLast.getDay();
          nextStreak = sameWeekday && diffDays >= 7 && diffDays <= 13 ? habit.streak + 1 : 1;
        } else {
          nextStreak = diffDays === 1 ? habit.streak + 1 : 1;
        }
      }

      return {
        ...habit,
        completedToday: true,
        streak: nextStreak,
        lastCompletedAt: now.toISOString(),
        history: [...habit.history.slice(-13), true],
      };
    }));

    if (linkedTaskId) {
      setTasks((prev) => prev.map((task) => {
        if (task.id !== linkedTaskId) return task;
        if (!nextCompleted) {
          return { ...task, completed: false };
        }

        if (task.repeat === 'daily' || task.repeat === 'weekly') {
          return { ...task, completed: true, date: new Date().toISOString() };
        }

        return { ...task, completed: true };
      }));
    }
  };

  const addTask = (task: Task) => {
    setTasks(prev => [...prev, task]);
    void syncTaskToGoogleCalendar(task, user, false).catch((error) => {
      console.warn('Google Calendar sync on task create failed:', error);
    });
  };

  const toggleTask = (taskId: string) => {
    setTasks(prev => prev.map((t) => {
      if (t.id !== taskId) return t;
      const nextCompleted = !t.completed;
      if (nextCompleted && (t.repeat === 'daily' || t.repeat === 'weekly')) {
        return { ...t, completed: true, date: new Date().toISOString() };
      }
      return { ...t, completed: nextCompleted };
    }));
  };

  const updateTask = (taskId: string, updates: Partial<Task>) => {
    let mergedTask: Task | null = null;
    setTasks((prev) => prev.map((task) => {
      if (task.id !== taskId) return task;
      mergedTask = { ...task, ...updates };
      return mergedTask;
    }));

    if (mergedTask) {
      void syncTaskToGoogleCalendar(mergedTask, user, false).catch((error) => {
        console.warn('Google Calendar sync on task update failed:', error);
      });
    }
  };

  const deleteTask = (taskId: string) => {
    const taskToDelete = tasks.find((task) => task.id === taskId) || null;
    setTasks((prev) => prev.filter((task) => task.id !== taskId));

    // Track this deletion to prevent re-adding during merge for next 60 seconds
    recentlyDeletedTaskIdsRef.current.add(taskId);
    const accountKey = getAccountKey(user);
    deletedTaskTombstonesRef.current = {
      ...deletedTaskTombstonesRef.current,
      [taskId]: Date.now(),
    };
    saveTaskDeletionTombstones(accountKey, deletedTaskTombstonesRef.current);
    if (deletionTimeoutRef.current) clearTimeout(deletionTimeoutRef.current);
    deletionTimeoutRef.current = setTimeout(() => {
      const now = Date.now();
      const maxAgeMs = 14 * 24 * 60 * 60 * 1000;
      deletedTaskTombstonesRef.current = Object.fromEntries(
        Object.entries(deletedTaskTombstonesRef.current).filter(([, ts]) => now - Number(ts) <= maxAgeMs)
      );
      recentlyDeletedTaskIdsRef.current = new Set(Object.keys(deletedTaskTombstonesRef.current));
      saveTaskDeletionTombstones(getAccountKey(user), deletedTaskTombstonesRef.current);
    }, 60000);

    if (taskToDelete) {
      void removeTaskFromGoogleCalendar(taskToDelete, user, false).catch((error) => {
        console.warn('Google Calendar delete sync failed:', error);
      });
    }
  };

  const addJournalEntry = (entry: JournalEntry) => {
    setJournal(prev => [entry, ...prev]);
  };

  const loadBibleDay = async (targetDay: number, highestCompletedDay: number) => {
    const totalDays = await getTotalReadingDays();
    const day = Math.min(totalDays, Math.max(1, targetDay));
    const data = await getDayReading(day);
    const today = getLocalDateKey();
    setBibleReading({
      day,
      totalDays,
      highestCompletedDay,
      passage: data.passage,
      text: data.text,
      completed: day <= highestCompletedDay,
      lastCompletedDate: bibleReading.lastCompletedDate || '',
      currentStreak: Math.max(0, Number(bibleReading.currentStreak || 0)),
    });
  };

  const refreshBibleReading = async () => {
    const totalDays = await getTotalReadingDays();
    const today = getLocalDateKey();
    const completedToday = bibleReading.lastCompletedDate === today && bibleReading.highestCompletedDay > 0;
    const safeDay = Math.min(totalDays, Math.max(1, bibleReading.highestCompletedDay + (completedToday ? 0 : 1)));
    const data = await getDayReading(safeDay);
    setBibleReading(prev => ({
      ...prev,
      day: safeDay,
      totalDays,
      passage: data.passage,
      text: data.text,
      completed: safeDay <= prev.highestCompletedDay,
    }));
  };

  const goToBibleDay = async (targetDay: number) => {
    const totalDays = await getTotalReadingDays();
    const bounded = Math.min(totalDays, Math.max(1, targetDay));
    await loadBibleDay(bounded, bibleReading.highestCompletedDay);
  };

  const completeBibleDay = async (completed = true) => {
    const today = getLocalDateKey();
    const totalDays = await getTotalReadingDays();
    const current = bibleReading;

    if (completed) {
      const completedDay = Math.min(totalDays, Math.max(1, current.day));
      const nextHighest = Math.max(current.highestCompletedDay, completedDay);
      const yesterday = getYesterdayDateKey();
      const nextStreak = current.lastCompletedDate === yesterday
        ? Math.max(1, Number(current.currentStreak || 0) + 1)
        : 1;

      // Mark as completed but stay on the same day (don't auto-advance)
      setBibleReading((prev) => ({
        ...prev,
        totalDays,
        day: completedDay,
        highestCompletedDay: nextHighest,
        completed: true,
        lastCompletedDate: today,
        currentStreak: nextStreak,
      }));
      return;
    }

    // Rollback logic unchanged
    const canRollbackToday = current.lastCompletedDate === today && current.highestCompletedDay > 0;
    const rolledBackHighest = canRollbackToday ? current.highestCompletedDay - 1 : current.highestCompletedDay;
    const nextDay = Math.max(1, Math.min(totalDays, rolledBackHighest + 1));
    const nextReading = await getDayReading(nextDay);

    setBibleReading((prev) => ({
      ...prev,
      totalDays,
      day: nextDay,
      highestCompletedDay: rolledBackHighest,
      passage: nextReading.passage,
      text: nextReading.text,
      completed: false,
      lastCompletedDate: current.lastCompletedDate === today ? '' : current.lastCompletedDate,
    }));
  };

  const setDailyTaskGoal = (goal: number) => {
    setDailyTaskGoalState(Math.max(1, Math.min(20, goal)));
  };

  const stats = {
    overallProgress: layers.reduce((acc, l) => acc + (l.xp / l.maxXp), 0) / layers.length * 100,
    longestStreak: Math.max(...habits.map(h => h.streak), 0),
    taskCompletionRate: tasks.length > 0 ? (tasks.filter(t => t.completed).length / tasks.length) * 100 : 0,
  };

  return (
    <AppContext.Provider value={{
      user, authReady, layers, habits, tasks, journal, bibleReading, stats, dailyTaskGoal,
      setUser, updateLayer, addHabit, toggleHabit, addTask, toggleTask, updateTask, deleteTask, addJournalEntry, completeBibleDay, refreshBibleReading, goToBibleDay, setDailyTaskGoal
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
