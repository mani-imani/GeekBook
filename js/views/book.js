// One book: where I stopped, progress, status, summaries and quotes.
import * as store from '../store.js';
import { h, icon, actionSheet, segmented, add } from '../ui.js';
import * as fmt from '../fmt.js';
import { pace, percent, daysToFinish } from '../stats.js';
import { colorOf, progressBar, pageLine, stars, empty, backButton, goBack } from '../components.js';
import { bookSheet, logSheet, editLogSheet, quoteSheet, deleteQuote, rateSheet, statusSheet, loanSheet, returnLoan, bookListsSheet, deleteBook, textSheet } from '../sheets.js';
import { exportBook } from '../markdown.js';
import { quoteCard } from '../share.js';
import { setFilter } from './library.js';

const tabOf = new Map(); // book id → 'logs' | 'quotes'
const rerender = () => document.dispatchEvent(new CustomEvent('geekbook:render'));

function menu(book) {
  const loan = store.activeLoan(book.id);
  actionSheet(book.title, [
    { icon: 'edit', label: 'ویرایش مشخصات', run: () => bookSheet({ book }) },
    { icon: 'list', label: 'فهرست‌ها', run: () => bookListsSheet(book) },
    book.status !== 'wish' && (loan
      ? { icon: 'user', label: `پس گرفتم از ${loan.person}`, run: () => returnLoan(loan) }
      : { icon: 'user', label: 'امانت دادم', run: () => loanSheet(book) }),
    book.status !== 'wish' && { icon: 'star', label: 'امتیاز و نظر', run: () => rateSheet(book) },
    { icon: 'file', label: 'خروجی Markdown', run: () => exportBook(book) },
    { icon: 'trash', label: 'حذف کتاب', danger: true, run: () => deleteBook(book, () => goBack('#/library')) },
  ]);
}

function facts(book) {
  const items = [
    book.genre && ['tag', book.genre],
    book.publisher && ['book', book.publisher],
    book.pages && ['file', `${fmt.num(book.pages)} صفحه`],
  ].filter(Boolean);
  if (!items.length) return null;
  return h('div', { class: 'facts' }, ...items.map(([ic, text]) => h('span', { class: 'fact', html: icon(ic) }, h('bdi', {}, text))));
}

function statusBlock(book) {
  const box = h('section', { class: 'card book-state' });
  const statusBtn = h('button', { class: 'status-btn', type: 'button', 'aria-label': `وضعیت: ${store.STATUSES[book.status].label}. تغییر`, onclick: () => statusSheet(book) },
    h('span', { class: `status status-${book.status}` }, store.STATUSES[book.status].label), h('span', { class: 'status-change muted small' }, 'تغییر'));
  add(box, statusBtn);
  const pct = percent(book);

  if (book.status === 'reading') {
    const p = pace(book);
    add(box, 
      h('div', { class: 'now-progress' }, h('span', { class: 'now-page' }, pageLine(book)), pct != null ? h('span', { class: 'now-pct' }, `${fmt.num(pct)}٪`) : null),
      pct != null ? progressBar(pct) : null,
      book.bookmark ? h('p', { class: 'now-mark' }, h('span', { class: 'now-mark-ic', html: icon('bookmark') }), h('span', {}, h('span', { class: 'muted small' }, 'کجا ماندم'), h('bdi', { class: 'now-mark-text' }, book.bookmark))) : null,
      p ? h('p', { class: 'now-meta muted small' }, p.days
        ? `با این روند حدود ${fmt.span(p.days)} دیگر تمام می‌شود · روزی ${fmt.dec(p.perDay)} صفحه · ${fmt.num(p.remaining)} صفحه مانده`
        : `${fmt.num(p.remaining)} صفحه مانده · در دو هفته‌ی اخیر چیزی ثبت نشده`) : (!book.pages ? h('p', { class: 'now-meta muted small' }, 'تعداد صفحه را در «ویرایش مشخصات» بنویس تا پیشرفت و زمان پایان حساب شود.') : null),
      h('div', { class: 'btn-row now-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', html: `${icon('bookOpen')}<span>ثبت مطالعه</span>`, onclick: () => logSheet(book) }),
        h('button', { class: 'btn', type: 'button', html: `${icon('quote')}<span>نقل‌قول</span>`, onclick: () => quoteSheet(book) })));
  } else if (book.status === 'read') {
    const d = daysToFinish(book);
    add(box, 
      h('button', { class: 'rate-row', type: 'button', 'aria-label': 'امتیاز و نظر', onclick: () => rateSheet(book) },
        stars(book.rating, { size: 'big' }), h('span', { class: 'muted small' }, book.rating ? 'تغییر' : 'امتیاز بده')),
      book.review ? h('button', { class: 'my-review', type: 'button', dir: 'auto', onclick: () => textSheet('نظر من', book.review) }, book.review) : null,
      h('p', { class: 'now-meta muted small' }, [
        book.finished_at ? `پایان: ${fmt.fullDate(book.finished_at)}` : 'تاریخ پایان ثبت نشده',
        d ? `در ${fmt.span(d)}` : '',
      ].filter(Boolean).join(' · ')),
      h('div', { class: 'btn-row now-actions' },
        h('button', { class: 'btn', type: 'button', html: `${icon('quote')}<span>نقل‌قول</span>`, onclick: () => quoteSheet(book) })));
  } else if (book.status === 'dropped') {
    add(box, 
      h('p', { class: 'now-meta' }, book.drop_reason ? h('bdi', {}, book.drop_reason) : h('span', { class: 'muted' }, 'دلیلی نوشته نشده.')),
      h('p', { class: 'now-meta muted small' }, book.current_page ? `تا صفحه‌ی ${fmt.num(book.current_page)}${book.pages ? ` از ${fmt.num(book.pages)}` : ''} خوانده شد` : 'شروع نشده بود'),
      h('div', { class: 'btn-row now-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', html: `${icon('bookOpen')}<span>دوباره سراغش می‌روم</span>`, onclick: () => store.setStatus(book.id, 'reading') })));
  } else if (book.status === 'wish') {
    add(box, 
      h('p', { class: 'now-meta' }, [book.price ? fmt.toman(book.price) : 'قیمت ثبت نشده', book.priority ? 'اولویت بالا' : ''].filter(Boolean).join(' · ')),
      h('div', { class: 'btn-row now-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', html: `${icon('check')}<span>خریدم</span>`, onclick: () => store.setStatus(book.id, 'shelf') })));
  } else {
    add(box, 
      h('p', { class: 'now-meta muted' }, 'در کتابخانه است و هنوز شروع نشده.'),
      h('div', { class: 'btn-row now-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', html: `${icon('bookOpen')}<span>شروع می‌کنم</span>`, onclick: () => store.setStatus(book.id, 'reading') })));
  }
  return box;
}

function logItem(l) {
  const range = l.pages ? `صفحه‌ی ${fmt.num(l.from_page)} تا ${fmt.num(l.to_page)}` : `صفحه‌ی ${fmt.num(l.to_page)}`;
  return h('li', { class: 'entry' },
    h('button', { class: 'entry-btn', type: 'button', 'aria-label': 'ویرایش این ثبت', onclick: () => editLogSheet(l) },
      h('span', { class: 'entry-head' },
        h('span', { class: 'entry-date' }, fmt.dayLabel(l.at)),
        h('span', { class: 'muted small' }, l.pages ? `${range} · ${fmt.num(l.pages)} صفحه` : range)),
      l.summary ? h('span', { class: 'entry-text', dir: 'auto' }, l.summary) : null));
}

function quoteItem(q, book) {
  return h('li', { class: 'entry quote' },
    h('p', { class: 'quote-text', dir: 'auto' }, q.text),
    q.note ? h('p', { class: 'quote-note muted small', dir: 'auto' }, q.note) : null,
    h('div', { class: 'quote-foot' },
      h('span', { class: 'muted small' }, q.page ? `صفحه‌ی ${fmt.num(q.page)}` : ''),
      h('span', { class: 'quote-actions' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'ساخت کارت برای اشتراک', html: icon('share'), onclick: () => quoteCard(q, book) }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'ویرایش نقل‌قول', html: icon('edit'), onclick: () => quoteSheet(book, q) }),
        h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'حذف نقل‌قول', html: icon('trash'), onclick: () => deleteQuote(q) }))));
}

export function render(root, id) {
  const book = store.getBook(id);
  if (!book) {
    add(root, h('section', { class: 'view' },
      h('header', { class: 'view-head sub-head' }, backButton('#/library'), h('h1', {}, 'کتاب')),
      empty({ ic: 'book', title: 'این کتاب پیدا نشد', text: 'شاید حذف شده باشد.' })));
    return;
  }
  const logs = store.logsOf(book.id);
  const quotes = store.quotesOf(book.id);
  const loan = store.activeLoan(book.id);
  const lists = store.lists().filter((l) => book.lists.includes(l.id));
  const tab = tabOf.get(book.id) || (quotes.length && !logs.length ? 'quotes' : 'logs');

  const view = h('section', { class: 'view view-book', style: { '--c': colorOf(book) } },
    h('header', { class: 'view-head sub-head' },
      backButton('#/library', 'بازگشت به کتابخانه'),
      h('span', { class: 'sub-title muted small' }, 'کتاب'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'گزینه‌های کتاب', html: icon('more'), onclick: () => menu(book) })),
    h('div', { class: 'hero' },
      h('h1', { class: 'hero-title' }, h('bdi', {}, book.title)),
      book.author ? h('p', { class: 'hero-by' }, h('bdi', {}, book.author)) : null,
      book.translator ? h('p', { class: 'hero-tr' }, 'ترجمه‌ی ', h('bdi', {}, book.translator)) : null),
    facts(book));
  add(root, view);

  if (loan) {
    const days = fmt.daysBetween(loan.lent_at, Date.now());
    add(view, h('div', { class: 'banner loan-banner' },
      h('span', { class: 'banner-ic', html: icon('user') }),
      h('p', { class: 'banner-text' }, 'دست ', h('bdi', {}, loan.person), ` است · از ${fmt.shortDate(loan.lent_at)}${days > 0 ? ` (${fmt.span(days)})` : ''}`, loan.note ? h('span', { class: 'muted small loan-note' }, loan.note) : null),
      h('div', { class: 'banner-actions' }, h('button', { class: 'chip chip-primary', type: 'button', onclick: () => returnLoan(loan) }, 'پس گرفتم'))));
  }
  add(view, statusBlock(book));

  add(view, h('div', { class: 'list-chips' },
    ...lists.map((l) => h('a', { class: 'chip chip-small', href: '#/library', onclick: () => setFilter(`list:${l.id}`) }, h('bdi', {}, l.name))),
    h('button', { class: 'chip chip-small chip-ghost', type: 'button', html: `${icon('plus')}<span>${lists.length ? 'فهرست‌ها' : 'افزودن به فهرست'}</span>`, onclick: () => bookListsSheet(book) })));

  if (book.note) add(view, h('button', { class: 'card note-card', type: 'button', dir: 'auto', onclick: () => textSheet('یادداشت', book.note) }, book.note));

  if (book.status !== 'wish') {
    add(view, h('div', { class: 'book-tabs' },
      segmented([['logs', `ثبت‌ها ${logs.length ? fmt.num(logs.length) : ''}`.trim()], ['quotes', `نقل‌قول‌ها ${quotes.length ? fmt.num(quotes.length) : ''}`.trim()]], tab, (v) => { tabOf.set(book.id, v); rerender(); }, 'بخش')));
    if (tab === 'logs') {
      if (logs.length) add(view, h('ul', { class: 'entries' }, ...logs.map(logItem)));
      else add(view, empty({ ic: 'bookOpen', title: 'هنوز چیزی ثبت نشده', text: 'هر بار که کتاب را بستی، صفحه و یک خلاصه‌ی کوتاه ثبت کن.' }));
    } else if (quotes.length) add(view, h('ul', { class: 'entries' }, ...quotes.map((q) => quoteItem(q, book))));
    else add(view, empty({ ic: 'quote', title: 'نقل‌قولی نداری', text: 'جمله‌ای که می‌خواهی یادت بماند را با شماره‌ی صفحه نگه دار.', action: h('button', { class: 'btn', type: 'button', html: `${icon('plus')}<span>نقل‌قول تازه</span>`, onclick: () => quoteSheet(book) }) }));
  }

  const dates = [
    book.started_at ? `شروع: ${fmt.fullDate(book.started_at)}` : '',
    book.finished_at ? `پایان: ${fmt.fullDate(book.finished_at)}` : '',
    `افزوده‌شده: ${fmt.fullDate(book.created_at)}`,
  ].filter(Boolean);
  add(view, h('p', { class: 'book-dates muted small' }, dates.join(' · ')));
}
