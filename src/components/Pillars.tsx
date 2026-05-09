import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import { ArrowLeft, CheckCircle2, Circle, WandSparkles, Loader2 } from 'lucide-react';
import { cn, formatXP, getProgress } from '../lib/utils';
import { Habit, Layer, LayerId } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { getEdenInsight } from '../services/gemini';
import { BibleReadingUI } from './BibleReadingUI';

const iconByLayer: Record<LayerId, string> = {
  spiritual: 'auto_awesome',
  academic: 'menu_book',
  financial: 'account_balance',
  physical: 'exercise',
  general: 'dashboard',
};

const layerColorClasses: Record<LayerId, { stripe: string; icon: string; level: string; bar: string }> = {
  spiritual: {
    stripe: 'bg-[var(--color-spiritual)]',
    icon: 'text-[var(--color-spiritual)]',
    level: 'text-[var(--color-spiritual)]',
    bar: 'bg-[var(--color-spiritual)]',
  },
  academic: {
    stripe: 'bg-[var(--color-academic)]',
    icon: 'text-[var(--color-academic)]',
    level: 'text-[var(--color-academic)]',
    bar: 'bg-[var(--color-academic)]',
  },
  financial: {
    stripe: 'bg-[var(--color-financial)]',
    icon: 'text-[var(--color-financial)]',
    level: 'text-[var(--color-financial)]',
    bar: 'bg-[var(--color-financial)]',
  },
  physical: {
    stripe: 'bg-[var(--color-physical)]',
    icon: 'text-[var(--color-physical)]',
    level: 'text-[var(--color-physical)]',
    bar: 'bg-[var(--color-physical)]',
  },
  general: {
    stripe: 'bg-[var(--color-general)]',
    icon: 'text-[var(--color-general)]',
    level: 'text-[var(--color-general)]',
    bar: 'bg-[var(--color-general)]',
  },
};

const layerSubtitle: Record<LayerId, string> = {
  spiritual: 'Cultivating inner stillness and sacred discipline.',
  academic: 'Deep work, curiosity, and long-term mastery.',
  financial: 'Wise stewardship and durable provision.',
  physical: 'Strength, energy, and embodied discipline.',
  general: 'Order, focus, and whole-life alignment.',
};

const layerPractices: Record<LayerId, Array<{ title: string; detail: string; icon: string }>> = {
  spiritual: [
    { title: 'Prayer Rhythm', detail: 'Start and end day with focused prayer windows.', icon: 'self_improvement' },
    { title: 'Scripture Meditation', detail: 'Read one passage and write one obedience action.', icon: 'menu_book' },
    { title: 'Sabbath Margin', detail: 'Protect one low-noise block for worship and stillness.', icon: 'church' },
  ],
  academic: [
    { title: 'Deep Work Block', detail: 'One uninterrupted 45-minute learning sprint.', icon: 'psychology' },
    { title: 'Active Recall', detail: 'Summarize from memory before checking notes.', icon: 'quiz' },
    { title: 'Concept Journal', detail: 'Capture one key idea and one application daily.', icon: 'edit_note' },
  ],
  financial: [
    { title: 'Expense Review', detail: 'Track every expense and label it by need/value.', icon: 'receipt_long' },
    { title: 'Budget Checkpoint', detail: 'Run a 30-minute budget review each week.', icon: 'account_balance_wallet' },
    { title: 'Income Growth', detail: 'One action daily toward income or skill expansion.', icon: 'trending_up' },
  ],
  physical: [
    { title: 'Exercise Session', detail: 'Strength or cardio session with progressive load.', icon: 'fitness_center' },
    { title: 'Nutrition Discipline', detail: 'Whole-food meal with protein and hydration target.', icon: 'restaurant' },
    { title: 'Recovery Protocol', detail: 'Sleep schedule, stretch, and mobility reset.', icon: 'hotel' },
  ],
  general: [
    { title: 'Daily Planning', detail: 'Define top 3 outcomes before work begins.', icon: 'event_note' },
    { title: 'Environment Reset', detail: '15-minute cleanup to reduce visual friction.', icon: 'cleaning_services' },
    { title: 'Digital Boundaries', detail: 'Intentional app windows and distraction blocks.', icon: 'screen_lock_portrait' },
  ],
};

const layerHeroTitle: Record<LayerId, string> = {
  spiritual: 'The Rhythm of Devotion',
  academic: 'The Rhythm of Mastery',
  financial: 'The Rhythm of Stewardship',
  physical: 'The Rhythm of Restoration',
  general: 'The Rhythm of Alignment',
};

const layerGuideCards: Record<LayerId, Array<{ title: string; detail: string; mins: string }>> = {
  spiritual: [
    { title: 'Morning Prayer Walk', detail: 'Quiet movement plus focused prayer to anchor the day.', mins: '20 mins' },
    { title: 'Psalm Meditation', detail: 'Read slowly, write one obedience action, and pray it.', mins: '15 mins' },
    { title: 'Evening Examen', detail: 'Review gratitude, conviction, and next-day intention.', mins: '12 mins' },
  ],
  academic: [
    { title: 'Deep Work Sprint', detail: 'Single-topic 45-minute concentration block.', mins: '45 mins' },
    { title: 'Active Recall Loop', detail: 'Recall from memory before checking your notes.', mins: '20 mins' },
    { title: 'Concept Review', detail: 'Capture one core concept and practical application.', mins: '18 mins' },
  ],
  financial: [
    { title: 'Budget Integrity Check', detail: 'Review inflow/outflow and trim non-essential leaks.', mins: '25 mins' },
    { title: 'Expense Labeling', detail: 'Classify every expense by value and necessity.', mins: '15 mins' },
    { title: 'Income Expansion', detail: 'One action that increases skill, value, or cashflow.', mins: '30 mins' },
  ],
  physical: [
    { title: 'Full Body Discipline', detail: 'Compound movement session to build strength and stamina.', mins: '60 mins' },
    { title: 'Core Foundation', detail: 'Stability and breathing for posture and endurance.', mins: '20 mins' },
    { title: 'Lower Body Power', detail: 'Mobility plus loaded movement for resilient legs.', mins: '30 mins' },
  ],
  general: [
    { title: 'Daily System Reset', detail: 'Declutter and reset work environment friction points.', mins: '15 mins' },
    { title: 'Priority Lock-in', detail: 'Define top 3 outcomes and sequence execution blocks.', mins: '12 mins' },
    { title: 'Digital Boundary Block', detail: 'Disable distractions and protect one deep block.', mins: '10 mins' },
  ],
};

const layerWisdom: Record<LayerId, Array<{ title: string; detail: string; points: string[] }>> = {
  spiritual: [
    { title: 'Prayer Fuel', detail: 'Begin with surrender before strategy.', points: ['Start with thanksgiving', 'Pray for one clear obedience'] },
    { title: 'Scripture Rooting', detail: 'Truth repeated becomes conviction embodied.', points: ['Read short and deep', 'Journal one practical step'] },
  ],
  academic: [
    { title: 'Pre-Study Setup', detail: 'Reduce cognitive switching before deep work.', points: ['Single objective', 'Phone out of reach'] },
    { title: 'Retention Loop', detail: 'Learning sticks when recalled without notes.', points: ['Explain aloud', 'Teach in one paragraph'] },
  ],
  financial: [
    { title: 'Cashflow Awareness', detail: 'Stewardship starts with clear visibility.', points: ['Track all spending', 'Tag impulse purchases'] },
    { title: 'Margin Building', detail: 'Small consistent reserves protect long-term growth.', points: ['Automate weekly savings', 'Reduce recurring leakage'] },
  ],
  physical: [
    { title: 'Pre-Workout Fuel', detail: 'Ignite output with simple quality fuel.', points: ['Oats and nuts', 'Green tea or coffee'] },
    { title: 'Recovery Greens', detail: 'Repair and reduce inflammation through nutrition.', points: ['Leafy greens daily', 'Hydrate to recovery'] },
  ],
  general: [
    { title: 'Attention Guardrails', detail: 'What you allow in focus determines outcomes.', points: ['Single-task windows', 'Scheduled communication blocks'] },
    { title: 'Weekly Review', detail: 'Reflection converts activity into learning.', points: ['Review wins and misses', 'Reset next-week systems'] },
  ],
};

const physicalGuideSeed = [
  { title: 'Full Body Discipline', detail: 'A rigorous sequence designed to challenge endurance and build functional strength across all major muscle chains.', duration: '60 Mins', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAKQErgHO8A5Rnc8j4u6Nnb2ZMl1_LfInsxmAKDU8SzvHxQ79wCtv60s5vVuVaFs4Ye52oWiZcGteTllOibwUYU5_rSWqXrSDjecuRAg_aoDBo8Ucw6sdPM92I6oyquy8j-p7EVff9x8xf1MSJGIeiELvPpCvMMfPN8cP8pOUuK6EWajQgqVRttM9henrZfc5zCuSNHd-z54ERYEqBuInONrrGa9D4gwdrl0Wnd0-VfBtOpOOyw_iceCZzNxfuNycinGqudLZsyDA' },
  { title: 'Upper Body', detail: 'Sculpt and strengthen arms and chest through controlled tempo.', duration: 'Play', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDG5-9XWCyVbEjxHng_RTHR7XKuK3S2-1FXykZSaWuRYnucJWKdpzKiQhjhWdKugmgl39decj1TzMASQYg7oKM9bfJZjdLodU-_RlH86TAgUMUhoLnfIs8jA3jy8czMrZ9o9BTIU9eL-O1ScOv02RVQJNE0dQYO2FeTn_cPpN-PisjDCYa8mXSkk5QU4SkpZjofXk-jcn8-yF2sOvFQJGgmUSh9yTZncnWoVwgHgL67dbpQDqeuaLtOfXNRv2XbFLLEVgHceAn2kw' },
  { title: 'Core (Abs)', detail: 'Stability and focus for a centered physical foundation.', duration: 'Play', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAKutajJRHrQTl46zs-2yHrzeO5EaTgnYgr_muHLTxdD_z65Vtpcl9cnH72TStxOd2-1QwcTJNKWaxZl_2GkY6U_NfjG1fedIZ0D510abaEOvZF3du7ABy0XH0hc-qo9qo5xZ1p5QgI8D-7dsc-IcYt7SPhUeEwXqZiZoybHUrK5cTUfX6RBZHHGqRV8xhB8ICNVhy1xwa6Kl8yKjaKY3J84JFRDlkE5imIrUaiIkR-rDIHP0PSPR3fqNC2cJrKEc2VzpHdLzk9rA' },
  { title: 'Lower Body', detail: 'Power and mobility for the lower extremities.', duration: 'Play', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDnsHku6g2kzAIqe9cYN63SXWo5cPRaFY1TDxw2HQmkQGex6T9TRH2tFTLArsGb2cyKGBLSUSRD8ttlROG7toqeWuoocF3pDAkk3M4x2NPML1Pjp59g_A__z1jXGn4O0KQOpXggY5faeYHTr-431MsoPUXjbtny3at42cVdt897sL_oMcapkDSlsLO-g56ek7spWLcqsZX7IBJ4AoMxPpB_AAxT71_ZQMuleZtz5AY5vScm53-BdBxmFfsJ8pk4Y0ZydAyUi11SJA' },
];

const physicalNutrition = [
  { title: 'Pre-Workout Fuel', detail: 'Ignite your metabolism with slow-release carbohydrates and natural stimulants.', points: ['Oats with crushed walnuts', 'Green tea or cold-brew espresso'] },
  { title: 'Recovery Greens', detail: 'Repair muscle fibers and reduce inflammation with alkalizing nutrients.', points: ['Spinach and spirulina smoothie', 'Steamed broccoli with lemon zest'] },
];

const toPaddedTime = (hours: number, minutes: number) => `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

const getRoundedFutureTime = (minutesAhead: number) => {
  const now = new Date();
  const next = new Date(now.getTime() + minutesAhead * 60 * 1000);
  const rounded = Math.ceil(next.getMinutes() / 5) * 5;
  if (rounded >= 60) {
    next.setHours(next.getHours() + 1, 0, 0, 0);
  } else {
    next.setMinutes(rounded, 0, 0);
  }
  return toPaddedTime(next.getHours(), next.getMinutes());
};

const Pillars: React.FC<{ initialLayerId?: string | null }> = ({ initialLayerId }) => {
  const { user, layers, habits, tasks, addHabit, addTask, toggleHabit, bibleReading, completeBibleDay } = useApp();

  const [activeLayerId, setActiveLayerId] = useState<LayerId | null>(null);
  const [habitName, setHabitName] = useState('');
  const [habitMinutes, setHabitMinutes] = useState(15);
  const [habitFrequency, setHabitFrequency] = useState<'daily' | 'weekly'>('daily');
  const [habitPriority, setHabitPriority] = useState<'A' | 'B' | 'C' | 'D' | 'E'>('C');
  const [habitTimeFormat, setHabitTimeFormat] = useState<'24' | '12'>('24');
  const [habitHourInput, setHabitHourInput] = useState('08');
  const [habitMinuteInput, setHabitMinuteInput] = useState('00');
  const [habitPeriod, setHabitPeriod] = useState<'AM' | 'PM'>('AM');
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [layerPlan, setLayerPlan] = useState('');
  const [showAllGuides, setShowAllGuides] = useState(false);
  const [layerActionMessage, setLayerActionMessage] = useState('');
  const [layerHint, setLayerHint] = useState('');
  const [loadingHint, setLoadingHint] = useState(false);
  const [showHabitSuggestions, setShowHabitSuggestions] = useState(false);
  const [habitSuggestions, setHabitSuggestions] = useState<Array<{ name: string; description: string; duration: number }>>([]);
  const [isGeneratingHabit, setIsGeneratingHabit] = useState(false);
  const today = new Date();
  const todayDateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const bibleCompletedToday = bibleReading.completed && bibleReading.lastCompletedDate === todayDateKey;

  const layerStats = useMemo(() => {
    return layers.map((layer) => {
      const layerHabits = habits.filter((h) => h.layerId === layer.id);
      const layerTasks = tasks.filter((t) => t.layerId === layer.id);
      const completedHabits = layerHabits.filter((h) => h.completedToday).length;
      const completedTasks = layerTasks.filter((t) => t.completed).length;
      const activityDenominator = layerHabits.length + layerTasks.length;
      const activityProgress = activityDenominator > 0 ? Math.round(((completedHabits + completedTasks) / activityDenominator) * 100) : 0;
      return {
        ...layer,
        habitsActive: layerHabits.length,
        tasksToday: layerTasks.filter((t) => !t.completed).length,
        progress: Math.max(Math.round(getProgress(layer.xp, layer.maxXp)), activityProgress),
      };
    });
  }, [layers, habits, tasks]);

  const activeLayer = useMemo<Layer | null>(() => {
    if (!activeLayerId) return null;
    return layers.find((layer) => layer.id === activeLayerId) || null;
  }, [activeLayerId, layers]);

  const activeLayerHabits = useMemo<Habit[]>(() => {
    if (!activeLayerId) return [];
    return habits.filter((h) => h.layerId === activeLayerId);
  }, [habits, activeLayerId]);

  const primaryLayerTrack = useMemo(() => {
    const names = user?.preferences.customFocusPlaylistNames || [];
    const urls = user?.preferences.customFocusPlaylistDataUrls || [];
    if (names[0] && urls[0]) {
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

  const layerInsightSummary = useMemo(() => {
    return layerStats.reduce<Record<LayerId, string>>((acc, layer) => {
      const incompleteCount = tasks.filter((task) => task.layerId === layer.id && !task.completed).length;
      const activeHabitCount = habits.filter((habit) => habit.layerId === layer.id).length;
      if (incompleteCount > 0) {
        acc[layer.id] = `${incompleteCount} open tasks and ${activeHabitCount} active habits. Build momentum with one concrete execution block now.`;
      } else if (activeHabitCount > 0) {
        acc[layer.id] = `${activeHabitCount} habits are active. Protect consistency and increase quality on your next session.`;
      } else {
        acc[layer.id] = 'No active tasks yet. Start with one small guided action and lock consistency first.';
      }
      return acc;
    }, {
      spiritual: '',
      academic: '',
      financial: '',
      physical: '',
      general: '',
    });
  }, [habits, layerStats, tasks]);

  const buildHabitTime = () => {
    if (habitTimeFormat === '24') {
      const hour = parseInt(habitHourInput) || 0;
      const minute = parseInt(habitMinuteInput) || 0;
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    } else {
      let hour24 = parseInt(habitHourInput) || 0;
      if (habitPeriod === 'PM' && hour24 !== 12) hour24 += 12;
      if (habitPeriod === 'AM' && hour24 === 12) hour24 = 0;
      const minute = parseInt(habitMinuteInput) || 0;
      return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  };

  const resolveDefaultUploadedSong = () => {
    const names = user?.preferences.customFocusPlaylistNames || [];
    const urls = user?.preferences.customFocusPlaylistDataUrls || [];
    if (names[0] && urls[0]) {
      return { name: names[0], dataUrl: urls[0] };
    }
    if (user?.preferences.customFocusSongName && user?.preferences.customFocusSongDataUrl) {
      return { name: user.preferences.customFocusSongName, dataUrl: user.preferences.customFocusSongDataUrl };
    }
    return null;
  };

  const createHabitForLayer = (layerId: LayerId) => {
    const name = habitName.trim();
    if (!name) {
      setLayerActionMessage('Please enter a habit name.');
      return;
    }

    const finalTime = buildHabitTime();
    const timeMatch = finalTime.match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/);
    if (!timeMatch) {
      setLayerActionMessage('Please enter a valid habit time.');
      return;
    }

    const now = new Date();
    const period = now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening';
    const habitId = `habit-${Date.now()}`;
    const habitTaskId = `habit-task-${habitId}`;
    const defaultUploadedSong = resolveDefaultUploadedSong();

    addHabit({
      id: habitId,
      name,
      layerId,
      frequency: habitFrequency,
      durationMinutes: Math.max(5, habitMinutes),
      streak: 0,
      history: Array(14).fill(false),
      completedToday: false,
      timeOfDay: period,
      time: finalTime,
      linkedTaskId: habitTaskId,
    });

    addTask({
      id: habitTaskId,
      name: `[Habit] ${name}`,
      layerId,
      priority: habitPriority,
      repeat: habitFrequency,
      time: finalTime,
      completed: false,
      date: new Date().toISOString(),
      alarmEnabled: true,
      preferredMusic: defaultUploadedSong?.name || '',
      customAlarmAudioName: defaultUploadedSong?.name,
      customAlarmAudioDataUrl: defaultUploadedSong?.dataUrl,
      estimatedDuration: Math.max(5, Math.min(300, habitMinutes)),
      durationStartedAt: new Date().toISOString(),
    });

    setHabitName('');
    setHabitMinutes(15);
    setHabitFrequency('daily');
    setHabitPriority('C');
    setHabitTimeFormat('24');
    setHabitHourInput('08');
    setHabitMinuteInput('00');
    setHabitPeriod('AM');
    setShowHabitSuggestions(false);
    setLayerActionMessage('Habit created and linked to a repeating task schedule.');
  };

  useEffect(() => {
    setShowAllGuides(false);
    setLayerActionMessage('');
    setLayerHint('');
    setLayerPlan('');
  }, [activeLayerId]);

  useEffect(() => {
    if (!initialLayerId) return;
    const valid = layers.some((layer) => layer.id === initialLayerId);
    if (valid) {
      setActiveLayerId(initialLayerId as LayerId);
    }
  }, [initialLayerId, layers]);

  const askEdenForLayerHint = async (layer: Layer) => {
    setLoadingHint(true);
    try {
      const hint = await getEdenInsight(`Give one tactical coaching hint for ${layer.name} layer. Include one action user can do in next 10 minutes.`);
      setLayerHint(hint);
    } finally {
      setLoadingHint(false);
    }
  };

  const getEdenHabitSuggestions = async (layer: Layer) => {
    setIsGeneratingHabit(true);
    try {
      const suggestions = await getEdenInsight(
        `For someone building a ${layer.name} layer habit, suggest 5 specific, actionable habits they could implement. Format as JSON array with objects: {name, description, duration (in minutes)}. Be concise.`
      );
      const fallbackByLayer: Record<LayerId, Array<{ name: string; description: string; duration: number }>> = {
        spiritual: [
          { name: 'Morning prayer block', description: 'Begin with focused prayer and one scripture.', duration: 12 },
          { name: 'Scripture reflection', description: 'Read and note one practical application.', duration: 15 },
          { name: 'Evening gratitude journal', description: 'Write three gratitude lines before sleep.', duration: 10 },
          { name: 'Bible chapter reading', description: 'Read one chapter and write one takeaway.', duration: 12 },
          { name: 'Short gratitude prayer', description: 'Pray with focus and thank God for three things.', duration: 5 },
        ],
        academic: [
          { name: 'Active recall sprint', description: 'Recall key concepts without notes.', duration: 25 },
          { name: 'Practice problem set', description: 'Solve targeted questions in one weak area.', duration: 30 },
          { name: 'Lecture review', description: 'Summarize one lecture into key points.', duration: 20 },
          { name: 'Past exam practice', description: 'Work through old questions under timed conditions.', duration: 45 },
          { name: 'Lecture summary page', description: 'Condense one lecture into a single page.', duration: 20 },
        ],
        financial: [
          { name: 'Expense tracking check', description: 'Record all purchases and categories.', duration: 10 },
          { name: 'Budget review', description: 'Adjust one budget line and next action.', duration: 15 },
          { name: 'Savings transfer habit', description: 'Move a fixed amount to savings.', duration: 8 },
          { name: 'Daily expense log', description: 'Write down every spend from today.', duration: 10 },
          { name: 'Money concept study', description: 'Learn one money principle and apply it.', duration: 12 },
        ],
        physical: [
          { name: 'Mobility routine', description: 'Joint mobility and stretch routine.', duration: 15 },
          { name: 'Bodyweight circuit', description: 'Short strength session for consistency.', duration: 20 },
          { name: 'Hydration checkpoint', description: 'Track and complete hydration target.', duration: 5 },
          { name: 'No-snooze wakeup', description: 'Wake up immediately without hitting snooze.', duration: 5 },
          { name: 'Post-study stretch', description: 'Stretch after study or work to reset posture.', duration: 10 },
        ],
        general: [
          { name: 'Top 3 planning', description: 'Define three priorities for the day.', duration: 10 },
          { name: 'Desk reset', description: 'Clear workspace before deep work.', duration: 8 },
          { name: 'End-of-day review', description: 'Review wins and plan tomorrow.', duration: 12 },
          { name: '5-second start', description: 'Begin the smallest next step immediately.', duration: 5 },
          { name: 'Daily discipline check', description: 'Track one win and one correction.', duration: 10 },
        ],
      };
      try {
        const normalized = String(suggestions || '').trim();
        const extracted = normalized.includes('```')
          ? normalized.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
          : normalized;
        const parsed = JSON.parse(extracted);
        setHabitSuggestions(Array.isArray(parsed) ? parsed.slice(0, 10) : []);
      } catch {
        setHabitSuggestions(fallbackByLayer[layer.id].slice(0, 6));
      }
      setShowHabitSuggestions(true);
    } finally {
      setIsGeneratingHabit(false);
    }
  };

  const applyHabitSuggestion = (suggestion: any) => {
    setHabitName(suggestion.name || '');
    setHabitMinutes(suggestion.duration || 15);
    setShowHabitSuggestions(false);
  };

  const createGuideTask = (layerId: LayerId, title: string, minutesLabel: string) => {
    const timeHint = /\d+/.exec(minutesLabel)?.[0] || '20';
    const layerUpcomingTask = tasks.find((task) => task.layerId === layerId && !task.completed && String(task.time || '').trim().length > 0);
    const suggestedTime = layerUpcomingTask?.time || getRoundedFutureTime(layerId === 'spiritual' ? 20 : layerId === 'academic' ? 35 : 30);
    const progressSnapshot = layerStats.find((layer) => layer.id === layerId)?.progress || 0;
    const dynamicPriority: 'A' | 'B' | 'C' = progressSnapshot < 35 ? 'A' : progressSnapshot < 70 ? 'B' : 'C';

    addTask({
      id: `task-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      name: `${title} (${timeHint}m)`,
      layerId,
      priority: dynamicPriority,
      repeat: 'once',
      time: suggestedTime,
      completed: false,
      date: new Date().toISOString(),
      alarmEnabled: true,
      preferredMusic: primaryLayerTrack?.name || '',
      customAlarmAudioName: primaryLayerTrack?.name,
      customAlarmAudioDataUrl: primaryLayerTrack?.dataUrl,
    });
    setLayerActionMessage(`Added to Home tasks: ${title} at ${suggestedTime} with priority ${dynamicPriority}.`);
  };

  const handleViewPlan = async (layer: Layer) => {
    setLoadingPlan(true);
    try {
      const plan = await getEdenInsight(
        `Create a practical 3-step action plan for the ${layer.name} layer. Include today's immediate action, this week's structure, and one metric to track. Keep concise.`
      );
      setLayerPlan(plan);
      setLayerActionMessage(`${layer.name} plan generated by Eden.`);
    } finally {
      setLoadingPlan(false);
    }
  };

  const handleViewAllGuides = (layerId: LayerId) => {
    const nextValue = !showAllGuides;
    setShowAllGuides(nextValue);
    setLayerActionMessage(`${layerId} guide list ${nextValue ? 'expanded' : 'collapsed'}.`);
  };

  return (
    <div className="p-6 pb-24 max-w-4xl mx-auto">
      <header className="mb-10">
        <h1 className="display-text text-5xl font-medium text-on-surface mb-2">Your Layers</h1>
        <p className="text-on-surface-variant text-xs tracking-[0.14em] uppercase font-bold">The Architecture of Your Life</p>
      </header>

      <section className="flex flex-col gap-6">
        {layerStats.map((layer, idx) => (
          <motion.button
            key={layer.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04 }}
            onClick={() => setActiveLayerId(layer.id)}
            className="relative w-full text-left bg-surface-container-lowest border border-outline-variant/20 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
          >
            <div className={cn('absolute left-0 top-0 bottom-0 w-1.5', layerColorClasses[layer.id].stripe)} />
            <div className="p-5 pl-8">
              <div className="flex justify-between items-start mb-4 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={cn('material-symbols-outlined text-3xl', layerColorClasses[layer.id].icon)}>{iconByLayer[layer.id]}</span>
                  <div>
                    <h3 className="text-xl font-serif font-semibold text-on-surface">{layer.name}</h3>
                    <p className={cn('text-xs font-label font-bold', layerColorClasses[layer.id].level)}>Level {layer.level}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-on-surface-variant mb-1">{layer.habitsActive} habits active</p>
                  <p className="text-xs text-on-surface-variant">{layer.tasksToday} tasks today</p>
                </div>
              </div>

              <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
                <motion.div
                  className={cn('h-full rounded-full', layerColorClasses[layer.id].bar)}
                  initial={{ width: 0 }}
                  animate={{ width: `${layer.progress}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[10px] text-outline uppercase tracking-widest font-bold">XP Progress</span>
                <span className="text-[10px] text-outline uppercase tracking-widest font-bold">{formatXP(layer.xp, layer.maxXp)}</span>
              </div>
            </div>
          </motion.button>
        ))}
      </section>

      <AnimatePresence>
        {activeLayer && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed inset-0 z-[80] bg-background overflow-y-auto"
          >
            <header className="sticky top-0 w-full z-50 bg-[#fef9f2]/80 backdrop-blur-md flex justify-between items-center px-4 sm:px-6 h-16 border-b border-outline-variant/25">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveLayerId(null)}
                  className="h-9 w-9 rounded-full bg-surface-container-low text-primary flex items-center justify-center"
                  aria-label="Back to layers"
                >
                  <ArrowLeft size={18} />
                </button>
                <span className="text-xl font-serif italic text-primary tracking-tight">Edenify</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-surface-container-high overflow-hidden">
                <span className="material-symbols-outlined text-primary text-[18px] h-full w-full flex items-center justify-center">layers</span>
              </div>
            </header>

            <main className="pt-6 pb-28 px-4 sm:px-6 w-full max-w-7xl mx-auto min-h-screen">
              <div className="mb-10 relative">
                <div className={cn('absolute -left-3 top-0 w-1 h-12 rounded-full', layerColorClasses[activeLayer.id].stripe)} />
                <h1 className="text-4xl font-serif font-bold tracking-tight text-on-surface mb-2">{activeLayer.name} Layer</h1>
                <p className="text-on-surface-variant/70 italic">{layerSubtitle[activeLayer.id]}</p>
              </div>

              {activeLayer.id === 'physical' ? (
                <>
                  <section className="mb-16">
                    <div className="relative overflow-hidden rounded-[32px] bg-surface-container-low min-h-[300px] flex items-center">
                      <div className="absolute inset-0 opacity-10">
                        <img className="w-full h-full object-cover" alt="Physical layer" src="https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=70" />
                      </div>
                      <div className="relative z-10 p-8 md:p-12 lg:p-16 flex flex-col md:flex-row gap-12 items-center w-full">
                        <div className="md:w-1/2">
                          <div className="flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-[var(--color-physical)]">auto_awesome</span>
                            <span className="font-label uppercase text-[10px] tracking-[0.2em] font-bold text-[var(--color-physical)]">Eden Insight</span>
                          </div>
                          <h2 className="text-4xl text-on-surface mb-6 leading-tight">The Rhythm of Restoration</h2>
                          <p className="text-secondary leading-relaxed mb-8 font-body">{layerInsightSummary.physical}</p>
                          <button onClick={() => handleViewPlan(activeLayer)} className="bg-gradient-to-br from-primary to-primary-container text-on-primary px-8 py-3 rounded-full font-label font-bold text-xs uppercase tracking-widest hover:opacity-90 transition-all">
                            View Plan
                          </button>
                          <button
                            onClick={() => askEdenForLayerHint(activeLayer)}
                            className="ml-2 mt-3 md:mt-0 px-8 py-3 rounded-full border border-outline-variant/35 text-[11px] font-bold uppercase tracking-[0.14em] text-primary"
                          >
                            Get Eden Hint
                          </button>
                        </div>
                        <div className="md:w-1/2 flex justify-center">
                          <div className="relative group">
                            <div className="absolute -inset-4 bg-[var(--color-physical)]/5 rounded-full blur-2xl group-hover:bg-[var(--color-physical)]/10 transition-all" />
                            <img className="relative w-64 h-64 md:w-80 md:h-80 object-cover rounded-[48px] shadow-sm rotate-3 group-hover:rotate-0 transition-transform duration-500" alt="Recovery bowl" src="https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=70" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="mb-20">
                    <div className="flex justify-between items-center mb-10">
                      <h3 className="text-3xl text-on-surface">Workout Guides</h3>
                      <button onClick={() => handleViewAllGuides('physical')} className="font-label text-xs font-bold text-[var(--color-physical)] border-b border-[var(--color-physical)]/20 pb-1 cursor-pointer">{showAllGuides ? 'Collapse' : 'Explore All'}</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                      <div className="md:col-span-7 bg-surface-container-lowest rounded-[28px] overflow-hidden flex flex-col group border-t-2 border-[var(--color-physical)]/5">
                        <div className="h-64 overflow-hidden relative">
                          <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="Full body discipline" src={physicalGuideSeed[0].image} />
                          <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-[var(--color-physical)]">60 Mins</div>
                        </div>
                        <div className="p-8">
                          <h4 className="text-2xl font-serif italic mb-3">{physicalGuideSeed[0].title}</h4>
                          <p className="text-secondary text-sm leading-relaxed mb-6">{physicalGuideSeed[0].detail}</p>
                          <button onClick={() => createGuideTask('physical', physicalGuideSeed[0].title, physicalGuideSeed[0].duration)} className="w-full bg-surface-container-high py-4 rounded-xl font-label font-bold text-[10px] uppercase tracking-widest hover:bg-[var(--color-physical)] hover:text-white transition-colors duration-300">Start Workout</button>
                        </div>
                      </div>

                      <div className="md:col-span-5 flex flex-col gap-6">
                        {(showAllGuides ? physicalGuideSeed.slice(1) : physicalGuideSeed.slice(1, 3)).map((guide) => (
                          <div key={guide.title} className="bg-surface-container-low p-6 rounded-[24px] flex items-center gap-6 group hover:bg-surface-container-high transition-colors">
                            <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0">
                              <img className="w-full h-full object-cover" alt={guide.title} src={guide.image} />
                            </div>
                            <div className="flex-grow">
                              <h4 className="font-serif italic text-lg leading-tight mb-1">{guide.title}</h4>
                              <p className="text-outline text-xs line-clamp-2">{guide.detail}</p>
                            </div>
                            <button onClick={() => createGuideTask('physical', guide.title, guide.duration)} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[var(--color-physical)] shadow-sm group-hover:scale-110 transition-transform" aria-label={`Play ${guide.title}`}>
                              <span className="material-symbols-outlined text-sm">play_arrow</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="mb-20">
                    <h3 className="text-3xl text-on-surface mb-10">Nutritional Wisdom</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {physicalNutrition.map((card, index) => (
                        <div key={card.title} className={cn('bg-surface-container-low rounded-[28px] p-8 border-l-4', index === 0 ? 'border-[var(--color-physical)]/30' : 'border-[var(--color-academic)]/30')}>
                          <div className="flex items-center gap-4 mb-6">
                            <span className={cn('material-symbols-outlined', index === 0 ? 'text-[var(--color-physical)]' : 'text-[var(--color-academic)]')}>{index === 0 ? 'bolt' : 'eco'}</span>
                            <h4 className="text-xl font-serif italic">{card.title}</h4>
                          </div>
                          <p className="text-secondary text-sm mb-6">{card.detail}</p>
                          <ul className="space-y-3">
                            {card.points.map((point) => (
                              <li key={point} className="flex items-center gap-3 text-on-surface-variant font-body text-sm">
                                <span className={cn('w-1.5 h-1.5 rounded-full', index === 0 ? 'bg-[var(--color-physical)]/40' : 'bg-[var(--color-academic)]/40')} />
                                {point}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </section>

                </>
              ) : activeLayer.id === 'spiritual' ? (
                <>
                  <section className="mb-8">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-serif italic text-on-surface">Daily Scripture</h2>
                    </div>

                    <BibleReadingUI
                      currentDay={bibleReading.day || 1}
                      completedToday={bibleCompletedToday}
                      onToggleComplete={(completed) => {
                        void completeBibleDay(completed);
                      }}
                      isProgressionEnforced={true}
                      totalDays={bibleReading.totalDays}
                    />
                  </section>

                  <section className="mb-6 relative overflow-hidden rounded-[2rem] border border-outline-variant/25 bg-surface-container-low p-5 sm:p-7">
                    <div className={cn('absolute top-0 left-0 w-full h-0.5', layerColorClasses[activeLayer.id].stripe)} />
                    <p className={cn('text-[10px] uppercase tracking-[0.15em] font-bold mb-3', layerColorClasses[activeLayer.id].icon)}>Eden Insight</p>
                    <h2 className="text-4xl font-serif italic text-on-surface mb-4">{layerHeroTitle[activeLayer.id]}</h2>
                    <p className="text-sm text-on-surface-variant leading-relaxed">
                      {layerInsightSummary[activeLayer.id]}
                    </p>
                    <button onClick={() => handleViewPlan(activeLayer)} className="mt-5 px-5 py-2 rounded-full bg-gradient-to-br from-primary to-primary-container text-white text-[11px] font-bold uppercase tracking-[0.14em]">
                      View Plan
                    </button>
                    <button
                      onClick={() => askEdenForLayerHint(activeLayer)}
                      className="mt-3 ml-2 px-5 py-2 rounded-full border border-outline-variant/35 text-[11px] font-bold uppercase tracking-[0.14em] text-primary"
                    >
                      Get Eden Hint
                    </button>
                  </section>

                  <section className="mb-6 bg-surface-container-low rounded-2xl border border-outline-variant/30 p-4">
                    <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-outline mb-3">Core Practices</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {layerPractices[activeLayer.id].map((practice) => (
                        <div key={practice.title} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3">
                          <span className="material-symbols-outlined text-primary text-[18px]">{practice.icon}</span>
                          <p className="text-sm font-semibold text-on-surface mt-1">{practice.title}</p>
                          <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{practice.detail}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                </>
              ) : (
                <>
                  <section className="mb-6 relative overflow-hidden rounded-[2rem] border border-outline-variant/25 bg-surface-container-low p-5 sm:p-7">
                    <div className={cn('absolute top-0 left-0 w-full h-0.5', layerColorClasses[activeLayer.id].stripe)} />
                    <p className={cn('text-[10px] uppercase tracking-[0.15em] font-bold mb-3', layerColorClasses[activeLayer.id].icon)}>Eden Insight</p>
                    <h2 className="text-4xl font-serif italic text-on-surface mb-4">{layerHeroTitle[activeLayer.id]}</h2>
                    <p className="text-sm text-on-surface-variant leading-relaxed">
                      {layerInsightSummary[activeLayer.id]}
                    </p>
                    <button onClick={() => handleViewPlan(activeLayer)} className="mt-5 px-5 py-2 rounded-full bg-gradient-to-br from-primary to-primary-container text-white text-[11px] font-bold uppercase tracking-[0.14em]">
                      View Plan
                    </button>
                    <button
                      onClick={() => askEdenForLayerHint(activeLayer)}
                      className="mt-3 ml-2 px-5 py-2 rounded-full border border-outline-variant/35 text-[11px] font-bold uppercase tracking-[0.14em] text-primary"
                    >
                      Get Eden Hint
                    </button>
                  </section>

                  <section className="mb-6 bg-surface-container-low rounded-2xl border border-outline-variant/30 p-4">
                    <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-outline mb-3">Core Practices</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {layerPractices[activeLayer.id].map((practice) => (
                        <div key={practice.title} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3">
                          <span className="material-symbols-outlined text-primary text-[18px]">{practice.icon}</span>
                          <p className="text-sm font-semibold text-on-surface mt-1">{practice.title}</p>
                          <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{practice.detail}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-3xl font-serif italic text-on-surface">Guides</h3>
                      <button onClick={() => handleViewAllGuides(activeLayer.id)} className={cn('text-[10px] uppercase tracking-[0.14em] font-bold', layerColorClasses[activeLayer.id].icon)}>{showAllGuides ? 'Collapse' : 'Explore All'}</button>
                    </div>
                    <div className="space-y-3">
                      {(showAllGuides ? layerGuideCards[activeLayer.id] : layerGuideCards[activeLayer.id].slice(0, 2)).map((guide) => (
                        <div key={guide.title} className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xl font-serif italic text-on-surface">{guide.title}</p>
                              <p className="mt-1 text-xs text-on-surface-variant">{guide.detail}</p>
                            </div>
                            <button onClick={() => createGuideTask(activeLayer.id, guide.title, guide.mins)} className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary bg-primary/10 px-2 py-1 rounded-full hover:bg-primary hover:text-white transition-colors">{guide.mins}</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="mb-6">
                    <h3 className="text-3xl font-serif italic text-on-surface mb-3">Layer Wisdom</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {layerWisdom[activeLayer.id].map((block) => (
                        <div key={block.title} className="rounded-2xl border border-outline-variant/25 bg-surface-container-low p-4">
                          <p className="text-lg font-serif italic text-on-surface">{block.title}</p>
                          <p className="text-xs text-on-surface-variant mt-1 mb-3">{block.detail}</p>
                          <ul className="space-y-2">
                            {block.points.map((point) => (
                              <li key={point} className="text-xs text-on-surface-variant flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                                {point}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {layerActionMessage && (
                <section className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                  <p className="text-xs font-semibold text-primary">{layerActionMessage}</p>
                </section>
              )}

              {(loadingHint || layerHint) && (
                <section className="mb-6 rounded-2xl border border-[var(--color-spiritual)]/20 bg-[var(--color-spiritual)]/5 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--color-spiritual)] mb-1">Eden Coach Hint</p>
                  <p className="text-xs text-on-surface-variant">{loadingHint ? 'Eden is generating a practical hint...' : layerHint}</p>
                </section>
              )}

              {(loadingPlan || layerPlan) && (
                <section className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-primary mb-1">Eden Plan</p>
                  <p className="text-xs text-on-surface-variant whitespace-pre-line">{loadingPlan ? 'Eden is building your plan...' : layerPlan}</p>
                </section>
              )}

              {activeLayerHabits.length === 0 ? (
                <section className="rounded-2xl border border-primary/20 bg-surface-container-lowest p-8">
                  <h2 className="text-2xl font-serif font-bold text-on-surface mb-2">Create Your First Habit</h2>
                  <p className="text-sm text-on-surface-variant mb-8">Begin with one small habit. Consistency over intensity.</p>

                  <div className="w-full space-y-4">
                    <div>
                      <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Habit Name</label>
                      <input
                        value={habitName}
                        onChange={(e) => setHabitName(e.target.value)}
                        placeholder="Write one clear habit"
                        title="Habit name"
                        className="w-full rounded-xl border border-outline-variant/45 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Duration (Min)</label>
                        <input
                          type="number"
                          min={5}
                          value={habitMinutes}
                          onChange={(e) => setHabitMinutes(Number(e.target.value || 15))}
                          placeholder="15"
                          title="Duration in minutes"
                          className="w-full rounded-xl border border-outline-variant/45 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                        />
                      </div>
                      <div>
                        <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Repeat</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setHabitFrequency('daily')}
                            className={cn(
                              'px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-[0.12em] border transition-all',
                              habitFrequency === 'daily'
                                ? 'bg-primary text-white border-primary'
                                : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                            )}
                          >
                            Daily
                          </button>
                          <button
                            type="button"
                            onClick={() => setHabitFrequency('weekly')}
                            className={cn(
                              'px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-[0.12em] border transition-all',
                              habitFrequency === 'weekly'
                                ? 'bg-primary text-white border-primary'
                                : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                            )}
                          >
                            Weekly
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Priority</label>
                      <div className="flex flex-wrap gap-2">
                        {(['A', 'B', 'C', 'D', 'E'] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setHabitPriority(value)}
                            className={cn(
                              'px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-[0.12em] border transition-all',
                              habitPriority === value
                                ? 'bg-primary text-white border-primary'
                                : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                            )}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Time</label>

                      <div className="flex gap-2 mb-3">
                        <button
                          type="button"
                          onClick={() => setHabitTimeFormat('24')}
                          className={cn(
                            'px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-[0.12em] border transition-all',
                            habitTimeFormat === '24'
                              ? 'bg-primary text-white border-primary'
                              : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                          )}
                        >
                          24H
                        </button>
                        <button
                          type="button"
                          onClick={() => setHabitTimeFormat('12')}
                          className={cn(
                            'px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-[0.12em] border transition-all',
                            habitTimeFormat === '12'
                              ? 'bg-primary text-white border-primary'
                              : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                          )}
                        >
                          12H
                        </button>
                      </div>

                      <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                        <input
                          inputMode="numeric"
                          value={habitHourInput}
                          onChange={(e) => setHabitHourInput(e.target.value.replace(/\D/g, '').slice(0, 2))}
                          placeholder={habitTimeFormat === '24' ? '00-23' : '01-12'}
                          className="w-full rounded-lg border border-outline-variant/45 bg-surface-container-lowest px-2 py-1.5 text-center text-sm text-on-surface"
                        />
                        <span className="text-sm font-bold text-secondary">:</span>
                        <input
                          inputMode="numeric"
                          value={habitMinuteInput}
                          onChange={(e) => setHabitMinuteInput(e.target.value.replace(/\D/g, '').slice(0, 2))}
                          placeholder="00-59"
                          className="w-full rounded-lg border border-outline-variant/45 bg-surface-container-lowest px-2 py-1.5 text-center text-sm text-on-surface"
                        />
                        {habitTimeFormat === '12' ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setHabitPeriod('AM')}
                              className={cn(
                                'px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-[0.12em] border',
                                habitPeriod === 'AM'
                                  ? 'bg-primary text-white border-primary'
                                  : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                              )}
                            >
                              AM
                            </button>
                            <button
                              type="button"
                              onClick={() => setHabitPeriod('PM')}
                              className={cn(
                                'px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-[0.12em] border',
                                habitPeriod === 'PM'
                                  ? 'bg-primary text-white border-primary'
                                  : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                              )}
                            >
                              PM
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <button
                      onClick={() => getEdenHabitSuggestions(activeLayer)}
                      disabled={isGeneratingHabit}
                      className="w-full rounded-full px-4 py-2 border border-primary/40 text-primary font-label text-xs font-bold uppercase tracking-[0.14em] flex items-center justify-center gap-2 disabled:opacity-60 hover:bg-primary/5 transition-all"
                    >
                      {isGeneratingHabit ? <Loader2 size={14} className="animate-spin" /> : <WandSparkles size={14} />}
                      {isGeneratingHabit ? 'Generating habits...' : 'Habit by Eden'}
                    </button>

                    {showHabitSuggestions && habitSuggestions.length > 0 && (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-primary mb-3">Suggested Habits</p>
                        <div className="grid grid-cols-1 gap-2">
                          {habitSuggestions.map((suggestion, index) => (
                            <button
                              key={`${suggestion.name}-${index}`}
                              type="button"
                              onClick={() => applyHabitSuggestion(suggestion)}
                              className="text-left rounded-lg border border-primary/25 px-3 py-2 bg-surface-container-lowest hover:bg-surface-container-low transition-colors"
                            >
                              <p className="text-xs font-bold text-on-surface">{suggestion.name}</p>
                              <p className="text-[11px] text-secondary mt-1">{suggestion.description} • {suggestion.duration}m</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => createHabitForLayer(activeLayer.id)}
                      disabled={!habitName.trim()}
                      className="w-full rounded-full bg-gradient-to-br from-primary to-primary-container text-white py-3 px-6 font-label font-bold text-sm uppercase tracking-[0.12em] disabled:opacity-50 hover:shadow-lg hover:shadow-primary/30 transition-all active:scale-95"
                    >
                      Create Habit + Loop Task
                    </button>
                  </div>
                </section>
              ) : (
                <section className="space-y-4">
                  <div className="bg-surface-container-low rounded-2xl border border-outline-variant/30 p-4">
                    <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-outline mb-3">Habits in {activeLayer.name}</p>
                    <div className="space-y-3">
                      {activeLayerHabits.map((habit) => (
                        <div key={habit.id} className="border border-outline-variant/25 rounded-xl px-3 py-3 bg-surface-container-lowest">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-on-surface truncate">{habit.name}</p>
                              <p className="text-[10px] uppercase tracking-[0.14em] text-secondary/70 font-bold mt-1">
                                {habit.frequency} • {habit.durationMinutes} min • {habit.time || '08:00'} • streak {habit.streak}
                              </p>
                            </div>
                            <button
                              onClick={() => toggleHabit(habit.id)}
                              className={cn('transition-colors', habit.completedToday ? 'text-primary' : 'text-secondary/40 hover:text-primary')}
                              aria-label={`Toggle habit ${habit.name}`}
                            >
                              {habit.completedToday ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                            </button>
                          </div>
                          <div className="mt-2 flex gap-1">
                            {habit.history.slice(-14).map((done, idx) => (
                              <span key={`${habit.id}-${idx}`} className={cn('h-2 w-2 rounded-full', done ? 'bg-primary' : 'bg-outline-variant/45')} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
                    <h3 className="text-lg font-serif font-bold text-on-surface">Add New Habit</h3>

                    <div>
                      <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Habit Name</label>
                      <input
                        value={habitName}
                        onChange={(e) => setHabitName(e.target.value)}
                        placeholder="Write one clear habit"
                        title="Habit name"
                        className="w-full rounded-xl border border-outline-variant/45 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Duration (Min)</label>
                        <input
                          type="number"
                          min={5}
                          value={habitMinutes}
                          onChange={(e) => setHabitMinutes(Number(e.target.value || 15))}
                          placeholder="15"
                          title="Duration in minutes"
                          className="w-full rounded-xl border border-outline-variant/45 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                        />
                      </div>
                      <div>
                        <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Repeat</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setHabitFrequency('daily')}
                            className={cn(
                              'px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-[0.12em] border transition-all',
                              habitFrequency === 'daily'
                                ? 'bg-primary text-white border-primary'
                                : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                            )}
                          >
                            Daily
                          </button>
                          <button
                            type="button"
                            onClick={() => setHabitFrequency('weekly')}
                            className={cn(
                              'px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-[0.12em] border transition-all',
                              habitFrequency === 'weekly'
                                ? 'bg-primary text-white border-primary'
                                : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                            )}
                          >
                            Weekly
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Priority</label>
                      <div className="flex flex-wrap gap-2">
                        {(['A', 'B', 'C', 'D', 'E'] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setHabitPriority(value)}
                            className={cn(
                              'px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-[0.12em] border transition-all',
                              habitPriority === value
                                ? 'bg-primary text-white border-primary'
                                : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                            )}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="font-label text-[10px] uppercase tracking-[0.16em] text-outline font-bold block mb-2">Time</label>

                      <div className="flex gap-2 mb-3">
                        <button
                          type="button"
                          onClick={() => setHabitTimeFormat('24')}
                          className={cn(
                            'px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-[0.12em] border transition-all',
                            habitTimeFormat === '24'
                              ? 'bg-primary text-white border-primary'
                              : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                          )}
                        >
                          24H
                        </button>
                        <button
                          type="button"
                          onClick={() => setHabitTimeFormat('12')}
                          className={cn(
                            'px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-[0.12em] border transition-all',
                            habitTimeFormat === '12'
                              ? 'bg-primary text-white border-primary'
                              : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                          )}
                        >
                          12H
                        </button>
                      </div>

                      <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                        <input
                          inputMode="numeric"
                          value={habitHourInput}
                          onChange={(e) => setHabitHourInput(e.target.value.replace(/\D/g, '').slice(0, 2))}
                          placeholder={habitTimeFormat === '24' ? '00-23' : '01-12'}
                          className="w-full rounded-lg border border-outline-variant/45 bg-surface-container-lowest px-2 py-1.5 text-center text-sm text-on-surface"
                        />
                        <span className="text-sm font-bold text-secondary">:</span>
                        <input
                          inputMode="numeric"
                          value={habitMinuteInput}
                          onChange={(e) => setHabitMinuteInput(e.target.value.replace(/\D/g, '').slice(0, 2))}
                          placeholder="00-59"
                          className="w-full rounded-lg border border-outline-variant/45 bg-surface-container-lowest px-2 py-1.5 text-center text-sm text-on-surface"
                        />
                        {habitTimeFormat === '12' ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setHabitPeriod('AM')}
                              className={cn(
                                'px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-[0.12em] border',
                                habitPeriod === 'AM'
                                  ? 'bg-primary text-white border-primary'
                                  : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                              )}
                            >
                              AM
                            </button>
                            <button
                              type="button"
                              onClick={() => setHabitPeriod('PM')}
                              className={cn(
                                'px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-[0.12em] border',
                                habitPeriod === 'PM'
                                  ? 'bg-primary text-white border-primary'
                                  : 'bg-surface-container-lowest text-secondary border-outline-variant/40'
                              )}
                            >
                              PM
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <button
                      onClick={() => getEdenHabitSuggestions(activeLayer)}
                      disabled={isGeneratingHabit}
                      className="w-full rounded-full px-4 py-2 border border-primary/40 text-primary font-label text-xs font-bold uppercase tracking-[0.14em] flex items-center justify-center gap-2 disabled:opacity-60 hover:bg-primary/5 transition-all"
                    >
                      {isGeneratingHabit ? <Loader2 size={14} className="animate-spin" /> : <WandSparkles size={14} />}
                      {isGeneratingHabit ? 'Generating habits...' : 'Habit by Eden'}
                    </button>

                    {showHabitSuggestions && habitSuggestions.length > 0 && (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-primary mb-3">Suggested Habits</p>
                        <div className="grid grid-cols-1 gap-2">
                          {habitSuggestions.map((suggestion, index) => (
                            <button
                              key={`${suggestion.name}-${index}`}
                              type="button"
                              onClick={() => applyHabitSuggestion(suggestion)}
                              className="text-left rounded-lg border border-primary/25 px-3 py-2 bg-surface-container-lowest hover:bg-surface-container-low transition-colors"
                            >
                              <p className="text-xs font-bold text-on-surface">{suggestion.name}</p>
                              <p className="text-[11px] text-secondary mt-1">{suggestion.description} • {suggestion.duration}m</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => createHabitForLayer(activeLayer.id)}
                      disabled={!habitName.trim()}
                      className="w-full rounded-full bg-gradient-to-br from-primary to-primary-container text-white py-3 px-6 font-label font-bold text-xs uppercase tracking-[0.12em] disabled:opacity-50 hover:shadow-lg hover:shadow-primary/30 transition-all active:scale-95"
                    >
                      Save Habit + Loop Task
                    </button>
                  </div>
                </section>
              )}
            </main>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Pillars;
