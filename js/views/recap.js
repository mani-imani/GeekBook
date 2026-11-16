// Year recap: one Jalali year in numbers, with a share image.
import * as store from '../store.js';
import { h, icon, segmented, add } from '../ui.js';
import * as fmt from '../fmt.js';
import { yearStats, activeYears } from '../stats.js';
import { backButton, bookRow, stars, empty } from '../components.js';
import { recapCard } from '../share.js';

function big(value, label) {
  return h('div', { class: 'recap-num' }, h('span', { class: 'recap-value' }, value), h('span', { class: 'recap-label' }, label));
}

export function render(root, param) {
  const years = activeYears();
  let jy = parseInt(param, 10);
  if (!years.includes(jy)) jy = years[0];
  const s = yearStats(jy);
  const goal = store.settings().yearlyBooks;
  const isCurrent = jy === fmt.jalaliYear();

  const view = h('section', { class: 'view view-recap' },
    h('header', { class: 'view-head sub-head' }, backButton('#/stats', 'بازگشت به آمار'), h('span', { class: 'sub-title muted small' }, 'جمع‌بندی سال'), h('span', { class: 'icon-btn-space' })));
  add(root, view);
  if (years.length > 1) {
    add(view, h('div', { class: 'book-tabs' }, segmented(years.slice(0, 5).map((y) => [y, fmt.num(y)]), jy, (v) => { history.replaceState(history.state, '', `#/recap/${v}`); document.dispatchEvent(new CustomEvent('geekbook:route')); }, 'سال')));
  }

  add(view, h('div', { class: 'recap-hero' },
    h('p', { class: 'recap-kicker' }, isCurrent ? 'کتاب‌خوانی من تا امروز در سال' : 'کتاب‌خوانی من در سال'),
    h('p', { class: 'recap-year' }, fmt.num(jy), h('i', {})),
    h('div', { class: 'recap-grid' },
      big(fmt.num(s.finished.length), 'کتاب تمام‌شده'), big(fmt.grouped(s.pages), 'صفحه'),
      big(fmt.num(s.days), 'روز مطالعه'), big(fmt.num(s.bestStreak), 'روز پیاپی'))));

  if (!s.finished.length && !s.pages) {
    add(view, empty({ ic: 'star', title: 'برای این سال هنوز چیزی ثبت نشده', text: 'با ثبت مطالعه و تمام کردن کتاب‌ها، جمع‌بندی سال ساخته می‌شود.' }));
    return;
  }

  add(view, h('button', { class: 'btn btn-primary btn-wide', type: 'button', html: `${icon('share')}<span>ساخت تصویر برای اشتراک</span>`, onclick: () => recapCard(s) }));

  const lines = [
    goal && isCurrent ? ['هدف سال', `${fmt.num(s.finished.length)} از ${fmt.num(goal)} کتاب`] : null,
    s.bestMonth ? ['پرکارترین ماه', `${s.bestMonth.name} · ${fmt.grouped(s.bestMonth.pages)} صفحه`] : null,
    s.genres[0] ? ['موضوع پرتکرار', s.genres[0].name] : null,
    s.authors[0] && s.authors[0].count > 1 ? ['نویسنده‌ی پرتکرار', s.authors[0].name] : null,
    s.longest ? ['بلندترین کتاب', `${s.longest.title} · ${fmt.grouped(s.longest.pages)} صفحه`] : null,
    s.avgDays ? ['میانگین زمان هر کتاب', fmt.span(s.avgDays)] : null,
    s.avgRating ? ['میانگین امتیازها', `${fmt.dec(s.avgRating)} از ${fmt.num(5)}`] : null,
    s.quotes ? ['نقل‌قول‌های نگه‌داشته', fmt.num(s.quotes)] : null,
    s.summaries ? ['خلاصه‌های نوشته‌شده', fmt.num(s.summaries)] : null,
  ].filter(Boolean);
  if (lines.length) add(view, h('section', { class: 'card' }, h('div', { class: 'insight-list' }, ...lines.map(([k, v]) => h('div', { class: 'insight' }, h('span', { class: 'muted' }, k), h('strong', {}, h('bdi', {}, v)))))));

  if (s.favorite) {
    add(view, h('h2', { class: 'group-head' }, 'بهترین کتاب سال'),
      h('ul', { class: 'bk-list' }, bookRow(s.favorite, { side: stars(s.favorite.rating, { size: 'small' }) })));
  }
  if (s.finished.length) {
    add(view, h('h2', { class: 'group-head' }, 'کتاب‌های تمام‌شده', h('span', { class: 'count' }, fmt.num(s.finished.length))),
      h('ul', { class: 'bk-list' }, ...[...s.finished].reverse().map((b) => bookRow(b, {
        sub: [b.author, fmt.fullDate(b.finished_at, { withYear: false })].filter(Boolean).join(' · '),
        side: b.rating ? stars(b.rating, { size: 'small' }) : null,
      }))));
  }
}
