// Number and date formatting, driven by user settings.
import { settings } from './store.js';
import { dateToJalali, jalaliToDate, jalaliMonthLength, JALALI_MONTHS, WEEKDAYS, satIndex } from './jalali.js';

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const DAY = 86400000;

/** Convert western digits to the user's chosen digit set. */
export function num(value) {
  const s = String(value);
  if (settings().digits !== 'fa') return s;
  return s.replace(/[0-9]/g, (d) => FA_DIGITS[d]).replace(/\./g, '٫');
}
/** Normalise any Persian/Arabic digits typed by the user to western ones. */
export function toLatinDigits(s) {
  return String(s).replace(/[۰-۹]/g, (d) => FA_DIGITS.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}
/** Parse a whole number typed in any digit set. Returns null when empty or not a number. */
export function parseInt10(s) {
  const clean = toLatinDigits(String(s ?? '')).replace(/[^\d]/g, '');
  if (!clean) return null;
  const n = parseInt(clean, 10);
  return Number.isFinite(n) ? n : null;
}

const pad = (n) => String(n).padStart(2, '0');

export function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
/** Local calendar-day key, e.g. 2026-11-12 */
export function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
/** Noon of a day key (noon keeps day arithmetic safe across DST changes). */
export function keyToTs(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12).getTime(); }
/** Whole calendar days between two timestamps (local). */
export function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY); }
/** Move a timestamp by whole calendar days. */
export function addDays(ts, n) { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); }

/** "۲۱ آبان ۱۴۰۵" */
export function fullDate(ts, { withYear = true, withWeekday = false } = {}) {
  const d = new Date(ts);
  const j = dateToJalali(d);
  const s = `${num(j.jd)} ${JALALI_MONTHS[j.jm - 1]}${withYear ? ' ' + num(j.jy) : ''}`;
  return withWeekday ? `${WEEKDAYS[satIndex(d)]} ${s}` : s;
}
/** Short date, drops the year when it's the current Jalali year. */
export function shortDate(ts) {
  const sameYear = dateToJalali(new Date(ts)).jy === dateToJalali(new Date()).jy;
  return fullDate(ts, { withYear: !sameYear });
}
/** "آبان ۱۴۰۵" */
export function monthYear(ts) {
  const j = dateToJalali(new Date(ts));
  return `${JALALI_MONTHS[j.jm - 1]} ${num(j.jy)}`;
}
export function relativeDay(ts) {
  const d = daysBetween(ts, Date.now());
  if (d === 0) return 'امروز';
  if (d === 1) return 'دیروز';
  if (d > 1 && d < 7) return `${num(d)} روز پیش`;
  if (d >= 7 && d < 30) return `${num(Math.floor(d / 7))} هفته پیش`;
  if (d >= 30 && d < 365) return `${num(Math.floor(d / 30))} ماه پیش`;
  if (d === -1) return 'فردا';
  if (d < -1) return `${num(-d)} روز دیگر`;
  return shortDate(ts);
}
/** A span of days in words: "۳ روز", "۲ هفته", "۴ ماه" */
export function span(days) {
  const d = Math.max(1, Math.round(days));
  if (d < 14) return `${num(d)} روز`;
  if (d < 60) return `${num(Math.round(d / 7))} هفته`;
  if (d < 365) return `${num(Math.round(d / 30))} ماه`;
  return `${num(Math.round(d / 36.5) / 10)} سال`;
}

export const jalaliYear = (ts = Date.now()) => dateToJalali(new Date(ts)).jy;
/** [start, end) timestamps of a Jalali year */
export function jalaliYearRange(jy) {
  return [jalaliToDate(jy, 1, 1).getTime(), jalaliToDate(jy + 1, 1, 1).getTime()];
}
/** Jalali {jy, jm, jd} → local noon timestamp, or null when the date does not exist. */
export function jalaliTs(jy, jm, jd) {
  if (!jy || !jm || !jd || jm < 1 || jm > 12 || jd < 1 || jy < 1200 || jy > 1600) return null;
  if (jd > jalaliMonthLength(jy, jm)) return null;
  const d = jalaliToDate(jy, jm, jd);
  d.setHours(12);
  return d.getTime();
}

/** Grouped number: ۱۲۰٬۰۰۰ */
export function grouped(n) {
  const s = String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return settings().digits === 'fa' ? num(s).replace(/,/g, '٬') : s;
}
export const toman = (n) => `${grouped(n)} تومان`;
/** One decimal at most, in the user's digits: ۴٫۵ */
export function dec(n) {
  const r = Math.round(n * 10) / 10;
  return num(Number.isInteger(r) ? r : r.toFixed(1));
}

/** Date for a log line: weekday for the last week, year only when it is not this year. */
export function dayLabel(ts) {
  const recent = Math.abs(daysBetween(ts, Date.now())) < 7;
  const sameYear = dateToJalali(new Date(ts)).jy === dateToJalali(new Date()).jy;
  return fullDate(ts, { withWeekday: recent, withYear: !sameYear });
}
