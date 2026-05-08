import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import toast from 'react-hot-toast';
import { Modal } from '../components/Modal';
import { Skeleton, SkeletonList } from '../components/Skeleton';
import { TaskList } from '../components/TaskList';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useDragAndDrop } from '../hooks/useDragAndDrop';
import { highlightSearch } from '../lib/utils';
import { format } from 'date-fns';
import { pad2, getDateKey, parseTimeToEditor, buildTimeFromEditor, parseAnyTime, getRoundedCurrentTime, getYesterdayKey } from '../lib/dateUtils';
import { ArrowLeft, ArrowRight, BellRing, CheckCircle2, Circle, Loader2, Maximize2, Minimize2, Pause, Pencil, Play, Plus, RefreshCw, Search, SkipForward, Timer, Trash2, WandSparkles, X } from 'lucide-react';
import { cn, getDailyTaskStats, getProgress, isTaskCompletedForToday, isTaskScheduledForToday, parseTaskDueDate, requestMediaPermission, isTaskFailedByDuration } from '../lib/utils';
import { getEdenInsight, suggestTaskWithGemini } from '../services/gemini';
import { BibleVerse, getChapter, getSuggestedVerse, searchBibleByReference, searchVerses, searchVersesFast } from '../services/bible';
import { sendCrossChannelNotification, areNotificationsEnabled, registerBibleReminderSync, unregisterBibleReminderSync } from '../services/notifications';
import { playTaskAlarm, playBibleReminderAlarm, stopAlarm as stopPlaybackAlarm } from '../services/alarm-playback';
import { analyzeMostRepeatedTasks } from '../services/taskAnalytics';
import { EDEN_TEMPLATE_COUNT, EdenTemplate, getEdenTypingSuggestions, getRecommendedEdenTemplates } from '../services/taskTemplates';
import { disconnectGoogleCalendar, getGoogleCalendarAccessToken, isGoogleCalendarConnected, verifyGoogleCalendarToken } from '../services/google-calendar';
import { LayerId, Task } from '../types';
import { AnimatePresence, motion } from 'motion/react';
import Focus from './Focus';
import { BibleReadingUI } from './BibleReadingUI';
import { BibleSection } from './BibleSection';
import { useTaskEditor } from '../hooks/useTaskEditor';
import { useBibleReader } from '../hooks/useBibleReader';

type InteractionHealthEvent = {
  id: string;
  action: string;
  status: 'ok' | 'blocked';
  reason: string;
  at: string;
};

const DEFAULT_REVISION_TASK_ID = 'default-academic-revision-task';
const ACADEMIC_TIMETABLE: Record<number, string[]> = {
  0: [],
  1: ['Resistance des materiaux', 'Hydraulique appliquee', 'Beton arme'],
  2: ['Geotechnique', 'Topographie', 'Mecanique des sols'],
  3: ['Construction metallique', 'DAO', 'Organisation des chantiers'],
  4: ['Routes et ouvrages', 'Assainissement', 'Securite industrielle'],
  5: ['Anglais technique', 'Methodologie de projet', 'Projet tutorat'],
  6: [],
};

const useDebouncedValue = <T,>(value: T, delayMs: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debouncedValue;
};

const getTomorrowSubjects = (baseDate = new Date()) => {
  const tomorrow = new Date(baseDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayIndex = tomorrow.getDay();
  return ACADEMIC_TIMETABLE[dayIndex] || [];
};

const Home: React.FC = () => {
  const {
    user,
    setUser,
    layers,
    tasks,
    addTask,
    toggleTask,
    deleteTask,
    updateTask,
    bibleReading,
    completeBibleDay,
    goToBibleDay,
    refreshBibleReading,
    dailyTaskGoal,
    addJournalEntry,
  } = useApp();

  const [insight, setInsight] = useState('Consistent spiritual habits act as the fertile soil for all other life pillars.');
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [loadingBible, setLoadingBible] = useState(false);

  const [showFocusPage, setShowFocusPage] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showInstallSuggestion, setShowInstallSuggestion] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);

  // Bible reader hook - consolidates all scripture state
  const [bibleReaderState, bibleReaderActions] = useBibleReader();

  // Task editor hook - consolidates all task creation/editing state
  const [taskEditorState, taskEditorActions] = useTaskEditor();

  const [readingSuggestion, setReadingSuggestion] = useState('');
  const [loadingScriptureText, setLoadingScriptureText] = useState(false);
  const [isGeneratingTask, setIsGeneratingTask] = useState(false);
  const [isTaskPreviewPlaying, setIsTaskPreviewPlaying] = useState(false);
  const [alarmTask, setAlarmTask] = useState<Task | null>(null);
  const [alarmOpen, setAlarmOpen] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState('');
  const scriptureAudioUrlRef = useRef<string | null>(null);
  const [reminderFeed, setReminderFeed] = useState<Array<{ id: string; title: string; detail: string; createdAt: string }>>([]);
  const [toastReminder, setToastReminder] = useState<{ id: string; title: string; detail: string } | null>(null);
  const [mediaPermissionGranted, setMediaPermissionGranted] = useState<boolean | null>(null);
  const [opsLastCheckedAt, setOpsLastCheckedAt] = useState('');
  const [opsCheckError, setOpsCheckError] = useState('');
  const [opsChecking, setOpsChecking] = useState(false);
  const [interactionEvents, setInteractionEvents] = useState<InteractionHealthEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDomain, setSearchDomain] = useState<'all' | 'bible' | 'tasks'>('all');
  const [searchingBible, setSearchingBible] = useState(false);
  const [bibleSearchLabel, setBibleSearchLabel] = useState('');
  const [bibleSearchResults, setBibleSearchResults] = useState<BibleVerse[]>([]);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [detailTaskName, setDetailTaskName] = useState('');
  const [detailTaskTime, setDetailTaskTime] = useState('');
  const [detailTaskRepeat, setDetailTaskRepeat] = useState<'once' | 'daily' | 'weekly'>('once');
  const [detailTaskPriority, setDetailTaskPriority] = useState<'A' | 'B' | 'C' | 'D' | 'E'>('C');
  const [detailTaskDuration, setDetailTaskDuration] = useState(25);
  const [detailTaskPreferredMusic, setDetailTaskPreferredMusic] = useState('');
  const [detailTaskCustomAlarmName, setDetailTaskCustomAlarmName] = useState('');
  const [detailTaskCustomAlarmDataUrl, setDetailTaskCustomAlarmDataUrl] = useState('');
  const [detailTaskAlarmEnabled, setDetailTaskAlarmEnabled] = useState(true);
  const [detailTaskError, setDetailTaskError] = useState('');
  const [googleCalendarBusy, setGoogleCalendarBusy] = useState(false);
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(() => isGoogleCalendarConnected(user?.email));
  const [googleCalendarAccountEmail, setGoogleCalendarAccountEmail] = useState('');
  const isSubPageOpen = bibleReaderState.showScripturePage || showFocusPage;

  const todayDateKey = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  })();

  const alarmTimeoutsRef = useRef<Record<string, number>>({});
  const alarmTriggeredRef = useRef<Set<string>>(new Set());
  const scripturePageRef = useRef<HTMLDivElement | null>(null);
  const reflectionComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const taskPreviewMediaRef = useRef<HTMLAudioElement | null>(null);
  const taskPreviewAudioRef = useRef<AudioContext | null>(null);
  const taskPreviewEndRef = useRef<number | null>(null);
  const academicReminderTimeoutRef = useRef<number | null>(null);
  const academicReminderTriggeredDateRef = useRef('');
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);
  const detailAudioFileInputRef = useRef<HTMLInputElement | null>(null);

  const completedToday = bibleReading.completed && bibleReading.lastCompletedDate === todayDateKey;
  const readingStartDate = user?.preferences?.readingPlanStartDate || todayDateKey;
  const readingElapsedMs = new Date(`${todayDateKey}T00:00:00`).getTime() - new Date(`${readingStartDate}T00:00:00`).getTime();
  const readingElapsedDays = Number.isFinite(readingElapsedMs)
    ? Math.max(0, Math.floor(readingElapsedMs / (24 * 60 * 60 * 1000)))
    : 0;
  const maxBibleDay = Math.max(1, bibleReading.totalDays || 1);
  const canNavigateBible = !loadingBible && maxBibleDay > 0;
  const notificationsEnabled = Boolean(
    user?.preferences.notifications.taskReminders &&
    user?.preferences.notifications.dailyScripture &&
    user?.preferences.notifications.streakProtection
  );
  const accountCacheKey = String(user?.email || user?.id || '').trim().toLowerCase();
  const homePrefsStorageKey = accountCacheKey ? `edenify_home_prefs_${accountCacheKey}` : 'edenify_home_prefs_guest';

  const activeScripturePage = bibleReaderState.pages[bibleReaderState.pageIndex] || [];
  const activeScriptureLabel = bibleReaderState.pageLabels[bibleReaderState.pageIndex] || bibleReading.passage;

  const recordInteractionEvent = useCallback((event: Omit<InteractionHealthEvent, 'id' | 'at'>) => {
    setInteractionEvents((prev) => [
      {
        id: `interaction-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
        at: new Date().toISOString(),
        ...event,
      },
      ...prev,
    ].slice(0, 30));
  }, []);

  const reportActionBlocked = useCallback((action: string, reason: string, withToast = true) => {
    recordInteractionEvent({ action, status: 'blocked', reason });
    if (withToast) {
      setNotificationStatus(reason);
    }
  }, [recordInteractionEvent]);

  const reportActionSuccess = useCallback((action: string, reason: string) => {
    recordInteractionEvent({ action, status: 'ok', reason });
  }, [recordInteractionEvent]);

  useEffect(() => {
    if (!accountCacheKey) return;

    try {
      const raw = localStorage.getItem(homePrefsStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        lastAlarmSongName: string;
        lastAlarmSongDataUrl: string;
        taskHour: string;
        taskMinute: string;
        taskPeriod: 'AM' | 'PM';
        taskTimeFormat: '12' | '24';
        taskDuration: number;
        bibleReminderTime: string;
      }>;

      if (parsed.taskHour) taskEditorActions.setHourInput(String(parsed.taskHour).slice(0, 2));
      if (parsed.taskMinute) taskEditorActions.setMinuteInput(String(parsed.taskMinute).slice(0, 2));
      if (parsed.taskPeriod === 'AM' || parsed.taskPeriod === 'PM') taskEditorActions.setPeriod(parsed.taskPeriod);
      if (parsed.taskTimeFormat === '12' || parsed.taskTimeFormat === '24') taskEditorActions.setTimeFormat(parsed.taskTimeFormat);
      if (Number.isFinite(Number(parsed.taskDuration))) {
        const boundedDuration = Math.max(5, Math.min(300, Number(parsed.taskDuration)));
        taskEditorActions.setDuration(boundedDuration);
      }

      if (parsed.lastAlarmSongName) taskEditorActions.setCustomAlarmName(parsed.lastAlarmSongName);
      if (parsed.lastAlarmSongDataUrl) taskEditorActions.setCustomAlarmDataUrl(parsed.lastAlarmSongDataUrl);

      if (user && (parsed.lastAlarmSongName || parsed.lastAlarmSongDataUrl || parsed.bibleReminderTime)) {
        setUser({
          ...user,
          preferences: {
            ...user.preferences,
            lastAlarmSongName: parsed.lastAlarmSongName || user.preferences.lastAlarmSongName,
            lastAlarmSongDataUrl: parsed.lastAlarmSongDataUrl || user.preferences.lastAlarmSongDataUrl,
            bibleReminderTime: parsed.bibleReminderTime || user.preferences.bibleReminderTime,
          },
        });
      }
    } catch {
      // Ignore malformed cache payloads.
    }
  }, [accountCacheKey]);

  useEffect(() => {
    if (!accountCacheKey) return;

    const safeAudioDataUrl = (taskEditorState.customAlarmDataUrl || '').length <= 4_500_000 ? taskEditorState.customAlarmDataUrl : '';
    const payload = {
      lastAlarmSongName: taskEditorState.customAlarmName || user?.preferences.lastAlarmSongName || '',
      lastAlarmSongDataUrl: safeAudioDataUrl || user?.preferences.lastAlarmSongDataUrl || '',
      taskHour: taskEditorState.hourInput,
      taskMinute: taskEditorState.minuteInput,
      taskPeriod: taskEditorState.period,
      taskTimeFormat: taskEditorState.timeFormat,
      taskDuration: taskEditorState.duration,
      bibleReminderTime: user?.preferences.bibleReminderTime || '06:30 AM',
    };

    try {
      localStorage.setItem(homePrefsStorageKey, JSON.stringify(payload));
    } catch {
      // Ignore localStorage quota errors.
    }
  }, [
    accountCacheKey,
    homePrefsStorageKey,
    taskEditorState.customAlarmName,
    taskEditorState.customAlarmDataUrl,
    taskEditorState.hourInput,
    taskEditorState.minuteInput,
    taskEditorState.period,
    taskEditorState.timeFormat,
    taskEditorState.duration,
    user?.preferences.bibleReminderTime,
    user?.preferences.lastAlarmSongName,
    user?.preferences.lastAlarmSongDataUrl,
  ]);

  const stopScriptureReading = useCallback(() => {
    if (bibleReaderActions.getAudioRef().current) {
      bibleReaderActions.getAudioRef().current.pause();
      bibleReaderActions.getAudioRef().current.currentTime = 0;
      bibleReaderActions.getAudioRef().current = null;
    }

    if (scriptureAudioUrlRef.current) {
      URL.revokeObjectURL(scriptureAudioUrlRef.current);
      scriptureAudioUrlRef.current = null;
    }

    bibleReaderActions.setIsReadingAloud(false);
  }, []);

  const readScriptureAloud = useCallback(async () => {
    const versesToRead = activeScripturePage.length > 0
      ? activeScripturePage
          .map((verse) => `${verse.bookName} ${verse.chapter}:${verse.verse}. ${verse.text}`)
          .join(' ')
      : bibleReading.text;
    const textToRead = `${activeScriptureLabel}. ${versesToRead}`.trim();
    const ttsInput = textToRead.slice(0, 3500);

    if (!ttsInput) {
      setNotificationStatus('No scripture text is available to read aloud yet.');
      return;
    }

    stopScriptureReading();
    bibleReaderActions.setIsReadingAloud(true);
    setNotificationStatus('Sending scripture to Gemini TTS...');

    try {
      const response = await fetch('/api/eden/read-aloud', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: ttsInput,
        }),
      });

      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success || !json?.audioBase64) {
        throw new Error(json?.error || 'Could not generate read-aloud audio.');
      }

      const binary = atob(json.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }

      const audioBlob = new Blob([bytes], { type: json.mimeType || 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      scriptureAudioUrlRef.current = audioUrl;

      const audio = new Audio(audioUrl);
      bibleReaderActions.getAudioRef().current = audio;

      audio.onended = () => {
        bibleReaderActions.getAudioRef().current = null;
        if (scriptureAudioUrlRef.current) {
          URL.revokeObjectURL(scriptureAudioUrlRef.current);
          scriptureAudioUrlRef.current = null;
        }
        bibleReaderActions.setIsReadingAloud(false);
        setNotificationStatus('Read aloud finished.');
      };

      audio.onerror = () => {
        bibleReaderActions.getAudioRef().current = null;
        if (scriptureAudioUrlRef.current) {
          URL.revokeObjectURL(scriptureAudioUrlRef.current);
          scriptureAudioUrlRef.current = null;
        }
        bibleReaderActions.setIsReadingAloud(false);
        setNotificationStatus('Read aloud failed. Please try again.');
      };

      await audio.play();
      setNotificationStatus('Reading aloud (Gemini TTS).');
    } catch (error: any) {
      bibleReaderActions.getAudioRef().current = null;
      if (scriptureAudioUrlRef.current) {
        URL.revokeObjectURL(scriptureAudioUrlRef.current);
        scriptureAudioUrlRef.current = null;
      }
      bibleReaderActions.setIsReadingAloud(false);
      setNotificationStatus(error?.message || 'Read aloud failed. Please try again.');
    }
  }, [activeScriptureLabel, activeScripturePage, bibleReading.text, stopScriptureReading]);

  const favoriteFocusTrack = useMemo(() => {
    const names = user?.preferences.customFocusPlaylistNames || [];
    const urls = user?.preferences.customFocusPlaylistDataUrls || [];
    if (names.length > 0 && urls.length > 0 && names[0] && urls[0]) {
      return { name: names[0], dataUrl: urls[0] };
    }
    if (user?.preferences.customFocusSongName && user?.preferences.customFocusSongDataUrl) {
      return { name: user.preferences.customFocusSongName, dataUrl: user.preferences.customFocusSongDataUrl };
    }
    return null;
  }, [
    user?.preferences.customFocusPlaylistNames,
    user?.preferences.customFocusPlaylistDataUrls,
    user?.preferences.customFocusSongName,
    user?.preferences.customFocusSongDataUrl,
  ]);

  const getDefaultAlarmFromPreferences = () => {
    if (user?.preferences.lastAlarmSongName && user?.preferences.lastAlarmSongDataUrl) {
      return {
        name: user.preferences.lastAlarmSongName,
        dataUrl: user.preferences.lastAlarmSongDataUrl,
      };
    }
    return favoriteFocusTrack;
  };

  const resolveTaskUploadedAlarm = (task: Task) => {
    if (task.customAlarmAudioDataUrl) {
      return { dataUrl: task.customAlarmAudioDataUrl, name: task.customAlarmAudioName || task.preferredMusic || 'Uploaded audio' };
    }

    const preferredName = String(task.preferredMusic || '').trim();
    if (!preferredName) return getDefaultAlarmFromPreferences();

    const playlistNames = user?.preferences.customFocusPlaylistNames || [];
    const playlistUrls = user?.preferences.customFocusPlaylistDataUrls || [];
    const index = playlistNames.findIndex((name) => String(name || '').trim().toLowerCase() === preferredName.toLowerCase());
    if (index >= 0 && playlistUrls[index]) {
      return { dataUrl: playlistUrls[index], name: playlistNames[index] };
    }

    const singleName = String(user?.preferences.customFocusSongName || '').trim();
    const singleUrl = String(user?.preferences.customFocusSongDataUrl || '').trim();
    if (singleName && singleUrl && singleName.toLowerCase() === preferredName.toLowerCase()) {
      return { dataUrl: singleUrl, name: singleName };
    }

    return getDefaultAlarmFromPreferences();
  };

  const [edenTemplatePool, setEdenTemplatePool] = useState<EdenTemplate[]>([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const debouncedTaskName = useDebouncedValue(taskEditorState.name.trim(), 220);

  const realtimeTemplateSuggestions = useMemo(() => {
    const query = debouncedTaskName.trim();
    if (query.length < 2) return [] as EdenTemplate[];

    const suggestions = getEdenTypingSuggestions({
      tasks,
      layerId: taskEditorState.layer,
      intent: query,
      mostRepeated: user?.preferences.mostRepeatedTasks?.map((entry) => ({
        name: entry.name,
        layerId: entry.layerId,
        count: entry.count,
      })),
      limit: 12,
    });

    return suggestions.slice(0, 8);
  }, [debouncedTaskName, taskEditorState.layer, tasks, user?.preferences.mostRepeatedTasks]);

  useEffect(() => {
    if (showQuickAdd) return;
    setShowTemplatePicker(false);
    setEdenTemplatePool([]);
    const defaultAlarm = getDefaultAlarmFromPreferences();
    if (defaultAlarm) {
      taskEditorActions.setPreferredMusic(defaultAlarm.name);
      taskEditorActions.setCustomAlarmName(defaultAlarm.name);
      taskEditorActions.setCustomAlarmDataUrl(defaultAlarm.dataUrl);
    } else {
      taskEditorActions.setPreferredMusic('');
      taskEditorActions.setCustomAlarmName('');
      taskEditorActions.setCustomAlarmDataUrl('');
    }
  }, [favoriteFocusTrack, showQuickAdd, user?.preferences.lastAlarmSongName, user?.preferences.lastAlarmSongDataUrl]);

  useEffect(() => {
    if (!user) return;
    const mostRepeated = analyzeMostRepeatedTasks(tasks, 12).map((item) => ({
      name: item.name,
      layerId: item.layerId,
      priority: item.priority,
      count: item.count,
    }));

    const current = user.preferences.mostRepeatedTasks || [];
    if (JSON.stringify(current) === JSON.stringify(mostRepeated)) return;

    setUser({
      ...user,
      preferences: {
        ...user.preferences,
        mostRepeatedTasks: mostRepeated,
      },
    });
  }, [tasks, user?.id]);

  useEffect(() => {
    setGoogleCalendarConnected(isGoogleCalendarConnected(user?.email));
    setGoogleCalendarAccountEmail('');
  }, [user?.id, user?.email, user?.preferences.googleCalendarEnabled]);

  const connectGoogleCalendar = async () => {
    const appUserEmail = String(user?.email || '').trim().toLowerCase();
    if (!appUserEmail) {
      reportActionBlocked('google-calendar-connect', 'Sign in with your Edenify account first so Google Calendar can be tied to your email.');
      return;
    }

    setGoogleCalendarBusy(true);
    try {
      const token = await getGoogleCalendarAccessToken(true, appUserEmail);
      const identity = await verifyGoogleCalendarToken(token, appUserEmail);

      if (!identity.matchesExpected) {
        disconnectGoogleCalendar(appUserEmail);
        throw new Error(`Connected Google account (${identity.email || 'unknown'}) does not match your Edenify email (${appUserEmail}).`);
      }

      setGoogleCalendarConnected(true);
      setGoogleCalendarAccountEmail(identity.email || appUserEmail);
      if (user && !user.preferences.googleCalendarEnabled) {
        setUser({
          ...user,
          preferences: {
            ...user.preferences,
            googleCalendarEnabled: true,
          },
        });
      }
      setNotificationStatus('Google Calendar connected and tied to your email.');
      reportActionSuccess('google-calendar-connect', 'Calendar connected and verified.');
    } catch (error: any) {
      setGoogleCalendarConnected(false);
      setGoogleCalendarAccountEmail('');
      setNotificationStatus(error?.message || 'Could not connect Google Calendar.');
      reportActionBlocked('google-calendar-connect', error?.message || 'Could not connect Google Calendar.', false);
    } finally {
      setGoogleCalendarBusy(false);
    }
  };

  const disconnectCalendar = () => {
    disconnectGoogleCalendar(user?.email);
    setGoogleCalendarConnected(false);
    setGoogleCalendarAccountEmail('');
    setNotificationStatus('Google Calendar disconnected.');
  };

  const toggleGoogleCalendarSync = () => {
    if (!user) {
      reportActionBlocked('google-calendar-sync-toggle', 'Sign in to manage Google Calendar sync.');
      return;
    }
    const nextEnabled = !Boolean(user.preferences.googleCalendarEnabled);

    if (nextEnabled && !googleCalendarConnected) {
      void connectGoogleCalendar();
      return;
    }

    setUser({
      ...user,
      preferences: {
        ...user.preferences,
        googleCalendarEnabled: nextEnabled,
      },
    });
    setNotificationStatus(nextEnabled ? 'Google Calendar sync enabled.' : 'Google Calendar sync disabled.');
    reportActionSuccess('google-calendar-sync-toggle', nextEnabled ? 'Google Calendar sync enabled.' : 'Google Calendar sync disabled.');
  };

  const stopActiveAlarm = () => {
    stopPlaybackAlarm();
    setAlarmOpen(false);
    setAlarmTask(null);
  };

  const snoozeActiveAlarm = useCallback(() => {
    if (!alarmTask) return;

    const snoozeMinutes = 10;
    const snoozedAt = new Date(Date.now() + snoozeMinutes * 60 * 1000);

    updateTask(alarmTask.id, {
      time: format(snoozedAt, 'HH:mm'),
      date: snoozedAt.toISOString(),
      completed: false,
      alarmEnabled: true,
    });

    stopPlaybackAlarm();
    setAlarmOpen(false);
    setAlarmTask(null);
    setNotificationStatus(`${alarmTask.name} snoozed for 10 minutes.`);
  }, [alarmTask, updateTask]);

  const enterActiveAlarm = useCallback(() => {
    if (!alarmTask) return;

    stopPlaybackAlarm();
    setAlarmOpen(false);
    setAlarmTask(null);
    setShowQuickAdd(false);
    setShowFocusPage(false);
    bibleReaderActions.setShowScripturePage(false);
    setNotificationStatus(`${alarmTask.name} opened in Edenify.`);
  }, [alarmTask]);

  const skipActiveAlarm = useCallback(() => {
    if (!alarmTask) return;

    stopPlaybackAlarm();
    setAlarmOpen(false);
    setAlarmTask(null);
    setNotificationStatus(`${alarmTask.name} dismissed.`);
  }, [alarmTask]);

  useEffect(() => {
    if (!alarmOpen || !alarmTask) return;

    const latestTask = tasks.find((task) => task.id === alarmTask.id);
    if (!latestTask || latestTask.alarmEnabled === false || isTaskCompletedForToday(latestTask)) {
      stopActiveAlarm();
    }
  }, [alarmOpen, alarmTask, tasks]);

  useEffect(() => {
    return () => {
      stopScriptureReading();
    };
  }, [stopScriptureReading]);

  useEffect(() => {
    if (!bibleReaderState.showScripturePage) {
      stopScriptureReading();
    }
  }, [bibleReaderState.showScripturePage, stopScriptureReading]);

  const requestNotificationPermission = async (withFeedback: boolean) => {
    if (!('Notification' in window)) {
      if (withFeedback) setNotificationStatus('Notifications are not supported on this browser.');
      return false;
    }

    if (Notification.permission === 'granted') {
      if (withFeedback) setNotificationStatus('Notifications are already enabled.');
      return true;
    }

    if (Notification.permission === 'denied') {
      if (withFeedback) setNotificationStatus('Notifications are blocked in browser settings.');
      return false;
    }

    const permission = await Notification.requestPermission();
    if (withFeedback) {
      setNotificationStatus(permission === 'granted' ? 'Notifications enabled.' : 'Notification permission was not granted.');
    }
    return permission === 'granted';
  };

  const tryBrowserNotification = async (title: string, body: string) => {
    const granted = await requestNotificationPermission(false);
    if (!granted) return;
    new Notification(title, { body, icon: '/edenify-logo.png' });
  };

  const toggleNotifications = async () => {
    if (!user) {
      reportActionBlocked('notifications-toggle', 'Sign in to change notification settings.');
      return;
    }

    const turningOn = !notificationsEnabled;
    if (turningOn) {
      const allowed = await requestNotificationPermission(true);
      if (!allowed) return;
    }

    setUser({
      ...user,
      preferences: {
        ...user.preferences,
        notifications: {
          taskReminders: turningOn,
          dailyScripture: turningOn,
          streakProtection: turningOn,
        },
      },
    });

    setNotificationStatus(turningOn ? 'Notification is ON' : 'Notification is OFF');
    reportActionSuccess('notifications-toggle', turningOn ? 'Notifications turned on.' : 'Notifications turned off.');

    if (!turningOn) {
      stopActiveAlarm();
    }

    if (turningOn) {
      await tryBrowserNotification('Edenify Notifications', 'All notifications are now enabled.');
    }
  };

  const pushReminderEvent = async (title: string, detail: string, taskId?: string) => {
    const item = {
      id: `evt-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      title,
      detail,
      createdAt: new Date().toISOString(),
    };

    console.log('[Reminder] Event triggered:', { title, detail, isBibleReminder: title.includes('📖') });

    setReminderFeed((prev) => [item, ...prev].slice(0, 20));
    setToastReminder({ id: item.id, title, detail });

    // Send reminder notification through available local channels.
    if (areNotificationsEnabled()) {
      try {
        const results = await sendCrossChannelNotification(
          {
            title: title,
            body: detail,
            icon: '/edenify-logo.png',
            tag: `reminder-${item.id}`,
            taskId,
          }
        );
        console.log('[Reminder] Notification results:', results);
      } catch (error) {
        console.warn('[Reminder] Failed to send notifications:', error);
      }
    } else {
      console.debug('[Reminder] Skipped notifications - not enabled');
    }
  };

  const getTaskCardDomId = useCallback((taskId: string) => `task-card-${encodeURIComponent(taskId)}`, []);

  const focusTaskFromNotification = useCallback((taskId: string) => {
    setFocusedTaskId(taskId);
    window.setTimeout(() => {
      const element = document.getElementById(getTaskCardDomId(taskId));
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 140);
  }, [getTaskCardDomId]);

  useEffect(() => {
    const handleFocusTask = (event: Event) => {
      const custom = event as CustomEvent<{ taskId?: string }>;
      const taskId = custom.detail?.taskId;
      if (!taskId) return;
      focusTaskFromNotification(taskId);
    };

    // Listen for Service Worker messages (including alarm playback signals)
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PLAY_ALARM') {
        const customUrl = event.data?.data?.customAudioDataUrl || getDefaultAlarmFromPreferences()?.dataUrl;
        if (event.data?.data?.isBibleReminder) {
          playBibleReminderAlarm(customUrl).catch(err => console.warn('[Alarm] SW Bible reminder failed:', err));
        } else {
          playTaskAlarm(event.data?.data?.taskName || 'Task', customUrl).catch(err => console.warn('[Alarm] SW task alarm failed:', err));
        }
      }
    };

    window.addEventListener('edenify:focus-task', handleFocusTask as EventListener);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage as EventListener);
    }

    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('taskId');
    if (taskId) {
      focusTaskFromNotification(taskId);
    }

    return () => {
      window.removeEventListener('edenify:focus-task', handleFocusTask as EventListener);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage as EventListener);
      }
    };
  }, [focusTaskFromNotification]);

  useEffect(() => {
    if (!focusedTaskId) return;
    const id = window.setTimeout(() => setFocusedTaskId(null), 8000);
    return () => window.clearTimeout(id);
  }, [focusedTaskId]);

  useEffect(() => {
    if (!notificationStatus) return;
    const id = window.setTimeout(() => {
      setNotificationStatus('');
    }, 10000);
    return () => window.clearTimeout(id);
  }, [notificationStatus]);

  useEffect(() => {
    if (!toastReminder) return;
    const id = window.setTimeout(() => {
      setToastReminder(null);
    }, 7000);
    return () => window.clearTimeout(id);
  }, [toastReminder]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const searchedTasks = useMemo(() => {
    if (!normalizedSearch || (searchDomain !== 'all' && searchDomain !== 'tasks')) return [] as Task[];

    return tasks
      .filter((task) => {
        const layer = layers.find((item) => item.id === task.layerId);
        const hay = `${task.name} ${task.time} ${task.repeat || 'once'} ${task.priority} ${layer?.name || ''}`.toLowerCase();
        return hay.includes(normalizedSearch);
      })
      .sort((a, b) => {
        const aDone = isTaskCompletedForToday(a) ? 1 : 0;
        const bDone = isTaskCompletedForToday(b) ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        return a.time.localeCompare(b.time);
      })
      .slice(0, 40);
  }, [layers, normalizedSearch, searchDomain, tasks]);

  useEffect(() => {
    if (!showGlobalSearch) return;
    if (!normalizedSearch || (searchDomain !== 'all' && searchDomain !== 'bible')) {
      setBibleSearchLabel('');
      setBibleSearchResults([]);
      return;
    }

    let active = true;
    const timeoutId = window.setTimeout(async () => {
      setSearchingBible(true);
      try {
        const direct = await searchBibleByReference(searchQuery);
        if (!active) return;

        if (direct) {
          setBibleSearchLabel(direct.mode === 'chapter' ? `Chapter: ${direct.label}` : `Verse: ${direct.label}`);
          setBibleSearchResults(direct.verses.slice(0, 120));
          return;
        }

        const verses = await searchVersesFast(searchQuery, 80);
        if (!active) return;
        setBibleSearchLabel(verses.length > 0 ? 'Verses' : '');
        setBibleSearchResults(verses);
      } catch {
        if (!active) return;
        setBibleSearchLabel('');
        setBibleSearchResults([]);
      } finally {
        if (active) setSearchingBible(false);
      }
    }, 120);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [normalizedSearch, searchDomain, searchQuery, showGlobalSearch]);

  const openTaskEditorFromSearch = (task: Task) => {
    taskEditorActions.setEditingSearchTaskId(task.id);
    taskEditorActions.setEditingSearchTaskName(task.name);
    taskEditorActions.setEditingSearchTaskTime(task.time);
    taskEditorActions.setEditingSearchTaskRepeat(task.repeat || 'once');
    taskEditorActions.setEditingSearchTaskPriority(task.priority);
  };

  const saveTaskEditorFromSearch = () => {
    if (!taskEditorState.editingSearchTaskId) {
      reportActionBlocked('search-task-save', 'No task is currently selected for editing.');
      return;
    }

    const normalizedTime = parseAnyTime(taskEditorState.editingSearchTaskTime);
    if (!normalizedTime) {
      setNotificationStatus('Please enter a valid time for task edit (HH:MM or H:MM AM/PM).');
      reportActionBlocked('search-task-save', 'Invalid task time in search editor.', false);
      return;
    }

    updateTask(taskEditorState.editingSearchTaskId, {
      name: taskEditorState.editingSearchTaskName.trim() || 'Untitled task',
      time: normalizedTime,
      repeat: taskEditorState.editingSearchTaskRepeat,
      priority: taskEditorState.editingSearchTaskPriority,
    });

    taskEditorActions.setEditingSearchTaskId(null);
    setNotificationStatus('Task updated from search.');
    reportActionSuccess('search-task-save', 'Task updated from global search.');
  };

  const openTaskDetails = (task: Task) => {
    setDetailTaskId(task.id);
    setDetailTaskName(task.name);
    setDetailTaskTime(task.time);
    setDetailTaskRepeat(task.repeat || 'once');
    setDetailTaskPriority(task.priority);
    setDetailTaskAlarmEnabled(task.alarmEnabled !== false);
    setDetailTaskDuration(Math.max(5, Math.min(300, Number(task.estimatedDuration || 25))));
    setDetailTaskPreferredMusic(task.preferredMusic || '');
    setDetailTaskCustomAlarmName(task.customAlarmAudioName || '');
    setDetailTaskCustomAlarmDataUrl(task.customAlarmAudioDataUrl || '');
    setDetailTaskError('');
  };

  const closeTaskDetails = () => {
    setDetailTaskId(null);
    setDetailTaskError('');
  };

  const saveTaskDetails = () => {
    if (!detailTaskId) {
      reportActionBlocked('task-details-save', 'No task is selected in details panel.');
      return;
    }

    const normalizedTime = parseAnyTime(detailTaskTime);
    if (!normalizedTime) {
      setDetailTaskError('Please provide a valid time (HH:MM or H:MM AM/PM).');
      reportActionBlocked('task-details-save', 'Task details time is invalid.', false);
      return;
    }

    const trimmedName = detailTaskName.trim();
    if (!trimmedName) {
      setDetailTaskError('Task name is required.');
      reportActionBlocked('task-details-save', 'Task name is required.', false);
      return;
    }

    const boundedDuration = Math.max(5, Math.min(300, Number(detailTaskDuration || 25)));

    updateTask(detailTaskId, {
      name: trimmedName,
      time: normalizedTime,
      repeat: detailTaskRepeat,
      priority: detailTaskPriority,
      alarmEnabled: detailTaskAlarmEnabled,
      estimatedDuration: boundedDuration,
      preferredMusic: detailTaskPreferredMusic || detailTaskCustomAlarmName || 'Uploaded Song',
      customAlarmAudioName: detailTaskCustomAlarmName || undefined,
      customAlarmAudioDataUrl: detailTaskCustomAlarmDataUrl || undefined,
    });

    if (user && detailTaskCustomAlarmDataUrl && detailTaskCustomAlarmName) {
      setUser({
        ...user,
        preferences: {
          ...user.preferences,
          lastAlarmSongName: detailTaskCustomAlarmName,
          lastAlarmSongDataUrl: detailTaskCustomAlarmDataUrl,
        },
      });
    }

    setNotificationStatus('Task details updated. Calendar sync will update automatically.');
    reportActionSuccess('task-details-save', 'Task details saved.');
    closeTaskDetails();
  };

  const handleDetailReminderSongUpload = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setDetailTaskError('Please choose a valid reminder audio file.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setDetailTaskError('Reminder audio is too large. Use a file under 20MB.');
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    if ((dataUrl || '').length > 25 * 1024 * 1024) {
      setDetailTaskError('Reminder audio is too large after encoding. Please use a shorter file.');
      return;
    }

    setDetailTaskCustomAlarmName(file.name);
    setDetailTaskCustomAlarmDataUrl(dataUrl);
    setDetailTaskPreferredMusic(file.name);
    setDetailTaskError('');
  };

  const previewDetailReminder = () => {
    if (!detailTaskCustomAlarmDataUrl) {
      setDetailTaskError('Upload a reminder song first.');
      return;
    }

    stopTaskPreview();
    const media = new Audio(detailTaskCustomAlarmDataUrl);
    media.volume = 0.85;
    media.play().then(() => {
      setIsTaskPreviewPlaying(true);
    }).catch(() => {
      setIsTaskPreviewPlaying(false);
      setDetailTaskError('Could not preview this audio file.');
    });

    media.onended = () => {
      setIsTaskPreviewPlaying(false);
      taskPreviewMediaRef.current = null;
    };

    taskPreviewMediaRef.current = media;
  };

  const stopTaskPreview = () => {
    if (taskPreviewEndRef.current) {
      window.clearTimeout(taskPreviewEndRef.current);
      taskPreviewEndRef.current = null;
    }

    if (taskPreviewMediaRef.current) {
      taskPreviewMediaRef.current.pause();
      taskPreviewMediaRef.current.currentTime = 0;
      taskPreviewMediaRef.current = null;
    }

    if (taskPreviewAudioRef.current) {
      taskPreviewAudioRef.current.close();
      taskPreviewAudioRef.current = null;
    }

    setIsTaskPreviewPlaying(false);
  };

  const previewUploadedReminder = () => {
    if (!taskEditorState.customAlarmDataUrl) {
      taskEditorActions.setQuickAddError('Upload a reminder song first.');
      reportActionBlocked('quick-add-preview-reminder', 'Upload a reminder song first.', false);
      return;
    }
    previewCustomReminder();
    reportActionSuccess('quick-add-preview-reminder', 'Preview started.');
  };

  const previewCustomReminder = () => {
    if (!taskEditorState.customAlarmDataUrl) {
      reportActionBlocked('quick-add-preview-reminder', 'No custom reminder audio is available.', false);
      return;
    }
    stopTaskPreview();

    const media = new Audio(taskEditorState.customAlarmDataUrl);
    media.volume = 0.85;
    media.play().then(() => {
      setIsTaskPreviewPlaying(true);
      reportActionSuccess('quick-add-preview-reminder', 'Preview audio playing.');
    }).catch(() => {
      setIsTaskPreviewPlaying(false);
      reportActionBlocked('quick-add-preview-reminder', 'Could not play uploaded reminder audio.', false);
    });
    media.onended = () => {
      setIsTaskPreviewPlaying(false);
      taskPreviewMediaRef.current = null;
    };

    taskPreviewMediaRef.current = media;
  };

  useEffect(() => {
    return () => {
      stopTaskPreview();
    };
  }, []);

  useEffect(() => {
    if (!detailTaskId) return;
    const exists = tasks.some((task) => task.id === detailTaskId);
    if (!exists) {
      closeTaskDetails();
    }
  }, [detailTaskId, tasks]);

  const today = new Date();
  const formattedDate = format(today, 'EEEE, MMMM dd');
  const taskStats = getDailyTaskStats(tasks, dailyTaskGoal);
  const priorityTask = useMemo(() => {
    const candidates = tasks.filter((task) => isTaskScheduledForToday(task) && !isTaskCompletedForToday(task) && (task.priority === 'A' || task.priority === 'B'));
    return candidates.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] || null;
  }, [tasks]);

  const todaysTasks = useMemo(() => {
    return tasks.filter((task) => isTaskScheduledForToday(task));
  }, [tasks]);
  const dailyTasks = useMemo(() => todaysTasks.filter((t) => t.repeat === 'daily'), [todaysTasks]);
  const weeklyTasks = useMemo(() => todaysTasks.filter((t) => t.repeat === 'weekly'), [todaysTasks]);

  const sortedTodayTasks = useMemo(() => {
    return [...todaysTasks].sort((a, b) => {
      const aCompleted = isTaskCompletedForToday(a);
      const bCompleted = isTaskCompletedForToday(b);
      if (aCompleted !== bCompleted) return Number(aCompleted) - Number(bCompleted);

      const aDue = parseTaskDueDate(a)?.getTime() || 0;
      const bDue = parseTaskDueDate(b)?.getTime() || 0;
      if (aDue !== bDue) return bDue - aDue;

      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [todaysTasks]);

  const failedTaskIds = useMemo(() => {
    return new Set(
      todaysTasks
        .filter((task) => {
          if (String(task.id || '').startsWith('habit-task-')) return false;
          if (isTaskCompletedForToday(task)) return false;
          // Use duration-based failure detection if duration is set
          return isTaskFailedByDuration(task);
        })
        .map((task) => task.id)
    );
  }, [todaysTasks]);

  const dailyCompleted = dailyTasks.filter((t) => isTaskCompletedForToday(t)).length;
  const onceCompleted = weeklyTasks.filter((t) => isTaskCompletedForToday(t)).length;
  const dailyPercent = dailyTasks.length ? Math.round((dailyCompleted / dailyTasks.length) * 100) : 0;
  const oncePercent = weeklyTasks.length ? Math.round((onceCompleted / weeklyTasks.length) * 100) : 0;
  const notificationPermissionState = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  const notificationStateLabel = notificationPermissionState === 'granted'
    ? 'Granted'
    : notificationPermissionState === 'denied'
      ? 'Blocked'
      : notificationPermissionState === 'default'
        ? 'Pending'
        : 'Unsupported';
  const alarmReadyCount = useMemo(() => {
    return tasks.filter((task) => {
      if (isTaskCompletedForToday(task)) return false;
      if (task.alarmEnabled === false) return false;
      return Boolean(parseTaskDueDate(task));
    }).length;
  }, [tasks]);

  const refreshOperationalStatus = useCallback(async (withFeedback: boolean) => {
    setOpsChecking(true);
    setOpsCheckError('');

    try {
      const health = await fetch('/api/health', { cache: 'no-store' });
      if (!health.ok) {
        throw new Error('Backend health check is unavailable.');
      }

      setOpsLastCheckedAt(new Date().toISOString());
      if (withFeedback) {
        setNotificationStatus('System status refreshed.');
      }
    } catch (error) {
      setOpsCheckError(error instanceof Error ? error.message : 'Could not refresh operational status.');
      if (withFeedback) {
        setNotificationStatus('Could not refresh system status.');
      }
    } finally {
      setOpsChecking(false);
    }
  }, []);

  const runSystemCheck = async () => {
    await pushReminderEvent('System check', 'Reminder channels are alive.');
    void refreshOperationalStatus(true);
  };

  useEffect(() => {
    const fetchInsight = async () => {
      setLoadingInsight(true);
      try {
        const context = `User is level ${layers[0]?.level || 1}. Tasks today: ${tasks.length}. Focus areas active.`;
        const nextInsight = await getEdenInsight(context);
        if (nextInsight) setInsight(nextInsight);
      } catch (error) {
        console.warn('Insight unavailable', error);
      } finally {
        setLoadingInsight(false);
      }
    };

    const fetchReadingSuggestion = async () => {
      try {
        const suggested = await getSuggestedVerse();
        if (suggested?.suggestion) {
          setReadingSuggestion(suggested.suggestion);
        }
      } catch (error) {
        console.warn('Reading suggestion unavailable', error);
      }
    };

    fetchInsight();
    fetchReadingSuggestion();
  }, [layers, tasks]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as any);
      setShowInstallSuggestion(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    const checkMediaPermission = async () => {
      const permitted = await requestMediaPermission();
      setMediaPermissionGranted(permitted);
    };
    checkMediaPermission();
  }, []);

  useEffect(() => {
    return () => {
      stopActiveAlarm();
    };
  }, []);

  useEffect(() => {
    const clearAllScheduledTimeouts = () => {
      (Object.values(alarmTimeoutsRef.current) as number[]).forEach((timeoutId) => window.clearTimeout(timeoutId));
      alarmTimeoutsRef.current = {};
    };

    const getFutureDue = (task: Task, nowMs: number) => {
      const due = parseTaskDueDate(task);
      if (!due) return null;

      const reminderDue = new Date(due);
      if (task.repeat === 'daily' && reminderDue.getTime() <= nowMs) {
        reminderDue.setDate(reminderDue.getDate() + 1);
      }
      if (task.repeat === 'weekly' && reminderDue.getTime() <= nowMs) {
        reminderDue.setDate(reminderDue.getDate() + 7);
      }
      return reminderDue;
    };

    const triggerAlarm = async (task: Task, alarmKey: string) => {
      if (alarmTriggeredRef.current.has(alarmKey)) return;
      alarmTriggeredRef.current.add(alarmKey);

      await pushReminderEvent('Task due now', `${task.name} is due now (${task.time}).`, task.id);
      setNotificationStatus(`${task.name} is due now.`);
      setAlarmTask(task);
      setAlarmOpen(true);
      const uploaded = resolveTaskUploadedAlarm(task);
      await playTaskAlarm(task.name, uploaded?.dataUrl);
    };

    clearAllScheduledTimeouts();

    const now = Date.now();
    tasks.forEach((task) => {
      if (isTaskCompletedForToday(task) || task.alarmEnabled === false) return;

      const reminderDue = getFutureDue(task, now);
      if (!reminderDue) return;

      const dueMs = reminderDue.getTime();
      if (dueMs <= now) return;

      const alarmDelay = dueMs <= now ? 500 : dueMs - now;
      const alarmKey = `${task.id}|alarm|${reminderDue.toISOString().slice(0, 16)}`;

      if (alarmDelay > 1000 * 60 * 60 * 26) return;

      alarmTimeoutsRef.current[alarmKey] = window.setTimeout(() => {
        void triggerAlarm(task, alarmKey);
      }, alarmDelay);
    });

    return () => {
      clearAllScheduledTimeouts();
    };
  }, [tasks, layers, user?.preferences.notifications.taskReminders, user?.preferences.customFocusPlaylistNames, user?.preferences.customFocusPlaylistDataUrls, user?.preferences.customFocusSongName, user?.preferences.customFocusSongDataUrl]);

  useEffect(() => {
    const askOnce = async () => {
      if (!user) return;
      const askedKey = accountCacheKey ? `edenify_notification_asked_${accountCacheKey}` : 'edenify_notification_asked_guest';
      if (localStorage.getItem(askedKey) === 'true') return;
      await requestNotificationPermission(false);
      localStorage.setItem(askedKey, 'true');
    };

    askOnce();
  }, [user?.id, accountCacheKey]);

  useEffect(() => {
    if (!user) return;

    const revisionTask = tasks.find((task) => task.id === DEFAULT_REVISION_TASK_ID)
      || tasks.find((task) => task.layerId === 'academic' && task.name.trim().toLowerCase() === 'revision');
    if (!revisionTask) return;

    const normalizedTime = parseAnyTime(revisionTask.time || '');
    if (!normalizedTime) return;

    const [hours, minutes] = normalizedTime.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;

    const scheduleNextReminder = () => {
      const now = new Date();
      const nextReminder = new Date(now);
      nextReminder.setHours(hours, minutes, 0, 0);
      if (nextReminder.getTime() <= now.getTime()) {
        nextReminder.setDate(nextReminder.getDate() + 1);
      }

      if (academicReminderTimeoutRef.current) {
        window.clearTimeout(academicReminderTimeoutRef.current);
      }

      const delay = Math.max(500, nextReminder.getTime() - now.getTime());
      academicReminderTimeoutRef.current = window.setTimeout(() => {
        const todayKey = format(new Date(), 'yyyy-MM-dd');
        if (academicReminderTriggeredDateRef.current !== todayKey) {
          academicReminderTriggeredDateRef.current = todayKey;

          const subjects = getTomorrowSubjects();
          const detail = subjects.length
            ? `Tomorrow's subjects: ${subjects.join(', ')}. Start your revision now.`
            : 'No scheduled classes tomorrow. Use this revision block for consolidation and weak-topic review.';

          void pushReminderEvent('Academic revision reminder', detail, revisionTask.id);
          setNotificationStatus(subjects.length ? `Tomorrow: ${subjects.join(', ')}` : 'Revision block: no classes tomorrow.');
          if (revisionTask.alarmEnabled !== false) {
            void playTaskAlarm(revisionTask.name, revisionTask.customAlarmAudioDataUrl || getDefaultAlarmFromPreferences()?.dataUrl);
          }
        }

        scheduleNextReminder();
      }, delay);
    };

    scheduleNextReminder();

    return () => {
      if (academicReminderTimeoutRef.current) {
        window.clearTimeout(academicReminderTimeoutRef.current);
        academicReminderTimeoutRef.current = null;
      }
    };
  }, [tasks, user?.id]);

  useEffect(() => {
    void refreshOperationalStatus(false);

    const intervalId = window.setInterval(() => {
      void refreshOperationalStatus(false);
    }, 45000);

    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshOperationalStatus(false);
    };

    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [refreshOperationalStatus]);

  useEffect(() => {
    if (!user) return;
    if (user.preferences.notifications.dailyScripture) {
      void registerBibleReminderSync();
      return;
    }

    void unregisterBibleReminderSync();
  }, [user?.id, user?.preferences.notifications.dailyScripture]);

  useEffect(() => {
    if (!bibleReaderState.showScripturePage) return;

    const loadFullPassage = async () => {
      setLoadingScriptureText(true);
      try {
        const loadChapterWithAliases = async (bookName: string, chapterNo: number): Promise<BibleVerse[]> => {
          const normalized = bookName.trim();
          const candidates = Array.from(new Set([
            normalized,
            normalized.replace(/\bPsalms\b/i, 'Psalm'),
            normalized.replace(/\bPsalm\b/i, 'Psalms'),
            normalized.replace(/\bSong of Solomon\b/i, 'Song of Songs'),
            normalized.replace(/\bSong of Songs\b/i, 'Song of Solomon'),
            normalized.replace(/\bSong of Songs\b/i, 'Canticles'),
            normalized.replace(/\bCanticles\b/i, 'Song of Songs'),
          ]));

          for (const candidate of candidates) {
            const chapter = await getChapter(candidate, chapterNo);
            if (chapter.length > 0) return chapter;
          }

          return [];
        };

        const segments = bibleReading.passage
          .split(';')
          .map((part) => part.trim())
          .filter(Boolean);

        const parsedPages: BibleVerse[][] = [];
        const labels: string[] = [];

        for (const segment of segments) {
          const match = segment.match(/^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?(?:-(\d+))?$/);
          if (!match) continue;

          const book = match[1].trim();
          const chapterStart = Number(match[2]);
          const singleVerseStart = match[3] ? Number(match[3]) : null;
          const singleVerseEnd = match[4] ? Number(match[4]) : null;
          const chapterEnd = match[5] ? Number(match[5]) : chapterStart;

          const passagePage: BibleVerse[] = [];

          if (singleVerseStart !== null) {
            const chapter = await loadChapterWithAliases(book, chapterStart);
            const filtered = chapter.filter((v) => {
              if (singleVerseEnd !== null) return v.verse >= singleVerseStart && v.verse <= singleVerseEnd;
              return v.verse === singleVerseStart;
            });
            passagePage.push(...filtered);
            if (passagePage.length > 0) {
              parsedPages.push(passagePage);
              labels.push(segment);
            }
            continue;
          }

          for (let chapterNo = chapterStart; chapterNo <= chapterEnd; chapterNo += 1) {
            const chapter = await loadChapterWithAliases(book, chapterNo);
            passagePage.push(...chapter);
          }

          if (passagePage.length > 0) {
            parsedPages.push(passagePage);
            labels.push(segment);
          }
        }

        if (parsedPages.length > 0) {
          bibleReaderActions.setScripturePageIndex(0);
          bibleReaderActions.setScripturePages(parsedPages);
          bibleReaderActions.setScripturePageLabels(labels);
          return;
        }

        const fallback = await searchVerses(bibleReading.passage.split(' ')[0], 40);
        bibleReaderActions.setScripturePageIndex(0);
        bibleReaderActions.setScripturePages(fallback.length > 0 ? [fallback] : []);
        bibleReaderActions.setScripturePageLabels([bibleReading.passage]);
      } catch (error) {
        console.error('Could not load ASV passage', error);
        bibleReaderActions.setScripturePageIndex(0);
        bibleReaderActions.setScripturePages([]);
        bibleReaderActions.setScripturePageLabels([]);
      } finally {
        setLoadingScriptureText(false);
      }
    };

    loadFullPassage();
  }, [bibleReaderState.showScripturePage, bibleReading.passage, bibleReading.text]);

  useEffect(() => {
    if (!bibleReaderState.showScripturePage) {
      bibleReaderActions.setShowReflectionComposer(false);
      bibleReaderActions.toggleFullscreen(false);
      bibleReaderActions.setScripturePageIndex(0);
      bibleReaderActions.setScripturePages([]);
      bibleReaderActions.setScripturePageLabels([]);
      return;
    }

    bibleReaderActions.setReflectionDraft(bibleReading.reflection || '');

    const handleFullscreenChange = () => {
      const currentFullscreen = document.fullscreenElement;
      bibleReaderActions.toggleFullscreen(Boolean(currentFullscreen));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [bibleReaderState.showScripturePage, bibleReading.reflection]);

  const toggleScriptureFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        const element = scripturePageRef.current || document.documentElement;
        
        // Ensure theme classes are applied to fullscreen element
        const selectedTheme = document.documentElement.getAttribute('data-theme') || 'system';
        const isDark = document.documentElement.classList.contains('dark');
        element.setAttribute('data-theme', selectedTheme);
        
        if (isDark) {
          element.classList.add('dark');
        } else {
          element.classList.remove('dark');
        }
        
        await element.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.warn('Fullscreen toggle failed:', error);
    }
  };

  const closeScripturePage = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // no-op
      }
    }
    bibleReaderActions.setShowScripturePage(false);
  };

  const openReflectionComposer = () => {
    bibleReaderActions.setShowReflectionComposer(true);
    window.setTimeout(() => {
      reflectionComposerRef.current?.focus();
      reflectionComposerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 20);
  };

  const saveReflection = () => {
    const content = bibleReaderState.reflectionDraft.trim();
    if (!content) {
      setNotificationStatus('Write a short reflection before saving.');
      return;
    }

    addJournalEntry({
      id: `journal-${Date.now()}`,
      date: new Date().toISOString(),
      layerId: 'spiritual',
      content: `Day ${bibleReading.day} • ${bibleReading.passage}\n${content}`,
    });

    bibleReaderActions.setShowReflectionComposer(false);
    setNotificationStatus('Reflection saved to your journal.');
  };

  const handleRefreshBible = async () => {
    setLoadingBible(true);
    try {
      await refreshBibleReading();
    } finally {
      setLoadingBible(false);
    }
  };

  const handleBibleNavigation = async (direction: 'prev' | 'next') => {
    if (!canNavigateBible) {
      reportActionBlocked('bible-navigation', 'Bible navigation is temporarily unavailable right now.', false);
      return;
    }

    const delta = direction === 'next' ? 1 : -1;
    const targetDay = Math.min(maxBibleDay, Math.max(1, bibleReading.day + delta));
    if (targetDay === bibleReading.day) {
      reportActionBlocked('bible-navigation', direction === 'next' ? 'You are already at the latest available reading day.' : 'You are already at day 1.', false);
      return;
    }

    setLoadingBible(true);
    try {
      await goToBibleDay(targetDay);
      reportActionSuccess('bible-navigation', `Moved to Bible day ${targetDay}.`);
    } finally {
      setLoadingBible(false);
    }
  };

  const handleCompleteReading = async () => {
    await completeBibleDay(!bibleReading.completed);
  };

  const handleQuickAddTask = () => {
    const trimmedName = taskEditorState.name.trim();
    if (!trimmedName) {
      taskEditorActions.setQuickAddError('Task name is required.');
      reportActionBlocked('quick-add-create-task', 'Task name is required.', false);
      return;
    }

    if (taskEditorState.repeat === 'weekly' && !taskEditorState.date) {
      taskEditorActions.setQuickAddError('Please choose a calendar date for weekly tasks.');
      reportActionBlocked('quick-add-create-task', 'Calendar date is required for weekly tasks.', false);
      return;
    }

    const resolvedTime = buildTimeFromEditor(taskEditorState.timeFormat, taskEditorState.hourInput, taskEditorState.minuteInput, taskEditorState.period);
    if (!resolvedTime) {
      taskEditorActions.setQuickAddError('Please enter a valid time (hour and minute).');
      reportActionBlocked('quick-add-create-task', 'Task time is invalid.', false);
      return;
    }

    const baseDate = taskEditorState.repeat === 'weekly' ? new Date(`${taskEditorState.date}T00:00:00`) : new Date();
    const dueDate = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;

    const draftTask: Task = {
      id: `task-${Date.now()}`,
      name: trimmedName,
      layerId: taskEditorState.layer,
      priority: taskEditorState.priority,
      repeat: taskEditorState.repeat,
      time: resolvedTime,
      completed: false,
      date: dueDate.toISOString(),
      alarmEnabled: taskEditorState.alarmEnabled,
      preferredMusic: taskEditorState.preferredMusic || taskEditorState.customAlarmName || 'Uploaded Song',
      customAlarmAudioName: taskEditorState.customAlarmName || 'Uploaded Song',
      customAlarmAudioDataUrl: taskEditorState.customAlarmDataUrl || undefined,
      estimatedDuration: taskEditorState.duration,
      durationStartedAt: new Date().toISOString(),
    };

    const due = parseTaskDueDate(draftTask);
    if (!due) {
      taskEditorActions.setQuickAddError('Could not understand this time. Please check hour/minute values.');
      reportActionBlocked('quick-add-create-task', 'Task due time could not be parsed.', false);
      return;
    }

    if (taskEditorState.repeat === 'once' && due.getTime() <= Date.now()) {
      taskEditorActions.setQuickAddError('Please choose a future time. Past times cannot be used.');
      reportActionBlocked('quick-add-create-task', 'One-time task cannot be scheduled in the past.', false);
      return;
    }

    addTask(draftTask);

    // Save last used alarm song for future task creation
    if (taskEditorState.customAlarmDataUrl && taskEditorState.customAlarmName && user) {
      setUser({
        ...user,
        preferences: {
          ...user.preferences,
          lastAlarmSongName: taskEditorState.customAlarmName,
          lastAlarmSongDataUrl: taskEditorState.customAlarmDataUrl,
        },
      });
    }

    taskEditorActions.setName('');
    taskEditorActions.setLayer('general');
    taskEditorActions.setPriority('C');
    taskEditorActions.setRepeat('once');
    const rounded = getRoundedCurrentTime();
    const roundedParts = parseTimeToEditor(rounded);
    taskEditorActions.setTime(rounded);
    taskEditorActions.setTimeFormat('24');
    taskEditorActions.setHourInput(roundedParts.hour24);
    taskEditorActions.setMinuteInput(roundedParts.minute);
    taskEditorActions.setPeriod(roundedParts.period);
    taskEditorActions.setDate(format(new Date(), 'yyyy-MM-dd'));
    taskEditorActions.setAlarmEnabled(true);
    const defaultAlarm = getDefaultAlarmFromPreferences();
    if (defaultAlarm) {
      taskEditorActions.setPreferredMusic(defaultAlarm.name);
      taskEditorActions.setCustomAlarmName(defaultAlarm.name);
      taskEditorActions.setCustomAlarmDataUrl(defaultAlarm.dataUrl);
    } else {
      taskEditorActions.setPreferredMusic('');
      taskEditorActions.setCustomAlarmName('');
      taskEditorActions.setCustomAlarmDataUrl('');
    }
    taskEditorActions.setQuickAddError('');
    setShowTemplatePicker(false);
    setEdenTemplatePool([]);
    setShowQuickAdd(false);
    reportActionSuccess('quick-add-create-task', `Task created: ${trimmedName}.`);
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read audio file.'));
      reader.readAsDataURL(file);
    });
  };

  const handleReminderSongUpload = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      taskEditorActions.setQuickAddError('Please choose a valid reminder audio file.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      taskEditorActions.setQuickAddError('Reminder audio is too large. Use a file under 20MB.');
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    if ((dataUrl || '').length > 25 * 1024 * 1024) {
      taskEditorActions.setQuickAddError('Reminder audio is too large after encoding. Please use a shorter or more compressed file.');
      return;
    }

    taskEditorActions.setCustomAlarmName(file.name);
    taskEditorActions.setCustomAlarmDataUrl(dataUrl);
    if (user) {
      setUser({
        ...user,
        preferences: {
          ...user.preferences,
          lastAlarmSongName: file.name,
          lastAlarmSongDataUrl: dataUrl,
        },
      });
    }
    taskEditorActions.setQuickAddError('');
  };

  const applyTemplateDraft = (template: EdenTemplate) => {
    taskEditorActions.setName(template.name);
    taskEditorActions.setLayer(template.layerId);
    taskEditorActions.setPriority(template.priority);
    taskEditorActions.setRepeat(template.repeat);

    const parts = parseTimeToEditor(template.time);
    taskEditorActions.setTime(template.time);
    if (taskEditorState.timeFormat === '12') {
      taskEditorActions.setHourInput(parts.hour12);
      taskEditorActions.setPeriod(parts.period);
    } else {
      taskEditorActions.setHourInput(parts.hour24);
    }
    taskEditorActions.setMinuteInput(parts.minute);
  };

  const handleTaskByEdenDraft = async () => {
    setIsGeneratingTask(true);
    taskEditorActions.setQuickAddError('');

    const recommendations = getRecommendedEdenTemplates({
      tasks,
      layerId: taskEditorState.layer,
      intent: taskEditorState.name,
      mostRepeated: user?.preferences.mostRepeatedTasks?.map((entry) => ({
        name: entry.name,
        layerId: entry.layerId,
        count: entry.count,
      })),
      limit: 18,
    });

    if (recommendations.length > 0) {
      setEdenTemplatePool(recommendations);
      setShowTemplatePicker(true);
    } else {
      setShowTemplatePicker(false);
      taskEditorActions.setQuickAddError('No strong template match yet. You can keep typing or add the task manually.');
    }

    const suggestion = await suggestTaskWithGemini({
      userName: user?.name,
      layer: taskEditorState.layer,
      priority: taskEditorState.priority,
      preferredTime: taskEditorState.time,
      intent: taskEditorState.name || 'help me create one meaningful task for today',
      userPreferences: {
        favoriteMusicName: favoriteFocusTrack?.name,
      },
    });

    if (!suggestion) {
      if (recommendations.length === 0) {
        taskEditorActions.setQuickAddError('Task by Eden is unavailable right now. Try again.');
      }
      setIsGeneratingTask(false);
      reportActionBlocked('task-by-eden', 'Task by Eden is unavailable right now.', false);
      return;
    }

    taskEditorActions.setQuickAddError('');
    taskEditorActions.setName(suggestion.name || taskEditorState.name);
    const normalizedTime = parseAnyTime(suggestion.time || taskEditorState.time);
    if (normalizedTime) {
      const parts = parseTimeToEditor(normalizedTime);
      taskEditorActions.setTime(normalizedTime);
      if (taskEditorState.timeFormat === '12') {
        taskEditorActions.setHourInput(parts.hour12);
        taskEditorActions.setPeriod(parts.period);
      } else {
        taskEditorActions.setHourInput(parts.hour24);
      }
      taskEditorActions.setMinuteInput(parts.minute);
    }
    taskEditorActions.setPreferredMusic(favoriteFocusTrack?.name || suggestion.preferredMusic || taskEditorState.preferredMusic);
    if (favoriteFocusTrack && suggestion.preferredMusic === favoriteFocusTrack.name) {
      taskEditorActions.setCustomAlarmName(favoriteFocusTrack.name);
      taskEditorActions.setCustomAlarmDataUrl(favoriteFocusTrack.dataUrl);
    }
    setIsGeneratingTask(false);
    reportActionSuccess('task-by-eden', 'Task draft generated from Eden recommendations.');
  };

  useEffect(() => {
    const normalized = buildTimeFromEditor(taskEditorState.timeFormat, taskEditorState.hourInput, taskEditorState.minuteInput, taskEditorState.period);
    if (normalized) {
      taskEditorActions.setTime(normalized);
    }
  }, [taskEditorState.timeFormat, taskEditorState.hourInput, taskEditorState.minuteInput, taskEditorState.period]);

  useEffect(() => {
    const parts = parseTimeToEditor(taskEditorState.time);
    if (taskEditorState.timeFormat === '12') {
      taskEditorActions.setHourInput(parts.hour12);
      taskEditorActions.setPeriod(parts.period);
      return;
    }

    taskEditorActions.setHourInput(parts.hour24);
  }, [taskEditorState.timeFormat]);

  const handleInstallApp = async () => {
    if (!installPromptEvent) {
      reportActionBlocked('install-app', 'Install prompt is not available yet on this device/browser.');
      return;
    }

    installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    if (choice?.outcome === 'accepted') {
      setShowInstallSuggestion(false);
      reportActionSuccess('install-app', 'Install prompt accepted.');
    } else {
      reportActionBlocked('install-app', 'Install prompt was dismissed.', false);
    }
    setInstallPromptEvent(null);
  };

  const pillarMeta: Record<string, { icon: string; iconClass: string; bgClass: string; strokeClass: string }> = {
    spiritual: {
      icon: 'church',
      iconClass: 'text-[var(--color-spiritual)]',
      bgClass: 'bg-[color:rgba(122,101,80,0.12)]',
      strokeClass: 'stroke-[var(--color-spiritual)]',
    },
    academic: {
      icon: 'school',
      iconClass: 'text-[var(--color-academic)]',
      bgClass: 'bg-[color:rgba(77,107,74,0.12)]',
      strokeClass: 'stroke-[var(--color-academic)]',
    },
    financial: {
      icon: 'payments',
      iconClass: 'text-[var(--color-financial)]',
      bgClass: 'bg-[color:rgba(74,93,107,0.12)]',
      strokeClass: 'stroke-[var(--color-financial)]',
    },
    physical: {
      icon: 'fitness_center',
      iconClass: 'text-[var(--color-physical)]',
      bgClass: 'bg-[color:rgba(140,60,60,0.12)]',
      strokeClass: 'stroke-[var(--color-physical)]',
    },
    general: {
      icon: 'grid_view',
      iconClass: 'text-[var(--color-general)]',
      bgClass: 'bg-[color:rgba(92,74,107,0.12)]',
      strokeClass: 'stroke-[var(--color-general)]',
    },
  };

  const openLayerFromHome = (layerId: LayerId) => {
    reportActionSuccess('open-layer', `Opened ${layerId} layer.`);
    window.dispatchEvent(new CustomEvent('edenify:navigate', {
      detail: {
        tab: 'layers',
        layerId,
      },
    }));
  };

  const handleOpenQuickAdd = () => {
    setShowQuickAdd(true);
    reportActionSuccess('open-quick-add', 'Opened quick add task modal.');
  };

  const handleTaskToggleAction = (taskId: string, source: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      reportActionBlocked('task-toggle', `Task was not found (${source}).`, false);
      return;
    }

    const nextState = !isTaskCompletedForToday(task);
    toggleTask(taskId);
    reportActionSuccess('task-toggle', `${nextState ? 'Completed' : 'Reopened'} task: ${task.name} (${source}).`);
  };

  const handleTaskDeleteAction = (taskId: string, source: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      reportActionBlocked('task-delete', `Task was not found (${source}).`, false);
      return;
    }

    deleteTask(taskId);
    reportActionSuccess('task-delete', `Deleted task: ${task.name} (${source}).`);
  };

  return (
    <div className="min-h-screen bg-surface pb-24">
      {!isSubPageOpen && (
      <header className="fixed top-0 left-0 right-0 z-50 h-[62px] bg-[#fef9f2]/92 dark:bg-background/92 backdrop-blur-xl border-b border-outline-variant/25">
        <div className="w-full h-full px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-container shadow-sm ring-1 ring-white/60">
              {user?.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                  {user?.name?.[0] || 'U'}
                </div>
              )}
            </div>
            <div className="leading-tight -space-y-0.5">
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-secondary/55">Good day</p>
              <p className="text-sm sm:text-base font-serif font-medium tracking-[-0.02em] text-on-surface">{user?.name || 'User'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              aria-label="Search"
              title="Search"
              onClick={() => setShowGlobalSearch(true)}
              className="h-10 w-10 rounded-full bg-surface-container-low flex items-center justify-center text-primary hover:opacity-80 transition-opacity"
            >
              <Search size={18} />
            </button>

            <button
              aria-label="Notifications"
              title="Notifications"
              onClick={toggleNotifications}
              className="relative h-10 w-10 rounded-full bg-surface-container-low flex items-center justify-center text-primary hover:opacity-80 transition-opacity"
            >
              <span className="material-symbols-outlined text-[20px]">{notificationsEnabled ? 'notifications_active' : 'notifications_off'}</span>
              <span className={cn('absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full', notificationsEnabled ? 'bg-emerald-500' : 'bg-outline')} />
            </button>
          </div>
        </div>
      </header>
      )}

      {!isSubPageOpen && (
      <main className="pt-[82px] px-4 sm:px-6 lg:px-8 w-full space-y-7">
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 px-1">
          <p className="font-label text-[11px] uppercase tracking-[0.2em] text-on-surface-variant/60 font-bold">{formattedDate}</p>
          <h1 className="display-text text-[2.6rem] sm:text-5xl font-medium tracking-[-0.04em] leading-[0.98] text-on-surface max-w-[12ch]">Good day, {user?.name || 'there'}.</h1>
          {notificationStatus && <p className="text-[11px] text-primary font-semibold">{notificationStatus}</p>}
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-surface-container-low rounded-2xl overflow-hidden border border-outline-variant/35">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="p-6 sm:p-7 border-b lg:border-b-0 lg:border-r border-outline-variant/30">
              <div className="flex justify-between items-end mb-6">
                <div>
                  <p className="font-label text-[10px] font-bold uppercase tracking-widest text-primary-container mb-2">Today's Task Progression</p>
                  <h2 className="display-text text-2xl text-on-surface">{taskStats.completed} of {taskStats.total} tasks</h2>
                </div>
                <p className="display-text text-4xl text-primary">{taskStats.percentage}%</p>
              </div>

              <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${taskStats.percentage}%` }} transition={{ duration: 0.9, ease: 'easeOut' }} className="h-full bg-gradient-to-r from-primary to-primary-container" />
              </div>

              <div className="grid grid-cols-2 gap-4 mt-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-label text-[10px] uppercase tracking-[0.14em] text-outline font-bold">Daily</p>
                    <p className="font-label text-[10px] uppercase tracking-[0.14em] text-primary font-bold">{dailyCompleted}/{dailyTasks.length}</p>
                  </div>
                  <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${dailyPercent}%` }} transition={{ duration: 0.7 }} className="h-full bg-primary" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-label text-[10px] uppercase tracking-[0.14em] text-outline font-bold">Weekly</p>
                    <p className="font-label text-[10px] uppercase tracking-[0.14em] text-primary font-bold">{onceCompleted}/{weeklyTasks.length}</p>
                  </div>
                  <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${oncePercent}%` }} transition={{ duration: 0.7 }} className="h-full bg-primary-container" />
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <p className="font-label text-[10px] uppercase tracking-[0.14em] text-red-500 font-bold">Failure</p>
                  <p className="font-label text-[10px] uppercase tracking-[0.14em] text-red-500 font-bold">{failedTaskIds.size}/{Math.max(1, todaysTasks.length)}</p>
                </div>
                <div className="h-1 bg-red-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (failedTaskIds.size / Math.max(1, todaysTasks.length)) * 100)}%` }}
                    transition={{ duration: 0.7 }}
                    className="h-full bg-red-500"
                  />
                </div>
              </div>

            </div>

            <div className="p-6 sm:p-7 text-left bg-surface-container-lowest rounded-2xl">
              <BibleReadingUI
                currentDay={bibleReading.day || 1}
                completedToday={completedToday}
                onToggleComplete={(completed) => {
                  completeBibleDay(completed);
                }}
                onReadMore={() => {
                  bibleReaderActions.setShowScripturePage(true);
                }}
                isProgressionEnforced={true}
              />
            </div>
          </div>
        </motion.section>

          <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-surface-container-low p-6 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-[#7a6550]" />
          <p className="font-label text-[10px] font-bold tracking-[0.15em] text-[#7a6550] uppercase mb-3">AI Insight</p>
          <p className="serif-text text-base text-on-surface-variant leading-snug italic">
            {loadingInsight ? 'Eden is reflecting...' : `"${insight}"`}
          </p>
        </motion.section>

        {priorityTask && (
          <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/30 shadow-[0_10px_28px_rgba(44,33,24,0.05)] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary-container" />
            <div className="flex justify-between items-start mb-4">
              <p className="font-label text-[10px] uppercase tracking-widest text-primary-container font-bold">Today's Priority</p>
              <p className="font-label text-[11px] text-outline">{priorityTask.time}</p>
            </div>
            <h3 className="display-text text-2xl text-on-surface">{priorityTask.name}</h3>
            <div className="mt-5 flex items-center gap-3">
              <div className="flex-1 h-px bg-outline-variant/30" />
              <button onClick={() => handleTaskToggleAction(priorityTask.id, 'priority-card')} className="text-primary font-label text-xs uppercase tracking-[0.14em] font-bold hover:opacity-70">Start now</button>
            </div>
          </motion.section>
        )}

        <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex items-center justify-between bg-surface-container-highest/30 p-4 rounded-xl">
          <div className="flex items-center gap-3">
            <Timer size={18} className="text-primary" />
            <span className="font-label font-bold text-sm text-on-surface">Focus Session</span>
          </div>
          <button onClick={() => setShowFocusPage(true)} className="bg-gradient-to-br from-primary to-primary-container text-white px-6 py-2 rounded-full font-label text-xs font-bold uppercase tracking-wider shadow-sm transition-transform active:scale-95">Open</button>
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {layers.map((layer, index) => {
            const layerTasksToday = todaysTasks.filter((task) => task.layerId === layer.id);
            const createdCount = layerTasksToday.length;
            const doneCount = layerTasksToday.filter((task) => isTaskCompletedForToday(task)).length;
            const progress = createdCount > 0 ? Math.round((doneCount / createdCount) * 100) : Math.round(getProgress(layer.xp, layer.maxXp));
            const radius = 30;
            const circumference = 2 * Math.PI * radius;
            const dashOffset = circumference - (progress / 100) * circumference;
            const meta = pillarMeta[layer.id] || pillarMeta.general;

            return (
              <motion.button
                key={layer.id}
                type="button"
                onClick={() => openLayerFromHome(layer.id)}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.38 + index * 0.04 }}
                className="bg-surface-container-low p-5 rounded-2xl border border-outline-variant/25 aspect-square flex flex-col justify-between text-left hover:border-primary/35 transition-colors"
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', meta.bgClass)}>
                  <span className={cn('material-symbols-outlined text-lg', meta.iconClass)}>{meta.icon}</span>
                </div>

                <div>
                  <p className="font-label text-[10px] uppercase tracking-[0.14em] text-outline font-bold mb-2">{layer.name}</p>
                  <div className="relative w-[80%] aspect-square min-w-[82px] max-w-[150px] mx-auto">
                    <svg viewBox="0 0 80 80" className="w-full h-full">
                      <circle cx="40" cy="40" r={radius} className="fill-none stroke-outline-variant/35" strokeWidth="7" />
                      <circle
                        cx="40"
                        cy="40"
                        r={radius}
                        className={cn('fill-none transition-all duration-700', meta.strokeClass)}
                        strokeWidth="7"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                        transform="rotate(-90 40 40)"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-label text-[clamp(11px,1.7vw,14px)] font-bold text-on-surface">{progress}%</span>
                    </div>
                  </div>
                  <p className="mt-1 font-label text-[9px] uppercase tracking-[0.12em] text-secondary/70 font-bold">{doneCount}/{createdCount} done</p>
                </div>
              </motion.button>
            );
          })}
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="space-y-5 pb-12">
          <div className="flex items-center justify-between">
            <h2 className="display-text text-2xl text-on-surface">Today's Tasks</h2>
            <p className="font-label text-[10px] uppercase tracking-[0.14em] text-outline font-bold">Hour + Layer</p>
          </div>

          <div className="space-y-3">
            <TaskList
              tasks={sortedTodayTasks}
              layers={layers}
              failedTaskIds={failedTaskIds}
              focusedTaskId={focusedTaskId}
              onToggleTask={handleTaskToggleAction}
              onModifyTask={openTaskDetails}
              onDeleteTask={handleTaskDeleteAction}
            />
          </div>
        </motion.section>
      </main>
      )}

      {!isSubPageOpen && (
      <button
        aria-label="Quick add task"
        title="Quick add task"
        onClick={handleOpenQuickAdd}
        className="fixed bottom-24 right-6 z-[60] h-14 w-14 rounded-full bg-gradient-to-br from-primary to-primary-container text-white shadow-[0_12px_32px_rgba(150,68,7,0.3)] flex items-center justify-center transition-transform active:scale-95"
      >
        <Plus size={24} />
      </button>
      )}

      <AnimatePresence>
        {bibleReaderState.showScripturePage && (
          <motion.div ref={scripturePageRef} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="min-h-screen bg-surface overflow-y-auto no-scrollbar pb-24">
            {bibleReaderState.isFullscreen && (
              <div
                className="fixed left-0 right-0 z-40 px-3 pointer-events-none top-[env(safe-area-inset-top)]"
              >
                <div className="max-w-4xl mx-auto pt-2 flex items-center justify-between pointer-events-auto">
                  <button
                    aria-label="Back to home"
                    title="Back"
                    onClick={closeScripturePage}
                    className="h-11 w-11 rounded-full bg-black/35 text-white flex items-center justify-center backdrop-blur-sm"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <button
                    aria-label="Exit fullscreen"
                    title="Exit fullscreen"
                    onClick={toggleScriptureFullscreen}
                    className="h-11 w-11 rounded-full bg-black/35 text-white flex items-center justify-center backdrop-blur-sm"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            )}

            <header className="sticky top-0 left-0 right-0 z-20 bg-background/80 backdrop-blur-md border-b border-outline-variant/15">
              <div className="min-h-16 max-w-4xl mx-auto px-4 sm:px-6 pt-[max(0.25rem,env(safe-area-inset-top))] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button aria-label="Close scripture page" title="Back" onClick={closeScripturePage} className="h-10 w-10 rounded-full hover:bg-surface-container-low text-primary flex items-center justify-center transition-colors">
                    <ArrowLeft size={18} />
                  </button>
                  <div>
                    <h1 className="text-lg font-serif text-on-surface">Day {bibleReading.day} of {bibleReading.totalDays}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-primary bg-primary/10 rounded-full px-2 py-1">Current: {bibleReading.day}</span>
                      <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-secondary bg-surface-container-low rounded-full px-2 py-1">Highest: {bibleReading.highestCompletedDay}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    aria-label={bibleReaderState.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    title={bibleReaderState.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    onClick={toggleScriptureFullscreen}
                    className="h-10 w-10 rounded-full hover:bg-surface-container-low text-primary flex items-center justify-center transition-colors"
                  >
                    {bibleReaderState.isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                  <button
                    aria-label="Previous scripture"
                    title="Previous"
                    disabled={!canNavigateBible || bibleReading.day <= 1 || loadingBible}
                    onClick={() => handleBibleNavigation('prev')}
                    className="h-10 w-10 rounded-full hover:bg-surface-container-low text-primary flex items-center justify-center transition-colors disabled:opacity-40"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <button aria-label="Refresh reading" title="Refresh reading" onClick={handleRefreshBible} className="h-10 w-10 rounded-full hover:bg-surface-container-low text-primary flex items-center justify-center transition-colors">
                    {loadingBible ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  </button>
                  <button
                    aria-label={bibleReaderState.isReadingAloud ? 'Stop reading aloud' : 'Read scripture aloud'}
                    title={bibleReaderState.isReadingAloud ? 'Stop reading aloud' : 'Read aloud'}
                    onClick={bibleReaderState.isReadingAloud ? stopScriptureReading : readScriptureAloud}
                    className="h-10 w-10 rounded-full hover:bg-surface-container-low text-primary flex items-center justify-center transition-colors"
                  >
                    {bibleReaderState.isReadingAloud ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button
                    aria-label="Next day reading"
                    title="Next day"
                    disabled={!canNavigateBible || bibleReading.day >= maxBibleDay || loadingBible}
                    onClick={() => handleBibleNavigation('next')}
                    className="h-10 w-10 rounded-full hover:bg-surface-container-low text-primary flex items-center justify-center transition-colors disabled:opacity-40"
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-28 space-y-10">
              <section>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-outline">Read More</p>
                  <h2 className="text-2xl sm:text-3xl font-semibold text-on-surface tracking-tight">{activeScriptureLabel}</h2>
                  {notificationStatus && (
                    <p className="text-xs font-semibold text-primary">{notificationStatus}</p>
                  )}
                  {bibleReaderState.pages.length > 1 && (
                    <p className="text-xs text-secondary uppercase tracking-[0.14em] font-bold">Passage {bibleReaderState.pageIndex + 1} of {bibleReaderState.pages.length}</p>
                  )}
                </div>
              </section>

              <section className="space-y-7 max-w-2xl">
                {loadingScriptureText && <p className="text-sm text-on-surface-variant">Loading chapter text from ASV database...</p>}

                {!loadingScriptureText && bibleReaderState.pages.length === 0 && (
                  <p className="text-base leading-7 text-on-surface-variant dark:text-on-surface">
                    <span className="text-primary font-semibold mr-2">1</span>
                    {bibleReading.text}
                  </p>
                )}

                {!loadingScriptureText && bibleReaderState.pages.length > 0 && (
                  <div className="space-y-6">
                    <p className="text-xs uppercase tracking-[0.14em] font-bold text-primary">{activeScriptureLabel}</p>
                    {activeScripturePage.map((verse, index) => {
                      const prev = index > 0 ? activeScripturePage[index - 1] : null;
                      const showChapterTitle = !prev || prev.bookName !== verse.bookName || prev.chapter !== verse.chapter;

                      return (
                        <div key={`${verse.bookName}-${verse.chapter}-${verse.verse}`} className="space-y-2">
                          {showChapterTitle && (
                            <p className="text-xs uppercase tracking-[0.14em] font-bold text-primary">{verse.bookName} {verse.chapter}</p>
                          )}
                          <p className="text-base leading-7 text-on-surface-variant dark:text-on-surface">
                            <span className="text-primary font-semibold mr-2">{verse.verse}</span>
                            {verse.text}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {bibleReaderState.pages.length > 1 && (
                  <section className="max-w-2xl pt-8">
                    <div className="flex items-center justify-between gap-3 border-t border-outline-variant/25 pt-6">
                      <button
                        type="button"
                        onClick={() => bibleReaderActions.setScripturePageIndex((prev) => Math.max(0, prev - 1))}
                        disabled={bibleReaderState.pageIndex <= 0}
                        className="px-4 py-2 rounded-full bg-surface-container-low text-primary text-xs font-bold uppercase tracking-[0.14em] disabled:opacity-40"
                      >
                        Keep Reading Left
                      </button>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-secondary">{bibleReaderState.pageIndex + 1}/{bibleReaderState.pages.length}</p>
                      <button
                        type="button"
                        onClick={() => bibleReaderActions.setScripturePageIndex((prev) => Math.min(bibleReaderState.pages.length - 1, prev + 1))}
                        disabled={bibleReaderState.pageIndex >= bibleReaderState.pages.length - 1}
                        className="px-4 py-2 rounded-full bg-primary text-white text-xs font-bold uppercase tracking-[0.14em] disabled:opacity-40"
                      >
                        Keep Reading Right
                      </button>
                    </div>
                  </section>
                )}
              </section>

              <section className="rounded-3xl border border-outline-variant/20 bg-surface-container-low p-6 sm:p-8 max-w-2xl">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-primary">Eden Insight</p>
                  <p className="text-base sm:text-lg text-on-surface-variant leading-relaxed">
                    {readingSuggestion || 'Reflect on one practical action you will take today from this reading.'}
                  </p>
                </div>
              </section>

            </main>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFocusPage && (
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 18 }}>
            <Focus user={user} setUser={setUser} onClose={() => setShowFocusPage(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showQuickAdd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowQuickAdd(false)}
            className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm flex items-center justify-center p-5"
          >
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 220 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl overflow-hidden rounded-[2rem] bg-surface-container-low border border-outline-variant/25 shadow-[0_20px_50px_rgba(44,33,24,0.08)] p-5 sm:p-6 max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <div className="max-w-3xl mx-auto space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold">Quick Add Task</p>
                    <h3 className="display-text text-2xl text-on-surface mt-1">Create a task without the noise</h3>
                  </div>
                  <button
                    aria-label="Close quick add"
                    title="Close"
                    onClick={() => setShowQuickAdd(false)}
                    className="h-9 w-9 rounded-full bg-surface-container-low text-primary flex items-center justify-center border border-outline-variant/30"
                  >
                    <ArrowLeft size={16} />
                  </button>
                </div>

                <div className="space-y-4">
                  {taskEditorState.quickAddError && <p className="text-xs text-red-600">{taskEditorState.quickAddError}</p>}

                  <div>
                    <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Task Name</label>
                    <input
                      aria-label="Task name"
                      value={taskEditorState.name}
                      onChange={(e) => taskEditorActions.setName(e.target.value)}
                      placeholder="Write one clear task"
                      className="w-full rounded-xl border border-outline-variant/45 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                    />
                    {realtimeTemplateSuggestions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {realtimeTemplateSuggestions.map((template, index) => (
                          <button
                            key={`${template.layerId}-${template.name}-rt-${index}`}
                            type="button"
                            onClick={() => applyTemplateDraft(template)}
                            className="px-2.5 py-1.5 rounded-full border border-outline-variant/35 bg-surface-container-lowest text-[10px] font-bold uppercase tracking-[0.1em] text-secondary hover:text-primary hover:border-primary/40"
                          >
                            {template.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Layer</label>
                      <select
                        aria-label="Task layer"
                        value={taskEditorState.layer}
                        onChange={(e) => taskEditorActions.setLayer(e.target.value as LayerId)}
                        className="w-full rounded-xl border border-outline-variant/45 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                      >
                        <option value="spiritual">Spiritual</option>
                        <option value="academic">Academic</option>
                        <option value="financial">Financial</option>
                        <option value="physical">Physical</option>
                        <option value="general">General</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Priority</label>
                      <select
                        aria-label="Task priority"
                        value={taskEditorState.priority}
                        onChange={(e) => taskEditorActions.setPriority(e.target.value as 'A' | 'B' | 'C' | 'D' | 'E')}
                        className="w-full rounded-xl border border-outline-variant/45 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                      >
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                        <option value="E">E</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Time</label>
                      <div className="space-y-2 rounded-xl border border-outline-variant/45 bg-surface-container-low p-2.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => taskEditorActions.setTimeFormat('24')}
                            className={cn(
                              'px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-[0.12em] border transition-colors',
                              taskEditorState.timeFormat === '24'
                                ? 'bg-primary text-white border-primary'
                                : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                            )}
                          >
                            24H
                          </button>
                          <button
                            type="button"
                            onClick={() => taskEditorActions.setTimeFormat('12')}
                            className={cn(
                              'px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-[0.12em] border transition-colors',
                              taskEditorState.timeFormat === '12'
                                ? 'bg-primary text-white border-primary'
                                : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                            )}
                          >
                            12H
                          </button>
                        </div>

                        <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                          <input
                            aria-label="Task hour"
                            inputMode="numeric"
                            value={taskEditorState.hourInput}
                            onChange={(e) => taskEditorActions.setHourInput(e.target.value.replace(/\D/g, '').slice(0, 2))}
                            placeholder={taskEditorState.timeFormat === '24' ? '00-23' : '01-12'}
                            className="w-full rounded-lg border border-outline-variant/45 bg-surface-container-lowest px-2 py-1.5 text-center text-sm text-on-surface"
                          />
                          <span className="text-sm font-bold text-secondary">:</span>
                          <input
                            aria-label="Task minute"
                            inputMode="numeric"
                            value={taskEditorState.minuteInput}
                            onChange={(e) => taskEditorActions.setMinuteInput(e.target.value.replace(/\D/g, '').slice(0, 2))}
                            placeholder="00-59"
                            className="w-full rounded-lg border border-outline-variant/45 bg-surface-container-lowest px-2 py-1.5 text-center text-sm text-on-surface"
                          />
                          {taskEditorState.timeFormat === '12' ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => taskEditorActions.setPeriod('AM')}
                                className={cn(
                                  'px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-[0.12em] border',
                                  taskEditorState.period === 'AM'
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                                )}
                              >
                                AM
                              </button>
                              <button
                                type="button"
                                onClick={() => taskEditorActions.setPeriod('PM')}
                                className={cn(
                                  'px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-[0.12em] border',
                                  taskEditorState.period === 'PM'
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                                )}
                              >
                                PM
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-secondary">24H</span>
                          )}
                        </div>

                        <p className="text-[10px] text-secondary">Saved time: {taskEditorState.time}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Repeat</label>
                    <select
                      aria-label="Task repeat"
                      value={taskEditorState.repeat}
                      onChange={(e) => taskEditorActions.setRepeat(e.target.value as 'once' | 'daily' | 'weekly')}
                      className="w-full rounded-xl border border-outline-variant/45 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                    >
                      <option value="once">Once</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Duration (Minutes)</label>
                    <input
                      type="number"
                      min="5"
                      max="300"
                      value={taskEditorState.duration}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val >= 5 && val <= 300) taskEditorActions.setDuration(val);
                      }}
                      className="w-full rounded-xl border border-outline-variant/45 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                      title="Set task duration (5-300 minutes)"
                    />
                    <p className="text-xs text-secondary mt-1">Task will be marked as failed if not completed within this time</p>
                  </div>

                  {taskEditorState.repeat === 'weekly' && (
                    <div>
                      <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Calendar Day</label>
                      <input
                        type="date"
                        aria-label="Task calendar date"
                        value={taskEditorState.date}
                        onChange={(e) => taskEditorActions.setDate(e.target.value)}
                        className="w-full rounded-xl border border-outline-variant/45 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                      />
                    </div>
                  )}

                  <div className="rounded-2xl border border-outline-variant/35 bg-surface-container-lowest p-4 space-y-3">
                    <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block">Reminder Song (Optional Upload)</label>
                    {mediaPermissionGranted === false ? (
                      <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                        <p className="text-xs text-red-700 font-semibold">Media access denied</p>
                        <p className="text-xs text-red-600 mt-1">Please enable media/file permissions in your browser settings to upload songs.</p>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => audioFileInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-full bg-surface-container-low text-primary text-[11px] font-bold uppercase tracking-[0.14em] hover:bg-surface-container-high transition-colors active:scale-95"
                        >
                          Upload song
                        </button>
                        <input
                          ref={audioFileInputRef}
                          type="file"
                          accept="audio/*"
                          title="Upload reminder song"
                          onChange={(e) => handleReminderSongUpload(e.target.files?.[0])}
                          className="hidden"
                          disabled={mediaPermissionGranted !== true}
                        />
                        {taskEditorState.customAlarmName ? (
                          <p className="text-xs text-on-surface-variant">Selected: {taskEditorState.customAlarmName}</p>
                        ) : (
                          <p className="text-xs text-secondary">No upload yet. Task will use default alarm behavior.</p>
                        )}
                      </>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={previewUploadedReminder}
                        className="px-3 py-1.5 rounded-full bg-surface-container-low text-primary text-[11px] font-bold uppercase tracking-[0.14em]"
                      >
                        Preview Upload
                      </button>
                      {isTaskPreviewPlaying && (
                        <button
                          type="button"
                          onClick={stopTaskPreview}
                          className="px-3 py-1.5 rounded-full bg-primary text-white text-[11px] font-bold uppercase tracking-[0.14em]"
                        >
                          Stop Preview
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-outline-variant/35 bg-surface-container-lowest p-4 space-y-3">
                    <p className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold">Google Calendar Sync</p>
                    <p className="text-xs text-secondary">Sync created/updated tasks to Google Calendar. Daily and weekly tasks are added as recurring events.</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleGoogleCalendarSync}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] border',
                          user?.preferences.googleCalendarEnabled
                            ? 'bg-primary text-white border-primary'
                            : 'bg-surface-container-low text-secondary border-outline-variant/40'
                        )}
                      >
                        {user?.preferences.googleCalendarEnabled ? 'Sync: On' : 'Sync: Off'}
                      </button>
                      {!googleCalendarConnected ? (
                        <button
                          type="button"
                          onClick={connectGoogleCalendar}
                          disabled={googleCalendarBusy}
                          className="px-3 py-1.5 rounded-full bg-surface-container-low text-primary text-[11px] font-bold uppercase tracking-[0.14em] disabled:opacity-60"
                        >
                          {googleCalendarBusy ? 'Connecting...' : 'Connect Google'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={disconnectCalendar}
                          className="px-3 py-1.5 rounded-full bg-surface-container-low text-primary text-[11px] font-bold uppercase tracking-[0.14em]"
                        >
                          Disconnect Google
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-on-surface-variant">
                      Status: {googleCalendarConnected ? (googleCalendarAccountEmail ? `Connected as ${googleCalendarAccountEmail}` : 'Connected') : 'Not connected'}
                    </p>
                  </div>

                  <label className="flex items-center justify-between rounded-xl border border-outline-variant/35 bg-surface-container-lowest px-3 py-2">
                    <span className="text-sm text-on-surface">Enable aggressive alarm reminder</span>
                    <button
                      type="button"
                      aria-label="Toggle alarm"
                      onClick={() => taskEditorActions.setAlarmEnabled((prev) => !prev)}
                      className={cn(
                        'h-8 w-14 rounded-full relative transition-all duration-300 border',
                        taskEditorState.alarmEnabled
                          ? 'bg-gradient-to-r from-primary to-primary-container border-primary/40 shadow-[0_8px_20px_rgba(150,68,7,0.25)]'
                          : 'bg-surface-container-low border-outline-variant/60'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-1 h-6 w-6 rounded-full bg-white transition-all duration-300 flex items-center justify-center',
                          taskEditorState.alarmEnabled ? 'translate-x-7' : 'translate-x-1'
                        )}
                      >
                        <span className={cn('h-2 w-2 rounded-full', taskEditorState.alarmEnabled ? 'bg-primary' : 'bg-outline')} />
                      </span>
                    </button>
                  </label>

                  <button
                    onClick={handleTaskByEdenDraft}
                    disabled={isGeneratingTask}
                    className="w-full rounded-full px-4 py-2 border border-primary/40 text-primary font-label text-xs font-bold uppercase tracking-[0.14em] flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {isGeneratingTask ? <Loader2 size={14} className="animate-spin" /> : <WandSparkles size={14} />}
                    {isGeneratingTask ? 'Preparing task by Eden...' : 'Task by Eden'}
                  </button>

                  <div className="rounded-xl border border-outline-variant/35 bg-surface-container-lowest px-3 py-2">
                    <p className="text-[11px] text-on-surface-variant">
                      Task by Eden includes {EDEN_TEMPLATE_COUNT}+ templates across all 5 layers.
                    </p>
                    {showTemplatePicker && edenTemplatePool.length > 0 && (
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                        {edenTemplatePool.map((template, index) => (
                          <button
                            key={`${template.layerId}-${template.name}-${index}`}
                            type="button"
                            onClick={() => applyTemplateDraft(template)}
                            className="text-left rounded-lg border border-outline-variant/35 px-2 py-2 bg-surface-container-low hover:bg-surface-container-high"
                          >
                            <p className="text-xs font-semibold text-on-surface truncate">{template.name}</p>
                            <p className="text-[10px] text-secondary uppercase tracking-[0.1em] mt-1">
                              {template.layerId} • {template.time} • {template.repeat}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex gap-3">
                    <button
                      onClick={() => setShowQuickAdd(false)}
                      className="flex-1 rounded-full px-4 py-2 bg-surface-container-low text-secondary font-label text-xs font-bold uppercase tracking-[0.14em]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleQuickAddTask}
                      className="flex-1 rounded-full px-4 py-2 bg-gradient-to-br from-primary to-primary-container text-white font-label text-xs font-bold uppercase tracking-[0.14em]"
                    >
                      Add Task
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGlobalSearch && !isSubPageOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowGlobalSearch(false)}
            className="fixed inset-0 z-[85] bg-black/45 backdrop-blur-sm flex items-start justify-center p-5"
          >
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 220 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-4xl overflow-hidden rounded-[2rem] bg-surface-container-low border border-outline-variant/25 shadow-[0_20px_50px_rgba(44,33,24,0.08)] max-h-[88vh] overflow-y-auto no-scrollbar"
            >
              <div className="p-4 sm:p-5 border-b border-outline-variant/20 flex items-center gap-3 sticky top-0 bg-surface-container-low z-10">
                <Search size={18} className="text-primary" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search verses (John 3:16, Psalm 23), chapters, or tasks"
                  className="flex-1 bg-transparent text-sm text-on-surface outline-none"
                />
                <button
                  onClick={() => setShowGlobalSearch(false)}
                  className="h-9 w-9 rounded-full hover:bg-surface-container-lowest flex items-center justify-center text-primary"
                  aria-label="Close search"
                  title="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="px-4 sm:px-5 pt-3 flex items-center gap-2">
                {(['all', 'bible', 'tasks'] as const).map((domain) => (
                  <button
                    key={domain}
                    onClick={() => setSearchDomain(domain)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.14em] font-bold border',
                      searchDomain === domain
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                    )}
                  >
                    {domain}
                  </button>
                ))}
                {searchingBible && <span className="text-[11px] text-secondary">Searching Bible...</span>}
              </div>

              <div className="p-4 sm:p-5 space-y-6">
                {(searchDomain === 'all' || searchDomain === 'bible') && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-primary">Bible Results</h3>
                      {bibleSearchLabel && <p className="text-[11px] text-secondary font-semibold">{bibleSearchLabel}</p>}
                    </div>
                    {!normalizedSearch && <p className="text-sm text-secondary">Type a verse, chapter, or keyword to search Scripture at high speed.</p>}
                    {normalizedSearch && bibleSearchResults.length === 0 && !searchingBible && (
                      <p className="text-sm text-secondary">No verse match yet. Try John 3:16, Psalm 23, or faith.</p>
                    )}
                    {bibleSearchResults.length > 0 && (
                      <div className="max-h-[34vh] overflow-y-auto rounded-xl border border-outline-variant/20 divide-y divide-outline-variant/20">
                        {bibleSearchResults.map((verse) => (
                          <div key={`search-verse-${verse.verseId}`} className="p-3 bg-surface-container-lowest">
                            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">{verse.bookName} {verse.chapter}:{verse.verse}</p>
                            <p className="text-sm text-on-surface leading-6 mt-1">{verse.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {(searchDomain === 'all' || searchDomain === 'tasks') && (
                  <section className="space-y-3">
                    <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-primary">Task Results (Editable)</h3>
                    {!normalizedSearch && <p className="text-sm text-secondary">Search by task name, layer, repeat, time, or priority.</p>}
                    {normalizedSearch && searchedTasks.length === 0 && <p className="text-sm text-secondary">No task match for this query.</p>}

                    {searchedTasks.length > 0 && (
                      <div className="space-y-2 max-h-[34vh] overflow-y-auto">
                        {searchedTasks.map((task) => {
                          const layer = layers.find((l) => l.id === task.layerId);
                          const editing = taskEditorState.editingSearchTaskId === task.id;
                          return (
                            <div key={`search-task-${task.id}`} className="rounded-xl border border-outline-variant/25 p-3 bg-surface-container-lowest space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-on-surface">{task.name}</p>
                                  <p className="text-[11px] text-secondary">{layer?.name || 'General'} • {task.time} • {task.repeat || 'once'} • {task.priority}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleTaskToggleAction(task.id, 'global-search')}
                                    className="text-[11px] px-2.5 py-1 rounded-full bg-surface-container-low text-primary font-bold uppercase"
                                  >
                                    {isTaskCompletedForToday(task) ? 'Undo' : 'Done'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openTaskEditorFromSearch(task)}
                                    className="text-[11px] px-2.5 py-1 rounded-full bg-primary text-white font-bold uppercase"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleTaskDeleteAction(task.id, 'global-search')}
                                    className="text-[11px] px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-bold uppercase"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>

                              {editing && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <input
                                    value={taskEditorState.editingSearchTaskName}
                                    onChange={(e) => taskEditorActions.setEditingSearchTaskName(e.target.value)}
                                    className="rounded-lg border border-outline-variant/40 bg-surface px-2.5 py-2 text-sm"
                                    placeholder="Task name"
                                  />
                                  <input
                                    value={taskEditorState.editingSearchTaskTime}
                                    onChange={(e) => taskEditorActions.setEditingSearchTaskTime(e.target.value)}
                                    className="rounded-lg border border-outline-variant/40 bg-surface px-2.5 py-2 text-sm"
                                    placeholder="14:30 or 2:30 PM"
                                  />
                                  <select
                                    value={taskEditorState.editingSearchTaskRepeat}
                                    onChange={(e) => taskEditorActions.setEditingSearchTaskRepeat(e.target.value as 'once' | 'daily' | 'weekly')}
                                    aria-label="Task repeat"
                                    className="rounded-lg border border-outline-variant/40 bg-surface px-2.5 py-2 text-sm"
                                  >
                                    <option value="once">Once</option>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                  </select>
                                  <select
                                    value={taskEditorState.editingSearchTaskPriority}
                                    onChange={(e) => taskEditorActions.setEditingSearchTaskPriority(e.target.value as 'A' | 'B' | 'C' | 'D' | 'E')}
                                    aria-label="Task priority"
                                    className="rounded-lg border border-outline-variant/40 bg-surface px-2.5 py-2 text-sm"
                                  >
                                    <option value="A">A</option>
                                    <option value="B">B</option>
                                    <option value="C">C</option>
                                    <option value="D">D</option>
                                    <option value="E">E</option>
                                  </select>
                                  <div className="sm:col-span-2 flex gap-2">
                                    <button onClick={saveTaskEditorFromSearch} className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-[0.12em]">Save</button>
                                    <button onClick={() => taskEditorActions.setEditingSearchTaskId(null)} className="px-3 py-2 rounded-lg bg-surface-container-low text-secondary text-xs font-bold uppercase tracking-[0.12em]">Cancel</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detailTaskId && !isSubPageOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeTaskDetails}
            className="fixed inset-0 z-[88] bg-black/45 backdrop-blur-sm flex items-center justify-center p-5"
          >
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 220 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl overflow-hidden rounded-[2rem] bg-surface-container-low border border-outline-variant/25 shadow-[0_20px_50px_rgba(44,33,24,0.08)] max-h-[88vh] overflow-y-auto no-scrollbar"
            >
              <div className="p-5 border-b border-outline-variant/20 sticky top-0 bg-surface-container-low z-10 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-primary">Task Details</p>
                  <h3 className="text-lg font-semibold text-on-surface mt-1">Modify Task</h3>
                </div>
                <button
                  onClick={closeTaskDetails}
                  className="h-9 w-9 rounded-full hover:bg-surface-container-lowest flex items-center justify-center text-primary"
                  aria-label="Close task details"
                  title="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Task Name</label>
                  <input
                    value={detailTaskName}
                    onChange={(e) => setDetailTaskName(e.target.value)}
                    placeholder="Task name"
                    className="w-full rounded-xl border border-outline-variant/45 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Time</label>
                    <input
                      value={detailTaskTime}
                      onChange={(e) => setDetailTaskTime(e.target.value)}
                      placeholder="14:30 or 2:30 PM"
                      className="w-full rounded-xl border border-outline-variant/45 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                    />
                  </div>
                  <div>
                    <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Duration (Minutes)</label>
                    <input
                      type="number"
                      aria-label="Task duration minutes"
                      min={5}
                      max={300}
                      value={detailTaskDuration}
                      onChange={(e) => setDetailTaskDuration(Math.max(5, Math.min(300, Number(e.target.value || 25))))}
                      className="w-full rounded-xl border border-outline-variant/45 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Repeat</label>
                    <select
                      aria-label="Task repeat details"
                      value={detailTaskRepeat}
                      onChange={(e) => setDetailTaskRepeat(e.target.value as 'once' | 'daily' | 'weekly')}
                      className="w-full rounded-xl border border-outline-variant/45 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                    >
                      <option value="once">Once</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Priority</label>
                    <select
                      aria-label="Task priority details"
                      value={detailTaskPriority}
                      onChange={(e) => setDetailTaskPriority(e.target.value as 'A' | 'B' | 'C' | 'D' | 'E')}
                      className="w-full rounded-xl border border-outline-variant/45 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                    >
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                      <option value="D">D</option>
                      <option value="E">E</option>
                    </select>
                  </div>
                </div>

                <label className="flex items-center justify-between rounded-xl border border-outline-variant/35 bg-surface-container-lowest px-3 py-2">
                  <span className="text-sm text-on-surface">Alarm enabled</span>
                  <button
                    type="button"
                    aria-label="Toggle detail alarm"
                    onClick={() => setDetailTaskAlarmEnabled((prev) => !prev)}
                    className={cn(
                      'h-8 w-14 rounded-full relative transition-all duration-300 border',
                      detailTaskAlarmEnabled
                        ? 'bg-gradient-to-r from-primary to-primary-container border-primary/40 shadow-[0_8px_20px_rgba(150,68,7,0.25)]'
                        : 'bg-surface-container-low border-outline-variant/60'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-1 h-6 w-6 rounded-full bg-white transition-all duration-300 flex items-center justify-center',
                        detailTaskAlarmEnabled ? 'translate-x-7' : 'translate-x-1'
                      )}
                    >
                      <span className={cn('h-2 w-2 rounded-full', detailTaskAlarmEnabled ? 'bg-primary' : 'bg-outline')} />
                    </span>
                  </button>
                </label>

                <div className="rounded-2xl border border-outline-variant/35 bg-surface-container-lowest p-4 space-y-3">
                  <p className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold">Alarm Audio</p>
                  <input
                    value={detailTaskPreferredMusic}
                    onChange={(e) => setDetailTaskPreferredMusic(e.target.value)}
                    placeholder="Preferred music label"
                    className="w-full rounded-xl border border-outline-variant/45 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => detailAudioFileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-full bg-surface-container-low text-primary text-[11px] font-bold uppercase tracking-[0.14em]"
                    >
                      Upload song
                    </button>
                    <input
                      ref={detailAudioFileInputRef}
                      type="file"
                      accept="audio/*"
                      title="Upload detail reminder song"
                      onChange={(e) => handleDetailReminderSongUpload(e.target.files?.[0])}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={previewDetailReminder}
                      className="px-3 py-1.5 rounded-full bg-surface-container-low text-primary text-[11px] font-bold uppercase tracking-[0.14em]"
                    >
                      Preview Upload
                    </button>
                    {isTaskPreviewPlaying && (
                      <button
                        type="button"
                        onClick={stopTaskPreview}
                        className="px-3 py-1.5 rounded-full bg-primary text-white text-[11px] font-bold uppercase tracking-[0.14em]"
                      >
                        Stop Preview
                      </button>
                    )}
                  </div>
                  {detailTaskCustomAlarmName ? (
                    <p className="text-xs text-on-surface-variant">Selected: {detailTaskCustomAlarmName}</p>
                  ) : (
                    <p className="text-xs text-secondary">No custom upload yet. Default alarm behavior will be used.</p>
                  )}
                </div>

                <div className="rounded-xl border border-outline-variant/35 bg-surface-container-lowest px-3 py-2">
                  <p className="text-xs text-secondary">
                    Google Calendar sync is {user?.preferences.googleCalendarEnabled ? 'enabled' : 'disabled'}. Saving this task updates calendar events automatically.
                  </p>
                </div>

                {detailTaskError && <p className="text-sm text-red-600">{detailTaskError}</p>}

                <div className="pt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={closeTaskDetails}
                    className="flex-1 rounded-full px-4 py-2 bg-surface-container-low text-secondary font-label text-xs font-bold uppercase tracking-[0.14em]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveTaskDetails}
                    className="flex-1 rounded-full px-4 py-2 bg-gradient-to-br from-primary to-primary-container text-white font-label text-xs font-bold uppercase tracking-[0.14em]"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showInstallSuggestion && !isSubPageOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm flex items-center justify-center p-5"
          >
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              className="w-full max-w-md bg-surface rounded-3xl border border-outline-variant/35 p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-label text-[10px] uppercase tracking-[0.15em] text-primary font-bold">Install Edenify</p>
                  <h3 className="display-text text-2xl text-on-surface mt-1">Add app to your home screen</h3>
                </div>
                <button
                  onClick={() => setShowInstallSuggestion(false)}
                  className="h-9 w-9 rounded-full bg-surface-container-low text-primary flex items-center justify-center"
                  aria-label="Close install prompt"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-sm text-on-surface-variant">Install for faster startup, offline support, and native app feel on mobile.</p>
              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setShowInstallSuggestion(false)}
                  className="flex-1 px-4 py-2 rounded-full bg-surface-container-low text-secondary font-label text-xs font-bold uppercase tracking-[0.14em]"
                >
                  Later
                </button>
                <button
                  onClick={handleInstallApp}
                  className="flex-1 px-4 py-2 rounded-full bg-gradient-to-br from-primary to-primary-container text-white font-label text-xs font-bold uppercase tracking-[0.14em]"
                >
                  Install Now
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {alarmOpen && alarmTask && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-[#2a1e14]/92 backdrop-blur-md flex items-center justify-center p-5"
          >
            <motion.div
              initial={{ y: 20, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 20, scale: 0.98 }}
              className="w-full max-w-lg rounded-3xl border border-white/20 bg-[#fff7ec] p-6 text-center"
            >
              <div className="mx-auto h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center text-primary mb-4">
                <BellRing size={24} />
              </div>
              <p className="font-label text-[10px] uppercase tracking-[0.16em] text-primary font-bold">Alarm Active</p>
              <h3 className="display-text text-3xl text-on-surface mt-2">{alarmTask.name}</h3>
              <p className="mt-3 text-sm text-on-surface-variant">{alarmTask.time} • {alarmTask.preferredMusic || 'Uploaded Song'}</p>
              <p className="mt-2 text-xs text-secondary">Reminder is sent 5 minutes early. Alarm stays visible across the app and can be snoozed, entered, or skipped.</p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={snoozeActiveAlarm}
                  className="rounded-full px-4 py-3 bg-surface-container-low text-primary font-label text-xs font-bold uppercase tracking-[0.14em] flex items-center justify-center gap-2"
                >
                  <SkipForward size={14} />
                  Postpone 10m
                </button>
                <button
                  onClick={enterActiveAlarm}
                  className="rounded-full px-4 py-3 bg-primary text-white font-label text-xs font-bold uppercase tracking-[0.14em]"
                >
                  Enter Edenify
                </button>
                <button
                  onClick={skipActiveAlarm}
                  className="rounded-full px-4 py-3 border border-outline-variant/35 text-secondary font-label text-xs font-bold uppercase tracking-[0.14em]"
                >
                  Skip
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default Home;
