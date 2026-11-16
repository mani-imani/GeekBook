// Everything derived from the reading log: pages per day, streaks, pace, yearly numbers.
import * as store from './store.js';
import * as fmt from './fmt.js';
import { dateToJalali, jalaliToDate, JALALI_MONTHS } from './jalali.js';

/** Map of local day key → pages read that day. */
export function pagesByDay() {
  const map = new Map();
  for (const l of store.logs()) {
    if (!l.pages) continue;
    const k = fmt.dayKey(l.at);
    map.set(k, (map.get(k) || 0) + l.pages);
  }
  return map;
}

export const pagesToday = (byDay = pagesByDay()) => byDay.get(fmt.dayKey(Date.now())) || 0;

/** current: consecutive reading days ending today (or yesterday, so the day is not lost before you read). */
export function streaks(byDay = pagesByDay()) {
  const has = (ts) => byDay.has(fmt.dayKey(ts));
  const d = new Date(); d.setHours(12, 0, 0, 0);
  const readToday = has(d.getTime());
  if (!readToday) d.setDate(d.getDate() - 1);
  let current = 0;
  while (has(d.getTime())) { current++; d.setDate(d.getDate() - 1); }
  let best = 0, run = 0, prev = null;
  for (const k of [...byDay.keys()].sort()) {
    const t = fmt.keyToTs(k);
    run = prev != null && fmt.daysBetween(prev, t) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = t;
  }
  return { current, best, readToday };
}

/**
 * Pace of one book: average pages per day over the last 14 days of its log, counted from the
 * first entry in that window (so a book started 3 days ago is averaged over 3 days, not 14).
 */
export function pace(book) {
  if (!book.pages || book.status !== 'reading') return null;
  const remaining = book.pages - (book.current_page || 0);
  if (remaining <= 0) return null;
  const since = fmt.startOfDay(fmt.addDays(Date.now(), -13));
  const recent = store.logsOf(book.id).filter((l) => l.at >= since && l.pages > 0);
  if (!recent.length) return { remaining, perDay: 0, days: null };
  const pages = recent.reduce((s, l) => s + l.pages, 0);
  const first = Math.min(...recent.map((l) => l.at));
  const spanDays = Math.max(1, fmt.daysBetween(first, Date.now()) + 1);
  const perDay = pages / spanDays;
  return { remaining, perDay, days: Math.max(1, Math.ceil(remaining / perDay)) };
}

export const percent = (book) => (book.pages ? Math.min(100, Math.round(((book.current_page || 0) / book.pages) * 100)) : null);

/** Days from start to finish of a read book (at least 1), or null when a date is missing. */
export function daysToFinish(book) {
  if (!book.started_at || !book.finished_at || book.finished_at < book.started_at) return null;
  return fmt.daysBetween(book.started_at, book.finished_at) + 1;
}

function top(items, n = 3) {
  const map = new Map();
  for (const it of items) if (it) map.set(it, (map.get(it) || 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fa')).slice(0, n).map(([name, count]) => ({ name, count }));
}

/** Numbers for one Jalali year (the recap and the yearly goal). */
export function yearStats(jy) {
  const [start, end] = fmt.jalaliYearRange(jy);
  const inYear = (t) => t != null && t >= start && t < end;
  const finished = store.books().filter((b) => b.status === 'read' && inYear(b.finished_at)).sort((a, b) => a.finished_at - b.finished_at);
  const logs = store.logs().filter((l) => inYear(l.at));
  const byDay = new Map();
  const months = new Array(12).fill(0);
  let pages = 0;
  for (const l of logs) {
    if (!l.pages) continue;
    pages += l.pages;
    const k = fmt.dayKey(l.at);
    byDay.set(k, (byDay.get(k) || 0) + l.pages);
    months[dateToJalali(new Date(l.at)).jm - 1] += l.pages;
  }
  const bestMonthIdx = months.indexOf(Math.max(...months));
  const rated = finished.filter((b) => b.rating > 0);
  const favorite = [...rated].sort((a, b) => b.rating - a.rating || b.finished_at - a.finished_at)[0] || null;
  const durations = finished.map(daysToFinish).filter((d) => d != null);
  const longest = [...finished].filter((b) => b.pages).sort((a, b) => b.pages - a.pages)[0] || null;
  return {
    jy, finished, pages, days: byDay.size,
    bestStreak: streaks(byDay).best,
    months, bestMonth: months[bestMonthIdx] ? { name: JALALI_MONTHS[bestMonthIdx], pages: months[bestMonthIdx] } : null,
    genres: top(finished.map((b) => b.genre)), authors: top(finished.map((b) => b.author)),
    favorite, longest,
    avgRating: rated.length ? rated.reduce((s, b) => s + b.rating, 0) / rated.length : null,
    avgDays: durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : null,
    quotes: store.quotes().filter((q) => inYear(q.created_at)).length,
    summaries: logs.filter((l) => l.summary).length,
  };
}

/** Pages per Jalali month for the last `count` months, oldest first. */
export function monthSeries(count = 12) {
  const j = dateToJalali(new Date());
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    let jm = j.jm - i, jy = j.jy;
    while (jm < 1) { jm += 12; jy--; }
    const start = jalaliToDate(jy, jm, 1).getTime();
    const end = jm === 12 ? jalaliToDate(jy + 1, 1, 1).getTime() : jalaliToDate(jy, jm + 1, 1).getTime();
    out.push({ jy, jm, label: JALALI_MONTHS[jm - 1], start, end, pages: 0, books: 0, current: i === 0 });
  }
  for (const l of store.logs()) {
    if (!l.pages) continue;
    const m = out.find((x) => l.at >= x.start && l.at < x.end);
    if (m) m.pages += l.pages;
  }
  for (const b of store.books()) {
    if (b.status !== 'read' || !b.finished_at) continue;
    const m = out.find((x) => b.finished_at >= x.start && b.finished_at < x.end);
    if (m) m.books++;
  }
  return out;
}

/** All-time numbers for the stats page. */
export function overall() {
  const all = store.books();
  const read = all.filter((b) => b.status === 'read');
  const byDay = pagesByDay();
  let pages = 0;
  for (const v of byDay.values()) pages += v;
  const rated = read.filter((b) => b.rating > 0);
  const durations = read.map(daysToFinish).filter((d) => d != null);
  const statusCounts = {};
  for (const k of Object.keys(store.STATUSES)) statusCounts[k] = all.filter((b) => b.status === k).length;
  return {
    total: all.length, read: read.length, statusCounts, pages, days: byDay.size,
    perActiveDay: byDay.size ? pages / byDay.size : 0,
    genres: top(read.map((b) => b.genre), 5), authors: top(read.map((b) => b.author), 5),
    avgRating: rated.length ? rated.reduce((s, b) => s + b.rating, 0) / rated.length : null,
    avgDays: durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : null,
    quotes: store.quotes().length,
  };
}

/** Jalali years that have any reading activity, newest first (always includes the current year). */
export function activeYears() {
  const years = new Set([fmt.jalaliYear()]);
  for (const l of store.logs()) years.add(fmt.jalaliYear(l.at));
  for (const b of store.books()) if (b.finished_at) years.add(fmt.jalaliYear(b.finished_at));
  return [...years].sort((a, b) => b - a);
}
