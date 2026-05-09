const edenApiTimeoutMs = 20000;

type ChatHistory = { role: 'user' | 'model'; parts: { text: string }[] }[];

type UserProfile = {
  preferredName?: string;
  lastActiveLayer?: 'spiritual' | 'academic' | 'financial' | 'physical' | 'general';
  responseStyle?: 'concise' | 'detailed' | 'motivational' | 'practical';
  lastInteractionAt?: string;
  favoritePatterns?: string[];
  ignoredTopics?: string[];
};

type ConversationEntry = {
  timestamp: string;
  userMessage: string;
  edenResponse: string;
  intent: string;
  layerContext?: string;
};

const PROFILE_STORAGE_KEY = 'eden.agent.profile.v1';
const HISTORY_STORAGE_KEY = 'eden.agent.history.v1';
const HISTORY_LIMIT = 120;

const appKnowledge = [
  'Edenify has five life layers: Spiritual, Academic, Financial, Physical, General.',
  'Tasks include name, layer, priority A-E, repeat mode once/daily/weekly, time, alarm sound, and preferred music.',
  'Eden chat can create, edit, complete, delete, and list tasks from natural language.',
  'Task lifecycle: reminder at T-5m, alarm at T, habit-linked tasks reset daily at midnight.',
  'Home shows progress rings, scripture, focus entry, and today tasks.',
  'Profile has notification preferences, Bible reminder settings, and avatar settings.',
  'Layers screen has habits, guide cards, and suggestions that can become tasks.',
  'Focus supports ambient sounds and completion alarm selection/upload.',
  'Bible reading plan spans a configurable number of days with local progression fallback.',
  'Prefer backend AI responses when available; local responses are failover when API is unavailable.',
];

const layerKnowledge: Record<string, string[]> = {
  spiritual: [
    'Morning prayer, one short passage, and evening gratitude creates stability.',
    'Choose one obedience action from scripture and complete it today.',
    'Use ACTS prayer model: Adoration, Confession, Thanksgiving, Supplication.',
  ],
  academic: [
    'Use deep-work blocks with active recall and short reviews.',
    'Teach back concepts in simple language to test understanding.',
    'Review within 24h to reduce forgetting curve loss.',
  ],
  financial: [
    'Track spending consistently and remove one recurring leak each week.',
    'Build emergency margin and automate savings.',
    'Prioritize reducing high-interest debt before lifestyle upgrades.',
  ],
  physical: [
    'Train progressively, recover intentionally, and protect sleep.',
    'Prioritize protein, hydration, and whole foods.',
    'Pair strength and cardio across the week for consistency.',
  ],
  general: [
    'Plan top three priorities daily and guard attention.',
    'Reduce friction in environment before starting important work.',
    'Use weekly reviews for calibration and momentum.',
  ],
};

const greetingPatterns: Array<{ pattern: RegExp; reply: string }> = [
  {
    pattern:
      /^(hi|hello|hey|yo|sup|greetings|hola|aloha|howdy|heya|what'?s up|good morning|good afternoon|good evening|good night)\b/i,
    reply: 'I am with you. What can I help you with today?',
  },
  {
    pattern: /^(how are you|how are u|how ru|how'?s it going|you okay|you good)\b/i,
    reply: 'I am here and ready. How are you doing?',
  },
  {
    pattern: /^(who are you|what are you|what'?s your name|what can you do)\b/i,
    reply:
      'I am Eden, your growth companion. I guide Spiritual, Academic, Financial, Physical, and General layers, and I can help you manage tasks right here.',
  },
  {
    pattern: /^(help|help me|i need help|assist|show me options)\b/i,
    reply:
      'I am here to help. Tell me if you want task help, daily planning, or guidance for a specific layer.',
  },
  {
    pattern: /^(thanks|thank you|thx|ty|appreciate it|cheers)\b/i,
    reply: 'You are welcome. Keep building. What is the next step?',
  },
  {
    pattern: /^(bye|goodbye|see you|later|peace|take care)\b/i,
    reply: 'Peace be with you. Return when you are ready. I will be here.',
  },
];

const motivationPatterns: Array<{ pattern: RegExp; reply: string }> = [
  {
    pattern: /(^|\b)(i can'?t|cannot|impossible|give up|quit|i am done|hopeless)\b/i,
    reply: 'Start with one tiny step now. Even five focused minutes counts. What is the smallest action you can do immediately?',
  },
  {
    pattern: /(^|\b)(tired|exhausted|burned out|drained|no energy)\b/i,
    reply: 'Recovery first: hydrate, breathe, and take a short reset. Then do one small task to regain momentum.',
  },
  {
    pattern: /(^|\b)(procrastinat|stuck|frozen|delay|avoid|can\'?t start)\b/i,
    reply: 'Use ignition mode: commit to five minutes only. Starting is the victory condition.',
  },
  {
    pattern: /(^|\b)(anxious|stress|scared|afraid|worried|panic)\b/i,
    reply: 'Breathe in 4 counts and out 6 counts for one minute, then pick one controllable action and execute it.',
  },
  {
    pattern: /(^|\b)(failed|mistake|messed up|wrong|bad day)\b/i,
    reply: 'Failure is feedback. Name the lesson, then choose one corrective action today.',
  },
  {
    pattern: /(^|\b)(overwhelmed|too much|can\'?t cope|swamped|drowning)\b/i,
    reply: 'Reduce to one task. Ignore everything else for now. What single outcome matters most?',
  },
  {
    pattern: /(^|\b)(lonely|alone|isolated|disconnected)\b/i,
    reply: 'Send one message to a trusted person today. Connection plus one small action can restore momentum.',
  },
  {
    pattern: /(^|\b)(motivation|inspire|push me|encourage|hype me)\b/i,
    reply: 'Discipline before mood. Start small now, and motivation will follow movement.',
  },
];

const guidancePatterns: Array<{ pattern: RegExp; reply: string }> = [
  {
    pattern: /\b(spiritual|pray|prayer|faith|god|bible|scripture|devotion|worship)\b/i,
    reply:
      'Spiritual protocol: 10 minutes prayer, one short passage, one obedience action, one gratitude line at night. Which one starts now?',
  },
  {
    pattern: /\b(academic|study|learn|exam|test|school|course|deep work|focus block)\b/i,
    reply:
      'Academic protocol: 45 minutes deep work, 10-minute review, then active recall without notes. Want a session plan right now?',
  },
  {
    pattern: /\b(financial|money|budget|save|invest|debt|income|expense)\b/i,
    reply:
      'Financial protocol: track today spending, cut one leak, and take one income-building action this week.',
  },
  {
    pattern: /\b(physical|exercise|workout|gym|nutrition|diet|sleep|health)\b/i,
    reply:
      'Physical protocol: move 35 minutes, eat a protein-centered whole-food meal, hydrate, and protect sleep tonight.',
  },
  {
    pattern: /\b(general|routine|discipline|habit|system|productivity|focus|priorit)\b/i,
    reply:
      'General protocol: define top 3 priorities, protect one deep-work block, and close the day with a short review.',
  },
  {
    pattern: /\b(decision|choose|which option|dilemma|stuck between|trade-off)\b/i,
    reply:
      'Decision path: list options, score each against top 3 criteria, then commit. Avoid re-opening the decision after choosing.',
  },
  {
    pattern: /\b(next step|what now|what should i do now|start)\b/i,
    reply:
      'Next step: choose one high-impact task, set a timer, remove distractions, and begin immediately.',
  },
  {
    pattern: /\b(track|metric|progress|accountability|score)\b/i,
    reply:
      'Tracking path: pick one metric, measure daily, and review weekly trends to adjust behavior.',
  },
];

const statusPatterns: Array<{ pattern: RegExp; reply: string }> = [
  {
    pattern: /\b(today|my day|schedule|tasks today|pending|agenda)\b/i,
    reply: 'Your day is on Home with current tasks and progress rings. Which layer should we prioritize first?',
  },
  {
    pattern: /\b(progress|status|summary|streak|how am i doing)\b/i,
    reply: 'Your progress is visible per layer as completed vs created tasks. Which layer needs a push?',
  },
  {
    pattern: /\b(reminder|alarm|when due|timeline|time)\b/i,
    reply: 'Reminder runs at T-5 minutes and alarm at due time. Check task list for exact timing.',
  },
  {
    pattern: /\b(layers|five layers|spiritual|academic|financial|physical|general)\b/i,
    reply: 'Five layers: Spiritual, Academic, Financial, Physical, General. Tell me which one you want to strengthen now.',
  },
  {
    pattern: /\b(tasks|list tasks|show tasks|pending tasks|to do)\b/i,
    reply: 'Type tasks in chat to view your active task list. You can then complete, edit, or delete quickly.',
  },
];

const complexReasoningTopics: RegExp[] = [
  /(long-term|long term|strategy|roadmap|quarter|year plan|vision|future)/i,
  /(compare|versus|\bvs\b|pros|cons|trade-off|best option)/i,
  /(detailed|deep dive|in depth|comprehensive|analysis|explain why|reasoning)/i,
  /(personalized|tailored|specific to me|my context|unique case)/i,
  /(complex|nuanced|edge case|exception|counterintuitive)/i,
  /(theology|apologetics|hermeneutics|portfolio theory|exercise physiology|metacognition)/i,
];

function safeReadLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in private mode/quota exceeded.
  }
}

function getProfile(): UserProfile {
  const raw = safeReadLocalStorage(PROFILE_STORAGE_KEY);
  if (!raw) return { responseStyle: 'practical' };
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return { responseStyle: 'practical' };
  }
}

function updateProfile(patch: Partial<UserProfile>): UserProfile {
  const next = { ...getProfile(), ...patch };
  safeWriteLocalStorage(PROFILE_STORAGE_KEY, JSON.stringify(next));
  return next;
}

function getConversationHistory(): ConversationEntry[] {
  const raw = safeReadLocalStorage(HISTORY_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ConversationEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function logConversation(entry: ConversationEntry): void {
  const history = getConversationHistory();
  history.push(entry);
  const bounded = history.slice(-HISTORY_LIMIT);
  safeWriteLocalStorage(HISTORY_STORAGE_KEY, JSON.stringify(bounded));
}

function extractLayerFromText(text: string): UserProfile['lastActiveLayer'] | undefined {
  const lower = text.toLowerCase();
  if (lower.includes('spiritual')) return 'spiritual';
  if (lower.includes('academic') || lower.includes('study')) return 'academic';
  if (lower.includes('financial') || lower.includes('money')) return 'financial';
  if (lower.includes('physical') || lower.includes('workout') || lower.includes('exercise')) return 'physical';
  if (lower.includes('general')) return 'general';
  return undefined;
}

function classifyIntent(message: string): string {
  const lower = message.toLowerCase();
  if (/\b(create|add|set|new)\b.*\b(task|habit|reminder)\b/.test(lower)) return 'create_task';
  if (/\b(complete|done|finish|mark)\b.*\btask\b/.test(lower)) return 'complete_task';
  if (/\b(delete|remove|clear)\b.*\btask\b/.test(lower)) return 'delete_task';
  if (/\b(edit|update|change|modify)\b.*\btask\b/.test(lower)) return 'edit_task';
  if (/\b(tasks|list|show|view)\b/.test(lower)) return 'list_tasks';
  if (/\b(spiritual|bible|prayer|faith)\b/.test(lower)) return 'spiritual';
  if (/\b(study|exam|learn|academic)\b/.test(lower)) return 'academic';
  if (/\b(money|budget|debt|invest|financial)\b/.test(lower)) return 'financial';
  if (/\b(workout|exercise|fitness|health|physical)\b/.test(lower)) return 'physical';
  if (/\b(help|guide|coach|advice)\b/.test(lower)) return 'guidance';
  return 'general';
}

function personalizeReply(base: string, profile: UserProfile): string {
  if (!profile.preferredName) return base;
  if (base.toLowerCase().includes(profile.preferredName.toLowerCase())) return base;
  if (Math.random() > 0.65) return `${base} ${profile.preferredName}, keep going.`;
  return base;
}
function getLocalChatReply(message: string, profile?: UserProfile): string | null {
  const lower = message.toLowerCase();
  const trimmed = message.trim();

  for (const item of greetingPatterns) {
    if (item.pattern.test(lower)) return item.reply;
  }

  for (const item of motivationPatterns) {
    if (item.pattern.test(lower)) return item.reply;
  }

  for (const item of guidancePatterns) {
    if (item.pattern.test(lower)) return item.reply;
  }

  for (const item of statusPatterns) {
    if (item.pattern.test(lower)) return item.reply;
  }

  if (/\b(i am bored|i'm bored|nothing to do)\b/i.test(lower)) {
    return 'Pick one tiny action: read one verse, do 5 pushups, track one expense, or clear one task. Momentum kills boredom.';
  }

  if (/\b(can\'?t sleep|insomnia|wide awake)\b/i.test(lower)) {
    return 'Step away from screens, dim lights, read a physical page for 10 minutes, then return to bed when sleepy.';
  }

  const probabilistic = getProbabilisticReply(message, profile);
  if (probabilistic) {
    return probabilistic;
  }

  if (trimmed.length > 0) {
    return 'Tell me what you need and I will guide you step by step. I can help with tasks, planning, and layer coaching.';
  }

  return null;
}

type ProbabilisticCategory =
  | 'focus'
  | 'discipline'
  | 'stress'
  | 'confidence'
  | 'consistency'
  | 'spiritual'
  | 'academic'
  | 'financial'
  | 'physical'
  | 'general';

const probabilisticKeywordMap: Record<ProbabilisticCategory, string[]> = {
  focus: ['focus', 'distract', 'phone', 'attention', 'concentrat', 'deep work', 'flow', 'single task'],
  discipline: ['discipline', 'lazy', 'self control', 'willpower', 'resist', 'temptation', 'routine'],
  stress: ['stress', 'anxious', 'anxiety', 'panic', 'overwhelm', 'worry', 'tense', 'burnout'],
  confidence: ['confidence', 'self doubt', 'imposter', 'not good enough', 'fear', 'hesitate', 'bold'],
  consistency: ['consistent', 'habit', 'routine', 'streak', 'track', 'daily', 'weekly', 'repeat'],
  spiritual: ['prayer', 'bible', 'faith', 'god', 'spiritual', 'devotion', 'worship', 'obedience'],
  academic: ['study', 'exam', 'learn', 'course', 'school', 'memory', 'recall', 'notes'],
  financial: ['money', 'budget', 'debt', 'invest', 'income', 'expense', 'savings', 'finance'],
  physical: ['exercise', 'workout', 'sleep', 'diet', 'health', 'fitness', 'gym', 'hydration'],
  general: ['plan', 'priority', 'life', 'decision', 'balance', 'organize', 'system', 'schedule'],
};

const probabilisticResponseWeights: Record<ProbabilisticCategory, number> = {
  focus: 1.2,
  discipline: 1.1,
  stress: 1.4,
  confidence: 1.1,
  consistency: 1.0,
  spiritual: 1.0,
  academic: 1.0,
  financial: 1.0,
  physical: 1.0,
  general: 0.9,
};

const probabilisticResponsePools: Record<ProbabilisticCategory, string[]> = {
  focus: [
    "Focus: Focus lock Action 001: Put your phone in another room for 25 minutes. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 002: Set one visible task and hide all other tabs. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 003: Write the exact next action before you begin. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 004: Use a 10-minute timer and commit without editing. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 005: Close notifications and switch to full-screen work. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 006: Start with two minutes of execution now. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 007: Do one difficult subtask first to reduce avoidance. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 008: Keep only one document open until completion. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 009: Put your phone in another room for 25 minutes. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 010: Set one visible task and hide all other tabs. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 011: Write the exact next action before you begin. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 012: Use a 10-minute timer and commit without editing. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 013: Close notifications and switch to full-screen work. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 014: Start with two minutes of execution now. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 015: Do one difficult subtask first to reduce avoidance. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 016: Keep only one document open until completion. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 017: Put your phone in another room for 25 minutes. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 018: Set one visible task and hide all other tabs. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 019: Write the exact next action before you begin. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 020: Use a 10-minute timer and commit without editing. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 021: Close notifications and switch to full-screen work. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 022: Start with two minutes of execution now. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 023: Do one difficult subtask first to reduce avoidance. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 024: Keep only one document open until completion. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 025: Put your phone in another room for 25 minutes. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 026: Set one visible task and hide all other tabs. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 027: Write the exact next action before you begin. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 028: Use a 10-minute timer and commit without editing. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 029: Close notifications and switch to full-screen work. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 030: Start with two minutes of execution now. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 031: Do one difficult subtask first to reduce avoidance. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 032: Keep only one document open until completion. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 033: Put your phone in another room for 25 minutes. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 034: Set one visible task and hide all other tabs. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 035: Write the exact next action before you begin. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 036: Use a 10-minute timer and commit without editing. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 037: Close notifications and switch to full-screen work. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 038: Start with two minutes of execution now. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 039: Do one difficult subtask first to reduce avoidance. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 040: Keep only one document open until completion. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 041: Put your phone in another room for 25 minutes. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 042: Set one visible task and hide all other tabs. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 043: Write the exact next action before you begin. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 044: Use a 10-minute timer and commit without editing. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 045: Close notifications and switch to full-screen work. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 046: Start with two minutes of execution now. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 047: Do one difficult subtask first to reduce avoidance. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 048: Keep only one document open until completion. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 049: Put your phone in another room for 25 minutes. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 050: Set one visible task and hide all other tabs. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 051: Write the exact next action before you begin. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 052: Use a 10-minute timer and commit without editing. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 053: Close notifications and switch to full-screen work. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 054: Start with two minutes of execution now. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 055: Do one difficult subtask first to reduce avoidance. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 056: Keep only one document open until completion. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 057: Put your phone in another room for 25 minutes. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 058: Set one visible task and hide all other tabs. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 059: Write the exact next action before you begin. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 060: Use a 10-minute timer and commit without editing. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 061: Close notifications and switch to full-screen work. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 062: Start with two minutes of execution now. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 063: Do one difficult subtask first to reduce avoidance. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 064: Keep only one document open until completion. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 065: Put your phone in another room for 25 minutes. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 066: Set one visible task and hide all other tabs. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 067: Write the exact next action before you begin. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 068: Use a 10-minute timer and commit without editing. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 069: Close notifications and switch to full-screen work. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 070: Start with two minutes of execution now. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 071: Do one difficult subtask first to reduce avoidance. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 072: Keep only one document open until completion. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 073: Put your phone in another room for 25 minutes. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 074: Set one visible task and hide all other tabs. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 075: Write the exact next action before you begin. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 076: Use a 10-minute timer and commit without editing. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 077: Close notifications and switch to full-screen work. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 078: Start with two minutes of execution now. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 079: Do one difficult subtask first to reduce avoidance. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 080: Keep only one document open until completion. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 081: Put your phone in another room for 25 minutes. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 082: Set one visible task and hide all other tabs. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 083: Write the exact next action before you begin. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 084: Use a 10-minute timer and commit without editing. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 085: Close notifications and switch to full-screen work. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 086: Start with two minutes of execution now. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 087: Do one difficult subtask first to reduce avoidance. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 088: Keep only one document open until completion. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 089: Put your phone in another room for 25 minutes. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 090: Set one visible task and hide all other tabs. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 091: Write the exact next action before you begin. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 092: Use a 10-minute timer and commit without editing. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 093: Close notifications and switch to full-screen work. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 094: Start with two minutes of execution now. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 095: Do one difficult subtask first to reduce avoidance. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 096: Keep only one document open until completion. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 097: Put your phone in another room for 25 minutes. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 098: Set one visible task and hide all other tabs. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 099: Write the exact next action before you begin. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 100: Use a 10-minute timer and commit without editing. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 101: Close notifications and switch to full-screen work. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 102: Start with two minutes of execution now. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 103: Do one difficult subtask first to reduce avoidance. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 104: Keep only one document open until completion. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 105: Put your phone in another room for 25 minutes. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 106: Set one visible task and hide all other tabs. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 107: Write the exact next action before you begin. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 108: Use a 10-minute timer and commit without editing. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 109: Close notifications and switch to full-screen work. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 110: Start with two minutes of execution now. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 111: Do one difficult subtask first to reduce avoidance. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 112: Keep only one document open until completion. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 113: Put your phone in another room for 25 minutes. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 114: Set one visible task and hide all other tabs. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 115: Write the exact next action before you begin. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 116: Use a 10-minute timer and commit without editing. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 117: Close notifications and switch to full-screen work. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 118: Start with two minutes of execution now. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 119: Do one difficult subtask first to reduce avoidance. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 120: Keep only one document open until completion. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 121: Put your phone in another room for 25 minutes. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 122: Set one visible task and hide all other tabs. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 123: Write the exact next action before you begin. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 124: Use a 10-minute timer and commit without editing. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 125: Close notifications and switch to full-screen work. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 126: Start with two minutes of execution now. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 127: Do one difficult subtask first to reduce avoidance. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 128: Keep only one document open until completion. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 129: Put your phone in another room for 25 minutes. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 130: Set one visible task and hide all other tabs. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 131: Write the exact next action before you begin. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 132: Use a 10-minute timer and commit without editing. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 133: Close notifications and switch to full-screen work. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 134: Start with two minutes of execution now. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 135: Do one difficult subtask first to reduce avoidance. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 136: Keep only one document open until completion. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 137: Put your phone in another room for 25 minutes. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 138: Set one visible task and hide all other tabs. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 139: Write the exact next action before you begin. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 140: Use a 10-minute timer and commit without editing. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 141: Close notifications and switch to full-screen work. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 142: Start with two minutes of execution now. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 143: Do one difficult subtask first to reduce avoidance. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 144: Keep only one document open until completion. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 145: Put your phone in another room for 25 minutes. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 146: Set one visible task and hide all other tabs. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 147: Write the exact next action before you begin. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 148: Use a 10-minute timer and commit without editing. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 149: Close notifications and switch to full-screen work. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 150: Start with two minutes of execution now. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 151: Do one difficult subtask first to reduce avoidance. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 152: Keep only one document open until completion. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 153: Put your phone in another room for 25 minutes. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 154: Set one visible task and hide all other tabs. Reframe: Progress over perfection.",
    "Focus: Distraction cut Action 155: Write the exact next action before you begin. Reframe: Depth wins over busyness.",
    "Focus: Concentration ramp Action 156: Use a 10-minute timer and commit without editing. Reframe: Calm execution compounds.",
    "Focus: Focus lock Action 157: Close notifications and switch to full-screen work. Reframe: Clarity beats intensity.",
    "Focus: Attention reset Action 158: Start with two minutes of execution now. Reframe: Small starts create momentum.",
    "Focus: Deep-work cue Action 159: Do one difficult subtask first to reduce avoidance. Reframe: Attention is a budget.",
    "Focus: Single-task mode Action 160: Keep only one document open until completion. Reframe: Progress over perfection.",
  ],
  discipline: [
    "Discipline: Discipline protocol Action 001: Define one non-negotiable and protect it today. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 002: Tie your behavior to a fixed trigger time. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 003: Lower the task size until resistance drops. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 004: Set a visible streak target and mark it tonight. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 005: Use if-then plans for your top temptation. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 006: Prepare your environment before motivation is needed. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 007: Choose effort over comfort for 15 minutes. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 008: Reduce decision fatigue by pre-committing. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 009: Define one non-negotiable and protect it today. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 010: Tie your behavior to a fixed trigger time. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 011: Lower the task size until resistance drops. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 012: Set a visible streak target and mark it tonight. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 013: Use if-then plans for your top temptation. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 014: Prepare your environment before motivation is needed. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 015: Choose effort over comfort for 15 minutes. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 016: Reduce decision fatigue by pre-committing. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 017: Define one non-negotiable and protect it today. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 018: Tie your behavior to a fixed trigger time. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 019: Lower the task size until resistance drops. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 020: Set a visible streak target and mark it tonight. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 021: Use if-then plans for your top temptation. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 022: Prepare your environment before motivation is needed. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 023: Choose effort over comfort for 15 minutes. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 024: Reduce decision fatigue by pre-committing. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 025: Define one non-negotiable and protect it today. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 026: Tie your behavior to a fixed trigger time. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 027: Lower the task size until resistance drops. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 028: Set a visible streak target and mark it tonight. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 029: Use if-then plans for your top temptation. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 030: Prepare your environment before motivation is needed. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 031: Choose effort over comfort for 15 minutes. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 032: Reduce decision fatigue by pre-committing. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 033: Define one non-negotiable and protect it today. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 034: Tie your behavior to a fixed trigger time. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 035: Lower the task size until resistance drops. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 036: Set a visible streak target and mark it tonight. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 037: Use if-then plans for your top temptation. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 038: Prepare your environment before motivation is needed. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 039: Choose effort over comfort for 15 minutes. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 040: Reduce decision fatigue by pre-committing. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 041: Define one non-negotiable and protect it today. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 042: Tie your behavior to a fixed trigger time. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 043: Lower the task size until resistance drops. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 044: Set a visible streak target and mark it tonight. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 045: Use if-then plans for your top temptation. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 046: Prepare your environment before motivation is needed. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 047: Choose effort over comfort for 15 minutes. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 048: Reduce decision fatigue by pre-committing. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 049: Define one non-negotiable and protect it today. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 050: Tie your behavior to a fixed trigger time. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 051: Lower the task size until resistance drops. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 052: Set a visible streak target and mark it tonight. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 053: Use if-then plans for your top temptation. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 054: Prepare your environment before motivation is needed. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 055: Choose effort over comfort for 15 minutes. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 056: Reduce decision fatigue by pre-committing. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 057: Define one non-negotiable and protect it today. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 058: Tie your behavior to a fixed trigger time. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 059: Lower the task size until resistance drops. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 060: Set a visible streak target and mark it tonight. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 061: Use if-then plans for your top temptation. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 062: Prepare your environment before motivation is needed. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 063: Choose effort over comfort for 15 minutes. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 064: Reduce decision fatigue by pre-committing. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 065: Define one non-negotiable and protect it today. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 066: Tie your behavior to a fixed trigger time. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 067: Lower the task size until resistance drops. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 068: Set a visible streak target and mark it tonight. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 069: Use if-then plans for your top temptation. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 070: Prepare your environment before motivation is needed. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 071: Choose effort over comfort for 15 minutes. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 072: Reduce decision fatigue by pre-committing. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 073: Define one non-negotiable and protect it today. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 074: Tie your behavior to a fixed trigger time. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 075: Lower the task size until resistance drops. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 076: Set a visible streak target and mark it tonight. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 077: Use if-then plans for your top temptation. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 078: Prepare your environment before motivation is needed. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 079: Choose effort over comfort for 15 minutes. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 080: Reduce decision fatigue by pre-committing. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 081: Define one non-negotiable and protect it today. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 082: Tie your behavior to a fixed trigger time. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 083: Lower the task size until resistance drops. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 084: Set a visible streak target and mark it tonight. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 085: Use if-then plans for your top temptation. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 086: Prepare your environment before motivation is needed. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 087: Choose effort over comfort for 15 minutes. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 088: Reduce decision fatigue by pre-committing. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 089: Define one non-negotiable and protect it today. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 090: Tie your behavior to a fixed trigger time. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 091: Lower the task size until resistance drops. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 092: Set a visible streak target and mark it tonight. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 093: Use if-then plans for your top temptation. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 094: Prepare your environment before motivation is needed. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 095: Choose effort over comfort for 15 minutes. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 096: Reduce decision fatigue by pre-committing. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 097: Define one non-negotiable and protect it today. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 098: Tie your behavior to a fixed trigger time. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 099: Lower the task size until resistance drops. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 100: Set a visible streak target and mark it tonight. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 101: Use if-then plans for your top temptation. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 102: Prepare your environment before motivation is needed. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 103: Choose effort over comfort for 15 minutes. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 104: Reduce decision fatigue by pre-committing. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 105: Define one non-negotiable and protect it today. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 106: Tie your behavior to a fixed trigger time. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 107: Lower the task size until resistance drops. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 108: Set a visible streak target and mark it tonight. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 109: Use if-then plans for your top temptation. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 110: Prepare your environment before motivation is needed. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 111: Choose effort over comfort for 15 minutes. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 112: Reduce decision fatigue by pre-committing. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 113: Define one non-negotiable and protect it today. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 114: Tie your behavior to a fixed trigger time. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 115: Lower the task size until resistance drops. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 116: Set a visible streak target and mark it tonight. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 117: Use if-then plans for your top temptation. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 118: Prepare your environment before motivation is needed. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 119: Choose effort over comfort for 15 minutes. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 120: Reduce decision fatigue by pre-committing. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 121: Define one non-negotiable and protect it today. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 122: Tie your behavior to a fixed trigger time. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 123: Lower the task size until resistance drops. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 124: Set a visible streak target and mark it tonight. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 125: Use if-then plans for your top temptation. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 126: Prepare your environment before motivation is needed. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 127: Choose effort over comfort for 15 minutes. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 128: Reduce decision fatigue by pre-committing. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 129: Define one non-negotiable and protect it today. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 130: Tie your behavior to a fixed trigger time. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 131: Lower the task size until resistance drops. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 132: Set a visible streak target and mark it tonight. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 133: Use if-then plans for your top temptation. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 134: Prepare your environment before motivation is needed. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 135: Choose effort over comfort for 15 minutes. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 136: Reduce decision fatigue by pre-committing. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 137: Define one non-negotiable and protect it today. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 138: Tie your behavior to a fixed trigger time. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 139: Lower the task size until resistance drops. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 140: Set a visible streak target and mark it tonight. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 141: Use if-then plans for your top temptation. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 142: Prepare your environment before motivation is needed. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 143: Choose effort over comfort for 15 minutes. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 144: Reduce decision fatigue by pre-committing. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 145: Define one non-negotiable and protect it today. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 146: Tie your behavior to a fixed trigger time. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 147: Lower the task size until resistance drops. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 148: Set a visible streak target and mark it tonight. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 149: Use if-then plans for your top temptation. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 150: Prepare your environment before motivation is needed. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 151: Choose effort over comfort for 15 minutes. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 152: Reduce decision fatigue by pre-committing. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 153: Define one non-negotiable and protect it today. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 154: Tie your behavior to a fixed trigger time. Reframe: Structure creates freedom.",
    "Discipline: Impulse interrupt Action 155: Lower the task size until resistance drops. Reframe: Micro-wins become standards.",
    "Discipline: Habit integrity Action 156: Set a visible streak target and mark it tonight. Reframe: You become what you repeat.",
    "Discipline: Discipline protocol Action 157: Use if-then plans for your top temptation. Reframe: Identity follows repeated action.",
    "Discipline: Self-control cue Action 158: Prepare your environment before motivation is needed. Reframe: Rules reduce friction.",
    "Discipline: Willpower conservation Action 159: Choose effort over comfort for 15 minutes. Reframe: Consistency is self-respect.",
    "Discipline: Boundary routine Action 160: Reduce decision fatigue by pre-committing. Reframe: Structure creates freedom.",
  ],
  stress: [
    "Stress: Nervous-system reset Action 001: Inhale for 4 and exhale for 6 for one minute. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 002: Name the top three stressors and choose one to act on. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 003: Do a five-minute walk without your phone. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 004: Hydrate and relax your shoulders before deciding. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 005: Separate what you can control from what you cannot. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 006: Write a one-sentence plan for the next hour only. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 007: Reduce your task list to one meaningful item. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 008: Take a brief break from notifications. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 009: Inhale for 4 and exhale for 6 for one minute. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 010: Name the top three stressors and choose one to act on. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 011: Do a five-minute walk without your phone. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 012: Hydrate and relax your shoulders before deciding. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 013: Separate what you can control from what you cannot. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 014: Write a one-sentence plan for the next hour only. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 015: Reduce your task list to one meaningful item. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 016: Take a brief break from notifications. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 017: Inhale for 4 and exhale for 6 for one minute. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 018: Name the top three stressors and choose one to act on. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 019: Do a five-minute walk without your phone. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 020: Hydrate and relax your shoulders before deciding. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 021: Separate what you can control from what you cannot. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 022: Write a one-sentence plan for the next hour only. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 023: Reduce your task list to one meaningful item. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 024: Take a brief break from notifications. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 025: Inhale for 4 and exhale for 6 for one minute. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 026: Name the top three stressors and choose one to act on. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 027: Do a five-minute walk without your phone. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 028: Hydrate and relax your shoulders before deciding. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 029: Separate what you can control from what you cannot. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 030: Write a one-sentence plan for the next hour only. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 031: Reduce your task list to one meaningful item. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 032: Take a brief break from notifications. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 033: Inhale for 4 and exhale for 6 for one minute. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 034: Name the top three stressors and choose one to act on. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 035: Do a five-minute walk without your phone. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 036: Hydrate and relax your shoulders before deciding. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 037: Separate what you can control from what you cannot. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 038: Write a one-sentence plan for the next hour only. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 039: Reduce your task list to one meaningful item. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 040: Take a brief break from notifications. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 041: Inhale for 4 and exhale for 6 for one minute. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 042: Name the top three stressors and choose one to act on. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 043: Do a five-minute walk without your phone. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 044: Hydrate and relax your shoulders before deciding. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 045: Separate what you can control from what you cannot. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 046: Write a one-sentence plan for the next hour only. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 047: Reduce your task list to one meaningful item. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 048: Take a brief break from notifications. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 049: Inhale for 4 and exhale for 6 for one minute. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 050: Name the top three stressors and choose one to act on. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 051: Do a five-minute walk without your phone. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 052: Hydrate and relax your shoulders before deciding. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 053: Separate what you can control from what you cannot. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 054: Write a one-sentence plan for the next hour only. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 055: Reduce your task list to one meaningful item. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 056: Take a brief break from notifications. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 057: Inhale for 4 and exhale for 6 for one minute. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 058: Name the top three stressors and choose one to act on. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 059: Do a five-minute walk without your phone. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 060: Hydrate and relax your shoulders before deciding. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 061: Separate what you can control from what you cannot. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 062: Write a one-sentence plan for the next hour only. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 063: Reduce your task list to one meaningful item. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 064: Take a brief break from notifications. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 065: Inhale for 4 and exhale for 6 for one minute. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 066: Name the top three stressors and choose one to act on. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 067: Do a five-minute walk without your phone. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 068: Hydrate and relax your shoulders before deciding. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 069: Separate what you can control from what you cannot. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 070: Write a one-sentence plan for the next hour only. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 071: Reduce your task list to one meaningful item. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 072: Take a brief break from notifications. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 073: Inhale for 4 and exhale for 6 for one minute. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 074: Name the top three stressors and choose one to act on. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 075: Do a five-minute walk without your phone. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 076: Hydrate and relax your shoulders before deciding. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 077: Separate what you can control from what you cannot. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 078: Write a one-sentence plan for the next hour only. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 079: Reduce your task list to one meaningful item. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 080: Take a brief break from notifications. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 081: Inhale for 4 and exhale for 6 for one minute. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 082: Name the top three stressors and choose one to act on. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 083: Do a five-minute walk without your phone. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 084: Hydrate and relax your shoulders before deciding. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 085: Separate what you can control from what you cannot. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 086: Write a one-sentence plan for the next hour only. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 087: Reduce your task list to one meaningful item. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 088: Take a brief break from notifications. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 089: Inhale for 4 and exhale for 6 for one minute. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 090: Name the top three stressors and choose one to act on. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 091: Do a five-minute walk without your phone. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 092: Hydrate and relax your shoulders before deciding. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 093: Separate what you can control from what you cannot. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 094: Write a one-sentence plan for the next hour only. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 095: Reduce your task list to one meaningful item. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 096: Take a brief break from notifications. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 097: Inhale for 4 and exhale for 6 for one minute. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 098: Name the top three stressors and choose one to act on. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 099: Do a five-minute walk without your phone. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 100: Hydrate and relax your shoulders before deciding. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 101: Separate what you can control from what you cannot. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 102: Write a one-sentence plan for the next hour only. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 103: Reduce your task list to one meaningful item. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 104: Take a brief break from notifications. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 105: Inhale for 4 and exhale for 6 for one minute. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 106: Name the top three stressors and choose one to act on. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 107: Do a five-minute walk without your phone. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 108: Hydrate and relax your shoulders before deciding. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 109: Separate what you can control from what you cannot. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 110: Write a one-sentence plan for the next hour only. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 111: Reduce your task list to one meaningful item. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 112: Take a brief break from notifications. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 113: Inhale for 4 and exhale for 6 for one minute. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 114: Name the top three stressors and choose one to act on. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 115: Do a five-minute walk without your phone. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 116: Hydrate and relax your shoulders before deciding. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 117: Separate what you can control from what you cannot. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 118: Write a one-sentence plan for the next hour only. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 119: Reduce your task list to one meaningful item. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 120: Take a brief break from notifications. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 121: Inhale for 4 and exhale for 6 for one minute. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 122: Name the top three stressors and choose one to act on. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 123: Do a five-minute walk without your phone. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 124: Hydrate and relax your shoulders before deciding. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 125: Separate what you can control from what you cannot. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 126: Write a one-sentence plan for the next hour only. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 127: Reduce your task list to one meaningful item. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 128: Take a brief break from notifications. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 129: Inhale for 4 and exhale for 6 for one minute. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 130: Name the top three stressors and choose one to act on. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 131: Do a five-minute walk without your phone. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 132: Hydrate and relax your shoulders before deciding. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 133: Separate what you can control from what you cannot. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 134: Write a one-sentence plan for the next hour only. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 135: Reduce your task list to one meaningful item. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 136: Take a brief break from notifications. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 137: Inhale for 4 and exhale for 6 for one minute. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 138: Name the top three stressors and choose one to act on. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 139: Do a five-minute walk without your phone. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 140: Hydrate and relax your shoulders before deciding. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 141: Separate what you can control from what you cannot. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 142: Write a one-sentence plan for the next hour only. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 143: Reduce your task list to one meaningful item. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 144: Take a brief break from notifications. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 145: Inhale for 4 and exhale for 6 for one minute. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 146: Name the top three stressors and choose one to act on. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 147: Do a five-minute walk without your phone. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 148: Hydrate and relax your shoulders before deciding. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 149: Separate what you can control from what you cannot. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 150: Write a one-sentence plan for the next hour only. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 151: Reduce your task list to one meaningful item. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 152: Take a brief break from notifications. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 153: Inhale for 4 and exhale for 6 for one minute. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 154: Name the top three stressors and choose one to act on. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 155: Do a five-minute walk without your phone. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 156: Hydrate and relax your shoulders before deciding. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 157: Separate what you can control from what you cannot. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 158: Write a one-sentence plan for the next hour only. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 159: Reduce your task list to one meaningful item. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 160: Take a brief break from notifications. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 161: Inhale for 4 and exhale for 6 for one minute. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 162: Name the top three stressors and choose one to act on. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 163: Do a five-minute walk without your phone. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 164: Hydrate and relax your shoulders before deciding. Reframe: Regulation precedes execution.",
    "Stress: Anxiety grounding Action 165: Separate what you can control from what you cannot. Reframe: Control the next step not the whole week.",
    "Stress: Calm protocol Action 166: Write a one-sentence plan for the next hour only. Reframe: Breath changes state quickly.",
    "Stress: Overwhelm reduction Action 167: Reduce your task list to one meaningful item. Reframe: Simplicity lowers pressure.",
    "Stress: Recovery cue Action 168: Take a brief break from notifications. Reframe: Slow is smooth and smooth is fast.",
    "Stress: Nervous-system reset Action 169: Inhale for 4 and exhale for 6 for one minute. Reframe: Calm is a skill.",
    "Stress: Pressure decompression Action 170: Name the top three stressors and choose one to act on. Reframe: Regulation precedes execution.",
  ],
  confidence: [
    "Confidence: Confidence builder Action 001: List three previous wins before starting. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 002: Do one action that feels slightly uncomfortable. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 003: Use a clear voice and shorter sentences in your next interaction. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 004: Commit publicly to one achievable target. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 005: Replace self-criticism with task-specific feedback. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 006: Take one imperfect action now instead of planning longer. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 007: Ask one courageous question today. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 008: Finish one task fully to reinforce self-trust. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 009: List three previous wins before starting. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 010: Do one action that feels slightly uncomfortable. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 011: Use a clear voice and shorter sentences in your next interaction. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 012: Commit publicly to one achievable target. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 013: Replace self-criticism with task-specific feedback. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 014: Take one imperfect action now instead of planning longer. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 015: Ask one courageous question today. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 016: Finish one task fully to reinforce self-trust. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 017: List three previous wins before starting. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 018: Do one action that feels slightly uncomfortable. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 019: Use a clear voice and shorter sentences in your next interaction. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 020: Commit publicly to one achievable target. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 021: Replace self-criticism with task-specific feedback. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 022: Take one imperfect action now instead of planning longer. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 023: Ask one courageous question today. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 024: Finish one task fully to reinforce self-trust. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 025: List three previous wins before starting. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 026: Do one action that feels slightly uncomfortable. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 027: Use a clear voice and shorter sentences in your next interaction. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 028: Commit publicly to one achievable target. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 029: Replace self-criticism with task-specific feedback. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 030: Take one imperfect action now instead of planning longer. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 031: Ask one courageous question today. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 032: Finish one task fully to reinforce self-trust. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 033: List three previous wins before starting. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 034: Do one action that feels slightly uncomfortable. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 035: Use a clear voice and shorter sentences in your next interaction. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 036: Commit publicly to one achievable target. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 037: Replace self-criticism with task-specific feedback. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 038: Take one imperfect action now instead of planning longer. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 039: Ask one courageous question today. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 040: Finish one task fully to reinforce self-trust. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 041: List three previous wins before starting. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 042: Do one action that feels slightly uncomfortable. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 043: Use a clear voice and shorter sentences in your next interaction. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 044: Commit publicly to one achievable target. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 045: Replace self-criticism with task-specific feedback. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 046: Take one imperfect action now instead of planning longer. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 047: Ask one courageous question today. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 048: Finish one task fully to reinforce self-trust. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 049: List three previous wins before starting. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 050: Do one action that feels slightly uncomfortable. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 051: Use a clear voice and shorter sentences in your next interaction. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 052: Commit publicly to one achievable target. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 053: Replace self-criticism with task-specific feedback. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 054: Take one imperfect action now instead of planning longer. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 055: Ask one courageous question today. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 056: Finish one task fully to reinforce self-trust. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 057: List three previous wins before starting. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 058: Do one action that feels slightly uncomfortable. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 059: Use a clear voice and shorter sentences in your next interaction. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 060: Commit publicly to one achievable target. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 061: Replace self-criticism with task-specific feedback. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 062: Take one imperfect action now instead of planning longer. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 063: Ask one courageous question today. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 064: Finish one task fully to reinforce self-trust. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 065: List three previous wins before starting. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 066: Do one action that feels slightly uncomfortable. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 067: Use a clear voice and shorter sentences in your next interaction. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 068: Commit publicly to one achievable target. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 069: Replace self-criticism with task-specific feedback. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 070: Take one imperfect action now instead of planning longer. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 071: Ask one courageous question today. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 072: Finish one task fully to reinforce self-trust. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 073: List three previous wins before starting. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 074: Do one action that feels slightly uncomfortable. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 075: Use a clear voice and shorter sentences in your next interaction. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 076: Commit publicly to one achievable target. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 077: Replace self-criticism with task-specific feedback. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 078: Take one imperfect action now instead of planning longer. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 079: Ask one courageous question today. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 080: Finish one task fully to reinforce self-trust. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 081: List three previous wins before starting. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 082: Do one action that feels slightly uncomfortable. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 083: Use a clear voice and shorter sentences in your next interaction. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 084: Commit publicly to one achievable target. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 085: Replace self-criticism with task-specific feedback. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 086: Take one imperfect action now instead of planning longer. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 087: Ask one courageous question today. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 088: Finish one task fully to reinforce self-trust. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 089: List three previous wins before starting. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 090: Do one action that feels slightly uncomfortable. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 091: Use a clear voice and shorter sentences in your next interaction. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 092: Commit publicly to one achievable target. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 093: Replace self-criticism with task-specific feedback. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 094: Take one imperfect action now instead of planning longer. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 095: Ask one courageous question today. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 096: Finish one task fully to reinforce self-trust. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 097: List three previous wins before starting. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 098: Do one action that feels slightly uncomfortable. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 099: Use a clear voice and shorter sentences in your next interaction. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 100: Commit publicly to one achievable target. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 101: Replace self-criticism with task-specific feedback. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 102: Take one imperfect action now instead of planning longer. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 103: Ask one courageous question today. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 104: Finish one task fully to reinforce self-trust. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 105: List three previous wins before starting. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 106: Do one action that feels slightly uncomfortable. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 107: Use a clear voice and shorter sentences in your next interaction. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 108: Commit publicly to one achievable target. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 109: Replace self-criticism with task-specific feedback. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 110: Take one imperfect action now instead of planning longer. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 111: Ask one courageous question today. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 112: Finish one task fully to reinforce self-trust. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 113: List three previous wins before starting. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 114: Do one action that feels slightly uncomfortable. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 115: Use a clear voice and shorter sentences in your next interaction. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 116: Commit publicly to one achievable target. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 117: Replace self-criticism with task-specific feedback. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 118: Take one imperfect action now instead of planning longer. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 119: Ask one courageous question today. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 120: Finish one task fully to reinforce self-trust. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 121: List three previous wins before starting. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 122: Do one action that feels slightly uncomfortable. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 123: Use a clear voice and shorter sentences in your next interaction. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 124: Commit publicly to one achievable target. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 125: Replace self-criticism with task-specific feedback. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 126: Take one imperfect action now instead of planning longer. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 127: Ask one courageous question today. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 128: Finish one task fully to reinforce self-trust. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 129: List three previous wins before starting. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 130: Do one action that feels slightly uncomfortable. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 131: Use a clear voice and shorter sentences in your next interaction. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 132: Commit publicly to one achievable target. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 133: Replace self-criticism with task-specific feedback. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 134: Take one imperfect action now instead of planning longer. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 135: Ask one courageous question today. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 136: Finish one task fully to reinforce self-trust. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 137: List three previous wins before starting. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 138: Do one action that feels slightly uncomfortable. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 139: Use a clear voice and shorter sentences in your next interaction. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 140: Commit publicly to one achievable target. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 141: Replace self-criticism with task-specific feedback. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 142: Take one imperfect action now instead of planning longer. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 143: Ask one courageous question today. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 144: Finish one task fully to reinforce self-trust. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 145: List three previous wins before starting. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 146: Do one action that feels slightly uncomfortable. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 147: Use a clear voice and shorter sentences in your next interaction. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 148: Commit publicly to one achievable target. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 149: Replace self-criticism with task-specific feedback. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 150: Take one imperfect action now instead of planning longer. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 151: Ask one courageous question today. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 152: Finish one task fully to reinforce self-trust. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 153: List three previous wins before starting. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 154: Do one action that feels slightly uncomfortable. Reframe: Courage grows by exposure.",
    "Confidence: Boldness cue Action 155: Use a clear voice and shorter sentences in your next interaction. Reframe: Self-trust comes from kept promises.",
    "Confidence: Identity reinforcement Action 156: Commit publicly to one achievable target. Reframe: Execution writes identity.",
    "Confidence: Confidence builder Action 157: Replace self-criticism with task-specific feedback. Reframe: Confidence is trained not granted.",
    "Confidence: Courage prompt Action 158: Take one imperfect action now instead of planning longer. Reframe: Action produces belief.",
    "Confidence: Self-trust reset Action 159: Ask one courageous question today. Reframe: Small proof beats big talk.",
    "Confidence: Imposter interrupt Action 160: Finish one task fully to reinforce self-trust. Reframe: Courage grows by exposure.",
  ],
  consistency: [
    "Consistency: Consistency system Action 001: Attach your habit to an existing daily trigger. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 002: Make your first step so small you cannot fail. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 003: Track completion visually today. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 004: Set a fallback version for low-energy days. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 005: Use the same start time for seven days. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 006: Prepare materials tonight for tomorrow habit. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 007: Review your streak before sleep. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 008: Remove one barrier from your routine now. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 009: Attach your habit to an existing daily trigger. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 010: Make your first step so small you cannot fail. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 011: Track completion visually today. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 012: Set a fallback version for low-energy days. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 013: Use the same start time for seven days. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 014: Prepare materials tonight for tomorrow habit. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 015: Review your streak before sleep. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 016: Remove one barrier from your routine now. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 017: Attach your habit to an existing daily trigger. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 018: Make your first step so small you cannot fail. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 019: Track completion visually today. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 020: Set a fallback version for low-energy days. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 021: Use the same start time for seven days. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 022: Prepare materials tonight for tomorrow habit. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 023: Review your streak before sleep. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 024: Remove one barrier from your routine now. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 025: Attach your habit to an existing daily trigger. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 026: Make your first step so small you cannot fail. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 027: Track completion visually today. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 028: Set a fallback version for low-energy days. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 029: Use the same start time for seven days. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 030: Prepare materials tonight for tomorrow habit. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 031: Review your streak before sleep. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 032: Remove one barrier from your routine now. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 033: Attach your habit to an existing daily trigger. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 034: Make your first step so small you cannot fail. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 035: Track completion visually today. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 036: Set a fallback version for low-energy days. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 037: Use the same start time for seven days. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 038: Prepare materials tonight for tomorrow habit. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 039: Review your streak before sleep. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 040: Remove one barrier from your routine now. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 041: Attach your habit to an existing daily trigger. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 042: Make your first step so small you cannot fail. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 043: Track completion visually today. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 044: Set a fallback version for low-energy days. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 045: Use the same start time for seven days. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 046: Prepare materials tonight for tomorrow habit. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 047: Review your streak before sleep. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 048: Remove one barrier from your routine now. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 049: Attach your habit to an existing daily trigger. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 050: Make your first step so small you cannot fail. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 051: Track completion visually today. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 052: Set a fallback version for low-energy days. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 053: Use the same start time for seven days. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 054: Prepare materials tonight for tomorrow habit. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 055: Review your streak before sleep. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 056: Remove one barrier from your routine now. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 057: Attach your habit to an existing daily trigger. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 058: Make your first step so small you cannot fail. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 059: Track completion visually today. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 060: Set a fallback version for low-energy days. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 061: Use the same start time for seven days. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 062: Prepare materials tonight for tomorrow habit. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 063: Review your streak before sleep. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 064: Remove one barrier from your routine now. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 065: Attach your habit to an existing daily trigger. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 066: Make your first step so small you cannot fail. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 067: Track completion visually today. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 068: Set a fallback version for low-energy days. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 069: Use the same start time for seven days. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 070: Prepare materials tonight for tomorrow habit. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 071: Review your streak before sleep. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 072: Remove one barrier from your routine now. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 073: Attach your habit to an existing daily trigger. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 074: Make your first step so small you cannot fail. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 075: Track completion visually today. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 076: Set a fallback version for low-energy days. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 077: Use the same start time for seven days. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 078: Prepare materials tonight for tomorrow habit. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 079: Review your streak before sleep. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 080: Remove one barrier from your routine now. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 081: Attach your habit to an existing daily trigger. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 082: Make your first step so small you cannot fail. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 083: Track completion visually today. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 084: Set a fallback version for low-energy days. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 085: Use the same start time for seven days. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 086: Prepare materials tonight for tomorrow habit. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 087: Review your streak before sleep. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 088: Remove one barrier from your routine now. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 089: Attach your habit to an existing daily trigger. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 090: Make your first step so small you cannot fail. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 091: Track completion visually today. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 092: Set a fallback version for low-energy days. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 093: Use the same start time for seven days. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 094: Prepare materials tonight for tomorrow habit. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 095: Review your streak before sleep. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 096: Remove one barrier from your routine now. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 097: Attach your habit to an existing daily trigger. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 098: Make your first step so small you cannot fail. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 099: Track completion visually today. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 100: Set a fallback version for low-energy days. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 101: Use the same start time for seven days. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 102: Prepare materials tonight for tomorrow habit. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 103: Review your streak before sleep. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 104: Remove one barrier from your routine now. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 105: Attach your habit to an existing daily trigger. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 106: Make your first step so small you cannot fail. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 107: Track completion visually today. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 108: Set a fallback version for low-energy days. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 109: Use the same start time for seven days. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 110: Prepare materials tonight for tomorrow habit. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 111: Review your streak before sleep. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 112: Remove one barrier from your routine now. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 113: Attach your habit to an existing daily trigger. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 114: Make your first step so small you cannot fail. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 115: Track completion visually today. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 116: Set a fallback version for low-energy days. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 117: Use the same start time for seven days. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 118: Prepare materials tonight for tomorrow habit. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 119: Review your streak before sleep. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 120: Remove one barrier from your routine now. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 121: Attach your habit to an existing daily trigger. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 122: Make your first step so small you cannot fail. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 123: Track completion visually today. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 124: Set a fallback version for low-energy days. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 125: Use the same start time for seven days. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 126: Prepare materials tonight for tomorrow habit. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 127: Review your streak before sleep. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 128: Remove one barrier from your routine now. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 129: Attach your habit to an existing daily trigger. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 130: Make your first step so small you cannot fail. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 131: Track completion visually today. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 132: Set a fallback version for low-energy days. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 133: Use the same start time for seven days. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 134: Prepare materials tonight for tomorrow habit. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 135: Review your streak before sleep. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 136: Remove one barrier from your routine now. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 137: Attach your habit to an existing daily trigger. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 138: Make your first step so small you cannot fail. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 139: Track completion visually today. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 140: Set a fallback version for low-energy days. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 141: Use the same start time for seven days. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 142: Prepare materials tonight for tomorrow habit. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 143: Review your streak before sleep. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 144: Remove one barrier from your routine now. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 145: Attach your habit to an existing daily trigger. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 146: Make your first step so small you cannot fail. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 147: Track completion visually today. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 148: Set a fallback version for low-energy days. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 149: Use the same start time for seven days. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 150: Prepare materials tonight for tomorrow habit. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 151: Review your streak before sleep. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 152: Remove one barrier from your routine now. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 153: Attach your habit to an existing daily trigger. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 154: Make your first step so small you cannot fail. Reframe: Lower friction raise follow-through.",
    "Consistency: Streak stabilizer Action 155: Track completion visually today. Reframe: Routine protects priorities.",
    "Consistency: Daily standard Action 156: Set a fallback version for low-energy days. Reframe: Reliable beats dramatic.",
    "Consistency: Consistency system Action 157: Use the same start time for seven days. Reframe: Repetition creates identity.",
    "Consistency: Habit lock Action 158: Prepare materials tonight for tomorrow habit. Reframe: Easy repeatable beats hard occasional.",
    "Consistency: Routine anchor Action 159: Review your streak before sleep. Reframe: Defaults drive outcomes.",
    "Consistency: Repeat protocol Action 160: Remove one barrier from your routine now. Reframe: Lower friction raise follow-through.",
  ],
  spiritual: [
    "Spiritual: Spiritual rhythm Action 001: Take two quiet minutes before your next task. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 002: Read one short passage and extract one action. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 003: Pray specifically for wisdom and courage. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 004: Write one gratitude line before bed. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 005: Choose one act of service today. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 006: Memorize one short verse this week. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 007: Turn one worry into one prayer now. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 008: Pause and ask what love requires in this moment. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 009: Take two quiet minutes before your next task. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 010: Read one short passage and extract one action. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 011: Pray specifically for wisdom and courage. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 012: Write one gratitude line before bed. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 013: Choose one act of service today. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 014: Memorize one short verse this week. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 015: Turn one worry into one prayer now. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 016: Pause and ask what love requires in this moment. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 017: Take two quiet minutes before your next task. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 018: Read one short passage and extract one action. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 019: Pray specifically for wisdom and courage. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 020: Write one gratitude line before bed. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 021: Choose one act of service today. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 022: Memorize one short verse this week. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 023: Turn one worry into one prayer now. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 024: Pause and ask what love requires in this moment. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 025: Take two quiet minutes before your next task. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 026: Read one short passage and extract one action. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 027: Pray specifically for wisdom and courage. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 028: Write one gratitude line before bed. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 029: Choose one act of service today. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 030: Memorize one short verse this week. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 031: Turn one worry into one prayer now. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 032: Pause and ask what love requires in this moment. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 033: Take two quiet minutes before your next task. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 034: Read one short passage and extract one action. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 035: Pray specifically for wisdom and courage. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 036: Write one gratitude line before bed. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 037: Choose one act of service today. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 038: Memorize one short verse this week. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 039: Turn one worry into one prayer now. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 040: Pause and ask what love requires in this moment. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 041: Take two quiet minutes before your next task. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 042: Read one short passage and extract one action. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 043: Pray specifically for wisdom and courage. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 044: Write one gratitude line before bed. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 045: Choose one act of service today. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 046: Memorize one short verse this week. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 047: Turn one worry into one prayer now. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 048: Pause and ask what love requires in this moment. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 049: Take two quiet minutes before your next task. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 050: Read one short passage and extract one action. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 051: Pray specifically for wisdom and courage. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 052: Write one gratitude line before bed. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 053: Choose one act of service today. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 054: Memorize one short verse this week. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 055: Turn one worry into one prayer now. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 056: Pause and ask what love requires in this moment. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 057: Take two quiet minutes before your next task. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 058: Read one short passage and extract one action. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 059: Pray specifically for wisdom and courage. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 060: Write one gratitude line before bed. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 061: Choose one act of service today. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 062: Memorize one short verse this week. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 063: Turn one worry into one prayer now. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 064: Pause and ask what love requires in this moment. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 065: Take two quiet minutes before your next task. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 066: Read one short passage and extract one action. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 067: Pray specifically for wisdom and courage. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 068: Write one gratitude line before bed. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 069: Choose one act of service today. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 070: Memorize one short verse this week. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 071: Turn one worry into one prayer now. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 072: Pause and ask what love requires in this moment. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 073: Take two quiet minutes before your next task. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 074: Read one short passage and extract one action. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 075: Pray specifically for wisdom and courage. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 076: Write one gratitude line before bed. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 077: Choose one act of service today. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 078: Memorize one short verse this week. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 079: Turn one worry into one prayer now. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 080: Pause and ask what love requires in this moment. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 081: Take two quiet minutes before your next task. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 082: Read one short passage and extract one action. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 083: Pray specifically for wisdom and courage. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 084: Write one gratitude line before bed. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 085: Choose one act of service today. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 086: Memorize one short verse this week. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 087: Turn one worry into one prayer now. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 088: Pause and ask what love requires in this moment. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 089: Take two quiet minutes before your next task. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 090: Read one short passage and extract one action. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 091: Pray specifically for wisdom and courage. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 092: Write one gratitude line before bed. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 093: Choose one act of service today. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 094: Memorize one short verse this week. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 095: Turn one worry into one prayer now. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 096: Pause and ask what love requires in this moment. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 097: Take two quiet minutes before your next task. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 098: Read one short passage and extract one action. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 099: Pray specifically for wisdom and courage. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 100: Write one gratitude line before bed. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 101: Choose one act of service today. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 102: Memorize one short verse this week. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 103: Turn one worry into one prayer now. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 104: Pause and ask what love requires in this moment. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 105: Take two quiet minutes before your next task. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 106: Read one short passage and extract one action. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 107: Pray specifically for wisdom and courage. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 108: Write one gratitude line before bed. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 109: Choose one act of service today. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 110: Memorize one short verse this week. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 111: Turn one worry into one prayer now. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 112: Pause and ask what love requires in this moment. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 113: Take two quiet minutes before your next task. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 114: Read one short passage and extract one action. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 115: Pray specifically for wisdom and courage. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 116: Write one gratitude line before bed. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 117: Choose one act of service today. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 118: Memorize one short verse this week. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 119: Turn one worry into one prayer now. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 120: Pause and ask what love requires in this moment. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 121: Take two quiet minutes before your next task. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 122: Read one short passage and extract one action. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 123: Pray specifically for wisdom and courage. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 124: Write one gratitude line before bed. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 125: Choose one act of service today. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 126: Memorize one short verse this week. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 127: Turn one worry into one prayer now. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 128: Pause and ask what love requires in this moment. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 129: Take two quiet minutes before your next task. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 130: Read one short passage and extract one action. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 131: Pray specifically for wisdom and courage. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 132: Write one gratitude line before bed. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 133: Choose one act of service today. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 134: Memorize one short verse this week. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 135: Turn one worry into one prayer now. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 136: Pause and ask what love requires in this moment. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 137: Take two quiet minutes before your next task. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 138: Read one short passage and extract one action. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 139: Pray specifically for wisdom and courage. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 140: Write one gratitude line before bed. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 141: Choose one act of service today. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 142: Memorize one short verse this week. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 143: Turn one worry into one prayer now. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 144: Pause and ask what love requires in this moment. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 145: Take two quiet minutes before your next task. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 146: Read one short passage and extract one action. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 147: Pray specifically for wisdom and courage. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 148: Write one gratitude line before bed. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 149: Choose one act of service today. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 150: Memorize one short verse this week. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 151: Turn one worry into one prayer now. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 152: Pause and ask what love requires in this moment. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 153: Take two quiet minutes before your next task. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 154: Read one short passage and extract one action. Reframe: Small faithfulness compounds.",
    "Spiritual: Stillness practice Action 155: Pray specifically for wisdom and courage. Reframe: Presence before performance.",
    "Spiritual: Grace reminder Action 156: Write one gratitude line before bed. Reframe: Truth stabilizes emotion.",
    "Spiritual: Spiritual rhythm Action 157: Choose one act of service today. Reframe: Depth grows in quiet consistency.",
    "Spiritual: Prayer cue Action 158: Memorize one short verse this week. Reframe: Obedience beats inspiration only.",
    "Spiritual: Scripture alignment Action 159: Turn one worry into one prayer now. Reframe: Stillness sharpens discernment.",
    "Spiritual: Obedience step Action 160: Pause and ask what love requires in this moment. Reframe: Small faithfulness compounds.",
  ],
  academic: [
    "Academic: Study acceleration Action 001: Run one 45-minute deep-work block with no phone. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 002: Use active recall after each section. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 003: Teach one concept out loud from memory. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 004: Write one practice question and answer it. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 005: Review notes within 24 hours. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 006: Use spaced repetition for weak topics. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 007: Break your chapter into focused chunks. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 008: Start with the hardest concept first. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 009: Run one 45-minute deep-work block with no phone. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 010: Use active recall after each section. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 011: Teach one concept out loud from memory. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 012: Write one practice question and answer it. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 013: Review notes within 24 hours. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 014: Use spaced repetition for weak topics. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 015: Break your chapter into focused chunks. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 016: Start with the hardest concept first. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 017: Run one 45-minute deep-work block with no phone. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 018: Use active recall after each section. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 019: Teach one concept out loud from memory. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 020: Write one practice question and answer it. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 021: Review notes within 24 hours. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 022: Use spaced repetition for weak topics. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 023: Break your chapter into focused chunks. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 024: Start with the hardest concept first. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 025: Run one 45-minute deep-work block with no phone. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 026: Use active recall after each section. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 027: Teach one concept out loud from memory. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 028: Write one practice question and answer it. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 029: Review notes within 24 hours. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 030: Use spaced repetition for weak topics. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 031: Break your chapter into focused chunks. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 032: Start with the hardest concept first. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 033: Run one 45-minute deep-work block with no phone. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 034: Use active recall after each section. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 035: Teach one concept out loud from memory. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 036: Write one practice question and answer it. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 037: Review notes within 24 hours. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 038: Use spaced repetition for weak topics. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 039: Break your chapter into focused chunks. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 040: Start with the hardest concept first. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 041: Run one 45-minute deep-work block with no phone. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 042: Use active recall after each section. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 043: Teach one concept out loud from memory. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 044: Write one practice question and answer it. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 045: Review notes within 24 hours. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 046: Use spaced repetition for weak topics. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 047: Break your chapter into focused chunks. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 048: Start with the hardest concept first. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 049: Run one 45-minute deep-work block with no phone. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 050: Use active recall after each section. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 051: Teach one concept out loud from memory. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 052: Write one practice question and answer it. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 053: Review notes within 24 hours. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 054: Use spaced repetition for weak topics. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 055: Break your chapter into focused chunks. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 056: Start with the hardest concept first. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 057: Run one 45-minute deep-work block with no phone. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 058: Use active recall after each section. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 059: Teach one concept out loud from memory. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 060: Write one practice question and answer it. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 061: Review notes within 24 hours. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 062: Use spaced repetition for weak topics. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 063: Break your chapter into focused chunks. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 064: Start with the hardest concept first. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 065: Run one 45-minute deep-work block with no phone. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 066: Use active recall after each section. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 067: Teach one concept out loud from memory. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 068: Write one practice question and answer it. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 069: Review notes within 24 hours. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 070: Use spaced repetition for weak topics. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 071: Break your chapter into focused chunks. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 072: Start with the hardest concept first. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 073: Run one 45-minute deep-work block with no phone. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 074: Use active recall after each section. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 075: Teach one concept out loud from memory. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 076: Write one practice question and answer it. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 077: Review notes within 24 hours. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 078: Use spaced repetition for weak topics. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 079: Break your chapter into focused chunks. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 080: Start with the hardest concept first. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 081: Run one 45-minute deep-work block with no phone. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 082: Use active recall after each section. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 083: Teach one concept out loud from memory. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 084: Write one practice question and answer it. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 085: Review notes within 24 hours. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 086: Use spaced repetition for weak topics. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 087: Break your chapter into focused chunks. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 088: Start with the hardest concept first. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 089: Run one 45-minute deep-work block with no phone. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 090: Use active recall after each section. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 091: Teach one concept out loud from memory. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 092: Write one practice question and answer it. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 093: Review notes within 24 hours. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 094: Use spaced repetition for weak topics. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 095: Break your chapter into focused chunks. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 096: Start with the hardest concept first. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 097: Run one 45-minute deep-work block with no phone. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 098: Use active recall after each section. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 099: Teach one concept out loud from memory. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 100: Write one practice question and answer it. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 101: Review notes within 24 hours. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 102: Use spaced repetition for weak topics. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 103: Break your chapter into focused chunks. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 104: Start with the hardest concept first. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 105: Run one 45-minute deep-work block with no phone. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 106: Use active recall after each section. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 107: Teach one concept out loud from memory. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 108: Write one practice question and answer it. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 109: Review notes within 24 hours. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 110: Use spaced repetition for weak topics. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 111: Break your chapter into focused chunks. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 112: Start with the hardest concept first. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 113: Run one 45-minute deep-work block with no phone. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 114: Use active recall after each section. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 115: Teach one concept out loud from memory. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 116: Write one practice question and answer it. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 117: Review notes within 24 hours. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 118: Use spaced repetition for weak topics. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 119: Break your chapter into focused chunks. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 120: Start with the hardest concept first. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 121: Run one 45-minute deep-work block with no phone. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 122: Use active recall after each section. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 123: Teach one concept out loud from memory. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 124: Write one practice question and answer it. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 125: Review notes within 24 hours. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 126: Use spaced repetition for weak topics. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 127: Break your chapter into focused chunks. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 128: Start with the hardest concept first. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 129: Run one 45-minute deep-work block with no phone. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 130: Use active recall after each section. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 131: Teach one concept out loud from memory. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 132: Write one practice question and answer it. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 133: Review notes within 24 hours. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 134: Use spaced repetition for weak topics. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 135: Break your chapter into focused chunks. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 136: Start with the hardest concept first. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 137: Run one 45-minute deep-work block with no phone. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 138: Use active recall after each section. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 139: Teach one concept out loud from memory. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 140: Write one practice question and answer it. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 141: Review notes within 24 hours. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 142: Use spaced repetition for weak topics. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 143: Break your chapter into focused chunks. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 144: Start with the hardest concept first. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 145: Run one 45-minute deep-work block with no phone. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 146: Use active recall after each section. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 147: Teach one concept out loud from memory. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 148: Write one practice question and answer it. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 149: Review notes within 24 hours. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 150: Use spaced repetition for weak topics. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 151: Break your chapter into focused chunks. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 152: Start with the hardest concept first. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 153: Run one 45-minute deep-work block with no phone. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 154: Use active recall after each section. Reframe: Retrieval builds memory.",
    "Academic: Deep-learning sprint Action 155: Teach one concept out loud from memory. Reframe: Weak areas are leverage.",
    "Academic: Recall builder Action 156: Write one practice question and answer it. Reframe: Consistency improves recall.",
    "Academic: Study acceleration Action 157: Review notes within 24 hours. Reframe: Testing beats re-reading.",
    "Academic: Learning loop Action 158: Use spaced repetition for weak topics. Reframe: Depth beats volume.",
    "Academic: Retention protocol Action 159: Break your chapter into focused chunks. Reframe: Spacing beats cramming.",
    "Academic: Exam prep cue Action 160: Start with the hardest concept first. Reframe: Retrieval builds memory.",
  ],
  financial: [
    "Financial: Financial control Action 001: Log every expense today with no exceptions. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 002: Cut one recurring low-value subscription. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 003: Set an automatic transfer to savings. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 004: Make an extra payment toward highest-interest debt. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 005: Review one budget category variance. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 006: Choose one action that can increase income this week. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 007: Plan purchases with a 24-hour cooling period. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 008: Set a weekly money review appointment. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 009: Log every expense today with no exceptions. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 010: Cut one recurring low-value subscription. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 011: Set an automatic transfer to savings. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 012: Make an extra payment toward highest-interest debt. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 013: Review one budget category variance. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 014: Choose one action that can increase income this week. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 015: Plan purchases with a 24-hour cooling period. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 016: Set a weekly money review appointment. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 017: Log every expense today with no exceptions. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 018: Cut one recurring low-value subscription. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 019: Set an automatic transfer to savings. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 020: Make an extra payment toward highest-interest debt. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 021: Review one budget category variance. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 022: Choose one action that can increase income this week. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 023: Plan purchases with a 24-hour cooling period. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 024: Set a weekly money review appointment. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 025: Log every expense today with no exceptions. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 026: Cut one recurring low-value subscription. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 027: Set an automatic transfer to savings. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 028: Make an extra payment toward highest-interest debt. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 029: Review one budget category variance. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 030: Choose one action that can increase income this week. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 031: Plan purchases with a 24-hour cooling period. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 032: Set a weekly money review appointment. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 033: Log every expense today with no exceptions. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 034: Cut one recurring low-value subscription. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 035: Set an automatic transfer to savings. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 036: Make an extra payment toward highest-interest debt. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 037: Review one budget category variance. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 038: Choose one action that can increase income this week. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 039: Plan purchases with a 24-hour cooling period. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 040: Set a weekly money review appointment. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 041: Log every expense today with no exceptions. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 042: Cut one recurring low-value subscription. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 043: Set an automatic transfer to savings. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 044: Make an extra payment toward highest-interest debt. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 045: Review one budget category variance. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 046: Choose one action that can increase income this week. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 047: Plan purchases with a 24-hour cooling period. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 048: Set a weekly money review appointment. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 049: Log every expense today with no exceptions. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 050: Cut one recurring low-value subscription. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 051: Set an automatic transfer to savings. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 052: Make an extra payment toward highest-interest debt. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 053: Review one budget category variance. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 054: Choose one action that can increase income this week. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 055: Plan purchases with a 24-hour cooling period. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 056: Set a weekly money review appointment. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 057: Log every expense today with no exceptions. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 058: Cut one recurring low-value subscription. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 059: Set an automatic transfer to savings. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 060: Make an extra payment toward highest-interest debt. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 061: Review one budget category variance. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 062: Choose one action that can increase income this week. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 063: Plan purchases with a 24-hour cooling period. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 064: Set a weekly money review appointment. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 065: Log every expense today with no exceptions. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 066: Cut one recurring low-value subscription. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 067: Set an automatic transfer to savings. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 068: Make an extra payment toward highest-interest debt. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 069: Review one budget category variance. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 070: Choose one action that can increase income this week. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 071: Plan purchases with a 24-hour cooling period. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 072: Set a weekly money review appointment. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 073: Log every expense today with no exceptions. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 074: Cut one recurring low-value subscription. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 075: Set an automatic transfer to savings. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 076: Make an extra payment toward highest-interest debt. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 077: Review one budget category variance. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 078: Choose one action that can increase income this week. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 079: Plan purchases with a 24-hour cooling period. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 080: Set a weekly money review appointment. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 081: Log every expense today with no exceptions. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 082: Cut one recurring low-value subscription. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 083: Set an automatic transfer to savings. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 084: Make an extra payment toward highest-interest debt. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 085: Review one budget category variance. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 086: Choose one action that can increase income this week. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 087: Plan purchases with a 24-hour cooling period. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 088: Set a weekly money review appointment. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 089: Log every expense today with no exceptions. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 090: Cut one recurring low-value subscription. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 091: Set an automatic transfer to savings. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 092: Make an extra payment toward highest-interest debt. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 093: Review one budget category variance. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 094: Choose one action that can increase income this week. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 095: Plan purchases with a 24-hour cooling period. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 096: Set a weekly money review appointment. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 097: Log every expense today with no exceptions. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 098: Cut one recurring low-value subscription. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 099: Set an automatic transfer to savings. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 100: Make an extra payment toward highest-interest debt. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 101: Review one budget category variance. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 102: Choose one action that can increase income this week. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 103: Plan purchases with a 24-hour cooling period. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 104: Set a weekly money review appointment. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 105: Log every expense today with no exceptions. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 106: Cut one recurring low-value subscription. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 107: Set an automatic transfer to savings. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 108: Make an extra payment toward highest-interest debt. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 109: Review one budget category variance. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 110: Choose one action that can increase income this week. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 111: Plan purchases with a 24-hour cooling period. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 112: Set a weekly money review appointment. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 113: Log every expense today with no exceptions. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 114: Cut one recurring low-value subscription. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 115: Set an automatic transfer to savings. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 116: Make an extra payment toward highest-interest debt. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 117: Review one budget category variance. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 118: Choose one action that can increase income this week. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 119: Plan purchases with a 24-hour cooling period. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 120: Set a weekly money review appointment. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 121: Log every expense today with no exceptions. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 122: Cut one recurring low-value subscription. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 123: Set an automatic transfer to savings. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 124: Make an extra payment toward highest-interest debt. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 125: Review one budget category variance. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 126: Choose one action that can increase income this week. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 127: Plan purchases with a 24-hour cooling period. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 128: Set a weekly money review appointment. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 129: Log every expense today with no exceptions. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 130: Cut one recurring low-value subscription. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 131: Set an automatic transfer to savings. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 132: Make an extra payment toward highest-interest debt. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 133: Review one budget category variance. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 134: Choose one action that can increase income this week. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 135: Plan purchases with a 24-hour cooling period. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 136: Set a weekly money review appointment. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 137: Log every expense today with no exceptions. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 138: Cut one recurring low-value subscription. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 139: Set an automatic transfer to savings. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 140: Make an extra payment toward highest-interest debt. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 141: Review one budget category variance. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 142: Choose one action that can increase income this week. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 143: Plan purchases with a 24-hour cooling period. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 144: Set a weekly money review appointment. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 145: Log every expense today with no exceptions. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 146: Cut one recurring low-value subscription. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 147: Set an automatic transfer to savings. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 148: Make an extra payment toward highest-interest debt. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 149: Review one budget category variance. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 150: Choose one action that can increase income this week. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 151: Plan purchases with a 24-hour cooling period. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 152: Set a weekly money review appointment. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 153: Log every expense today with no exceptions. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 154: Cut one recurring low-value subscription. Reframe: Cash flow clarity creates freedom.",
    "Financial: Income-growth prompt Action 155: Set an automatic transfer to savings. Reframe: Debt reduction buys options.",
    "Financial: Wealth discipline Action 156: Make an extra payment toward highest-interest debt. Reframe: Plan first purchase second.",
    "Financial: Financial control Action 157: Review one budget category variance. Reframe: Awareness changes spending behavior.",
    "Financial: Money clarity Action 158: Choose one action that can increase income this week. Reframe: Automation beats intention alone.",
    "Financial: Budget correction Action 159: Plan purchases with a 24-hour cooling period. Reframe: Small leaks sink plans.",
    "Financial: Debt reduction cue Action 160: Set a weekly money review appointment. Reframe: Cash flow clarity creates freedom.",
  ],
  physical: [
    "Physical: Physical momentum Action 001: Move for at least 20 minutes today. Reframe: Energy follows habits.",
    "Physical: Training cue Action 002: Prioritize protein in your next meal. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 003: Drink water before caffeine refill. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 004: Set a consistent bedtime target tonight. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 005: Take a 10-minute walk after eating. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 006: Do mobility work for 8 minutes. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 007: Prepare tomorrow workout plan now. Reframe: Energy follows habits.",
    "Physical: Training cue Action 008: Stand and stretch every hour. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 009: Move for at least 20 minutes today. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 010: Prioritize protein in your next meal. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 011: Drink water before caffeine refill. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 012: Set a consistent bedtime target tonight. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 013: Take a 10-minute walk after eating. Reframe: Energy follows habits.",
    "Physical: Training cue Action 014: Do mobility work for 8 minutes. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 015: Prepare tomorrow workout plan now. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 016: Stand and stretch every hour. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 017: Move for at least 20 minutes today. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 018: Prioritize protein in your next meal. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 019: Drink water before caffeine refill. Reframe: Energy follows habits.",
    "Physical: Training cue Action 020: Set a consistent bedtime target tonight. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 021: Take a 10-minute walk after eating. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 022: Do mobility work for 8 minutes. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 023: Prepare tomorrow workout plan now. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 024: Stand and stretch every hour. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 025: Move for at least 20 minutes today. Reframe: Energy follows habits.",
    "Physical: Training cue Action 026: Prioritize protein in your next meal. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 027: Drink water before caffeine refill. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 028: Set a consistent bedtime target tonight. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 029: Take a 10-minute walk after eating. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 030: Do mobility work for 8 minutes. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 031: Prepare tomorrow workout plan now. Reframe: Energy follows habits.",
    "Physical: Training cue Action 032: Stand and stretch every hour. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 033: Move for at least 20 minutes today. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 034: Prioritize protein in your next meal. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 035: Drink water before caffeine refill. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 036: Set a consistent bedtime target tonight. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 037: Take a 10-minute walk after eating. Reframe: Energy follows habits.",
    "Physical: Training cue Action 038: Do mobility work for 8 minutes. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 039: Prepare tomorrow workout plan now. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 040: Stand and stretch every hour. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 041: Move for at least 20 minutes today. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 042: Prioritize protein in your next meal. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 043: Drink water before caffeine refill. Reframe: Energy follows habits.",
    "Physical: Training cue Action 044: Set a consistent bedtime target tonight. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 045: Take a 10-minute walk after eating. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 046: Do mobility work for 8 minutes. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 047: Prepare tomorrow workout plan now. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 048: Stand and stretch every hour. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 049: Move for at least 20 minutes today. Reframe: Energy follows habits.",
    "Physical: Training cue Action 050: Prioritize protein in your next meal. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 051: Drink water before caffeine refill. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 052: Set a consistent bedtime target tonight. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 053: Take a 10-minute walk after eating. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 054: Do mobility work for 8 minutes. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 055: Prepare tomorrow workout plan now. Reframe: Energy follows habits.",
    "Physical: Training cue Action 056: Stand and stretch every hour. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 057: Move for at least 20 minutes today. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 058: Prioritize protein in your next meal. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 059: Drink water before caffeine refill. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 060: Set a consistent bedtime target tonight. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 061: Take a 10-minute walk after eating. Reframe: Energy follows habits.",
    "Physical: Training cue Action 062: Do mobility work for 8 minutes. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 063: Prepare tomorrow workout plan now. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 064: Stand and stretch every hour. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 065: Move for at least 20 minutes today. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 066: Prioritize protein in your next meal. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 067: Drink water before caffeine refill. Reframe: Energy follows habits.",
    "Physical: Training cue Action 068: Set a consistent bedtime target tonight. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 069: Take a 10-minute walk after eating. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 070: Do mobility work for 8 minutes. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 071: Prepare tomorrow workout plan now. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 072: Stand and stretch every hour. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 073: Move for at least 20 minutes today. Reframe: Energy follows habits.",
    "Physical: Training cue Action 074: Prioritize protein in your next meal. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 075: Drink water before caffeine refill. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 076: Set a consistent bedtime target tonight. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 077: Take a 10-minute walk after eating. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 078: Do mobility work for 8 minutes. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 079: Prepare tomorrow workout plan now. Reframe: Energy follows habits.",
    "Physical: Training cue Action 080: Stand and stretch every hour. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 081: Move for at least 20 minutes today. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 082: Prioritize protein in your next meal. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 083: Drink water before caffeine refill. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 084: Set a consistent bedtime target tonight. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 085: Take a 10-minute walk after eating. Reframe: Energy follows habits.",
    "Physical: Training cue Action 086: Do mobility work for 8 minutes. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 087: Prepare tomorrow workout plan now. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 088: Stand and stretch every hour. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 089: Move for at least 20 minutes today. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 090: Prioritize protein in your next meal. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 091: Drink water before caffeine refill. Reframe: Energy follows habits.",
    "Physical: Training cue Action 092: Set a consistent bedtime target tonight. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 093: Take a 10-minute walk after eating. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 094: Do mobility work for 8 minutes. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 095: Prepare tomorrow workout plan now. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 096: Stand and stretch every hour. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 097: Move for at least 20 minutes today. Reframe: Energy follows habits.",
    "Physical: Training cue Action 098: Prioritize protein in your next meal. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 099: Drink water before caffeine refill. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 100: Set a consistent bedtime target tonight. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 101: Take a 10-minute walk after eating. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 102: Do mobility work for 8 minutes. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 103: Prepare tomorrow workout plan now. Reframe: Energy follows habits.",
    "Physical: Training cue Action 104: Stand and stretch every hour. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 105: Move for at least 20 minutes today. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 106: Prioritize protein in your next meal. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 107: Drink water before caffeine refill. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 108: Set a consistent bedtime target tonight. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 109: Take a 10-minute walk after eating. Reframe: Energy follows habits.",
    "Physical: Training cue Action 110: Do mobility work for 8 minutes. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 111: Prepare tomorrow workout plan now. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 112: Stand and stretch every hour. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 113: Move for at least 20 minutes today. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 114: Prioritize protein in your next meal. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 115: Drink water before caffeine refill. Reframe: Energy follows habits.",
    "Physical: Training cue Action 116: Set a consistent bedtime target tonight. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 117: Take a 10-minute walk after eating. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 118: Do mobility work for 8 minutes. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 119: Prepare tomorrow workout plan now. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 120: Stand and stretch every hour. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 121: Move for at least 20 minutes today. Reframe: Energy follows habits.",
    "Physical: Training cue Action 122: Prioritize protein in your next meal. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 123: Drink water before caffeine refill. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 124: Set a consistent bedtime target tonight. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 125: Take a 10-minute walk after eating. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 126: Do mobility work for 8 minutes. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 127: Prepare tomorrow workout plan now. Reframe: Energy follows habits.",
    "Physical: Training cue Action 128: Stand and stretch every hour. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 129: Move for at least 20 minutes today. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 130: Prioritize protein in your next meal. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 131: Drink water before caffeine refill. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 132: Set a consistent bedtime target tonight. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 133: Take a 10-minute walk after eating. Reframe: Energy follows habits.",
    "Physical: Training cue Action 134: Do mobility work for 8 minutes. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 135: Prepare tomorrow workout plan now. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 136: Stand and stretch every hour. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 137: Move for at least 20 minutes today. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 138: Prioritize protein in your next meal. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 139: Drink water before caffeine refill. Reframe: Energy follows habits.",
    "Physical: Training cue Action 140: Set a consistent bedtime target tonight. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 141: Take a 10-minute walk after eating. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 142: Do mobility work for 8 minutes. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 143: Prepare tomorrow workout plan now. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 144: Stand and stretch every hour. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 145: Move for at least 20 minutes today. Reframe: Energy follows habits.",
    "Physical: Training cue Action 146: Prioritize protein in your next meal. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 147: Drink water before caffeine refill. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 148: Set a consistent bedtime target tonight. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 149: Take a 10-minute walk after eating. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 150: Do mobility work for 8 minutes. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 151: Prepare tomorrow workout plan now. Reframe: Energy follows habits.",
    "Physical: Training cue Action 152: Stand and stretch every hour. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 153: Move for at least 20 minutes today. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 154: Prioritize protein in your next meal. Reframe: Sleep drives adaptation.",
    "Physical: Sleep protection Action 155: Drink water before caffeine refill. Reframe: Consistency beats intensity spikes.",
    "Physical: Energy protocol Action 156: Set a consistent bedtime target tonight. Reframe: Health is a system not a moment.",
    "Physical: Physical momentum Action 157: Take a 10-minute walk after eating. Reframe: Energy follows habits.",
    "Physical: Training cue Action 158: Do mobility work for 8 minutes. Reframe: Recovery is training.",
    "Physical: Recovery standard Action 159: Prepare tomorrow workout plan now. Reframe: Hydration improves performance.",
    "Physical: Nutrition anchor Action 160: Stand and stretch every hour. Reframe: Sleep drives adaptation.",
  ],
  general: [
    "General: Execution architecture Action 001: Pick top three outcomes for today. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 002: Block one protected deep-work window. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 003: Delete or defer one low-value commitment. Reframe: Focus is a design choice.",
    "General: Time design Action 004: Run a five-minute workspace reset. Reframe: Less but better.",
    "General: Environment setup Action 005: Use one trusted list for all tasks. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 006: Close the day with a short review. Reframe: Execution compounds.",
    "General: Execution architecture Action 007: Define next action for each active project. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 008: Batch shallow tasks into one window. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 009: Pick top three outcomes for today. Reframe: Focus is a design choice.",
    "General: Time design Action 010: Block one protected deep-work window. Reframe: Less but better.",
    "General: Environment setup Action 011: Delete or defer one low-value commitment. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 012: Run a five-minute workspace reset. Reframe: Execution compounds.",
    "General: Execution architecture Action 013: Use one trusted list for all tasks. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 014: Close the day with a short review. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 015: Define next action for each active project. Reframe: Focus is a design choice.",
    "General: Time design Action 016: Batch shallow tasks into one window. Reframe: Less but better.",
    "General: Environment setup Action 017: Pick top three outcomes for today. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 018: Block one protected deep-work window. Reframe: Execution compounds.",
    "General: Execution architecture Action 019: Delete or defer one low-value commitment. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 020: Run a five-minute workspace reset. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 021: Use one trusted list for all tasks. Reframe: Focus is a design choice.",
    "General: Time design Action 022: Close the day with a short review. Reframe: Less but better.",
    "General: Environment setup Action 023: Define next action for each active project. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 024: Batch shallow tasks into one window. Reframe: Execution compounds.",
    "General: Execution architecture Action 025: Pick top three outcomes for today. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 026: Block one protected deep-work window. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 027: Delete or defer one low-value commitment. Reframe: Focus is a design choice.",
    "General: Time design Action 028: Run a five-minute workspace reset. Reframe: Less but better.",
    "General: Environment setup Action 029: Use one trusted list for all tasks. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 030: Close the day with a short review. Reframe: Execution compounds.",
    "General: Execution architecture Action 031: Define next action for each active project. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 032: Batch shallow tasks into one window. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 033: Pick top three outcomes for today. Reframe: Focus is a design choice.",
    "General: Time design Action 034: Block one protected deep-work window. Reframe: Less but better.",
    "General: Environment setup Action 035: Delete or defer one low-value commitment. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 036: Run a five-minute workspace reset. Reframe: Execution compounds.",
    "General: Execution architecture Action 037: Use one trusted list for all tasks. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 038: Close the day with a short review. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 039: Define next action for each active project. Reframe: Focus is a design choice.",
    "General: Time design Action 040: Batch shallow tasks into one window. Reframe: Less but better.",
    "General: Environment setup Action 041: Pick top three outcomes for today. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 042: Block one protected deep-work window. Reframe: Execution compounds.",
    "General: Execution architecture Action 043: Delete or defer one low-value commitment. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 044: Run a five-minute workspace reset. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 045: Use one trusted list for all tasks. Reframe: Focus is a design choice.",
    "General: Time design Action 046: Close the day with a short review. Reframe: Less but better.",
    "General: Environment setup Action 047: Define next action for each active project. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 048: Batch shallow tasks into one window. Reframe: Execution compounds.",
    "General: Execution architecture Action 049: Pick top three outcomes for today. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 050: Block one protected deep-work window. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 051: Delete or defer one low-value commitment. Reframe: Focus is a design choice.",
    "General: Time design Action 052: Run a five-minute workspace reset. Reframe: Less but better.",
    "General: Environment setup Action 053: Use one trusted list for all tasks. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 054: Close the day with a short review. Reframe: Execution compounds.",
    "General: Execution architecture Action 055: Define next action for each active project. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 056: Batch shallow tasks into one window. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 057: Pick top three outcomes for today. Reframe: Focus is a design choice.",
    "General: Time design Action 058: Block one protected deep-work window. Reframe: Less but better.",
    "General: Environment setup Action 059: Delete or defer one low-value commitment. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 060: Run a five-minute workspace reset. Reframe: Execution compounds.",
    "General: Execution architecture Action 061: Use one trusted list for all tasks. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 062: Close the day with a short review. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 063: Define next action for each active project. Reframe: Focus is a design choice.",
    "General: Time design Action 064: Batch shallow tasks into one window. Reframe: Less but better.",
    "General: Environment setup Action 065: Pick top three outcomes for today. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 066: Block one protected deep-work window. Reframe: Execution compounds.",
    "General: Execution architecture Action 067: Delete or defer one low-value commitment. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 068: Run a five-minute workspace reset. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 069: Use one trusted list for all tasks. Reframe: Focus is a design choice.",
    "General: Time design Action 070: Close the day with a short review. Reframe: Less but better.",
    "General: Environment setup Action 071: Define next action for each active project. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 072: Batch shallow tasks into one window. Reframe: Execution compounds.",
    "General: Execution architecture Action 073: Pick top three outcomes for today. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 074: Block one protected deep-work window. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 075: Delete or defer one low-value commitment. Reframe: Focus is a design choice.",
    "General: Time design Action 076: Run a five-minute workspace reset. Reframe: Less but better.",
    "General: Environment setup Action 077: Use one trusted list for all tasks. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 078: Close the day with a short review. Reframe: Execution compounds.",
    "General: Execution architecture Action 079: Define next action for each active project. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 080: Batch shallow tasks into one window. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 081: Pick top three outcomes for today. Reframe: Focus is a design choice.",
    "General: Time design Action 082: Block one protected deep-work window. Reframe: Less but better.",
    "General: Environment setup Action 083: Delete or defer one low-value commitment. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 084: Run a five-minute workspace reset. Reframe: Execution compounds.",
    "General: Execution architecture Action 085: Use one trusted list for all tasks. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 086: Close the day with a short review. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 087: Define next action for each active project. Reframe: Focus is a design choice.",
    "General: Time design Action 088: Batch shallow tasks into one window. Reframe: Less but better.",
    "General: Environment setup Action 089: Pick top three outcomes for today. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 090: Block one protected deep-work window. Reframe: Execution compounds.",
    "General: Execution architecture Action 091: Delete or defer one low-value commitment. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 092: Run a five-minute workspace reset. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 093: Use one trusted list for all tasks. Reframe: Focus is a design choice.",
    "General: Time design Action 094: Close the day with a short review. Reframe: Less but better.",
    "General: Environment setup Action 095: Define next action for each active project. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 096: Batch shallow tasks into one window. Reframe: Execution compounds.",
    "General: Execution architecture Action 097: Pick top three outcomes for today. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 098: Block one protected deep-work window. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 099: Delete or defer one low-value commitment. Reframe: Focus is a design choice.",
    "General: Time design Action 100: Run a five-minute workspace reset. Reframe: Less but better.",
    "General: Environment setup Action 101: Use one trusted list for all tasks. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 102: Close the day with a short review. Reframe: Execution compounds.",
    "General: Execution architecture Action 103: Define next action for each active project. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 104: Batch shallow tasks into one window. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 105: Pick top three outcomes for today. Reframe: Focus is a design choice.",
    "General: Time design Action 106: Block one protected deep-work window. Reframe: Less but better.",
    "General: Environment setup Action 107: Delete or defer one low-value commitment. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 108: Run a five-minute workspace reset. Reframe: Execution compounds.",
    "General: Execution architecture Action 109: Use one trusted list for all tasks. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 110: Close the day with a short review. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 111: Define next action for each active project. Reframe: Focus is a design choice.",
    "General: Time design Action 112: Batch shallow tasks into one window. Reframe: Less but better.",
    "General: Environment setup Action 113: Pick top three outcomes for today. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 114: Block one protected deep-work window. Reframe: Execution compounds.",
    "General: Execution architecture Action 115: Delete or defer one low-value commitment. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 116: Run a five-minute workspace reset. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 117: Use one trusted list for all tasks. Reframe: Focus is a design choice.",
    "General: Time design Action 118: Close the day with a short review. Reframe: Less but better.",
    "General: Environment setup Action 119: Define next action for each active project. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 120: Batch shallow tasks into one window. Reframe: Execution compounds.",
    "General: Execution architecture Action 121: Pick top three outcomes for today. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 122: Block one protected deep-work window. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 123: Delete or defer one low-value commitment. Reframe: Focus is a design choice.",
    "General: Time design Action 124: Run a five-minute workspace reset. Reframe: Less but better.",
    "General: Environment setup Action 125: Use one trusted list for all tasks. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 126: Close the day with a short review. Reframe: Execution compounds.",
    "General: Execution architecture Action 127: Define next action for each active project. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 128: Batch shallow tasks into one window. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 129: Pick top three outcomes for today. Reframe: Focus is a design choice.",
    "General: Time design Action 130: Block one protected deep-work window. Reframe: Less but better.",
    "General: Environment setup Action 131: Delete or defer one low-value commitment. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 132: Run a five-minute workspace reset. Reframe: Execution compounds.",
    "General: Execution architecture Action 133: Use one trusted list for all tasks. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 134: Close the day with a short review. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 135: Define next action for each active project. Reframe: Focus is a design choice.",
    "General: Time design Action 136: Batch shallow tasks into one window. Reframe: Less but better.",
    "General: Environment setup Action 137: Pick top three outcomes for today. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 138: Block one protected deep-work window. Reframe: Execution compounds.",
    "General: Execution architecture Action 139: Delete or defer one low-value commitment. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 140: Run a five-minute workspace reset. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 141: Use one trusted list for all tasks. Reframe: Focus is a design choice.",
    "General: Time design Action 142: Close the day with a short review. Reframe: Less but better.",
    "General: Environment setup Action 143: Define next action for each active project. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 144: Batch shallow tasks into one window. Reframe: Execution compounds.",
    "General: Execution architecture Action 145: Pick top three outcomes for today. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 146: Block one protected deep-work window. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 147: Delete or defer one low-value commitment. Reframe: Focus is a design choice.",
    "General: Time design Action 148: Run a five-minute workspace reset. Reframe: Less but better.",
    "General: Environment setup Action 149: Use one trusted list for all tasks. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 150: Close the day with a short review. Reframe: Execution compounds.",
    "General: Execution architecture Action 151: Define next action for each active project. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 152: Batch shallow tasks into one window. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 153: Pick top three outcomes for today. Reframe: Focus is a design choice.",
    "General: Time design Action 154: Block one protected deep-work window. Reframe: Less but better.",
    "General: Environment setup Action 155: Delete or defer one low-value commitment. Reframe: Boundaries protect priorities.",
    "General: Review loop Action 156: Run a five-minute workspace reset. Reframe: Execution compounds.",
    "General: Execution architecture Action 157: Use one trusted list for all tasks. Reframe: Clarity creates momentum.",
    "General: Priority filter Action 158: Close the day with a short review. Reframe: Environment drives behavior.",
    "General: Decision simplifier Action 159: Define next action for each active project. Reframe: Focus is a design choice.",
    "General: Time design Action 160: Batch shallow tasks into one window. Reframe: Less but better.",
  ],
};

function pickWeightedIndex(weights: number[]): number {
  const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return 0;
  let cursor = Math.random() * total;
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= Math.max(0, weights[index]);
    if (cursor <= 0) return index;
  }
  return weights.length - 1;
}

function detectProbabilisticCategory(message: string): ProbabilisticCategory | null {
  const lower = message.toLowerCase();
  let bestCategory: ProbabilisticCategory | null = null;
  let bestScore = 0;

  (Object.keys(probabilisticKeywordMap) as ProbabilisticCategory[]).forEach((category) => {
    const score = probabilisticKeywordMap[category].reduce((sum, token) => {
      return sum + (lower.includes(token) ? 1 : 0);
    }, 0);
    if (score <= 0) return;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  });

  return bestCategory;
}

function getProbabilisticReply(message: string, profile?: UserProfile): string | null {
  const category = detectProbabilisticCategory(message);
  if (!category) return null;

  const pool = probabilisticResponsePools[category] || [];
  if (pool.length === 0) return null;

  const styleBonus = profile?.responseStyle === 'motivational' ? 1.2 : profile?.responseStyle === 'concise' ? 0.9 : 1.0;
  const categoryWeight = probabilisticResponseWeights[category] || 1;

  const weights = pool.map((_, index) => {
    const rarityBias = 1 + ((index % 7) / 30);
    return rarityBias * styleBonus * categoryWeight;
  });

  return pool[pickWeightedIndex(weights)] || null;
}

export function shouldCallGemini(message: string): boolean {
  const lower = message.toLowerCase();
  const trimmed = message.trim();

  const basicIntents: RegExp[] = [
    /^(hi|hello|hey|yo|sup|greetings|howdy|good (morning|afternoon|evening|night))\b/i,
    /^(how are you|what\'?s up|who are you|help|thanks|bye)\b/i,
    /^(tasks?|list tasks|show tasks|create task|add task|delete task|edit task|complete task)\b/i,
    /^(today|my day|status|summary|progress|reminder|alarm|layers)\b/i,
  ];

  for (const intent of basicIntents) {
    if (intent.test(lower)) return false;
  }

  if (/\b(call gemini|use ai|deep reasoning|advanced reasoning)\b/i.test(lower)) {
    return true;
  }

  for (const topic of complexReasoningTopics) {
    if (topic.test(lower)) return true;
  }

  if (trimmed.length > 220) return true;
  if ((trimmed.match(/\?/g) || []).length >= 3) return true;

  return false;
}

export function needsComplexReasoning(intent: string): boolean {
  const value = (intent || '').trim().toLowerCase();
  if (!value) return false;
  if (value.length > 120) return true;

  const indicators: RegExp[] = [
    /(strategy|plan|approach|framework|model|optimize|maximize|trade-off|compare|versus|\bvs\b)/i,
    /(custom|personalized|tailored|specific to me|my context)/i,
    /(why|reason|cause|impact|implication|analysis)/i,
    /(if|then|else|unless|assuming|provided that)/i,
  ];

  return indicators.some((pattern) => pattern.test(value));
}

function localInsightFallback(context: string): string {
  const lower = context.toLowerCase();
  if (/\b(task|todo|plan|focus)\b/.test(lower)) {
    return 'Choose one high-impact task and finish it before noon. One completed promise creates momentum.';
  }
  if (/\b(spiritual|faith|prayer|bible)\b/.test(lower)) {
    return 'Begin with stillness, one short passage, and one obedience action today.';
  }
  if (/\b(academic|study|learn)\b/.test(lower)) {
    return 'Go deep on one topic, then test yourself without notes.';
  }
  if (/\b(financial|money|budget|debt)\b/.test(lower)) {
    return 'Track spending today and remove one recurring leak this week.';
  }
  if (/\b(physical|health|exercise|sleep)\b/.test(lower)) {
    return 'Move for 15 minutes and protect sleep tonight. Consistency beats intensity.';
  }
  return 'Consistency is your edge today. Keep one promise to yourself, then stack the next one.';
}

const linkedBibleCoreTimeline: Array<{ passage: string; text: string; context: string; theme: string }> = [
  { passage: 'Genesis 1:1-5', text: 'In the beginning God created the heavens and the earth.', context: 'Creation sets the pattern of order, purpose, and stewardship.', theme: 'creation' },
  { passage: 'Genesis 3:8-15', text: 'I will put enmity between you and the woman.', context: 'The fall introduces both rupture and the first promise of redemption.', theme: 'fall' },
  { passage: 'Genesis 12:1-3', text: 'In you all the families of the earth shall be blessed.', context: 'God begins a covenant mission through Abraham for all nations.', theme: 'covenant' },
  { passage: 'Genesis 22:13-14', text: 'The Lord will provide.', context: 'Substitution foreshadows later redemptive patterns.', theme: 'provision' },
  { passage: 'Exodus 3:7-10', text: 'I have surely seen the affliction of my people.', context: 'God reveals his heart for liberation and covenant faithfulness.', theme: 'deliverance' },
  { passage: 'Exodus 12:12-13', text: 'When I see the blood, I will pass over you.', context: 'Passover forms a core redemption memory later fulfilled in Christ.', theme: 'passover' },
  { passage: 'Exodus 20:1-3', text: 'You shall have no other gods before me.', context: 'Covenant life is shaped by worship-centered allegiance.', theme: 'law' },
  { passage: 'Deuteronomy 6:4-7', text: 'Hear, O Israel: The Lord our God, the Lord is one.', context: 'Identity, memory, and discipleship are household practices.', theme: 'identity' },
  { passage: 'Joshua 1:8-9', text: 'Be strong and courageous.', context: 'Meditation and obedience are linked to courageous mission.', theme: 'courage' },
  { passage: '1 Samuel 16:7', text: 'Man looks on the outward appearance, but the Lord looks on the heart.', context: 'God prioritizes formation over image.', theme: 'formation' },
  { passage: '2 Samuel 7:12-16', text: 'I will establish the throne of his kingdom forever.', context: 'Davidic promise creates messianic expectation.', theme: 'kingdom' },
  { passage: 'Psalm 23:1-3', text: 'The Lord is my shepherd.', context: 'Trust and guidance are relational, not merely procedural.', theme: 'trust' },
  { passage: 'Psalm 51:10-12', text: 'Create in me a clean heart, O God.', context: 'Repentance reopens joy and usefulness.', theme: 'repentance' },
  { passage: 'Proverbs 3:5-6', text: 'Trust in the Lord with all your heart.', context: 'Wisdom is lived dependence, not self-reliance.', theme: 'wisdom' },
  { passage: 'Isaiah 9:6-7', text: 'For to us a child is born.', context: 'Hope is anchored in promised reign and peace.', theme: 'messiah' },
  { passage: 'Isaiah 53:4-6', text: 'He was pierced for our transgressions.', context: 'The servant motif clarifies sacrificial redemption.', theme: 'atonement' },
  { passage: 'Jeremiah 31:31-34', text: 'I will make a new covenant.', context: 'Heart-level transformation is central to covenant renewal.', theme: 'new-covenant' },
  { passage: 'Ezekiel 36:26-27', text: 'I will give you a new heart.', context: 'Spiritual renewal includes new desire and empowered obedience.', theme: 'renewal' },
  { passage: 'Daniel 7:13-14', text: 'One like a son of man... his dominion is everlasting.', context: 'Kingdom vision broadens hope beyond immediate crises.', theme: 'kingdom' },
  { passage: 'Micah 6:8', text: 'Do justice, and love kindness, and walk humbly with your God.', context: 'True devotion integrates justice, mercy, and humility.', theme: 'justice' },
  { passage: 'Malachi 3:1', text: 'The Lord whom you seek will suddenly come to his temple.', context: 'Expectation of divine visitation prepares hearts for fulfillment.', theme: 'expectation' },
  { passage: 'Matthew 5:13-16', text: 'You are the light of the world.', context: 'Kingdom identity expresses itself publicly through faithful action.', theme: 'kingdom-life' },
  { passage: 'Matthew 6:9-13', text: 'Our Father in heaven...', context: 'Prayer aligns desire with God\'s rule and daily dependence.', theme: 'prayer' },
  { passage: 'Mark 1:15', text: 'Repent and believe in the gospel.', context: 'The gospel call is urgent and transformational.', theme: 'gospel' },
  { passage: 'Luke 4:18-19', text: 'He has anointed me to proclaim good news to the poor.', context: 'Mission includes restoration for the broken and oppressed.', theme: 'mission' },
  { passage: 'John 1:14', text: 'The Word became flesh and dwelt among us.', context: 'Incarnation reveals God\'s nearness and character.', theme: 'incarnation' },
  { passage: 'John 15:4-5', text: 'Abide in me, and I in you.', context: 'Fruitfulness flows from union, not mere effort.', theme: 'abiding' },
  { passage: 'Acts 1:8', text: 'You will receive power... and you will be my witnesses.', context: 'Spirit empowerment fuels outward witness.', theme: 'spirit-mission' },
  { passage: 'Acts 2:42-47', text: 'They devoted themselves to the apostles\' teaching.', context: 'Community rhythms sustain mission and formation.', theme: 'community' },
  { passage: 'Romans 8:1-2', text: 'There is therefore now no condemnation.', context: 'Identity in Christ disarms shame-driven striving.', theme: 'identity' },
  { passage: 'Romans 12:1-2', text: 'Be transformed by the renewing of your mind.', context: 'Transformation is worshipful and practical.', theme: 'transformation' },
  { passage: '1 Corinthians 13:4-7', text: 'Love is patient and kind.', context: 'Mature spirituality is measured relationally.', theme: 'love' },
  { passage: 'Galatians 5:22-23', text: 'The fruit of the Spirit is love, joy, peace...', context: 'Character formation confirms inner life with God.', theme: 'fruit' },
  { passage: 'Ephesians 2:8-10', text: 'By grace you have been saved through faith.', context: 'Grace saves and commissions for prepared good works.', theme: 'grace' },
  { passage: 'Philippians 4:6-7', text: 'Do not be anxious about anything.', context: 'Prayer and gratitude stabilize anxious hearts.', theme: 'peace' },
  { passage: 'Colossians 3:12-14', text: 'Put on... compassion, kindness, humility.', context: 'New identity must be consciously clothed in practice.', theme: 'virtue' },
  { passage: 'Hebrews 12:1-2', text: 'Run with endurance the race set before us.', context: 'Perseverance is sustained by focused hope.', theme: 'endurance' },
  { passage: 'James 1:22', text: 'Be doers of the word, and not hearers only.', context: 'Obedience converts insight into transformation.', theme: 'practice' },
  { passage: '1 Peter 5:6-7', text: 'Cast all your anxieties on him.', context: 'Humility and trust are linked disciplines.', theme: 'humility' },
  { passage: 'Revelation 21:3-5', text: 'Behold, I am making all things new.', context: 'Final renewal reframes present endurance.', theme: 'new-creation' },
];

const linkedBibleThemeBridge: Record<string, string[]> = {
  creation: ['Psalm 8:3-6', 'John 1:1-3', 'Colossians 1:16-17'],
  fall: ['Romans 5:12', 'Genesis 3:15', '1 John 3:8'],
  covenant: ['Galatians 3:8', 'Hebrews 11:8-10', 'Romans 4:16-18'],
  provision: ['Philippians 4:19', 'Genesis 22:14', 'Matthew 6:31-33'],
  deliverance: ['Psalm 34:17', 'Luke 4:18', 'Colossians 1:13-14'],
  passover: ['1 Corinthians 5:7', 'Luke 22:19-20', 'John 1:29'],
  law: ['Psalm 19:7-8', 'Matthew 5:17', 'Romans 7:12'],
  identity: ['1 Peter 2:9', 'Ephesians 1:4-5', 'Romans 8:15-17'],
  courage: ['Deuteronomy 31:6', 'Psalm 27:1', '2 Timothy 1:7'],
  formation: ['Romans 8:29', '2 Corinthians 3:18', 'Hebrews 5:14'],
  kingdom: ['Matthew 6:33', 'Luke 17:20-21', 'Revelation 11:15'],
  trust: ['Psalm 37:5', 'Isaiah 26:3-4', 'Proverbs 16:3'],
  repentance: ['1 John 1:9', 'Acts 3:19', 'Psalm 32:5'],
  wisdom: ['James 1:5', 'Proverbs 2:6', 'Colossians 2:3'],
  messiah: ['Luke 2:11', 'Matthew 1:21', 'John 20:31'],
  atonement: ['1 Peter 2:24', 'Romans 3:23-25', 'Hebrews 9:26'],
  'new-covenant': ['Luke 22:20', 'Hebrews 8:10-12', '2 Corinthians 3:6'],
  renewal: ['Titus 3:5', 'Romans 12:2', 'Ephesians 4:23-24'],
  justice: ['Isaiah 1:17', 'Matthew 23:23', 'Zechariah 7:9'],
  expectation: ['Luke 3:15-16', 'Mark 1:2-3', 'John 1:23'],
  'kingdom-life': ['Matthew 5:14-16', 'Philippians 2:14-15', '1 Peter 2:12'],
  prayer: ['Luke 11:1-4', 'Philippians 4:6', '1 Thessalonians 5:17'],
  gospel: ['Romans 1:16', '1 Corinthians 15:1-4', 'Mark 1:15'],
  mission: ['Matthew 28:18-20', 'Acts 13:47', '2 Corinthians 5:20'],
  incarnation: ['Philippians 2:6-8', 'Hebrews 2:14', 'John 1:14'],
  abiding: ['Psalm 1:2-3', 'John 15:9-10', '1 John 2:27-28'],
  'spirit-mission': ['Acts 2:1-4', 'Romans 8:14', 'Galatians 5:25'],
  community: ['Hebrews 10:24-25', 'Acts 4:32', 'Ephesians 4:15-16'],
  transformation: ['2 Corinthians 5:17', 'Colossians 3:1-3', 'Romans 12:2'],
  love: ['John 13:34-35', '1 John 4:7-12', 'Romans 13:8-10'],
  fruit: ['John 15:8', 'Galatians 5:22-23', 'Ephesians 5:9'],
  grace: ['Titus 2:11-12', 'Ephesians 2:8-10', 'Hebrews 4:16'],
  peace: ['Isaiah 26:3', 'John 14:27', 'Colossians 3:15'],
  virtue: ['2 Peter 1:5-7', 'Colossians 3:12-14', 'Micah 6:8'],
  endurance: ['James 1:2-4', 'Romans 5:3-5', 'Hebrews 10:36'],
  practice: ['Luke 6:46-49', 'James 1:22', 'John 13:17'],
  humility: ['Philippians 2:3-4', 'James 4:6-10', 'Matthew 23:12'],
  'new-creation': ['Romans 8:18-23', '2 Peter 3:13', 'Revelation 21:5'],
};

function localBibleFallback(day: number) {
  const safeDay = Math.max(1, Math.floor(day || 1));
  const segmentLength = 10;
  const segment = Math.floor((safeDay - 1) / segmentLength);
  const offset = (safeDay - 1) % segmentLength;

  // Rotate through the salvation-history timeline, but interleave themes each segment.
  const baseIndex = (segment * 3 + offset * 7) % linkedBibleCoreTimeline.length;
  const core = linkedBibleCoreTimeline[baseIndex];
  const bridges = linkedBibleThemeBridge[core.theme] || [];
  const bridge = bridges.length > 0 ? bridges[(segment + offset) % bridges.length] : core.passage;

  // Deterministic linking note creates a coherent traversal across the linked timeline.
  const context = `Day ${safeDay} links ${core.theme} across Scripture: core reading in ${core.passage}, then trace the same motif in ${bridge}. ${core.context}`;

  return {
    passage: `${core.passage} + linked: ${bridge}`,
    text: core.text,
    context,
  };
}

async function postEdenApi<T>(endpoint: string | string[], payload: Record<string, any>): Promise<(T & { success?: boolean; error?: string }) | null> {
  const endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];
  let lastError = 'Eden API route not found';

  for (const currentEndpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), edenApiTimeoutMs);
      const response = await fetch(currentEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      const json = await response.json().catch(() => null);
      if (!response.ok) {
        lastError = json?.error || `HTTP ${response.status}`;
        if (response.status === 404) {
          continue;
        }
        return ({ success: false, error: lastError } as unknown) as (T & { success?: boolean; error?: string });
      }

      return (json as T & { success?: boolean; error?: string }) || null;
    } catch {
      lastError = 'Network error';
    }
  }

  return ({ success: false, error: lastError } as unknown) as (T & { success?: boolean; error?: string });
}

function parseJsonSafely<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  return JSON.parse(cleaned) as T;
}

export async function getEdenInsight(context: string) {
  const data = await postEdenApi<{ success?: boolean; text?: string }>('/api/eden/insight', { context });
  return data?.success && data.text ? data.text : localInsightFallback(context);
}

export async function getDailyBibleReading(day: number) {
  const data = await postEdenApi<{ success?: boolean; reading?: { passage: string; text: string; context: string } }>('/api/eden/bible-reading', { day });
  if (data?.success && data.reading) return data.reading;
  return localBibleFallback(day);
}

function buildSystemPrompt(profile: UserProfile, recent: ConversationEntry[]): string {
  const recentMessages = recent.slice(-3).map((item) => item.userMessage).join(' | ');
  const favorite = (profile.favoritePatterns || []).slice(-8).join(', ');
  const ignored = (profile.ignoredTopics || []).slice(-8).join(', ');

  return [
    'You are Eden, a disciplined and compassionate growth companion.',
    `Preferred response style: ${profile.responseStyle || 'practical'}.`,
    `Last active layer: ${profile.lastActiveLayer || 'general'}.`,
    favorite ? `Patterns the user engages with: ${favorite}.` : '',
    ignored ? `Topics to avoid forcing: ${ignored}.` : '',
    recentMessages ? `Recent user context: ${recentMessages}.` : '',
    'Give concrete next steps. Be concise. Avoid generic filler.',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function chatWithEden(history: ChatHistory, message: string) {
  const layer = extractLayerFromText(message);
  const profile = updateProfile({
    lastInteractionAt: new Date().toISOString(),
    ...(layer ? { lastActiveLayer: layer } : {}),
  });

  const recent = getConversationHistory().slice(-5);
  const systemPrompt = buildSystemPrompt(profile, recent);

  const data = await postEdenApi<{ success?: boolean; text?: string }>(['/api/eden/chat', '/api/eden/chat/'], {
    history,
    message,
    appKnowledge,
    systemPrompt,
  });

  if (data?.success && data.text) {
    const aiReply = personalizeReply(data.text, profile);
    logConversation({
      timestamp: new Date().toISOString(),
      userMessage: message,
      edenResponse: aiReply,
      intent: classifyIntent(message),
      layerContext: layer,
    });
    return aiReply;
  }

  const localReply = getLocalChatReply(message, profile);
  if (localReply) {
    const personal = personalizeReply(localReply, profile);
    logConversation({
      timestamp: new Date().toISOString(),
      userMessage: message,
      edenResponse: personal,
      intent: classifyIntent(message),
      layerContext: layer,
    });
    return personal;
  }

  const lower = message.toLowerCase();
  let failover = 'I could not reach advanced reasoning right now, but I can still guide you with a practical next step.';
  if (/\b(strategy|plan|roadmap|long term)\b/i.test(lower)) {
    failover =
      'Use this strategy frame: choose one high-impact area, define a 90-day target, and execute one weekly milestone with review.';
  } else if (/\b(compare|vs|trade-off|pros|cons)\b/i.test(lower)) {
    failover =
      'Use a weighted comparison: top 3 criteria, score each option 1-10, multiply by priority weight, then choose decisively.';
  } else if (/\b(why|explain|analysis|detailed)\b/i.test(lower)) {
    failover =
      'Break it down into first principles: define the core problem, list assumptions, test one assumption at a time.';
  }

  const finalFailover = personalizeReply(failover, profile);
  logConversation({
    timestamp: new Date().toISOString(),
    userMessage: message,
    edenResponse: finalFailover,
    intent: classifyIntent(message),
    layerContext: layer,
  });
  return finalFailover;
}

export async function suggestTaskWithGemini(input: {
  userName?: string;
  layer: string;
  priority: string;
  preferredTime?: string;
  intent: string;
  userPreferences?: {
    favoriteMusicName?: string;
    focusAlarmSound?: string;
  };
}) {
  const quickLocal = !needsComplexReasoning(input.intent || '') && (input.intent || '').trim().length < 120;

  const nextNearTime = () => {
    const now = new Date();
    const near = new Date(now.getTime() + 20 * 60 * 1000);
    const minutes = near.getMinutes();
    near.setMinutes(minutes + (5 - (minutes % 5 || 5))); // round up to next 5-minute mark
    const h24 = near.getHours();
    const mm = String(near.getMinutes()).padStart(2, '0');
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${mm} ${period}`;
  };

  if (quickLocal) {
    const layer = input.layer.toLowerCase();
    const fallbackByLayer: Record<string, string[]> = {
      spiritual: [
        'Pray and journal one scripture insight',
        'Read one psalm and write one application',
        '10-minute gratitude and intercession prayer',
      ],
      academic: [
        'Deep study sprint with active recall',
        'Review lecture notes and summarize key points',
        'Solve practice questions for one weak topic',
      ],
      financial: [
        'Track today expenses and categorize spending',
        'Review budget and cut one non-essential item',
        'Update savings plan and next contribution',
      ],
      physical: [
        '20-minute workout and hydration checkpoint',
        'Prepare one high-protein meal',
        'Stretch and mobility reset session',
      ],
      general: [
        'Plan top 3 priorities for today',
        'Clear workspace and remove distractions',
        'Time-block one focused work session',
      ],
    };

    const options = fallbackByLayer[layer] || ['Complete one high-impact task'];
    const intentSeed = String(input.intent || '').trim().toLowerCase();
    const seed = Math.abs(
      Array.from(intentSeed || `${Date.now()}`).reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0)
    );
    const picked = options[seed % options.length];
    const suggestedTime = input.preferredTime && String(input.preferredTime).trim().length > 0
      ? input.preferredTime
      : nextNearTime();

    return {
      name: picked,
      time: suggestedTime,
      preferredMusic: input.userPreferences?.favoriteMusicName || 'Instrumental Warmth',
    };
  }

  const data = await postEdenApi<{ success?: boolean; suggestion?: { name: string; time: string; preferredMusic: string } }>(
    '/api/eden/suggest-task',
    {
      ...input,
      layerKnowledge,
      appKnowledge,
    }
  );

  if (!data?.success || !data.suggestion) return null;
  return data.suggestion;
}

export async function initializeEdenAgent() {
  const current = getProfile();
  if (!current.responseStyle) {
    updateProfile({ responseStyle: 'practical' });
  }
}

export async function getAgentProfile() {
  return getProfile();
}

export async function getRecentAgentConversations(limit = 10) {
  return getConversationHistory().slice(-Math.max(1, limit));
}

export { parseJsonSafely };
