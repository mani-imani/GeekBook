// Pieces shared by several views: book colors, rows, stars, progress.
import * as store from './store.js';
import { h, icon } from './ui.js';
import * as fmt from './fmt.js';
import { percent } from './stats.js';

// Cover colors: quiet, readable with white text in both themes. Navy first (brand).
export const COLORS = [
  { name: 'سرمه‌ای', c: '#1F3A5F' }, { name: 'سبز تیره', c: '#2F6B52' }, { name: 'زرشکی', c: '#7A2E3A' },
  { name: 'خردلی', c: '#8F6418' }, { name: 'کله‌غازی', c: '#1F6670' }, { name: 'بنفش', c: '#5A3B6E' },
  { name: 'زغالی', c: '#434953' }, { name: 'آجری', c: '#9A4A30' }, { name: 'زیتونی', c: '#556229' },
  { name: 'آبی', c: '#2C5A94' },
];
function hash(s) { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x; }
export const colorIndex = (book) => (Number.isInteger(book.color) && COLORS[book.color] ? book.color : hash(book.id) % COLORS.length);
export const colorOf = (book) => COLORS[colorIndex(book)].c;

/** First letter of the title, for the small cover. Skips quotes, digits and the Arabic article. */
export function initial(title) {
  const m = String(title).match(/[\p{L}]/u);
  return m ? m[0].toLocaleUpperCase() : '•';
}

export function cover(book, cls = '') {
  return h('span', { class: `cover ${cls}`, style: { '--c': colorOf(book) }, 'aria-hidden': 'true' }, initial(book.title));
}

export function stars(rating, { size = '' } = {}) {
  const el = h('span', { class: `stars ${size}`, role: 'img', 'aria-label': rating ? `امتیاز ${fmt.num(rating)} از ${fmt.num(5)}` : 'بدون امتیاز' });
  for (let i = 1; i <= 5; i++) el.append(h('span', { class: `star${i <= rating ? ' on' : ''}`, html: icon('star') }));
  return el;
}

/** Tappable stars. onChange(n); tapping the current value clears it. */
export function starInput(value, onChange) {
  const el = h('div', { class: 'stars stars-input', role: 'radiogroup', 'aria-label': 'امتیاز' });
  const paint = () => { [...el.children].forEach((b, i) => { b.classList.toggle('on', i < value); b.setAttribute('aria-checked', String(i + 1 === value)); }); };
  for (let i = 1; i <= 5; i++) {
    el.append(h('button', { type: 'button', class: 'star', role: 'radio', 'aria-label': `${fmt.num(i)} ستاره`, html: icon('star'), onclick: () => { value = value === i ? 0 : i; paint(); onChange(value); } }));
  }
  paint();
  return el;
}

export function progressBar(pct, label) {
  return h('span', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': label || 'پیشرفت' },
    h('span', { class: 'bar-fill', style: { '--p': pct + '%' } }));
}

/** "صفحه‌ی ۱۴۰ از ۳۲۰" or just the page when the total is unknown. */
export function pageLine(book) {
  const cur = book.current_page || 0;
  if (book.pages) return `صفحه‌ی ${fmt.num(cur)} از ${fmt.num(book.pages)}`;
  return cur ? `تا صفحه‌ی ${fmt.num(cur)}` : 'هنوز شروع نشده';
}

export function byline(book) {
  return [book.author, book.translator ? `ترجمه‌ی ${book.translator}` : ''].filter(Boolean).join(' · ');
}

/** A library row. `side` and `sub` let each list show what matters there. */
export function bookRow(book, { sub, side, below } = {}) {
  const pct = percent(book);
  const loan = store.activeLoan(book.id);
  const subText = sub ?? (book.author || book.genre || '');
  return h('li', { class: 'bk' },
    h('a', { class: 'bk-link', href: `#/book/${book.id}` },
      cover(book),
      h('span', { class: 'bk-main' },
        h('bdi', { class: 'bk-title' }, book.title),
        subText ? h('bdi', { class: 'bk-sub muted' }, subText) : null,
        book.status === 'reading' && pct != null ? h('span', { class: 'bk-progress' }, progressBar(pct), h('span', { class: 'bk-pct muted' }, `${fmt.num(pct)}٪`)) : null,
        loan ? h('span', { class: 'bk-tag' }, `دست ${loan.person}`) : null,
        below || null)),
    side ? h('span', { class: 'bk-side' }, side) : null);
}

export function statusBadge(status) {
  return h('span', { class: `status status-${status}` }, store.STATUSES[status].short);
}

export function empty({ ic = 'book', title, text, action }) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-mark', html: icon(ic) }),
    h('p', { class: 'empty-title' }, title),
    text ? h('p', { class: 'muted' }, text) : null,
    action ? h('div', { class: 'empty-action' }, action) : null);
}

export function sectionHead(title, right) {
  return h('div', { class: 'sec-head' }, h('h2', { class: 'sec-title' }, title), right || null);
}

/** Go back inside the app; falls back to a parent route when there is no in-app history. */
export function goBack(fallback = '#/') {
  if (window.__gbDepth > 0) history.back(); else location.hash = fallback;
}
export function backButton(fallback, label = 'بازگشت') {
  return h('button', { type: 'button', class: 'icon-btn back', 'aria-label': label, html: icon('chevR'), onclick: () => goBack(fallback) });
}
