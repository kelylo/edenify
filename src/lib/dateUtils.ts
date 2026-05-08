/**
 * Centralized date and time utilities
 * Consolidates time parsing logic from AppContext, Home, and utils
 */

/**
 * Pad number to 2 digits with leading zero
 * @example pad2(5) => "05"
 */
export const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Get today's date as YYYY-MM-DD string
 */
export const getDateKey = (date = new Date()): string => {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
};

/**
 * Get yesterday's date as YYYY-MM-DD string
 */
export const getYesterdayKey = (date = new Date()): string => {
  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  return getDateKey(yesterday);
};

/**
 * Get tomorrow's date as YYYY-MM-DD string
 */
export const getTomorrowKey = (date = new Date()): string => {
  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getDateKey(tomorrow);
};

/**
 * Get date N days from now
 */
export const getDateKeyNDaysLater = (days: number, fromDate = new Date()): string => {
  const target = new Date(fromDate);
  target.setDate(target.getDate() + days);
  return getDateKey(target);
};

/**
 * Parse HH:MM time string (24-hour format)
 * @returns { h, m } or null if invalid
 */
export const parseTime24 = (time: string): { h: number; m: number } | null => {
  const match = String(time || '').trim().match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return { h: Number(match[1]), m: Number(match[2]) };
};

/**
 * Format hours and minutes as HH:MM (24-hour)
 */
export const formatTime24 = (h: number, m: number): string => `${pad2(h)}:${pad2(m)}`;

/**
 * Convert 12-hour time + period to 24-hour format
 * @example parseTime12("3:30", "PM") => "15:30"
 */
export const parseTime12 = (time: string, period: 'AM' | 'PM'): string | null => {
  const parsed = parseTime24(time);
  if (!parsed) return null;

  let h = Number(time.split(':')[0]);
  if (h < 1 || h > 12) return null;

  let h24 = h % 12;
  if (period === 'PM') h24 += 12;

  return formatTime24(h24, parsed.m);
};

/**
 * Parse any time format (12-hour or 24-hour) to 24-hour HH:MM
 * @example parseAnyTime("3:30 PM") => "15:30"
 * @example parseAnyTime("15:30") => "15:30"
 * @example parseAnyTime("12:00 AM") => "00:00"
 * @example parseAnyTime("12:00 PM") => "12:00"
 */
export const parseAnyTime = (text: string): string | null => {
  const normalized = String(text || '').toUpperCase().replace(/\s+/g, ' ').trim();

  // Try 12-hour format: "3:30 PM"
  const match12 = normalized.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
  if (match12) {
    let h = Number(match12[1]);
    const m = Number(match12[2]);
    const period = match12[3].toUpperCase();

    // Handle 12 AM/PM edge cases
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;

    return formatTime24(h, m);
  }

  // Try 24-hour format: "15:30"
  const match24 = normalized.match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/);
  if (match24) {
    return formatTime24(Number(match24[1]), Number(match24[2]));
  }

  return null;
};

/**
 * Get next rounded time (round up to nearest 5 minutes)
 * Used for default task scheduling
 * @example If current time is 14:23, returns "14:25"
 */
export const getRoundedCurrentTime = (): string => {
  const now = new Date();
  const roundedMin = Math.ceil(now.getMinutes() / 5) * 5;
  const next = new Date(now);
  next.setSeconds(0, 0);

  if (roundedMin >= 60) {
    next.setHours(now.getHours() + 1, 0, 0, 0);
  } else {
    next.setMinutes(roundedMin, 0, 0);
  }

  return formatTime24(next.getHours(), next.getMinutes());
};

/**
 * Parse 24-hour time to 12-hour editor format
 * @example parseTimeToEditor("15:30") => { hour24: "15", hour12: "03", minute: "30", period: "PM" }
 */
export const parseTimeToEditor = (
  time24: string
): {
  hour24: string;
  minute: string;
  hour12: string;
  period: 'AM' | 'PM';
} => {
  const match = String(time24 || '').trim().match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return {
      hour24: '08',
      minute: '00',
      hour12: '08',
      period: 'AM',
    };
  }

  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return {
    hour24: pad2(hour24),
    minute: pad2(minute),
    hour12: pad2(hour12),
    period,
  };
};

/**
 * Build 24-hour time from editor form inputs
 * @example buildTimeFromEditor("24", "15", "30", "PM") => "15:30"
 */
export const buildTimeFromEditor = (
  format: '12' | '24',
  hourInput: string,
  minuteInput: string,
  period: 'AM' | 'PM'
): string | null => {
  const hour = Number(hourInput);
  const minute = Number(minuteInput);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (minute < 0 || minute > 59) return null;

  if (format === '24') {
    if (hour < 0 || hour > 23) return null;
    return formatTime24(hour, minute);
  }

  if (hour < 1 || hour > 12) return null;
  let hours24 = hour % 12;
  if (period === 'PM') hours24 += 12;

  return formatTime24(hours24, minute);
};

/**
 * Get day difference between two YYYY-MM-DD date keys
 * @example getDayDiff("2024-01-01", "2024-01-10") => 9
 */
export const getDayDiff = (fromKey: string, toKey: string): number => {
  const from = new Date(`${fromKey}T00:00:00`);
  const to = new Date(`${toKey}T00:00:00`);
  const diffMs = to.getTime() - from.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

/**
 * Check if two date keys represent the same day
 */
export const isSameDay = (key1: string, key2: string): boolean => key1 === key2;

/**
 * Check if date key is today
 */
export const isToday = (key: string): boolean => isSameDay(key, getDateKey());

/**
 * Check if date key is yesterday
 */
export const isYesterday = (key: string): boolean => isSameDay(key, getYesterdayKey());

/**
 * Check if date key is in the past
 */
export const isPast = (key: string): boolean => getDayDiff(key, getDateKey()) > 0;

/**
 * Check if date key is in the future
 */
export const isFuture = (key: string): boolean => getDayDiff(key, getDateKey()) < 0;
