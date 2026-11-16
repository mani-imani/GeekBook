// Home: what I am reading and where I stopped, today's goal, the streak.
import * as store from '../store.js';
import { h, icon, add } from '../ui.js';
import * as fmt from '../fmt.js';
import { pagesByDay, pagesToday, streaks, pace, percent, yearStats } from '../stats.js';
import { colorOf, progressBar, pageLine, byline, empty, sectionHead, bookRow } from '../components.js';
import { logSheet, quoteSheet, bookSheet } from '../sheets.js';

let bannerSlot = null;
export const banners = () => bannerSlot;

function ring(pct) {
  const r = 20, c = 2 * Math.PI * r;
  return h('span', {
    class: 'ring',
    html: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="ring-bg" cx="24" cy="24" r="${r}"/><circle class="ring-fg" cx="24" cy="24" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(1, pct))}" transform="rotate(-90 24 24)"/></svg>`,
  });
}

function today() {
  const s = store.settings();
  const byDay = pagesByDay();
  const pages = pagesToday(byDay);
  const st = streaks(byDay);
  const jy = fmt.jalaliYear();
  const ys = yearStats(jy);
  const tiles = [];
  tiles.push(h('a', { class: 'tile tile-today', href: '#/stats' },
    s.dailyPages ? ring(pages / s.dailyPages) : h('span', { class: 'tile-ic', html: icon('bookOpen') }),
    h('span', { class: 'tile-text' },
      h('span', { class: 'tile-value' }, s.dailyPages ? `${fmt.num(pages)} از ${fmt.num(s.dailyPages)}` : fmt.num(pages)),
      h('span', { class: 'tile-label muted' }, s.dailyPages && pages >= s.dailyPages ? 'هدف امروز کامل شد' : 'صفحه‌ی امروز'))));
  tiles.push(h('a', { class: 'tile', href: '#/stats' },
    h('span', { class: `tile-ic${st.current && st.readToday ? ' is-on' : ''}`, html: icon('flame') }),
    h('span', { class: 'tile-text' },
      h('span', { class: 'tile-value' }, `${fmt.num(st.current)} روز`),
      h('span', { class: 'tile-label muted' }, st.current && !st.readToday ? 'پیاپی · امروز مانده' : 'پیاپی'))));
  if (s.yearlyBooks) {
    tiles.push(h('a', { class: 'tile', href: `#/recap/${jy}` },
      h('span', { class: 'tile-ic', html: icon('target') }),
      h('span', { class: 'tile-text' },
        h('span', { class: 'tile-value' }, `${fmt.num(ys.finished.length)} از ${fmt.num(s.yearlyBooks)}`),
        h('span', { class: 'tile-label muted' }, `کتاب در ${fmt.num(jy)}`))));
  }
  return h('div', { class: `tiles tiles-${tiles.length}` }, ...tiles);
}

function nowCard(book) {
  const pct = percent(book);
  const p = pace(book);
  let paceLine = null;
  if (p) {
    if (p.days) paceLine = `با این روند حدود ${fmt.span(p.days)} دیگر تمام می‌شود · ${fmt.num(p.remaining)} صفحه مانده`;
    else paceLine = `${fmt.num(p.remaining)} صفحه مانده`;
  }
  const last = store.logsOf(book.id)[0];
  return h('article', { class: 'now', style: { '--c': colorOf(book) } },
    h('a', { class: 'now-cover', href: `#/book/${book.id}` },
      h('bdi', { class: 'now-title' }, book.title),
      byline(book) ? h('bdi', { class: 'now-by' }, byline(book)) : null),
    h('div', { class: 'now-body' },
      h('div', { class: 'now-progress' },
        h('span', { class: 'now-page' }, pageLine(book)),
        pct != null ? h('span', { class: 'now-pct' }, `${fmt.num(pct)}٪`) : null),
      pct != null ? progressBar(pct) : null,
      book.bookmark ? h('p', { class: 'now-mark' }, h('span', { class: 'now-mark-ic', html: icon('bookmark') }), h('span', {}, h('span', { class: 'muted small' }, 'کجا ماندم'), h('bdi', { class: 'now-mark-text' }, book.bookmark))) : null,
      paceLine || last ? h('p', { class: 'now-meta muted small' }, [paceLine, last ? `آخرین بار: ${fmt.relativeDay(last.at)}` : ''].filter(Boolean).join(' · ')) : null,
      h('div', { class: 'btn-row now-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', html: `${icon('bookOpen')}<span>ثبت مطالعه</span>`, onclick: () => logSheet(book) }),
        h('button', { class: 'btn', type: 'button', html: `${icon('quote')}<span>نقل‌قول</span>`, onclick: () => quoteSheet(book) }))));
}

/** One older quote a day, the same one all day. */
function dailyQuote() {
  const all = store.quotes();
  if (!all.length) return null;
  const dayNo = Math.floor(fmt.startOfDay(Date.now()) / fmt.DAY);
  const q = [...all].sort((a, b) => a.created_at - b.created_at)[dayNo % all.length];
  const book = store.getBook(q.book_id);
  return h('section', { class: 'card quote-day' },
    h('p', { class: 'quote-text', dir: 'auto' }, q.text),
    h('a', { class: 'quote-src muted small', href: `#/book/${book.id}` }, h('bdi', {}, book.title), q.page ? ` · صفحه‌ی ${fmt.num(q.page)}` : ''));
}

export function render(root) {
  const reading = store.booksByStatus('reading').sort((a, b) => b.updated_at - a.updated_at);
  const shelf = store.booksByStatus('shelf').sort((a, b) => b.updated_at - a.updated_at).slice(0, 3);
  const total = store.books().length;
  bannerSlot = h('div', { class: 'banners' });

  add(root, h('section', { class: 'view view-home' }, bannerSlot, total ? today() : null));
  const view = root.firstChild;

  if (!total) {
    add(view, empty({
      ic: 'books', title: 'کتابخانه‌ات خالی است',
      text: 'اولین کتاب را اضافه کن: فقط نام و مشخصاتش. بعد هر بار که خواندی، صفحه و جایی را که ماندی ثبت کن.',
      action: h('button', { class: 'btn btn-primary', type: 'button', html: `${icon('plus')}<span>افزودن کتاب</span>`, onclick: () => bookSheet({ status: 'reading' }) }),
    }));
    return;
  }

  add(view, sectionHead('می‌خوانم', h('button', { class: 'chip', type: 'button', html: `${icon('plus')}<span>کتاب تازه</span>`, onclick: () => bookSheet({ status: 'reading' }) })));
  if (reading.length) add(view, h('div', { class: 'now-list' }, ...reading.map(nowCard)));
  else {
    add(view, h('div', { class: 'card hint-card' },
      h('p', {}, 'الان کتابی در دست نداری.'),
      shelf.length ? h('p', { class: 'muted small' }, 'یکی از نخوانده‌ها را شروع کن:') : h('p', { class: 'muted small' }, 'از کتابخانه یکی را انتخاب کن یا کتاب تازه اضافه کن.'),
      shelf.length ? h('ul', { class: 'bk-list' }, ...shelf.map((b) => bookRow(b, {
        side: h('button', { class: 'chip chip-small', type: 'button', onclick: () => store.setStatus(b.id, 'reading') }, 'شروع'),
      }))) : null));
  }
  const dq = dailyQuote();
  if (dq) add(view, sectionHead('نقل‌قول امروز'), dq);
}
