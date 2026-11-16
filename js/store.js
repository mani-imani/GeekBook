// App state, kept in memory and persisted to IndexedDB.
//
// Every record has: id (UUID), created_at, updated_at (ms epoch; import merge and future sync
// keep the newer one), deleted (soft delete).
//
// book   title, author, translator, publisher, genre, pages (total | null),
//        status: wish | shelf | reading | read | dropped,
//        current_page, bookmark ("where I stopped", one line), started_at, finished_at,
//        rating (0–5), review, drop_reason, price (| null), priority (0 | 1), note,
//        color (index into COLORS | null → picked from the id), lists: [list id]
// log    book_id, at, from_page, to_page, pages (read in this entry), summary,
//        review_stage, next_review_at
// quote  book_id, text, page (| null), note, review_stage, next_review_at
// list   name, sort_order
// loan   book_id, person, lent_at, returned_at (| null), note

import * as db from './db.js';

export const SCHEMA_VERSION = 1;
export const COLOR_COUNT = 10; // cover colors, see COLORS in components.js
const DAY = 86400000;

export const STATUSES = {
  reading: { label: 'می‌خوانم', short: 'می‌خوانم' },
  shelf: { label: 'نخوانده', short: 'نخوانده' },
  read: { label: 'خوانده‌ام', short: 'خوانده' },
  dropped: { label: 'رها شد', short: 'رها شد' },
  wish: { label: 'برای خرید', short: 'خرید' },
};

/** Spaced review: days until the next showing, by stage. The last gap repeats. */
export const REVIEW_GAPS = [1, 7, 30, 90, 180];

export const DEFAULT_SETTINGS = {
  theme: 'system',          // system | light | dark
  accent: 'navy',           // see ACCENTS in the settings view (navy = brand)
  font: 'vazirmatn',        // vazirmatn | rounded | system
  fontSize: 17,             // px, 14–22
  digits: 'fa',             // fa | en
  dailyPages: 20,           // 0 = no daily goal
  yearlyBooks: 12,          // 0 = no yearly goal
  review: true,             // spaced review of summaries and quotes
  askSummary: true,         // ask for a short summary when logging
  installPrompt: true,
  backupReminder: true,
  backupDays: 30,
  updated_at: 0,
};

const state = { books: [], logs: [], quotes: [], lists: [], loans: [], settings: { ...DEFAULT_SETTINGS } };
const listeners = new Set();

export const now = () => Date.now();
const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));
const clean = (s, max = 300) => String(s ?? '').replace(/[ \t ]+/g, ' ').trim().slice(0, max);
const cleanLong = (s, max = 6000) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(kind = 'data') { for (const fn of listeners) fn(kind); }

export async function init() {
  const [books, logs, quotes, lists, loans, settingsRec] = await Promise.all([
    ...db.DATA_STORES.map((s) => db.getAll(s)), db.get('settings', 'settings')]);
  state.books = books.map(normalizeBook).filter(Boolean);
  state.logs = logs.map(normalizeLog).filter(Boolean);
  state.quotes = quotes.map(normalizeQuote).filter(Boolean);
  state.lists = lists.map(normalizeList).filter(Boolean);
  state.loans = loans.map(normalizeLoan).filter(Boolean);
  if (settingsRec) {
    const { key, ...rest } = settingsRec;
    state.settings = { ...DEFAULT_SETTINGS, ...rest };
  }
}

export const settings = () => state.settings;

function touch(rec) { rec.updated_at = Math.max(now(), (rec.updated_at || 0) + 1); return rec; }
/** Persist changed records ([store, record] pairs) in one transaction and notify the views. */
async function commit(pairs, kind) {
  for (const [, rec] of pairs) touch(rec);
  await db.putAll(pairs);
  emit(kind);
}

// ---------- books ----------
export const getBook = (id) => state.books.find((b) => b.id === id && !b.deleted);
export const books = () => state.books.filter((b) => !b.deleted);
export const booksByStatus = (status) => books().filter((b) => b.status === status);
const liveBookIds = () => new Set(books().map((b) => b.id));

function bookFields(f) {
  const out = {};
  if ('title' in f) out.title = clean(f.title);
  if ('author' in f) out.author = clean(f.author, 200);
  if ('translator' in f) out.translator = clean(f.translator, 200);
  if ('publisher' in f) out.publisher = clean(f.publisher, 200);
  if ('genre' in f) out.genre = clean(f.genre, 80);
  if ('pages' in f) out.pages = f.pages > 0 ? Math.min(Math.round(f.pages), 99999) : null;
  if ('price' in f) out.price = f.price > 0 ? Math.round(f.price) : null;
  if ('priority' in f) out.priority = f.priority ? 1 : 0;
  if ('note' in f) out.note = cleanLong(f.note, 2000);
  if ('color' in f) out.color = Number.isInteger(f.color) ? f.color : null;
  if ('bookmark' in f) out.bookmark = clean(f.bookmark, 300);
  if ('rating' in f) out.rating = Math.max(0, Math.min(5, Math.round(f.rating || 0)));
  if ('review' in f) out.review = cleanLong(f.review, 4000);
  if ('drop_reason' in f) out.drop_reason = clean(f.drop_reason, 300);
  if ('started_at' in f) out.started_at = f.started_at || null;
  if ('finished_at' in f) out.finished_at = f.finished_at || null;
  if ('current_page' in f) out.current_page = Math.max(0, Math.round(f.current_page || 0));
  return out;
}

export async function addBook(fields) {
  const f = bookFields(fields);
  if (!f.title) return null;
  const ts = now();
  const status = STATUSES[fields.status] ? fields.status : 'shelf';
  const b = {
    id: uuid(), title: f.title, author: f.author || '', translator: f.translator || '', publisher: f.publisher || '',
    genre: f.genre || '', pages: f.pages ?? null, status,
    current_page: 0, bookmark: '', started_at: null, finished_at: null,
    rating: 0, review: '', drop_reason: '', price: f.price ?? null, priority: f.priority || 0, note: f.note || '',
    color: f.color ?? nextColor(), lists: Array.isArray(fields.lists) ? [...fields.lists] : [],
    created_at: ts, updated_at: 0, deleted: false,
  };
  applyStatus(b, status, ts, fields);
  state.books.push(b);
  await commit([['books', b]]);
  return b;
}

/** The cover color used by the fewest books, so neighbours on the shelf differ. */
function nextColor() {
  const used = new Array(COLOR_COUNT).fill(0);
  for (const b of books()) if (Number.isInteger(b.color) && b.color < COLOR_COUNT) used[b.color]++;
  const min = Math.min(...used);
  const start = books().length % COLOR_COUNT;
  for (let i = 0; i < COLOR_COUNT; i++) { const k = (start + i) % COLOR_COUNT; if (used[k] === min) return k; }
  return 0;
}

/** Dates follow the status on their own; explicit dates in `opts` win. */
function applyStatus(b, status, ts, opts = {}) {
  b.status = status;
  if (status === 'reading') {
    if (!b.started_at) b.started_at = ts;
    b.finished_at = null;
  } else if (status === 'read') {
    if (!b.finished_at) b.finished_at = 'finished_at' in opts ? (opts.finished_at || null) : ts;
    if (b.pages) b.current_page = b.pages;
  } else if (status === 'shelf' || status === 'wish') {
    b.finished_at = null;
  }
  if ('started_at' in opts && opts.started_at !== undefined) b.started_at = opts.started_at || null;
}

export async function updateBook(id, patch) {
  const b = getBook(id);
  if (!b) return null;
  const f = bookFields(patch);
  if ('title' in f && !f.title) delete f.title;
  Object.assign(b, f);
  if (b.pages && b.current_page > b.pages) b.current_page = b.pages;
  await commit([['books', b]]);
  return b;
}

export async function setStatus(id, status, opts = {}) {
  const b = getBook(id);
  if (!b || !STATUSES[status]) return null;
  const pairs = [['books', b]];
  const ts = now();
  // finishing a book I was reading: the pages that were left count as read today
  if (status === 'read' && b.status === 'reading' && b.pages && (b.current_page || 0) < b.pages) {
    const l = {
      id: uuid(), book_id: b.id, at: ts, from_page: b.current_page || 0, to_page: b.pages, pages: b.pages - (b.current_page || 0), summary: '',
      review_stage: 0, next_review_at: ts + REVIEW_GAPS[0] * DAY, created_at: ts, updated_at: 0, deleted: false,
    };
    state.logs.push(l);
    pairs.push(['logs', l]);
  }
  applyStatus(b, status, ts, opts);
  if (status === 'read') b.bookmark = '';
  if ('drop_reason' in opts) b.drop_reason = clean(opts.drop_reason, 300);
  await commit(pairs);
  return b;
}

export async function removeBook(id) {
  const b = getBook(id);
  if (!b) return;
  b.deleted = true;
  await commit([['books', b]]);
}
export async function restoreBook(id) {
  const b = state.books.find((x) => x.id === id);
  if (!b) return;
  b.deleted = false;
  await commit([['books', b]]);
}

// ---------- reading log ----------
export const logs = () => { const live = liveBookIds(); return state.logs.filter((l) => !l.deleted && live.has(l.book_id)); };
export const logsOf = (bookId) => state.logs.filter((l) => !l.deleted && l.book_id === bookId).sort((a, b) => b.at - a.at || b.created_at - a.created_at);

/**
 * Record a reading entry: the page reached, an optional one-line "where I stopped" and an
 * optional short summary. Pages read = page reached − page before.
 */
export async function addLog({ book_id, to_page, at, summary = '', bookmark, finished = false }) {
  const b = getBook(book_id);
  if (!b) return null;
  const ts = now();
  const from = b.current_page || 0;
  let to = Math.max(0, Math.round(to_page ?? from));
  if (b.pages && to > b.pages) to = b.pages;
  const text = cleanLong(summary, 3000);
  const l = {
    id: uuid(), book_id, at: at || ts, from_page: from, to_page: to, pages: Math.max(0, to - from), summary: text,
    review_stage: 0, next_review_at: (at || ts) + REVIEW_GAPS[0] * DAY,
    created_at: ts, updated_at: 0, deleted: false,
  };
  state.logs.push(l);
  b.current_page = to;
  if (bookmark !== undefined) b.bookmark = clean(bookmark, 300);
  if (finished || (b.pages && to >= b.pages)) {
    if (!b.started_at) b.started_at = l.at;
    b.status = 'read';
    b.finished_at = l.at;
    if (b.pages) b.current_page = b.pages;
    b.bookmark = '';
  } else if (b.status !== 'reading') {
    b.status = 'reading';
    if (!b.started_at) b.started_at = l.at;
    b.finished_at = null;
  }
  if (b.started_at && l.at < b.started_at) b.started_at = l.at;
  await commit([['logs', l], ['books', b]]);
  return l;
}
export async function updateLog(id, { summary }) {
  const l = state.logs.find((x) => x.id === id);
  if (!l) return;
  l.summary = cleanLong(summary, 3000);
  await commit([['logs', l]]);
}
export async function removeLog(id, deleted = true) {
  const l = state.logs.find((x) => x.id === id);
  if (!l) return;
  l.deleted = deleted;
  await commit([['logs', l]]);
}

// ---------- quotes ----------
export const quotes = () => { const live = liveBookIds(); return state.quotes.filter((q) => !q.deleted && live.has(q.book_id)).sort((a, b) => b.created_at - a.created_at); };
export const quotesOf = (bookId) => state.quotes.filter((q) => !q.deleted && q.book_id === bookId)
  .sort((a, b) => (a.page ?? 1e9) - (b.page ?? 1e9) || a.created_at - b.created_at);
export const getQuote = (id) => state.quotes.find((q) => q.id === id && !q.deleted);

export async function addQuote({ book_id, text, page, note = '' }) {
  const t = cleanLong(text, 3000);
  if (!t || !getBook(book_id)) return null;
  const ts = now();
  const q = {
    id: uuid(), book_id, text: t, page: page > 0 ? Math.round(page) : null, note: clean(note, 500),
    review_stage: 0, next_review_at: ts + REVIEW_GAPS[0] * DAY,
    created_at: ts, updated_at: 0, deleted: false,
  };
  state.quotes.push(q);
  await commit([['quotes', q]]);
  return q;
}
export async function updateQuote(id, { text, page, note }) {
  const q = getQuote(id);
  if (!q) return;
  const t = cleanLong(text, 3000);
  if (t) q.text = t;
  q.page = page > 0 ? Math.round(page) : null;
  q.note = clean(note, 500);
  await commit([['quotes', q]]);
}
export async function removeQuote(id, deleted = true) {
  const q = state.quotes.find((x) => x.id === id);
  if (!q) return;
  q.deleted = deleted;
  await commit([['quotes', q]]);
}

// ---------- spaced review ----------
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };

/** Summaries and quotes whose turn has come, oldest first. */
export function dueReviews() {
  if (!state.settings.review) return [];
  const limit = endOfToday();
  const items = [];
  for (const q of quotes()) if (q.next_review_at <= limit) items.push({ kind: 'quote', item: q, book: getBook(q.book_id) });
  for (const l of logs()) if (l.summary && l.next_review_at <= limit) items.push({ kind: 'log', item: l, book: getBook(l.book_id) });
  return items.sort((a, b) => a.item.next_review_at - b.item.next_review_at);
}
/** remembered → next, longer gap. Not remembered → back to the start, shown again tomorrow. */
export async function answerReview(kind, id, remembered) {
  const storeName = kind === 'quote' ? 'quotes' : 'logs';
  const rec = state[storeName].find((x) => x.id === id);
  if (!rec) return;
  const noon = new Date(); noon.setHours(12, 0, 0, 0);
  if (remembered) {
    const gap = REVIEW_GAPS[Math.min(rec.review_stage + 1, REVIEW_GAPS.length - 1)];
    rec.review_stage = Math.min(rec.review_stage + 1, REVIEW_GAPS.length);
    rec.next_review_at = noon.getTime() + gap * DAY;
  } else {
    rec.review_stage = 0;
    rec.next_review_at = noon.getTime() + REVIEW_GAPS[0] * DAY;
  }
  await commit([[storeName, rec]]);
}

// ---------- lists ----------
export const lists = () => state.lists.filter((l) => !l.deleted).sort((a, b) => a.sort_order - b.sort_order || a.created_at - b.created_at);
export const getList = (id) => state.lists.find((l) => l.id === id && !l.deleted);
export const booksInList = (listId) => books().filter((b) => b.lists.includes(listId));

export async function addList(name) {
  const n = clean(name, 60);
  if (!n) return null;
  const ts = now();
  const l = { id: uuid(), name: n, sort_order: ts, created_at: ts, updated_at: 0, deleted: false };
  state.lists.push(l);
  await commit([['lists', l]]);
  return l;
}
export async function renameList(id, name) {
  const l = getList(id);
  const n = clean(name, 60);
  if (!l || !n) return;
  l.name = n;
  await commit([['lists', l]]);
}
export async function removeList(id) {
  const l = getList(id);
  if (!l) return;
  l.deleted = true;
  const pairs = [['lists', l]];
  for (const b of state.books) if (b.lists.includes(id)) { b.lists = b.lists.filter((x) => x !== id); pairs.push(['books', b]); }
  await commit(pairs);
}
export async function setBookLists(bookId, listIds) {
  const b = getBook(bookId);
  if (!b) return;
  const valid = new Set(lists().map((l) => l.id));
  b.lists = [...new Set(listIds)].filter((x) => valid.has(x));
  await commit([['books', b]]);
}

// ---------- loans ----------
export const loans = () => { const live = liveBookIds(); return state.loans.filter((l) => !l.deleted && live.has(l.book_id)).sort((a, b) => b.lent_at - a.lent_at); };
export const openLoans = () => loans().filter((l) => !l.returned_at);
export const activeLoan = (bookId) => state.loans.find((l) => !l.deleted && l.book_id === bookId && !l.returned_at) || null;
export const loansOf = (bookId) => state.loans.filter((l) => !l.deleted && l.book_id === bookId).sort((a, b) => b.lent_at - a.lent_at);

export async function lend({ book_id, person, lent_at, note = '' }) {
  const p = clean(person, 80);
  if (!p || !getBook(book_id) || activeLoan(book_id)) return null;
  const ts = now();
  const l = { id: uuid(), book_id, person: p, lent_at: lent_at || ts, returned_at: null, note: clean(note, 300), created_at: ts, updated_at: 0, deleted: false };
  state.loans.push(l);
  await commit([['loans', l]]);
  return l;
}
export async function returnLoan(id, returned = true) {
  const l = state.loans.find((x) => x.id === id);
  if (!l) return;
  l.returned_at = returned ? now() : null;
  await commit([['loans', l]]);
}
export async function removeLoan(id, deleted = true) {
  const l = state.loans.find((x) => x.id === id);
  if (!l) return;
  l.deleted = deleted;
  await commit([['loans', l]]);
}

// ---------- settings ----------
export async function updateSettings(patch) {
  Object.assign(state.settings, patch, { updated_at: now() });
  await db.put('settings', { key: 'settings', ...state.settings });
  emit('settings');
}

// ---------- backup ----------
export function counts() {
  return { books: books().length, logs: logs().length, quotes: quotes().length, lists: lists().length, loans: loans().length };
}

export function exportData() {
  const copy = (arr) => arr.map((x) => ({ ...x, ...(x.lists ? { lists: [...x.lists] } : {}) }));
  return {
    app: 'GeekBook',
    schema_version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    books: copy(state.books), logs: copy(state.logs), quotes: copy(state.quotes),
    lists: copy(state.lists), loans: copy(state.loans),
    settings: { ...state.settings },
  };
}

const ts = (v) => (v == null || v === '' ? null : typeof v === 'number' ? v : Date.parse(v) || null);
const int = (v, fallback = 0) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.round(+v) : fallback);
function base(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null;
  const created = ts(raw.created_at) ?? now();
  return { id: raw.id, created_at: created, updated_at: ts(raw.updated_at) ?? created, deleted: !!raw.deleted };
}
function normalizeBook(raw) {
  const b = base(raw);
  if (!b || typeof raw.title !== 'string' || !raw.title.trim()) return null;
  const pages = int(raw.pages, 0) > 0 ? int(raw.pages) : null;
  return {
    ...b, title: clean(raw.title), author: clean(raw.author, 200), translator: clean(raw.translator, 200),
    publisher: clean(raw.publisher, 200), genre: clean(raw.genre, 80), pages,
    status: STATUSES[raw.status] ? raw.status : 'shelf',
    current_page: Math.max(0, Math.min(int(raw.current_page), pages || 99999)), bookmark: clean(raw.bookmark, 300),
    started_at: ts(raw.started_at), finished_at: ts(raw.finished_at),
    rating: Math.max(0, Math.min(5, int(raw.rating))), review: cleanLong(raw.review, 4000), drop_reason: clean(raw.drop_reason, 300),
    price: int(raw.price, 0) > 0 ? int(raw.price) : null, priority: raw.priority ? 1 : 0, note: cleanLong(raw.note, 2000),
    color: Number.isInteger(raw.color) ? raw.color : null,
    lists: Array.isArray(raw.lists) ? raw.lists.filter((x) => typeof x === 'string') : [],
  };
}
function reviewFields(raw, from) {
  return { review_stage: Math.max(0, Math.min(REVIEW_GAPS.length, int(raw.review_stage))), next_review_at: ts(raw.next_review_at) ?? from + REVIEW_GAPS[0] * DAY };
}
function normalizeLog(raw) {
  const b = base(raw);
  if (!b || typeof raw.book_id !== 'string') return null;
  const at = ts(raw.at) ?? b.created_at;
  const from = Math.max(0, int(raw.from_page)), to = Math.max(0, int(raw.to_page));
  return { ...b, book_id: raw.book_id, at, from_page: from, to_page: to, pages: Math.max(0, int(raw.pages, Math.max(0, to - from))), summary: cleanLong(raw.summary, 3000), ...reviewFields(raw, at) };
}
function normalizeQuote(raw) {
  const b = base(raw);
  if (!b || typeof raw.book_id !== 'string' || typeof raw.text !== 'string' || !raw.text.trim()) return null;
  return { ...b, book_id: raw.book_id, text: cleanLong(raw.text, 3000), page: int(raw.page, 0) > 0 ? int(raw.page) : null, note: clean(raw.note, 500), ...reviewFields(raw, b.created_at) };
}
function normalizeList(raw) {
  const b = base(raw);
  if (!b || typeof raw.name !== 'string' || !raw.name.trim()) return null;
  return { ...b, name: clean(raw.name, 60), sort_order: typeof raw.sort_order === 'number' ? raw.sort_order : b.created_at };
}
function normalizeLoan(raw) {
  const b = base(raw);
  if (!b || typeof raw.book_id !== 'string' || typeof raw.person !== 'string' || !raw.person.trim()) return null;
  return { ...b, book_id: raw.book_id, person: clean(raw.person, 80), lent_at: ts(raw.lent_at) ?? b.created_at, returned_at: ts(raw.returned_at), note: clean(raw.note, 300) };
}
const NORMALIZERS = { books: normalizeBook, logs: normalizeLog, quotes: normalizeQuote, lists: normalizeList, loans: normalizeLoan };

/**
 * Merge an exported file. Records are matched by id; the one with the newer updated_at wins
 * (the same rule future sync will use), so importing the same file twice changes nothing.
 */
export async function importData(data) {
  if (!data || typeof data !== 'object' || data.app !== 'GeekBook' || !Array.isArray(data.books)) {
    throw new Error('این فایل پشتیبان GeekBook نیست.');
  }
  if ((data.schema_version || 1) > SCHEMA_VERSION) {
    throw new Error('این فایل با نسخه‌ی تازه‌تری از اپ ساخته شده.');
  }
  let added = 0, updated = 0, skipped = 0;
  const pairs = [];
  for (const name of db.DATA_STORES) {
    for (const raw of Array.isArray(data[name]) ? data[name] : []) {
      const rec = NORMALIZERS[name](raw);
      if (!rec) { skipped++; continue; }
      const existing = state[name].find((x) => x.id === rec.id);
      if (!existing) { state[name].push(rec); pairs.push([name, rec]); added++; }
      else if (rec.updated_at > existing.updated_at) { Object.assign(existing, rec); pairs.push([name, existing]); updated++; }
      else skipped++;
    }
  }
  await db.putAll(pairs);
  let settingsApplied = false;
  if (data.settings && typeof data.settings === 'object' && (data.settings.updated_at || 0) > (state.settings.updated_at || 0)) {
    const ok = {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in data.settings && typeof data.settings[k] === typeof DEFAULT_SETTINGS[k]) ok[k] = data.settings[k];
    Object.assign(state.settings, ok);
    await db.put('settings', { key: 'settings', ...state.settings });
    settingsApplied = true;
  }
  emit(settingsApplied ? 'settings' : 'data');
  return { added, updated, skipped, settingsApplied };
}
