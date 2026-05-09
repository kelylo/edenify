import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../AppContext';
import {
  Send,
  Sparkles,
  User,
  Loader2,
  Plus,
  Check,
  X,
  ThumbsUp,
  ThumbsDown,
  Undo2,
  Copy,
  Layers,
  Repeat,
  CheckCircle2,
  Mic,
  StopCircle,
  PanelRightClose,
  PanelRightOpen,
  History,
  BookOpen,
  Paperclip,
  Camera,
  Smile,
  Menu,
  Headphones,
  ChevronDown,
} from 'lucide-react';
import {
  chatWithEden,
  initializeEdenAgent,
  remember,
  recall,
  updateProfile,
  getProfile,
  logConversation,
  getRecentConversations,
  recordFeedback,
  getDailyBibleReading,
  type UserProfile,
} from '../services/eden-agent';
import { getTotalReadingDays } from '../services/bible';
import { motion, AnimatePresence } from 'motion/react';
import { cn, parseTaskDueDate } from '../lib/utils';
import { LayerId, Task, Habit } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type TaskFlowMode = 'create' | 'delete';
type QuickTimeSlot = 'morning' | 'afternoon' | 'evening' | 'night';
interface TaskFlowState {
  mode: TaskFlowMode;
  step: 'name' | 'time' | 'repeat' | 'layer' | 'priority' | 'confirm' | 'select';
  draft: Partial<Task>;
  taskIds?: string[];
}

interface Suggestion {
  id: string;
  text: string;
  action: () => void;
  icon?: React.ReactNode;
}

interface UndoAction {
  type: 'task';
  undo: () => void;
  description: string;
}

const INTRO_MESSAGE =
  'Greetings, Kevin. I am Eden, your companion in this journey of growth. How can I help today? I can guide your Spiritual, Academic, Financial, Physical, and General layers, and I can create, edit, complete, or delete tasks for you right here.';

const defaultPreferredMusic = 'Instrumental Warmth';
const DRAFT_INPUT_STORAGE_KEY = 'eden.chat.draft.v1';

const shuffleSmall = <T,>(items: T[]) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

const QUICK_SUGGESTIONS: Record<QuickTimeSlot, Array<{ text: string; layer?: LayerId }>> = {
  morning: [
    { text: 'wake up without snooze', layer: 'physical' },
    { text: 'morning prayer 5 minutes', layer: 'spiritual' },
    { text: 'read bible one chapter', layer: 'spiritual' },
    { text: 'plan top 3 tasks today', layer: 'general' },
    { text: "review today's lectures before class", layer: 'academic' },
    { text: 'drink water before coffee', layer: 'physical' },
    { text: 'prepare your first priority block', layer: 'general' },
    { text: '10-minute stretch and mobility', layer: 'physical' },
    { text: 'review one key formula', layer: 'academic' },
    { text: 'no phone first 30 minutes morning', layer: 'general' },
    { text: 'clean desk before study session', layer: 'general' },
    { text: 'prepare bag night before', layer: 'general' },
  ],
  afternoon: [
    { text: 'deep study 45 minutes no phone', layer: 'academic' },
    { text: 'solve 5 hard problems daily', layer: 'academic' },
    { text: 'use timer 45 minute focus block', layer: 'general' },
    { text: 'stand up and reset every hour', layer: 'physical' },
    { text: 'track daily wins checklist', layer: 'general' },
    { text: 'practice coding 30 minutes', layer: 'academic' },
    { text: 'midday prayer and reset', layer: 'spiritual' },
    { text: 'review spending for today', layer: 'financial' },
    { text: 'finish one delayed task now', layer: 'general' },
    { text: 'revise yesterday notes 10 minutes', layer: 'academic' },
    { text: 'daily gym 30 minutes minimum', layer: 'physical' },
    { text: 'learn one software skill daily', layer: 'academic' },
  ],
  evening: [
    { text: 'review formulas before sleep', layer: 'academic' },
    { text: 'daily reflection 3 lines', layer: 'general' },
    { text: 'short gratitude prayer night', layer: 'spiritual' },
    { text: 'prepare bag night before', layer: 'general' },
    { text: 'sleep at same time daily', layer: 'physical' },
    { text: 'write daily reflection 3 lines', layer: 'spiritual' },
    { text: 'walk 20 minutes after dinner', layer: 'physical' },
    { text: 'plan top 3 tasks for tomorrow', layer: 'general' },
    { text: 'review one lecture summary', layer: 'academic' },
    { text: 'track daily expenses', layer: 'financial' },
    { text: 'review weekly progress every sunday', layer: 'general' },
  ],
  night: [
    { text: 'review goals morning and night', layer: 'general' },
    { text: 'pray before starting work', layer: 'spiritual' },
    { text: 'visualize finishing tasks today', layer: 'general' },
    { text: 'prepare bag night before', layer: 'general' },
    { text: 'sleep at same time daily', layer: 'physical' },
    { text: 'short gratitude prayer night', layer: 'spiritual' },
    { text: 'read one scripture passage', layer: 'spiritual' },
    { text: 'set tomorrow focus alarm', layer: 'general' },
    { text: 'quick budget check before bed', layer: 'financial' },
    { text: 'finish what you start daily', layer: 'general' },
    { text: 'choose discipline over comfort', layer: 'general' },
    { text: 'study even when bored', layer: 'academic' },
  ],
};

const TIME_SLOT_KEYWORDS: Record<QuickTimeSlot, RegExp> = {
  morning: /\b(morning|wake|prayer|class|lecture|breakfast|snooze)\b/i,
  afternoon: /\b(afternoon|study|problem|focus|coding|work|class|lecture)\b/i,
  evening: /\b(evening|sleep|night|reflection|review|journal|quiet)\b/i,
  night: /\b(night|sleep|rest|prepare|go to bed|before bed)\b/i,
};

const getQuickTimeSlot = (date = new Date()): QuickTimeSlot => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
};

const inferLayerFromText = (text: string): LayerId | null => {
  const lower = text.toLowerCase();
  if (/\b(pray|bible|scripture|verse|god)\b/.test(lower)) return 'spiritual';
  if (/\b(study|lecture|exam|class|problem|coding|code|lecture|academic)\b/.test(lower)) return 'academic';
  if (/\b(money|budget|save|spend|finance|financial)\b/.test(lower)) return 'financial';
  if (/\b(gym|pushups|walk|run|stretch|sleep|water|body)\b/.test(lower)) return 'physical';
  return null;
};

const buildQuickSuggestions = (input: string, currentLayer?: LayerId | null) => {
  const slot = getQuickTimeSlot();
  const layerHint = currentLayer || inferLayerFromText(input);
  const pool = QUICK_SUGGESTIONS[slot];

  const ranked = pool
    .map((item, index) => ({
      ...item,
      score:
        (item.layer && item.layer === layerHint ? 20 : 0) +
        (TIME_SLOT_KEYWORDS[slot].test(item.text) ? 10 : 0) -
        index + Math.floor(Math.random() * 4),
    }))
    .sort((a, b) => b.score - a.score);

  return shuffleSmall(ranked).slice(0, 8);
};

const formatTimeDisplay = (time: string) => {
  const m = time.match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return time;
  const h24 = Number(m[1]);
  const min = m[2];
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${min} ${period}`;
};

const parseNaturalDate = (text: string, baseDate: Date = new Date()): Date | null => {
  const lower = text.toLowerCase();
  const now = new Date(baseDate);
  now.setHours(0, 0, 0, 0);

  if (/\btoday\b/.test(lower)) return now;
  if (/\bday after tomorrow\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    return d;
  }
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }

  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < weekdays.length; i += 1) {
    const regex = new RegExp(`\\b(next\\s+)?${weekdays[i]}\\b`, 'i');
    if (regex.test(lower)) {
      const result = new Date(baseDate);
      const currentDay = baseDate.getDay();
      let delta = i - currentDay;
      if (delta <= 0) delta += 7;
      result.setDate(result.getDate() + delta);
      return result;
    }
  }

  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
};

const parseTimeFromText = (text: string): string | null => {
  const match12 = text.match(/\b(\d{1,2}):(\d{2})\s?(AM|PM)\b/i);
  if (match12) {
    let h = Number(match12[1]);
    const m = Number(match12[2]);
    const p = match12[3].toUpperCase();
    if (p === 'PM' && h !== 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const match24 = text.match(/\b([0-1]?\d|2[0-3]):([0-5]\d)\b/);
  if (match24) return `${String(Number(match24[1])).padStart(2, '0')}:${match24[2]}`;

  if (/\bnoon\b/i.test(text)) return '12:00';
  if (/\bmidnight\b/i.test(text)) return '00:00';

  const compact = text.match(/\b(\d{1,2})\s?(am|pm)\b/i);
  if (compact) {
    let h = Number(compact[1]);
    if (compact[2].toLowerCase() === 'pm' && h !== 12) h += 12;
    if (compact[2].toLowerCase() === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:00`;
  }

  return null;
};

const parseCombinedDateTime = (text: string): { date?: Date; time?: string } | null => {
  const date = parseNaturalDate(text);
  const time = parseTimeFromText(text);
  if (!date && !time) return null;
  return { date: date || undefined, time: time || undefined };
};

const Eden: React.FC = () => {
  const { user, tasks, habits, addTask, toggleTask, updateTask, deleteTask, addHabit, toggleHabit } = useApp();

  const favoriteFocusTrack = React.useMemo(() => {
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

  const preferredTaskMusic = favoriteFocusTrack?.name || defaultPreferredMusic;

  const [messages, setMessages] = useState<Array<{ role: 'user' | 'model'; text: string; id: string; timestamp: Date; feedback?: 'helpful' | 'unhelpful' }>>([
    { role: 'model', text: INTRO_MESSAGE, id: 'intro', timestamp: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [taskFlow, setTaskFlow] = useState<TaskFlowState | null>(null);
  const [inputPlaceholder, setInputPlaceholder] = useState('Reflect with Eden... (Enter to send, Shift+Enter for new line)');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobileView, setIsMobileView] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 1024 : true));
  const [toolsOpen, setToolsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [agentProfile, setAgentProfile] = useState<UserProfile | null>(null);
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);
  const [agenticStatus, setAgenticStatus] = useState<'thinking' | 'searching' | 'composing' | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const addModelMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { role: 'model', text, id: `msg-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`, timestamp: new Date() }]);
  }, []);

  const streamModelMessage = useCallback(async (text: string) => {
    const id = `msg-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
    setMessages((prev) => [...prev, { role: 'model', text: '', id, timestamp: new Date() }]);

    const chunks = text.split(/(\s+)/).filter(Boolean);
    let current = '';
    for (const chunk of chunks) {
      current += chunk;
      setMessages((prev) => prev.map((message) => (message.id === id ? { ...message, text: current } : message)));
      await new Promise((resolve) => window.setTimeout(resolve, 16));
    }
  }, []);

  const addUserMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { role: 'user', text, id: `msg-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`, timestamp: new Date() }]);
  }, []);

  useEffect(() => {
    const savedDraft = window.localStorage.getItem(DRAFT_INPUT_STORAGE_KEY);
    if (savedDraft) setInput(savedDraft);

    const init = async () => {
      await initializeEdenAgent();
      const prof = await getProfile();
      setAgentProfile(prof);
      const recent = await getRecentConversations(10);
      setConversationHistory(recent);

      const savedName = await recall<string>('preferredName');
      if (savedName && !prof.preferredName) {
        const updated = await updateProfile({ preferredName: savedName });
        setAgentProfile(updated);
      }
    };

    void init();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(DRAFT_INPUT_STORAGE_KEY, input);
  }, [input]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping]);

  useEffect(() => {
    const area = textAreaRef.current;
    if (!area) return;
    const wasEmpty = input.trim().length === 0;
    const backup = area.placeholder;
    if (wasEmpty) area.placeholder = '';
    area.style.height = '0px';
    area.style.height = `${Math.min(160, area.scrollHeight)}px`;
    if (wasEmpty) area.placeholder = backup;
  }, [input]);

  useEffect(() => {
    const updatePlaceholderResponsive = () => {
      const w = window.innerWidth;
      if (w <= 430) setInputPlaceholder('Message Eden...');
      else if (w <= 768) setInputPlaceholder('Message Eden... (Enter to send)');
      else setInputPlaceholder('Reflect with Eden... (Enter to send, Shift+Enter for new line)');

      const mobile = w < 1024;
      setIsMobileView(mobile);
      setSidebarOpen((prev) => (mobile ? prev : true));
    };
    updatePlaceholderResponsive();
    window.addEventListener('resize', updatePlaceholderResponsive);
    return () => window.removeEventListener('resize', updatePlaceholderResponsive);
  }, []);

  useEffect(() => {
    if (!toolsOpen) return;
    const close = () => setToolsOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [toolsOpen]);



  useEffect(() => {
    const SpeechRecognitionApi = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionApi) return;

    recognitionRef.current = new SpeechRecognitionApi();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.onresult = (event: any) => {
      const transcript = event?.results?.[0]?.[0]?.transcript || '';
      setInput((prev) => `${prev} ${transcript}`.trim());
    };
    recognitionRef.current.onend = () => setIsListening(false);
  }, []);

  useEffect(() => {
    const normalized = input.trim().toLowerCase();
    const currentLayer = taskFlow?.draft?.layerId || inferLayerFromText(input) || (agentProfile?.lastActiveLayer as LayerId | undefined) || null;

    const quickSuggestions = buildQuickSuggestions(input, currentLayer);
    const list: Suggestion[] = quickSuggestions.map((item, index) => ({
      id: `quick-${item.text}-${index}`,
      text: item.text,
      icon: item.layer === 'spiritual' ? <BookOpen size={14} /> : item.layer === 'academic' ? <Layers size={14} /> : item.layer === 'physical' ? <Repeat size={14} /> : <Sparkles size={14} />,
      action: () => {
        setInput(item.text);
        textAreaRef.current?.focus();
      },
    }));

    if (/\b(create|add|new)\b.*\btask\b/.test(normalized)) {
      list.unshift({ id: 'create-task', text: 'Create a new task', icon: <Plus size={14} />, action: () => startTaskCreation() });
    }
    if (/\b(list|show|view)\b.*\btasks?\b/.test(normalized) || /^tasks?$/.test(normalized)) {
      list.unshift({ id: 'list-tasks', text: 'Show my tasks', icon: <CheckCircle2 size={14} />, action: () => handleQuickCommand('tasks') });
    }
    if (/\b(bible|verse|reading|scripture)\b/.test(normalized)) {
      list.unshift({ id: 'bible-reading', text: 'Get today reading', icon: <BookOpen size={14} />, action: () => handleQuickCommand('bible') });
    }
    if (/\b(habit|daily|routine)\b/.test(normalized)) {
      list.unshift({ id: 'create-habit', text: 'Create daily habit', icon: <Repeat size={14} />, action: () => setInput('create habit ') });
    }

    setSuggestions(list.slice(0, 5));
  }, [input, taskFlow?.draft?.layerId, agentProfile?.lastActiveLayer]);

  const pushUndo = useCallback((action: UndoAction) => {
    setUndoStack((prev) => [action, ...prev].slice(0, 20));
    window.setTimeout(() => {
      setUndoStack((prev) => prev.filter((entry) => entry !== action));
    }, 10000);
  }, []);

  const performUndo = useCallback((action: UndoAction) => {
    action.undo();
    setUndoStack((prev) => prev.filter((entry) => entry !== action));
  }, []);

  const parseRepeat = (text: string): Task['repeat'] | null => {
    const lower = text.trim().toLowerCase();
    if (lower === '1' || lower.includes('once')) return 'once';
    if (lower === '2' || lower.includes('daily')) return 'daily';
    if (lower === '3' || lower.includes('weekly')) return 'weekly';
    return null;
  };

  const parseLayer = (text: string): LayerId | null => {
    const lower = text.trim().toLowerCase();
    if (lower === '1' || lower.includes('spiritual')) return 'spiritual';
    if (lower === '2' || lower.includes('academic')) return 'academic';
    if (lower === '3' || lower.includes('financial')) return 'financial';
    if (lower === '4' || lower.includes('physical')) return 'physical';
    if (lower === '5' || lower.includes('general')) return 'general';
    return null;
  };

  const parsePriority = (text: string): Task['priority'] | null => {
    const lower = text.trim().toLowerCase();
    if (lower === '1' || lower === 'a') return 'A';
    if (lower === '2' || lower === 'b') return 'B';
    if (lower === '3' || lower === 'c') return 'C';
    if (lower === '4' || lower === 'd') return 'D';
    if (lower === '5' || lower === 'e') return 'E';
    return null;
  };

  const startTaskCreation = () => {
    setTaskFlow({ mode: 'create', step: 'name', draft: {} });
    setInput('');
  };

  const findTaskByQuery = (query: string): Task | null => {
    const clean = query.trim().toLowerCase();
    if (!clean) return null;
    const exact = tasks.find((task) => task.name.toLowerCase() === clean);
    if (exact) return exact;
    const partial = tasks.find((task) => task.name.toLowerCase().includes(clean));
    return partial || null;
  };

  const handleTaskFlowInput = async (text: string): Promise<string | null> => {
    if (!taskFlow) return null;

    const raw = text.trim();
    if (!raw) return 'Please send a value or type "cancel".';

    if (raw.toLowerCase() === 'cancel' || raw.toLowerCase() === '/cancel') {
      setTaskFlow(null);
      return 'Task setup cancelled.';
    }

    if (taskFlow.mode === 'create') {
      const draft = { ...taskFlow.draft };
      let nextStep: TaskFlowState['step'] = taskFlow.step;

      if (taskFlow.step === 'name') {
        if (raw.length < 2) return 'Please send a clear task name.';
        draft.name = raw;
        nextStep = 'time';
      } else if (taskFlow.step === 'time') {
        const parsed = parseCombinedDateTime(raw);
        const time = parsed?.time || parseTimeFromText(raw);
        if (!time) return 'Time not recognized. Try: 14:30, 2:30 PM, tomorrow 9am, or noon.';

        const probe: Task = {
          id: 'probe',
          name: draft.name || 'Task',
          layerId: 'general',
          priority: 'C',
          repeat: 'once',
          time,
          completed: false,
          date: parsed?.date?.toISOString() || new Date().toISOString(),
        };
        const due = parseTaskDueDate(probe);
        if (!due || due.getTime() <= Date.now()) {
          return 'That time is in the past. Please choose a future time.';
        }

        draft.time = time;
        if (parsed?.date) draft.date = parsed.date.toISOString();
        nextStep = 'repeat';
      } else if (taskFlow.step === 'repeat') {
        const repeat = parseRepeat(raw);
        if (!repeat) return 'Choose repeat: 1.Once  2.Daily  3.Weekly';
        draft.repeat = repeat;
        nextStep = 'layer';
      } else if (taskFlow.step === 'layer') {
        const layer = parseLayer(raw);
        if (!layer) return 'Choose layer: 1.Spiritual 2.Academic 3.Financial 4.Physical 5.General';
        draft.layerId = layer;
        nextStep = 'priority';
      } else if (taskFlow.step === 'priority') {
        const priority = parsePriority(raw);
        if (!priority) return 'Choose priority: 1.A 2.B 3.C 4.D 5.E';
        draft.priority = priority;
        // If this is first task or user has no songs, ask for song  
        const userHasSongs = Boolean(favoriteFocusTrack?.name || user?.preferences?.customFocusSongName);
        nextStep = !userHasSongs || tasks.length === 0 ? 'song' : 'confirm';
      } else if (taskFlow.step === 'song') {
        // Song selection for first task
        if (raw.toLowerCase() === 'skip') {
          // Allow skipping if not first task
          if (tasks.length > 0) {
            draft.preferredMusic = '';
            nextStep = 'confirm';
          } else {
            return 'First task requires a song to set your default. Please choose or upload one.';
          }
        } else if (raw && raw.length > 2) {
          // They typed a song name
          draft.preferredMusic = raw;
          nextStep = 'confirm';
        } else {
          return tasks.length === 0 
            ? `First task requires a song (your default). Available songs:\n${favoriteFocusTrack?.name || 'Rain Forest (default)'}\n\nType song name or use current default.`
            : `Choose preferred song for this task, or type "skip": ${favoriteFocusTrack?.name || 'None'}`;
        }
      } else if (taskFlow.step === 'confirm') {
        if (!raw.toLowerCase().startsWith('y')) {
          setTaskFlow(null);
          return 'Task creation cancelled.';
        }

        const newTask: Task = {
          id: `task-${Date.now()}`,
          name: draft.name || 'New task',
          layerId: (draft.layerId as LayerId) || 'general',
          priority: (draft.priority as Task['priority']) || 'C',
          repeat: (draft.repeat as Task['repeat']) || 'once',
          time: draft.time || '08:00',
          completed: false,
          date: draft.date || new Date().toISOString(),
          alarmEnabled: true,
          preferredMusic: (draft.preferredMusic || preferredTaskMusic || favoriteFocusTrack?.name || ''),
          customAlarmAudioName: favoriteFocusTrack?.name,
          customAlarmAudioDataUrl: favoriteFocusTrack?.dataUrl,
        };

        addTask(newTask);
        pushUndo({
          type: 'task',
          undo: () => deleteTask(newTask.id),
          description: `Undo create \"${newTask.name}\"`,
        });

        setTaskFlow(null);
        return `Task created: \"${newTask.name}\" at ${formatTimeDisplay(newTask.time)} (${newTask.repeat}, ${newTask.layerId}, priority ${newTask.priority}).`;
      }

      setTaskFlow({ ...taskFlow, step: nextStep, draft });
      if (nextStep === 'time') return 'What time? Example: 14:30, 2:30 PM, tomorrow 9am, or noon.';
      if (nextStep === 'repeat') return 'How often? 1.Once  2.Daily  3.Weekly';
      if (nextStep === 'layer') return 'Which layer? 1.Spiritual 2.Academic 3.Financial 4.Physical 5.General';
      if (nextStep === 'priority') return 'Priority? 1.A (highest) to 5.E (lowest)';
      if (nextStep === 'song') {
        const defaultSong = favoriteFocusTrack?.name || user?.preferences?.customFocusSongName || 'Rain Forest (default)';
        return tasks.length === 0 
          ? `📀 First task! Set your default alarm song:\n${defaultSong}\n\nType a song name or press Enter to accept default.`
          : `📀 Alarm song for this task? Available: ${defaultSong}\n\nType song name or "skip".`;
      }
      return `Confirm task:\n\"${draft.name}\" at ${draft.time} | ${draft.repeat} | ${draft.layerId} | priority ${draft.priority}. Reply \"yes\" or \"cancel\".`;
    }

    if (taskFlow.mode === 'delete') {
      const ids = taskFlow.taskIds || [];
      const list = ids.map((id) => tasks.find((task) => task.id === id)).filter(Boolean) as Task[];
      if (list.length === 0) {
        setTaskFlow(null);
        return 'No tasks to delete.';
      }

      const idx = Number(raw);
      if (!Number.isNaN(idx) && idx >= 1 && idx <= list.length) {
        const target = list[idx - 1];
        deleteTask(target.id);
        pushUndo({
          type: 'task',
          undo: () => addTask(target),
          description: `Undo delete \"${target.name}\"`,
        });
        setTaskFlow(null);
        return `Deleted: \"${target.name}\"`;
      }

      return `Type a number between 1 and ${list.length}, or cancel.`;
    }

    return null;
  };

  const parseTaskOperation = (text: string): { handled: boolean; reply?: string } => {
    const raw = text.trim();
    const lower = raw.toLowerCase();

    if (/^tasks?$/.test(lower) || /\b(list|show|view|pending)\b.*\btasks?\b/.test(lower)) {
      const active = tasks.filter((task) => !task.completed).slice(0, 15);
      if (active.length === 0) return { handled: true, reply: 'You have no active tasks right now.' };
      return {
        handled: true,
        reply: `Here are your active tasks:\n${active.map((task, index) => `${index + 1}. ${task.name} | ${task.time} | ${task.repeat || 'once'} | ${task.priority}`).join('\n')}`,
      };
    }

    if (/\b(create|add|new|set)\b/.test(lower) && /\btask\b/.test(lower)) {
      startTaskCreation();
      return { handled: true, reply: 'Sure. First, what is the task name?' };
    }

    if (/\b(delete|remove)\b/.test(lower) && /\btask\b/.test(lower)) {
      const available = tasks.filter((task) => !task.completed).slice(0, 10);
      if (available.length === 0) return { handled: true, reply: 'You have no active tasks to delete.' };
      setTaskFlow({ mode: 'delete', step: 'select', draft: {}, taskIds: available.map((task) => task.id) });
      return {
        handled: true,
        reply: `Choose a task to delete:\n${available.map((task, index) => `${index + 1}. ${task.name} (${task.time})`).join('\n')}`,
      };
    }

    if (/\b(done|complete|finish|check)\b/.test(lower) && /\btask\b/.test(lower)) {
      const targetName = raw.replace(/.*\btask\b/i, '').trim().replace(/^['"]|['"]$/g, '');
      const target = findTaskByQuery(targetName);
      if (!target) return { handled: true, reply: 'I could not find that task. Try quoting the exact task name.' };
      if (!target.completed) {
        toggleTask(target.id);
        pushUndo({
          type: 'task',
          undo: () => toggleTask(target.id),
          description: `Undo complete \"${target.name}\"`,
        });
      }
      return { handled: true, reply: `Marked \"${target.name}\" as completed.` };
    }

    if (/\b(edit|update|change|modify)\b/.test(lower) && /\btask\b/.test(lower)) {
      const targetName = raw.replace(/.*\btask\b/i, '').replace(/\b(time|priority|layer|repeat)\b.*$/i, '').trim();
      const target = findTaskByQuery(targetName);
      if (!target) return { handled: true, reply: 'I could not find that task. Try quoting the exact task name.' };

      const updates: Partial<Task> = {};
      const parsedTime = parseTimeFromText(raw);
      if (parsedTime) updates.time = parsedTime;
      const priorityMatch = raw.match(/\bpriority\s*([A-E])\b/i) || raw.match(/\b([A-E])\s*priority\b/i);
      if (priorityMatch?.[1]) updates.priority = priorityMatch[1].toUpperCase() as Task['priority'];
      const layerMatch = lower.match(/\b(spiritual|academic|financial|physical|general)\b/);
      if (layerMatch?.[1]) updates.layerId = layerMatch[1] as LayerId;
      const repeatMatch = lower.match(/\b(once|daily|weekly)\b/);
      if (repeatMatch?.[1]) updates.repeat = repeatMatch[1] as Task['repeat'];

      if (Object.keys(updates).length === 0) {
        return { handled: true, reply: 'I found the task but no update field was detected. Mention time, priority, layer, or repeat.' };
      }

      updateTask(target.id, updates);
      pushUndo({
        type: 'task',
        undo: () => updateTask(target.id, target),
        description: `Undo edit \"${target.name}\"`,
      });
      return { handled: true, reply: `Updated \"${target.name}\" successfully.` };
    }

    if (/\b(create|add)\b/.test(lower) && /\bhabit\b/.test(lower)) {
      const name = raw.replace(/.*\bhabit\b/i, '').trim() || 'New habit';
      const habit: Habit = {
        id: `habit-${Date.now()}`,
        name,
        layerId: 'general',
        frequency: 'daily',
        durationMinutes: 20,
        streak: 0,
        history: Array(14).fill(false),
        completedToday: false,
      };
      addHabit(habit);
      return { handled: true, reply: `Created habit: \"${habit.name}\".` };
    }

    if (/\b(toggle|complete|done)\b/.test(lower) && /\bhabit\b/.test(lower)) {
      const targetName = raw.replace(/.*\bhabit\b/i, '').trim();
      const target = habits.find((habit) => habit.name.toLowerCase().includes(targetName.toLowerCase()));
      if (!target) return { handled: true, reply: 'I could not find that habit.' };
      toggleHabit(target.id);
      return { handled: true, reply: `Toggled habit: \"${target.name}\".` };
    }

    if (/\b(bible|scripture|reading|verse)\b/.test(lower) && /\b(today|day|plan|suggest)\b/.test(lower)) {
      void (async () => {
        const total = await getTotalReadingDays();
        const day = Math.max(1, Math.min(total, Math.floor((Date.now() / (1000 * 60 * 60 * 24)) % total) + 1));
        const reading = await getDailyBibleReading(day);
        addModelMessage(`Day ${day}/${total} reading:\n${reading.passage}\n"${reading.text}"\n${reading.context}`);
      })();
      return { handled: true, reply: 'I will prepare today spiritual reading now.' };
    }

    return { handled: false };
  };

  const handleQuickCommand = (cmd: string) => {
    if (cmd === 'tasks') {
      const active = tasks.filter((task) => !task.completed).slice(0, 10);
      const reply =
        active.length === 0
          ? 'You have no active tasks.'
          : `Here are your tasks:\n${active.map((task, index) => `${index + 1}. ${task.name} | ${task.time} | ${task.repeat || 'once'} | ${task.priority}`).join('\n')}`;
      addModelMessage(reply);
    }

    if (cmd === 'bible') {
      void (async () => {
        const total = await getTotalReadingDays();
        const day = Math.max(1, Math.min(total, Math.floor((Date.now() / (1000 * 60 * 60 * 24)) % total) + 1));
        const reading = await getDailyBibleReading(day);
        addModelMessage(`Day ${day}/${total} reading:\n${reading.passage}\n"${reading.text}"\n${reading.context}`);
      })();
    }

    setInput('');
  };

  const handleFeedback = async (messageId: string, type: 'helpful' | 'unhelpful') => {
    setMessages((prev) => prev.map((message) => (message.id === messageId ? { ...message, feedback: type } : message)));
    await recordFeedback(messageId, type === 'helpful', true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
  };

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    setIsListening(true);
    recognitionRef.current.start();
  };

  const startNewConversation = async () => {
    setMessages([{ role: 'model', text: INTRO_MESSAGE, id: `intro-${Date.now()}`, timestamp: new Date() }]);
    setTaskFlow(null);
    await remember('lastConversationResetAt', new Date().toISOString());
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() || isTyping) return;

    const userMsg = input.trim();
    setInput('');
    addUserMessage(userMsg);
    setIsTyping(true);
    setAgenticStatus('thinking');

    const historyForApi = messages.map((message) => ({ role: message.role, parts: [{ text: message.text }] }));

    if (taskFlow) {
      const flowReply = await handleTaskFlowInput(userMsg);
      if (flowReply) {
        addModelMessage(flowReply);
        setIsTyping(false);
        return;
      }
    }

    const operation = parseTaskOperation(userMsg);
    if (operation.handled) {
      addModelMessage(operation.reply || 'Done.');
      setIsTyping(false);
      setAgenticStatus(null);
      return;
    }

    try {
      setAgenticStatus('searching');
      const response = await chatWithEden(historyForApi, userMsg);
      setAgenticStatus('composing');
      await streamModelMessage(response);
      await logConversation({ userMessage: userMsg, edenResponse: response, wasHelpful: undefined, userEngaged: true });
      const prof = await getProfile();
      setAgentProfile(prof);
      const recent = await getRecentConversations(10);
      setConversationHistory(recent);
    } catch {
      addModelMessage('I did not understand that clearly. Try rephrasing in one short line, for example: "Create a physical task for 19:00".');
    } finally {
      setIsTyping(false);
      setAgenticStatus(null);
    }
  }, [input, isTyping, taskFlow, messages, addUserMessage, addModelMessage, streamModelMessage]);

  return (
    <div className="flex flex-col h-full bg-background relative">
      <header className="px-4 py-3 border-b border-outline-variant/30 bg-white/95 backdrop-blur-sm sticky top-0 z-20 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {isMobileView ? (
              <button
                onClick={() => setSidebarOpen((prev) => !prev)}
                className="h-10 w-10 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/35 text-primary flex items-center justify-center transition-colors"
                aria-label="Toggle chat history"
                title="Toggle chat history"
              >
                <Menu size={18} />
              </button>
            ) : (
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-primary-container flex items-center justify-center text-white shadow-sm">
                <Sparkles size={18} />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-sm font-semibold truncate">Eden</h1>
              <p className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Available
              </p>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer">
            <span className="font-medium">Eden GPT</span>
            <ChevronDown size={12} />
          </div>

          <div className="flex items-center gap-1.5">
            {!isMobileView && (
              <button
                onClick={toggleListening}
                className={cn('h-10 w-10 rounded-lg border flex items-center justify-center transition-all', isListening ? 'bg-error/10 border-error text-error' : 'bg-surface-container-low border-outline-variant/35 text-primary hover:bg-surface-container')}
                aria-label="Voice mode"
                title="Voice mode"
              >
                {isListening ? <StopCircle size={18} /> : <Headphones size={18} />}
              </button>
            )}
            <button
              onClick={() => void startNewConversation()}
              className="h-10 w-10 rounded-lg bg-surface-container-low border border-outline-variant/35 text-primary hover:bg-surface-container flex items-center justify-center transition-colors"
              aria-label="New chat"
              title="New chat"
            >
              <Plus size={18} />
            </button>
            {!isMobileView && (
              <button
                onClick={() => setSidebarOpen((prev) => !prev)}
                className="h-10 w-10 rounded-lg bg-surface-container-low border border-outline-variant/35 text-primary hover:bg-surface-container flex items-center justify-center transition-colors"
                aria-label="Toggle sidebar"
                title="Toggle sidebar"
              >
                {sidebarOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
              </button>
            )}
          </div>
        </div>

        {agentProfile?.lastActiveLayer && (
          <div className="mt-2.5 flex items-center gap-2 text-[10px] text-on-surface-variant">
            <Layers size={12} className="text-primary/60" />
            <span className="font-medium">Focus: {agentProfile.lastActiveLayer}</span>
          </div>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden bg-[#faf8f5]">
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={isMobileView ? { x: -280, opacity: 0 } : { width: 0, opacity: 0 }}
              animate={isMobileView ? { x: 0, opacity: 1 } : { width: 280, opacity: 1 }}
              exit={isMobileView ? { x: -280, opacity: 0 } : { width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className={cn(
                'border-r border-outline-variant/30 bg-surface-container-lowest overflow-y-auto',
                isMobileView ? 'fixed top-[66px] bottom-[100px] left-0 z-30 w-[280px] shadow-xl' : 'relative w-[280px]'
              )}
            >
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History size={16} className="text-primary" />
                    <h3 className="font-semibold text-sm">History</h3>
                  </div>
                  <button
                    onClick={() => void startNewConversation()}
                    className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 flex items-center justify-center transition-colors"
                    aria-label="New chat"
                    title="New chat"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <div className="space-y-2">
                  {conversationHistory.length === 0 ? (
                    <p className="text-xs text-on-surface-variant/60 py-4 text-center">No conversations yet</p>
                  ) : (
                    conversationHistory.map((conv, index) => (
                      <div key={`${conv.id || index}`} className="text-xs p-3 rounded-lg bg-surface-container-low hover:bg-surface-container border border-outline-variant/20 cursor-pointer transition-colors group">
                        <div className="font-medium truncate line-clamp-2 text-on-surface group-hover:text-primary transition-colors">{conv.userMessage}</div>
                        <div className="text-on-surface-variant/70 truncate line-clamp-1 mt-1">{conv.edenResponse}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {isMobileView && sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 top-[66px] bottom-[100px] bg-black/25 z-20 backdrop-blur-sm"
            aria-label="Close sidebar overlay"
            title="Close sidebar"
          />
        )}

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4" ref={scrollRef}>
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.div key={message.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn('flex gap-3 max-w-[92%]', message.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto')}>
                <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-semibold', message.role === 'user' ? 'bg-gradient-to-br from-secondary to-primary-container text-white' : 'bg-primary/10 text-primary')}>
                  {message.role === 'user' ? <User size={16} /> : <Sparkles size={16} />}
                </div>
                <div className="group relative">
                  <div className={cn('p-3 rounded-lg text-sm leading-relaxed', message.role === 'user' ? 'bg-primary text-white rounded-br-none' : 'bg-white border border-outline-variant/30 rounded-bl-none text-on-surface shadow-sm')}>
                    {message.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{message.text}</p>
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
                          code: ({ children }) => <code className="bg-surface-container px-1.5 py-0.5 rounded text-xs">{children}</code>,
                        }}
                      >
                        {message.text}
                      </ReactMarkdown>
                    )}
                  </div>
                  {message.role === 'model' && (
                    <div className="absolute -bottom-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white border border-outline-variant/30 p-1.5 rounded-lg shadow-md">
                      <button onClick={() => copyToClipboard(message.text)} className="p-1 hover:bg-surface-container rounded transition-colors" title="Copy">
                        <Copy size={14} className="text-on-surface-variant" />
                      </button>
                      <button onClick={() => void handleFeedback(message.id, 'helpful')} className={cn('p-1 rounded transition-all', message.feedback === 'helpful' ? 'text-emerald-600 bg-emerald-50' : 'hover:bg-surface-container text-on-surface-variant')} title="Helpful">
                        <ThumbsUp size={14} />
                      </button>
                      <button onClick={() => void handleFeedback(message.id, 'unhelpful')} className={cn('p-1 rounded transition-all', message.feedback === 'unhelpful' ? 'text-rose-600 bg-rose-50' : 'hover:bg-surface-container text-on-surface-variant')} title="Unhelpful">
                        <ThumbsDown size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}

            {agenticStatus && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mr-auto">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-outline-variant/30 text-xs text-secondary shadow-sm">
                  <Loader2 size={12} className="animate-spin" />
                  <span className="font-medium">{agenticStatus === 'thinking' ? 'Thinking...' : agenticStatus === 'searching' ? 'Searching...' : 'Composing...'}</span>
                </div>
              </motion.div>
            )}

            {isTyping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 mr-auto">
                <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <Loader2 size={14} className="animate-spin" />
                </div>
                <div className="p-3 rounded-lg bg-white border border-outline-variant/30 rounded-bl-none shadow-sm">
                  <div className="flex gap-1.5">
                    <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {undoStack.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-3 text-sm border border-outline-variant/20">
            <span className="font-medium">{undoStack[0].description}</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => performUndo(undoStack[0])} className="font-semibold text-primary-light hover:text-primary-light/80 flex items-center gap-1 transition-colors">
                <Undo2 size={14} /> Undo
              </button>
              <button onClick={() => setUndoStack((prev) => prev.slice(1))} className="text-inverse-on-surface hover:text-inverse-on-surface/70 transition-colors" title="Dismiss" aria-label="Dismiss undo">
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {suggestions.length > 0 && (
        <div className="px-4 sm:px-6 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {suggestions.map((suggestion) => (
            <button key={suggestion.id} onClick={suggestion.action} className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-xs whitespace-nowrap hover:bg-surface-container transition-colors">
              {suggestion.icon}
              {suggestion.text}
            </button>
          ))}
        </div>
      )}

      <div className="p-3 sm:p-4 bg-white/95 backdrop-blur-sm border-t border-outline-variant/30 shadow-lg">
        {taskFlow && (
          <div className="mb-3 p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                {taskFlow.step === 'name' ? '1' : taskFlow.step === 'time' ? '2' : taskFlow.step === 'repeat' ? '3' : taskFlow.step === 'layer' ? '4' : taskFlow.step === 'priority' ? '5' : <Check size={12} />}
              </div>
              <span className="font-medium">{taskFlow.mode === 'create' ? `Creating: ${taskFlow.draft.name || '..'}` : 'Delete task'}</span>
            </div>
            <button onClick={() => setTaskFlow(null)} className="text-xs text-on-surface-variant hover:text-error transition-colors">
              Cancel
            </button>
          </div>
        )}

        <div className="relative flex items-end gap-2">
          <input ref={attachmentInputRef} type="file" className="hidden" title="Attach file" aria-label="Attach file" />
          <input ref={cameraInputRef} type="file" className="hidden" title="Capture image" aria-label="Capture image" />

          {isMobileView ? (
            <div className="relative" onClick={(event) => event.stopPropagation()}>
              <button
                onClick={() => setToolsOpen((prev) => !prev)}
                className="p-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-primary border border-outline-variant/30 transition-colors"
                title="Open tools"
                aria-label="Open tools"
              >
                <Plus size={18} />
              </button>

              <AnimatePresence>
                {toolsOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 6 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="absolute bottom-14 left-0 rounded-lg border border-outline-variant/30 bg-white shadow-lg p-1 flex flex-col gap-0.5 min-w-[140px] z-20"
                  >
                    <button
                      onClick={() => {
                        setToolsOpen(false);
                        attachmentInputRef.current?.click();
                      }}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-surface-container-low text-sm text-on-surface transition-colors"
                    >
                      <Paperclip size={16} className="text-primary" /> File
                    </button>
                    <button
                      onClick={() => {
                        setToolsOpen(false);
                        cameraInputRef.current?.click();
                      }}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-surface-container-low text-sm text-on-surface transition-colors"
                    >
                      <Camera size={16} className="text-primary" /> Camera
                    </button>
                    <button
                      onClick={() => {
                        setToolsOpen(false);
                        setInput((prev) => `${prev}${prev ? ' ' : ''}🙂`);
                      }}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-surface-container-low text-sm text-on-surface transition-colors"
                    >
                      <Smile size={16} className="text-primary" /> Emoji
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <button onClick={() => attachmentInputRef.current?.click()} className="p-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-primary border border-outline-variant/30 transition-colors" title="Attach file" aria-label="Attach file">
              <Paperclip size={18} />
            </button>
          )}

          <div className="relative flex-1">
            <textarea
              ref={textAreaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              rows={1}
              autoFocus
              placeholder={inputPlaceholder}
              className="w-full resize-none overflow-y-auto bg-white border border-outline-variant/40 rounded-xl py-3 pl-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
            {input.trim() ? (
              <button onClick={() => void handleSend()} disabled={isTyping} className="absolute right-2.5 bottom-2.5 p-2 rounded-lg bg-primary hover:bg-primary/90 text-white disabled:opacity-50 transition-all shadow-sm active:scale-95" title="Send" aria-label="Send">
                <Send size={18} />
              </button>
            ) : isMobileView ? (
              <button
                onClick={toggleListening}
                className={cn('absolute right-2.5 bottom-2.5 p-2 rounded-lg transition-all', isListening ? 'bg-error/10 text-error border border-error/30' : 'bg-surface-container-low text-primary border border-outline-variant/30')}
                title="Voice mode"
                aria-label="Voice mode"
              >
                {isListening ? <StopCircle size={18} /> : <Mic size={18} />}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Eden;
