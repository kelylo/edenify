import { getEdenInsight } from './gemini';

// Bible verse interface
export interface BibleVerse {
  verseId: number;
  bookName: string;
  bookNumber: number;
  chapter: number;
  verse: number;
  text: string;
}

export interface BibleDayReading {
  passage: string;
  text: string;
  context: string;
}

let bibleData: BibleVerse[] = [];
let isLoaded = false;
let readingPlan: Record<number, string> | null = null;
let planLoaded = false;
const PLAN_CACHE_KEY = 'edenify-bible-plan-v2'; // Cache bust on version change
let verseSearchIndex: Map<string, number[]> | null = null;
let verseSearchText: string[] = [];

async function loadBibleDataFromJson(): Promise<BibleVerse[]> {
  const response = await fetch('/bible-data.json');
  if (!response.ok) throw new Error('bible-data.json not found');

  const data = await response.json();

  const parsed = Array.isArray(data)
    ? data
        .filter((item: any) => item['__EMPTY_1'] && typeof item['__EMPTY_1'] === 'string' && !isNaN(Number(item['__EMPTY_1'])))
        .map((item: any, index: number) => ({
          verseId: index,
          bookName: item['__EMPTY'] || '',
          bookNumber: Number(item['__EMPTY_1']) || 0,
          chapter: Number(item['__EMPTY_2']) || 0,
          verse: Number(item['__EMPTY_3']) || 0,
          text: item['__EMPTY_4'] || '',
        }))
    : [];

  if (parsed.length > 0) return parsed;
  throw new Error('Unable to parse bible-data.json');
}

async function loadBibleData(): Promise<BibleVerse[]> {
  if (isLoaded && bibleData.length > 0) return bibleData;

  try {
    bibleData = await loadBibleDataFromJson();
    isLoaded = true;
    return bibleData;
  } catch (error) {
    console.error('Error loading Bible data:', error);
    return [];
  }
}

function tokenize(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s:]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function ensureVerseSearchIndex(verses: BibleVerse[]) {
  if (verseSearchIndex && verseSearchText.length === verses.length) return;

  const index = new Map<string, number[]>();
  const searchableText: string[] = new Array(verses.length).fill('');

  verses.forEach((verse, idx) => {
    const ref = `${verse.bookName} ${verse.chapter}:${verse.verse}`;
    const chapterRef = `${verse.bookName} ${verse.chapter}`;
    const text = `${ref} ${chapterRef} ${verse.text}`.toLowerCase();
    searchableText[idx] = text;

    const tokens = new Set<string>([...tokenize(text), verse.bookName.toLowerCase(), String(verse.chapter), `${verse.chapter}:${verse.verse}`]);
    tokens.forEach((token) => {
      const bucket = index.get(token) || [];
      bucket.push(idx);
      index.set(token, bucket);
    });
  });

  verseSearchIndex = index;
  verseSearchText = searchableText;
}

export async function searchVersesFast(keyword: string, limit = 30): Promise<BibleVerse[]> {
  const verses = await loadBibleData();
  const query = String(keyword || '').trim().toLowerCase();
  if (!query) return [];

  ensureVerseSearchIndex(verses);

  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const candidateScores = new Map<number, number>();
  tokens.forEach((token) => {
    const exactHits = verseSearchIndex?.get(token) || [];
    exactHits.forEach((index) => {
      candidateScores.set(index, (candidateScores.get(index) || 0) + 5);
    });

    // Prefix matches for speed and flexible partial searches.
    if (!verseSearchIndex) return;
    for (const [indexedToken, indices] of verseSearchIndex.entries()) {
      if (!indexedToken.startsWith(token) || token.length < 2) continue;
      indices.forEach((index) => {
        candidateScores.set(index, (candidateScores.get(index) || 0) + 2);
      });
    }
  });

  const ranked = Array.from(candidateScores.entries())
    .map(([index, score]) => {
      const hay = verseSearchText[index] || '';
      const phraseBoost = hay.includes(query) ? 8 : 0;
      return { index, score: score + phraseBoost };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(10, limit * 3));

  const filtered = ranked
    .map((entry) => verses[entry.index])
    .filter((verse) => verse && verseSearchText[verse.verseId].includes(query));

  if (filtered.length > 0) {
    return filtered.slice(0, limit);
  }

  // Last-resort fallback for unusual query shapes.
  const fallback = verses.filter((v) => `${v.bookName} ${v.chapter}:${v.verse} ${v.text}`.toLowerCase().includes(query));
  return fallback.slice(0, limit);
}

export async function searchBibleByReference(query: string): Promise<{ mode: 'verse' | 'chapter'; label: string; verses: BibleVerse[] } | null> {
  const trimmed = String(query || '').trim();
  if (!trimmed) return null;

  const verseMatch = trimmed.match(/^([1-3]?\s?[a-zA-Z]+(?:\s+[a-zA-Z]+)*)\s+(\d{1,3}):(\d{1,3})$/);
  if (verseMatch) {
    const book = verseMatch[1].replace(/\s+/g, ' ').trim();
    const chapter = Number(verseMatch[2]);
    const verse = Number(verseMatch[3]);
    const hit = await getVerse(book, chapter, verse);
    if (hit) {
      return {
        mode: 'verse',
        label: `${hit.bookName} ${hit.chapter}:${hit.verse}`,
        verses: [hit],
      };
    }
  }

  const chapterMatch = trimmed.match(/^([1-3]?\s?[a-zA-Z]+(?:\s+[a-zA-Z]+)*)\s+(\d{1,3})$/);
  if (chapterMatch) {
    const book = chapterMatch[1].replace(/\s+/g, ' ').trim();
    const chapter = Number(chapterMatch[2]);
    const verses = await getChapter(book, chapter);
    if (verses.length > 0) {
      return {
        mode: 'chapter',
        label: `${book} ${chapter}`,
        verses,
      };
    }
  }

  return null;
}

export async function getRandomVerse(): Promise<BibleVerse | null> {
  const verses = await loadBibleData();
  if (verses.length === 0) return null;
  return verses[Math.floor(Math.random() * verses.length)];
}

export async function getVerse(book: string, chapter: number, verse: number): Promise<BibleVerse | null> {
  const verses = await loadBibleData();
  if (verses.length === 0) return null;

  return verses.find(
    v => v.bookName.toLowerCase() === book.toLowerCase() &&
         v.chapter === chapter &&
         v.verse === verse
  ) || null;
}

export async function getBook(bookName: string): Promise<BibleVerse[]> {
  const verses = await loadBibleData();
  return verses.filter(v => v.bookName.toLowerCase() === bookName.toLowerCase());
}

export async function getChapter(bookName: string, chapter: number): Promise<BibleVerse[]> {
  const verses = await loadBibleData();
  return verses.filter(
    v => v.bookName.toLowerCase() === bookName.toLowerCase() && v.chapter === chapter
  );
}

export async function getSuggestedVerse(): Promise<{ verse: BibleVerse; suggestion: string } | null> {
  const randomVerse = await getRandomVerse();
  if (!randomVerse) return null;

  const prompt = `The Bible verse "${randomVerse.text.substring(0, 100)}..." (${randomVerse.bookName} ${randomVerse.chapter}:${randomVerse.verse}) provides spiritual guidance. Give a 1-2 sentence interpretation of how this applies to daily spiritual discipline.`;

  const suggestion = await getEdenInsight(prompt);

  return {
    verse: randomVerse,
    suggestion: suggestion || 'Meditate on this scripture for your reflection.'
  };
}

export async function searchVerses(keyword: string, limit: number = 10): Promise<BibleVerse[]> {
  return searchVersesFast(keyword, limit);
}

function formatPassage(start: BibleVerse, end: BibleVerse) {
  if (start.bookName === end.bookName && start.chapter === end.chapter) {
    return `${start.bookName} ${start.chapter}:${start.verse}-${end.verse}`;
  }

  if (start.bookName === end.bookName) {
    return `${start.bookName} ${start.chapter}:${start.verse}-${end.chapter}:${end.verse}`;
  }

  return `${start.bookName} ${start.chapter}:${start.verse} - ${end.bookName} ${end.chapter}:${end.verse}`;
}

export async function getBibleReadingForDay(day: number): Promise<BibleDayReading> {
  const verses = await loadBibleData();
  if (verses.length === 0) {
    return {
      passage: 'Reading unavailable',
      text: 'Bible data is unavailable. Please ensure bible-data.json is present.',
      context: 'Could not load /bible-data.json.',
    };
  }

  const totalDays = await getTotalReadingDays();
  const safeDay = Math.min(totalDays, Math.max(1, day));
  const totalVerses = verses.length;
  const baseChunk = Math.floor(totalVerses / totalDays);
  const remainder = totalVerses % totalDays;

  const startIndex = ((safeDay - 1) * baseChunk) + Math.min(safeDay - 1, remainder);
  const chunkSize = baseChunk + (safeDay <= remainder ? 1 : 0);
  const endIndex = Math.min(totalVerses - 1, startIndex + chunkSize - 1);

  const start = verses[startIndex];
  const end = verses[endIndex];

  return {
    passage: formatPassage(start, end),
    text: start.text,
    context: `Day ${safeDay} covers verse ${startIndex + 1} to ${endIndex + 1} of ${totalVerses}.`,
  };
}

function parsePlanTextToMap(text: string): Record<number, string> {
  const lines = text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const parsed: Record<number, string> = {};

  lines.forEach((line) => {
    const match = line.match(/^(?:day\s*)?(\d{1,3})\s*[:\-.)]?\s*(.+)$/i);
    if (!match) return;
    const day = Number(match[1]);
    if (!Number.isFinite(day) || day < 1 || day > 366) return;

    const passage = match[2].trim();
    if (!passage || /^day\b/i.test(passage)) return;
    parsed[day] = passage;
  });

  return parsed;
}

/**
 * Load the preset day reading plan, preferring bible-plan.json.
 */
async function loadReadingPlan(): Promise<Record<number, string>> {
  if (planLoaded && readingPlan) {
    console.log('[Bible Plan] Using cached plan with', Object.keys(readingPlan).length, 'days');
    return readingPlan;
  }

  try {
    console.log('[Bible Plan] Fetching /data/bible-plan.json...');
    const response = await fetch('/data/bible-plan.json');
    if (!response.ok) throw new Error(`bible-plan.json not found (status: ${response.status})`);
    const data = await response.json() as {
      readings?: Record<string, { passages?: string } | string>;
      plan?: Record<string, { passages?: string } | string>;
      days?: Record<string, { passages?: string } | string>;
    };

    readingPlan = {};

    const sourcePlan = data.readings || data.plan || data.days || {};

    Object.entries(sourcePlan).forEach(([day, reading]) => {
      const dayNumber = Number(day);
      if (!Number.isFinite(dayNumber) || dayNumber <= 0) return;
      const passages = typeof reading === 'string' ? reading : reading?.passages;
      if (!passages || typeof passages !== 'string') return;
      readingPlan![dayNumber] = passages;
    });

    const dayCount = Object.keys(readingPlan).length;
    console.log('[Bible Plan] Loaded successfully with', dayCount, 'days');
    console.log('[Bible Plan] Sample days:', Object.keys(readingPlan).slice(0, 3).map(d => `Day ${d}: ${readingPlan![Number(d)]}`).join(', '));

    planLoaded = true;
    return readingPlan || {};
  } catch (error) {
    console.warn('[Bible Plan] Could not load reading plan from /data/bible-plan.json:', error);
    planLoaded = true;
    return {};
  }
}

/**
 * Get reading for a specific day, preferring the preset plan if available.
 */
export async function getDayReading(day: number): Promise<BibleDayReading> {
  const plan = await loadReadingPlan();
  const totalDays = Math.max(1, Object.keys(plan).length || 365);
  const safeDay = Math.min(totalDays, Math.max(1, day));

  console.log('[getDayReading] day:', day, 'safeDay:', safeDay, 'planLoaded:', Object.keys(plan).length > 0);

  if (plan[safeDay]) {
    const result = {
      passage: plan[safeDay],
      text: `Today's reading: ${plan[safeDay]}`,
      context: `Day ${safeDay} of the reading plan.`
    };
    console.log('[getDayReading] Found in plan:', result.passage);
    return result;
  }

  console.warn('[getDayReading] Not found in plan for day', safeDay);
  return {
    passage: `Day ${safeDay} unavailable`,
    text: 'Reading plan entry is missing for this day.',
    context: `No reading found in /data/bible-plan.json for day ${safeDay}.`,
  };
}

/**
 * Get the total number of days in the reading plan.
 */
export async function getTotalReadingDays(): Promise<number> {
  const plan = await loadReadingPlan();
  const dayCount = Object.keys(plan).length;
  return dayCount > 0 ? dayCount : 365;
}
