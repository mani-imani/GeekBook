// Stats: streak, goals, a Jalali heatmap of reading days, pages per month and a few numbers.
import * as store from '../store.js';
import { h, icon, toast, add } from '../ui.js';
import * as fmt from '../fmt.js';
import { dateToJalali, JALALI_MONTHS, WEEKDAYS_SHORT, satIndex } from '../jalali.js';
import { pagesByDay, pagesToday, streaks, yearStats, monthSeries, overall } from '../stats.js';
import { progressBar, empty } from '../components.js';

const WEEKS = 53;
// Which way time runs in the two charts. 'rtl': older on the right, newer on the left (reading order of Persian).
// 'ltr': older on the left, newer on the right (the usual chart order, also in Persian spreadsheets).
const TIME_FLOW = 'ltr';   // chosen by the owner (v1.0.2)

/** Size the reading-days map to its box: the whole year when it fits (desktop), otherwise whole weeks only, so no
 *  column is ever cut in half at an edge. Runs again when the box changes size. */
function fitHeat(wrap, scroller, grid) {
  const fit = () => {
    const gap = 3, pad = 3;
    const avail = wrap.clientWidth - wrap.firstChild.offsetWidth - 6 - pad * 2;
    if (avail <= 0) return;
    const whole = Math.min(15, Math.floor((avail + gap) / WEEKS) - gap);
    let cell, cols;
    if (whole >= 9) { cell = whole; cols = WEEKS; }
    else { cell = 14; cols = Math.max(4, Math.floor((avail + gap) / (cell + gap))); }
    wrap.style.setProperty('--cell', `${cell}px`);
    scroller.style.width = `${cols * (cell + gap) - gap + pad * 2}px`;
    scroller.scrollLeft = TIME_FLOW === 'rtl' ? -scroller.scrollWidth : scroller.scrollWidth;   // newest weeks in view
  };
  requestAnimationFrame(fit);
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(wrap);
}

function tile(label, value, sub, accent = false) {
  return h('div', { class: `kpi${accent ? ' kpi-accent' : ''}` },
    h('span', { class: 'kpi-label' }, label),
    h('span', { class: 'kpi-value' }, value),
    sub ? h('span', { class: 'kpi-sub muted' }, sub) : null);
}

function goalRow(label, value, goal, unit) {
  const pct = Math.min(100, Math.round((value / goal) * 100));
  return h('div', { class: 'goal' },
    h('div', { class: 'goal-top' }, h('span', {}, label), h('span', { class: 'muted small' }, `${fmt.num(value)} از ${fmt.num(goal)} ${unit}`)),
    progressBar(pct, label));
}

function heatmap(byDay) {
  const goal = store.settings().dailyPages || 20;
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - satIndex(start) - (WEEKS - 1) * 7); // Saturday, 52 weeks back
  const grid = h('div', { class: 'heat-grid' });
  const months = h('div', { class: 'heat-months', 'aria-hidden': 'true' });
  let prevMonth = null, prevW = -9;
  const d = new Date(start);
  for (let w = 0; w < WEEKS; w++) {
    const j = dateToJalali(d);
    // a month's name goes on the week it starts in; the first column only gets one when the next month is still
    // three weeks away, and two names are never closer than three weeks (they would overlap)
    const starts = j.jm !== prevMonth && (j.jd <= 7 || (w === 0 && j.jd <= 10));
    const label = starts && w - prevW >= 3 ? JALALI_MONTHS[j.jm - 1] : '';
    if (starts) prevMonth = j.jm;
    if (label) prevW = w;
    months.append(h('span', { class: 'heat-month' }, label));
    for (let i = 0; i < 7; i++) {
      const future = d > today;
      const key = fmt.dayKey(d.getTime());
      const pages = byDay.get(key) || 0;
      const r = pages / goal;
      const level = !pages ? 0 : r < 0.5 ? 1 : r < 1 ? 2 : r < 2 ? 3 : 4;
      grid.append(h('span', { class: `heat-cell${future ? ' is-future' : ''}${key === fmt.dayKey(today.getTime()) ? ' is-today' : ''}`, 'data-l': level, 'data-k': future ? null : key, 'data-p': pages }));
      d.setDate(d.getDate() + 1);
    }
  }
  grid.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-k]');
    if (!cell) return;
    const p = +cell.dataset.p;
    toast(`${fmt.fullDate(fmt.keyToTs(cell.dataset.k), { withWeekday: true })}: ${p ? `${fmt.num(p)} صفحه` : 'بدون مطالعه'}`, { duration: 2600 });
  });
  const scroller = h('div', { class: 'heat-scroll', tabindex: '0', role: 'img', 'aria-label': `نقشه‌ی روزهای مطالعه در یک سال اخیر: ${fmt.num(byDay.size)} روز` }, h('div', { class: 'heat-inner' }, months, grid));
  const wrap = h('div', { class: 'heat', dir: TIME_FLOW },
    h('div', { class: 'heat-days muted', 'aria-hidden': 'true' }, ...WEEKDAYS_SHORT.map((x, i) => h('span', {}, i % 2 === 0 ? x : ''))),
    scroller);
  fitHeat(wrap, scroller, grid);
  return wrap;
}

function monthChart(series) {
  const max = Math.max(1, ...series.map((m) => m.pages));
  const scroller = h('div', { class: 'months-scroll', dir: TIME_FLOW, tabindex: '0', role: 'img', 'aria-label': 'صفحه‌های خوانده‌شده در دوازده ماه اخیر' },
    h('div', { class: 'months' }, ...series.map((m, i) => h('div', { class: `month${m.current ? ' is-current' : ''}` },
      h('span', { class: 'month-val' }, m.pages ? fmt.grouped(m.pages) : ''),
      h('span', { class: 'month-bar-wrap' }, h('span', { class: 'month-bar', style: { '--h': `${Math.round((m.pages / max) * 100)}%`, '--d': `${i * 25}ms` } })),
      h('span', { class: 'month-lbl' }, m.label)))));
  requestAnimationFrame(() => { scroller.scrollLeft = TIME_FLOW === 'rtl' ? -scroller.scrollWidth : scroller.scrollWidth; });
  return scroller;
}

function ranked(title, items, unit = 'کتاب') {
  if (!items.length) return null;
  return h('div', { class: 'insight-block' }, h('h3', { class: 'insight-title' }, title),
    h('ol', { class: 'rank' }, ...items.map((it) => h('li', {}, h('bdi', {}, it.name), h('span', { class: 'muted small' }, `${fmt.num(it.count)} ${unit}`)))));
}

export function render(root) {
  const s = store.settings();
  const byDay = pagesByDay();
  const view = h('section', { class: 'view view-stats' }, h('header', { class: 'view-head' }, h('h1', {}, 'آمار')));
  add(root, view);
  if (!store.books().length) {
    add(view, empty({ ic: 'chart', title: 'هنوز آماری نیست', text: 'با اولین ثبت مطالعه، این صفحه پر می‌شود.' }));
    return;
  }
  const st = streaks(byDay);
  const today = pagesToday(byDay);
  const jy = fmt.jalaliYear();
  const ys = yearStats(jy);
  const all = overall();

  add(view, h('div', { class: 'kpis' },
    tile('روزهای پیاپی', fmt.num(st.current), st.best > st.current ? `بهترین: ${fmt.num(st.best)} روز` : (st.current ? 'بهترین رکوردت' : 'از امروز شروع کن'), true),
    tile('امروز', fmt.num(today), 'صفحه'),
    tile(`کتاب در ${fmt.num(jy)}`, fmt.num(ys.finished.length), `${fmt.grouped(ys.pages)} صفحه`),
    tile('همه‌ی صفحه‌ها', fmt.grouped(all.pages), `در ${fmt.num(all.days)} روز`)));

  if (s.dailyPages || s.yearlyBooks) {
    add(view, h('section', { class: 'card' }, h('h2', { class: 'card-title' }, 'هدف‌ها'),
      s.dailyPages ? goalRow('امروز', today, s.dailyPages, 'صفحه') : null,
      s.yearlyBooks ? goalRow(`سال ${fmt.num(jy)}`, ys.finished.length, s.yearlyBooks, 'کتاب') : null));
  }

  add(view, h('section', { class: 'card' },
    h('div', { class: 'chart-top' }, h('h2', { class: 'card-title' }, 'روزهای مطالعه'), h('span', { class: 'muted small' }, 'یک سال اخیر')),
    heatmap(byDay),
    h('div', { class: 'heat-legend muted small' }, h('span', {}, 'کمتر'), ...[0, 1, 2, 3, 4].map((l) => h('i', { class: 'heat-cell', 'data-l': l })), h('span', {}, 'بیشتر'))));

  add(view, h('section', { class: 'card' },
    h('div', { class: 'chart-top' }, h('h2', { class: 'card-title' }, 'صفحه در ماه'), h('span', { class: 'muted small' }, 'دوازده ماه اخیر')),
    monthChart(monthSeries(12))));

  const facts = [
    all.perActiveDay ? ['میانگین هر روز مطالعه', `${fmt.dec(all.perActiveDay)} صفحه`] : null,
    all.avgDays ? ['میانگین زمان تمام کردن یک کتاب', fmt.span(all.avgDays)] : null,
    all.avgRating ? ['میانگین امتیازها', `${fmt.dec(all.avgRating)} از ${fmt.num(5)}`] : null,
    ['نقل‌قول‌ها', fmt.num(all.quotes)],
  ].filter(Boolean);
  add(view, h('section', { class: 'card' }, h('h2', { class: 'card-title' }, 'در یک نگاه'),
    h('div', { class: 'status-counts' }, ...Object.entries(store.STATUSES).map(([k, v]) => h('span', { class: 'sc' }, h('b', {}, fmt.num(all.statusCounts[k])), h('span', { class: 'muted small' }, v.short)))),
    h('div', { class: 'insight-list' }, ...facts.map(([k, v]) => h('div', { class: 'insight' }, h('span', { class: 'muted' }, k), h('strong', {}, v)))),
    ranked('موضوع‌های پرتکرار', all.genres), ranked('نویسنده‌های پرتکرار', all.authors)));

  add(view, h('a', { class: 'card recap-link', href: `#/recap/${jy}` },
    h('span', { class: 'banner-ic', html: icon('star') }),
    h('span', { class: 'recap-link-text' }, h('b', {}, `جمع‌بندی سال ${fmt.num(jy)}`), h('span', { class: 'muted small' }, 'کتاب‌ها، صفحه‌ها و بهترین‌های سال، با تصویر برای اشتراک')),
    h('span', { class: 'muted', html: icon('chevL') })));
}
