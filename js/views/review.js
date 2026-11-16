// Review: summaries and quotes come back after a day, a week, a month…; plus every quote in one place.
import * as store from '../store.js';
import { h, icon, segmented, add } from '../ui.js';
import * as fmt from '../fmt.js';
import { empty } from '../components.js';
import { quoteSheet, deleteQuote } from '../sheets.js';
import { quoteCard } from '../share.js';

let tab = 'due';
let revealed = null; // id of the summary whose answer is showing
const rerender = () => document.dispatchEvent(new CustomEvent('geekbook:render'));

function nextDue() {
  if (!store.settings().review) return null;
  const all = [...store.quotes().map((q) => q.next_review_at), ...store.logs().filter((l) => l.summary).map((l) => l.next_review_at)];
  return all.length ? Math.min(...all) : null;
}

async function answer(entry, remembered) {
  revealed = null;
  await store.answerReview(entry.kind, entry.item.id, remembered);
}

function dueCard(entry, left) {
  const { kind, item, book } = entry;
  const isLog = kind === 'log';
  const open = !isLog || revealed === item.id;
  const where = isLog
    ? (item.pages ? `صفحه‌ی ${fmt.num(item.from_page)} تا ${fmt.num(item.to_page)}` : `صفحه‌ی ${fmt.num(item.to_page)}`)
    : (item.page ? `صفحه‌ی ${fmt.num(item.page)}` : '');
  return h('article', { class: `card review-card${isLog ? ' is-log' : ' is-quote'}` },
    h('div', { class: 'review-top' },
      h('span', { class: 'review-kind' }, isLog ? 'خلاصه' : 'نقل‌قول'),
      h('span', { class: 'muted small' }, left > 1 ? `${fmt.num(left)} مورد مانده` : 'آخرین مورد امروز')),
    h('a', { class: 'review-book', href: `#/book/${book.id}` }, h('bdi', {}, book.title)),
    h('p', { class: 'muted small review-where' }, [where, fmt.relativeDay(isLog ? item.at : item.created_at)].filter(Boolean).join(' · ')),
    isLog && !open ? h('p', { class: 'review-ask' }, 'از این بخش چه یادت مانده؟ اول خودت به یاد بیاور، بعد نوشته‌ات را ببین.') : null,
    open ? h('p', { class: isLog ? 'review-text' : 'quote-text', dir: 'auto' }, isLog ? item.summary : item.text) : null,
    open && !isLog && item.note ? h('p', { class: 'quote-note muted small', dir: 'auto' }, item.note) : null,
    open
      ? h('div', { class: 'btn-row review-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', html: `${icon('check')}<span>یادم بود</span>`, onclick: () => answer(entry, true) }),
        h('button', { class: 'btn', type: 'button', html: `${icon('undo')}<span>فردا دوباره</span>`, onclick: () => answer(entry, false) }))
      : h('div', { class: 'btn-row review-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', html: `${icon('eye')}<span>نشان بده</span>`, onclick: () => { revealed = item.id; rerender(); } })));
}

function quoteItem(q) {
  const book = store.getBook(q.book_id);
  return h('li', { class: 'entry quote' },
    h('p', { class: 'quote-text', dir: 'auto' }, q.text),
    q.note ? h('p', { class: 'quote-note muted small', dir: 'auto' }, q.note) : null,
    h('div', { class: 'quote-foot' },
      h('a', { class: 'quote-src muted small', href: `#/book/${book.id}` }, h('bdi', {}, book.title), q.page ? ` · صفحه‌ی ${fmt.num(q.page)}` : ''),
      h('span', { class: 'quote-actions' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'ساخت کارت برای اشتراک', html: icon('share'), onclick: () => quoteCard(q, book) }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'ویرایش نقل‌قول', html: icon('edit'), onclick: () => quoteSheet(book, q) }),
        h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'حذف نقل‌قول', html: icon('trash'), onclick: () => deleteQuote(q) }))));
}

export function dueCount() { return store.dueReviews().length; }

export function render(root) {
  const due = store.dueReviews();
  const quotes = store.quotes();
  const view = h('section', { class: 'view view-review' },
    h('header', { class: 'view-head' }, h('h1', {}, 'مرور')),
    h('div', { class: 'book-tabs' }, segmented([['due', `امروز ${due.length ? fmt.num(due.length) : ''}`.trim()], ['quotes', `نقل‌قول‌ها ${quotes.length ? fmt.num(quotes.length) : ''}`.trim()]], tab, (v) => { tab = v; revealed = null; rerender(); }, 'بخش')));
  add(root, view);

  if (tab === 'quotes') {
    if (quotes.length) add(view, h('ul', { class: 'entries' }, ...quotes.map(quoteItem)));
    else add(view, empty({ ic: 'quote', title: 'هنوز نقل‌قولی نداری', text: 'از صفحه‌ی هر کتاب، جمله‌هایی را که می‌خواهی بماند با شماره‌ی صفحه نگه دار.' }));
    return;
  }

  if (!store.settings().review) {
    add(view, empty({ ic: 'cards', title: 'مرور خاموش است', text: 'از تنظیمات روشنش کن تا خلاصه‌ها و نقل‌قول‌ها هر چند وقت یک‌بار برگردند.' }));
    return;
  }
  if (due.length) {
    add(view, dueCard(due[0], due.length));
    add(view, h('p', { class: 'muted small review-hint' }, '«یادم بود» فاصله‌ی بعدی را بیشتر می‌کند: یک روز، یک هفته، یک ماه، سه ماه، شش ماه.'));
    return;
  }
  const next = nextDue();
  add(view, empty({
    ic: 'check', title: 'برای امروز چیزی نمانده',
    text: next ? `مرور بعدی: ${fmt.relativeDay(next)}` : 'بعد از هر بار خواندن یک خلاصه‌ی کوتاه بنویس یا نقل‌قولی نگه دار؛ فردا برای مرور برمی‌گردد.',
  }));
}
