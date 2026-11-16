// Library: every book, filtered by status, by one of my own lists, or by who has borrowed it.
import * as store from '../store.js';
import { h, icon, toast, actionSheet, add } from '../ui.js';
import * as fmt from '../fmt.js';
import { bookRow, stars, statusBadge, empty } from '../components.js';
import { bookSheet, listNameSheet, deleteList, returnLoan } from '../sheets.js';

// filter: 'all' | a status | 'list:<id>' | 'loans'
let filter = 'all';
export function setFilter(f) { filter = f; }

const ORDER = ['reading', 'shelf', 'read', 'dropped', 'wish'];

function sorted(list, by) {
  const a = [...list];
  if (by === 'read') return a.sort((x, y) => (y.finished_at || 0) - (x.finished_at || 0) || y.updated_at - x.updated_at);
  if (by === 'wish') return a.sort((x, y) => y.priority - x.priority || y.created_at - x.created_at);
  return a.sort((x, y) => y.updated_at - x.updated_at);
}

async function buy(book) {
  await store.setStatus(book.id, 'shelf');
  toast(`«${book.title}» به کتابخانه آمد`, { action: 'برگردان', icon: 'check', duration: 6000, onAction: () => store.setStatus(book.id, 'wish') });
}

function rowFor(book, context) {
  if (book.status === 'wish') {
    return bookRow(book, {
      sub: [book.author, book.price ? fmt.toman(book.price) : ''].filter(Boolean).join(' · '),
      below: book.priority ? h('span', { class: 'bk-tag is-accent' }, 'اولویت بالا') : null,
      side: h('button', { class: 'chip chip-small', type: 'button', onclick: () => buy(book) }, 'خریدم'),
    });
  }
  if (book.status === 'read') {
    return bookRow(book, {
      sub: [book.author, book.finished_at ? fmt.monthYear(book.finished_at) : ''].filter(Boolean).join(' · '),
      side: book.rating ? stars(book.rating, { size: 'small' }) : (context === 'mixed' ? statusBadge('read') : null),
    });
  }
  if (book.status === 'dropped') {
    return bookRow(book, { sub: [book.author, book.drop_reason].filter(Boolean).join(' · '), side: context === 'mixed' ? statusBadge('dropped') : null });
  }
  return bookRow(book, { side: context === 'mixed' && book.status !== 'reading' ? statusBadge(book.status) : null });
}

function chip(key, label, count) {
  return h('button', {
    type: 'button', class: 'fchip', role: 'tab', 'aria-selected': String(filter === key), 'data-f': key,
    onclick: () => { filter = key; document.dispatchEvent(new CustomEvent('geekbook:render')); },
  }, h('bdi', {}, label), count != null ? h('span', { class: 'fchip-n' }, fmt.num(count)) : null);
}

export function render(root) {
  const all = store.books();
  const lists = store.lists();
  const open = store.openLoans();
  if (filter.startsWith('list:') && !store.getList(filter.slice(5))) filter = 'all';
  if (filter === 'loans' && !open.length) filter = 'all';

  const view = h('section', { class: 'view view-library' },
    h('header', { class: 'view-head with-action' },
      h('h1', {}, 'کتابخانه'),
      h('button', { class: 'btn btn-primary btn-small', type: 'button', html: `${icon('plus')}<span>کتاب تازه</span>`, onclick: () => bookSheet({ status: ORDER.includes(filter) ? filter === 'dropped' ? 'shelf' : filter : 'shelf' }) })));
  add(root, view);

  if (!all.length) {
    add(view, empty({ ic: 'books', title: 'هنوز کتابی اضافه نکرده‌ای', text: 'کتاب‌هایی که داری، می‌خوانی، خوانده‌ای یا می‌خواهی بخری، همه این‌جا می‌آیند.' }));
    return;
  }

  // filters: statuses, then my lists and loans
  const statusRow = h('div', { class: 'fchips', role: 'tablist', 'aria-label': 'وضعیت' }, chip('all', 'همه', all.length),
    ...ORDER.map((s) => { const n = all.filter((b) => b.status === s).length; return n || filter === s ? chip(s, store.STATUSES[s].short, n) : null; }));
  const listRow = h('div', { class: 'fchips', role: 'tablist', 'aria-label': 'فهرست‌ها' },
    ...lists.map((l) => chip(`list:${l.id}`, l.name, store.booksInList(l.id).length)),
    open.length ? chip('loans', 'امانت‌ها', open.length) : null,
    h('button', { type: 'button', class: 'fchip fchip-add', html: `${icon('plus')}<span>فهرست تازه</span>`, onclick: () => listNameSheet(null, (l) => { if (l) { filter = `list:${l.id}`; document.dispatchEvent(new CustomEvent('geekbook:render')); } }) }));
  add(view, statusRow, listRow);

  const body = h('div', { class: 'lib-body' });
  add(view, body);

  if (filter === 'loans') {
    add(body, h('ul', { class: 'bk-list' }, ...open.map((loan) => {
      const book = store.getBook(loan.book_id);
      const days = fmt.daysBetween(loan.lent_at, Date.now());
      return bookRow(book, {
        sub: `دست ${loan.person} · ${days > 0 ? `${fmt.span(days)} است` : 'از امروز'}`,
        side: h('button', { class: 'chip chip-small', type: 'button', onclick: () => returnLoan(loan) }, 'پس گرفتم'),
      });
    })));
    return;
  }

  if (filter.startsWith('list:')) {
    const list = store.getList(filter.slice(5));
    const items = sorted(store.booksInList(list.id));
    add(body, h('div', { class: 'list-head' },
      h('span', { class: 'muted small' }, items.length ? `${fmt.num(items.length)} کتاب` : 'خالی'),
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': `گزینه‌های فهرست ${list.name}`, html: icon('more'),
        onclick: () => actionSheet(list.name, [
          { icon: 'edit', label: 'تغییر نام', run: () => listNameSheet(list) },
          { icon: 'trash', label: 'حذف فهرست', danger: true, run: () => deleteList(list, () => { filter = 'all'; }) },
        ]),
      })));
    if (!items.length) add(body, empty({ ic: 'list', title: 'این فهرست خالی است', text: 'صفحه‌ی هر کتاب را باز کن و از «فهرست‌ها» آن را به این‌جا اضافه کن.' }));
    else add(body, h('ul', { class: 'bk-list' }, ...items.map((b) => rowFor(b, 'mixed'))));
    return;
  }

  if (filter === 'all') {
    for (const s of ORDER) {
      const items = sorted(all.filter((b) => b.status === s), s);
      if (!items.length) continue;
      add(body, h('h2', { class: 'group-head' }, store.STATUSES[s].label, h('span', { class: 'count' }, fmt.num(items.length))),
        h('ul', { class: 'bk-list' }, ...items.map((b) => rowFor(b, 'group'))));
    }
    return;
  }

  const items = sorted(all.filter((b) => b.status === filter), filter);
  if (filter === 'wish' && items.length) {
    const sum = items.reduce((t, b) => t + (b.price || 0), 0);
    if (sum) add(body, h('p', { class: 'muted small lib-sum' }, `جمع قیمت‌ها: ${fmt.toman(sum)}`));
  }
  if (!items.length) add(body, empty({ ic: 'book', title: 'کتابی با این وضعیت نیست' }));
  else add(body, h('ul', { class: 'bk-list' }, ...items.map((b) => rowFor(b, 'single'))));
}
