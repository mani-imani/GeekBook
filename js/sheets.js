// Every form in the app lives in a bottom sheet, built here.
import * as store from './store.js';
import { h, icon, toast, field, formSheet, segmented, actionSheet, confirmDialog, sheet, add } from './ui.js';
import * as fmt from './fmt.js';
import { dateToJalali, JALALI_MONTHS } from './jalali.js';
import { COLORS, colorIndex, starInput } from './components.js';
import { pagesToday } from './stats.js';

// ---------- small pieces ----------

/** Jalali date as three boxes (day, month, year). value → ms | null (empty) | undefined (invalid). */
function dateField({ label, value = null, hint }) {
  const j = value ? dateToJalali(new Date(value)) : null;
  const box = (ph, v, max, cls) => {
    const el = h('input', { type: 'text', inputmode: 'numeric', class: `input input-num ${cls}`, dir: 'ltr', placeholder: ph, maxlength: max, autocomplete: 'off', 'aria-label': `${label}: ${ph}` });
    el.value = v ?? '';
    return el;
  };
  const d = box('روز', j?.jd, 2, 'date-d'), m = box('ماه', j?.jm, 2, 'date-m'), y = box('سال', j?.jy, 4, 'date-y');
  const preview = h('span', { class: 'date-preview muted small' });
  const read = () => {
    const [jd, jm, jy] = [d, m, y].map((x) => fmt.parseInt10(x.value));
    if (jd == null && jm == null && jy == null) return null;
    return fmt.jalaliTs(jy, jm, jd) ?? undefined;
  };
  const paint = () => {
    const v = read();
    const jm = fmt.parseInt10(m.value);
    const filled = [d, m, y].every((x) => fmt.parseInt10(x.value) != null) && String(fmt.parseInt10(y.value)).length === 4;
    preview.textContent = v ? fmt.fullDate(v, { withWeekday: true }) : (v === undefined ? (filled ? 'چنین روزی در تقویم نیست' : (jm >= 1 && jm <= 12 ? JALALI_MONTHS[jm - 1] : '')) : '');
  };
  for (const x of [d, m, y]) x.addEventListener('input', paint);
  paint();
  const el = h('div', { class: 'field' },
    h('span', { class: 'field-label' }, label, h('span', { class: 'field-opt' }, 'اختیاری')),
    h('div', { class: 'date-row' }, d, m, y, preview),
    hint ? h('p', { class: 'field-hint muted small' }, hint) : null);
  return { el, get value() { return read(); }, focus: () => d.focus() };
}

function toggleRow(label, checked, hint) {
  const input = h('input', { type: 'checkbox', class: 'switch', role: 'switch' });
  input.checked = !!checked;
  const el = h('label', { class: 'set-row toggle-row' },
    h('div', { class: 'set-label' }, h('span', {}, label), hint ? h('span', { class: 'muted small' }, hint) : null), input);
  return { el, input, get value() { return input.checked; } };
}

function genreList() {
  const seen = new Map();
  for (const b of store.books()) if (b.genre) seen.set(b.genre, (seen.get(b.genre) || 0) + 1);
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]).slice(0, 12);
}

/** Text field with tappable suggestions under it (used for the genre). */
function suggestField(opts, suggestions) {
  const f = field(opts);
  if (suggestions.length) {
    add(f.el, h('div', { class: 'suggest-row' }, ...suggestions.map((s) => h('button', { type: 'button', class: 'chip chip-small', onclick: () => { f.input.value = s; } }, s))));
  }
  return f;
}

// ---------- book: add / edit ----------

export function bookSheet({ book = null, status = 'shelf', onSaved } = {}) {
  const editing = !!book;
  let st = editing ? book.status : status;
  let color = editing ? colorIndex(book) : null;

  const title = field({ label: 'عنوان کتاب', value: book?.title, required: true, autofocus: !editing, maxlength: 300 });
  const author = field({ label: 'نویسنده', value: book?.author, maxlength: 200 });
  const translator = field({ label: 'مترجم', value: book?.translator, maxlength: 200 });
  const publisher = field({ label: 'ناشر', value: book?.publisher, maxlength: 200 });
  const genre = suggestField({ label: 'موضوع', value: book?.genre, placeholder: 'مثلاً رمان، تاریخ، روان‌شناسی', maxlength: 80 }, genreList());
  const pages = field({ label: 'تعداد صفحه', value: book?.pages, type: 'number', hint: 'برای حساب پیشرفت و زمان پایان لازم است.', maxlength: 5 });
  const price = field({ label: 'قیمت (تومان)', value: book?.price, type: 'number', maxlength: 10 });
  const priority = toggleRow('اولویت بالا', book?.priority, 'بالای فهرست خرید می‌آید');
  const note = field({ label: 'یادداشت', value: book?.note, type: 'area', rows: 2, maxlength: 2000 });
  const started = dateField({ label: 'تاریخ شروع', value: book?.started_at });
  const finished = dateField({ label: 'تاریخ پایان', value: book?.finished_at, hint: 'اگر یادت نیست خالی بگذار.' });

  const statusOptions = editing
    ? Object.entries(store.STATUSES).map(([k, v]) => [k, v.short])
    : [['shelf', 'نخوانده'], ['reading', 'می‌خوانم'], ['read', 'خوانده'], ['wish', 'خرید']];
  const statusSeg = h('div', { class: 'field' },
    h('span', { class: 'field-label' }, 'وضعیت'),
    segmented(statusOptions, st, (v) => { st = v; sync(); }, 'وضعیت'));

  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'رنگ جلد' },
    ...COLORS.map((c, i) => h('button', {
      type: 'button', role: 'radio', class: 'swatch', 'aria-checked': String(i === color), 'aria-label': c.name, title: c.name, style: { '--sw': c.c },
      onclick: (e) => { color = i; for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-checked', String(b === e.currentTarget)); },
    })));
  const colorField = h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'رنگ جلد'), swatches);

  function sync() {
    price.el.hidden = priority.el.hidden = st !== 'wish';
    started.el.hidden = !(st === 'reading' || st === 'read' || st === 'dropped');
    finished.el.hidden = st !== 'read';
  }
  sync();

  return formSheet({
    title: editing ? 'ویرایش کتاب' : 'کتاب تازه',
    submit: editing ? 'ذخیره' : 'افزودن',
    fields: [title, author, translator, publisher, genre, pages, statusSeg, price, priority, started, finished, editing ? colorField : null, note],
    onSubmit: async () => {
      if (!title.value.trim()) { title.invalid('عنوان کتاب را بنویس.'); return false; }
      const s = started.el.hidden ? null : started.value, f = finished.el.hidden ? null : finished.value;
      if (s === undefined) { started.focus(); toast('تاریخ شروع درست نیست.', { icon: 'x' }); return false; }
      if (f === undefined) { finished.focus(); toast('تاریخ پایان درست نیست.', { icon: 'x' }); return false; }
      if (s && f && f < s) { finished.focus(); toast('تاریخ پایان پیش از تاریخ شروع است.', { icon: 'x' }); return false; }
      const info = {
        title: title.value, author: author.value, translator: translator.value, publisher: publisher.value, genre: genre.value,
        pages: fmt.parseInt10(pages.value) || 0, note: note.value,
        price: st === 'wish' ? fmt.parseInt10(price.value) || 0 : (book?.price || 0), priority: st === 'wish' ? priority.value : (book?.priority || 0),
      };
      if (editing) {
        await store.updateBook(book.id, { ...info, color });
        if (st !== book.status) await store.setStatus(book.id, st);
        // dates as typed (an empty box clears the date)
        const dates = {};
        const sameStatus = st === book.status; // after a status change an empty box means "set it for me"
        if (!started.el.hidden && (s || sameStatus)) dates.started_at = s;
        if (!finished.el.hidden && (f || sameStatus)) dates.finished_at = f;
        if (Object.keys(dates).length) await store.updateBook(book.id, dates);
        toast('ذخیره شد', { icon: 'check' });
        onSaved?.(book);
      } else {
        const opts = { ...info, status: st };
        if (!started.el.hidden && s) opts.started_at = s;
        if (st === 'read') opts.finished_at = f; // null → date unknown
        const b = await store.addBook(opts);
        toast(`«${b.title}» اضافه شد`, { icon: 'check' });
        onSaved?.(b);
      }
    },
  });
}

// ---------- reading entry ----------

export function logSheet(book, { onSaved } = {}) {
  const s = store.settings();
  const cur = book.current_page || 0;
  let day = 0; // 0 = today, 1 = yesterday
  const page = field({
    label: 'تا صفحه‌ی چند خواندی؟', value: '', type: 'number', required: true, autofocus: true, maxlength: 5, placeholder: cur ? String(fmt.num(cur)) : '',
    hint: book.pages ? `دفعه‌ی پیش: صفحه‌ی ${fmt.num(cur)} از ${fmt.num(book.pages)}` : (cur ? `دفعه‌ی پیش: صفحه‌ی ${fmt.num(cur)}` : 'شماره‌ی صفحه‌ای که الان رویش هستی.'),
  });
  const mark = field({ label: 'کجا ماندی؟', value: '', placeholder: book.bookmark || 'مثلاً: وسط فصل سه، بعد از ماجرای نامه', hint: 'یک خط، تا دفعه‌ی بعد زود سر جایت برگردی.', maxlength: 300 });
  const summary = field({ label: 'خلاصه از حفظ', type: 'area', rows: 3, placeholder: 'بدون نگاه به کتاب: چه خواندی؟', hint: 'دو سه خط به زبان خودت. بعداً برای مرور برمی‌گردد.', maxlength: 3000 });
  const done = toggleRow('کتاب تمام شد', false);
  const daySeg = h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'چه روزی؟'),
    segmented([[0, 'امروز'], [1, 'دیروز']], 0, (v) => { day = v; }, 'روز مطالعه'));
  const preview = h('p', { class: 'field-hint small log-preview', 'aria-live': 'polite' });
  add(page.el, preview);
  // "finished" switches itself on at the last page, and off again when the number is corrected
  // (a typo like 125 → 25 must not leave the book marked as finished); a tap on the switch is the user's own choice and stays.
  let autoDone = false;
  done.input.addEventListener('change', () => { autoDone = false; });
  page.input.addEventListener('input', () => {
    const to = fmt.parseInt10(page.value);
    const atEnd = to != null && book.pages && to >= book.pages;
    if (atEnd && !done.input.checked) { done.input.checked = true; autoDone = true; }
    else if (!atEnd && autoDone) { done.input.checked = false; autoDone = false; }
    if (to == null) { preview.textContent = ''; return; }
    if (atEnd) { preview.textContent = to > book.pages ? '' : 'به آخر کتاب رسیدی.'; return; }
    preview.textContent = to > cur ? `${fmt.num(to - cur)} صفحه خواندی.` : (to < cur ? 'کمتر از دفعه‌ی پیش است؛ صفحه‌ی فعلی اصلاح می‌شود.' : '');
  });

  return formSheet({
    title: 'ثبت مطالعه',
    submit: 'ثبت',
    fields: [h('p', { class: 'sheet-sub muted' }, h('bdi', {}, book.title)), page, daySeg, mark, s.askSummary ? summary : null, done],
    onSubmit: async () => {
      let to = fmt.parseInt10(page.value);
      const finishedNow = done.value;
      if (to == null) {
        if (finishedNow && book.pages) to = book.pages;
        else if (finishedNow || summary.value.trim() || mark.value.trim()) to = cur;
        else { page.invalid('شماره‌ی صفحه را بنویس.'); return false; }
      }
      if (book.pages && to > book.pages) { page.invalid(`این کتاب ${fmt.num(book.pages)} صفحه دارد.`); return false; }
      const at = day ? fmt.addDays(Date.now(), -1) : Date.now();
      const before = pagesToday();
      const l = await store.addLog({ book_id: book.id, to_page: to, at, summary: s.askSummary ? summary.value : '', bookmark: mark.value.trim() ? mark.value : undefined, finished: finishedNow });
      const fresh = store.getBook(book.id);
      if (fresh.status === 'read') {
        toast(`«${fresh.title}» تمام شد`, { icon: 'check', duration: 4000 });
        setTimeout(() => rateSheet(fresh), 350);
      } else {
        const goal = s.dailyPages;
        const after = pagesToday();
        const reached = goal && before < goal && after >= goal;
        toast(reached ? `هدف امروز کامل شد · ${fmt.num(after)} صفحه` : (l.pages ? `${fmt.num(l.pages)} صفحه ثبت شد` : 'ثبت شد'), { icon: reached ? 'target' : 'check' });
      }
      onSaved?.(l);
    },
  });
}

export function editLogSheet(log) {
  const summary = field({ label: 'خلاصه', value: log.summary, type: 'area', rows: 5, autofocus: true, maxlength: 3000, placeholder: 'بدون نگاه به کتاب: چه خواندی؟' });
  return formSheet({
    title: `${fmt.dayLabel(log.at)} · ${log.pages ? `${fmt.num(log.pages)} صفحه` : `صفحه‌ی ${fmt.num(log.to_page)}`}`,
    fields: [summary],
    onSubmit: async () => { await store.updateLog(log.id, { summary: summary.value }); },
    danger: {
      label: 'حذف این ثبت',
      run: async (close) => {
        close();
        await store.removeLog(log.id);
        toast('ثبت حذف شد', { action: 'برگردان', icon: 'trash', duration: 6000, onAction: () => store.removeLog(log.id, false) });
      },
    },
  });
}

// ---------- quotes ----------

export function quoteSheet(book, quote = null) {
  const text = field({ label: 'متن نقل‌قول', value: quote?.text, type: 'area', rows: 5, required: true, autofocus: !quote, maxlength: 3000 });
  const page = field({ label: 'صفحه', value: quote?.page ?? (quote ? '' : (book.current_page || '')), type: 'number', maxlength: 5 });
  const note = field({ label: 'یادداشت خودت', value: quote?.note, placeholder: 'چرا این را نگه داشتی؟', maxlength: 500 });
  return formSheet({
    title: quote ? 'ویرایش نقل‌قول' : 'نقل‌قول تازه',
    submit: quote ? 'ذخیره' : 'افزودن',
    fields: [h('p', { class: 'sheet-sub muted' }, h('bdi', {}, book.title)), text, page, note],
    onSubmit: async () => {
      if (!text.value.trim()) { text.invalid('متن نقل‌قول را بنویس.'); return false; }
      const p = fmt.parseInt10(page.value) || 0;
      if (book.pages && p > book.pages) { page.invalid(`این کتاب ${fmt.num(book.pages)} صفحه دارد.`); return false; }
      if (quote) await store.updateQuote(quote.id, { text: text.value, page: p, note: note.value });
      else { await store.addQuote({ book_id: book.id, text: text.value, page: p, note: note.value }); toast('نقل‌قول اضافه شد', { icon: 'quote' }); }
    },
  });
}

export async function deleteQuote(quote) {
  await store.removeQuote(quote.id);
  toast('نقل‌قول حذف شد', { action: 'برگردان', icon: 'trash', duration: 6000, onAction: () => store.removeQuote(quote.id, false) });
}

// ---------- rating, status ----------

export function rateSheet(book) {
  let rating = book.rating || 0;
  const review = field({ label: 'نظر کوتاه', value: book.review, type: 'area', rows: 3, placeholder: 'این کتاب برایت چه داشت؟', maxlength: 4000 });
  const starsField = h('div', { class: 'field field-stars' }, h('span', { class: 'field-label' }, 'امتیاز'), starInput(rating, (v) => { rating = v; }));
  return formSheet({
    title: 'امتیاز و نظر',
    fields: [h('p', { class: 'sheet-sub muted' }, h('bdi', {}, book.title)), starsField, review],
    onSubmit: async () => { await store.updateBook(book.id, { rating, review: review.value }); },
  });
}

export function dropSheet(book) {
  const reason = field({ label: 'چرا رها شد؟', value: book.drop_reason, placeholder: 'مثلاً: کُند بود، الان وقتش نیست', maxlength: 300, autofocus: true });
  return formSheet({
    title: 'رها کردن کتاب',
    submit: 'رها شد',
    fields: [h('p', { class: 'sheet-sub muted' }, 'کتابی که به کارت نمی‌آید را می‌شود کنار گذاشت. صفحه‌ی فعلی و یادداشت‌ها می‌مانند.'), reason],
    onSubmit: async () => { await store.setStatus(book.id, 'dropped', { drop_reason: reason.value }); toast('کتاب کنار گذاشته شد', { icon: 'pause' }); },
  });
}

export function statusSheet(book) {
  const go = async (status, msg) => { await store.setStatus(book.id, status); toast(msg, { icon: 'check' }); };
  const items = [
    book.status !== 'reading' && { icon: 'bookOpen', label: book.status === 'read' ? 'دوباره می‌خوانم' : 'می‌خوانم', run: () => go('reading', 'به «می‌خوانم» رفت') },
    book.status !== 'read' && { icon: 'check', label: 'خوانده‌ام', run: async () => { await store.setStatus(book.id, 'read'); toast('به «خوانده‌ام» رفت', { icon: 'check' }); setTimeout(() => rateSheet(store.getBook(book.id)), 350); } },
    book.status !== 'shelf' && { icon: 'book', label: book.status === 'wish' ? 'خریدم' : 'نخوانده', run: () => go('shelf', book.status === 'wish' ? 'به کتابخانه آمد' : 'به «نخوانده» رفت') },
    book.status !== 'dropped' && book.status !== 'wish' && { icon: 'pause', label: 'رها شد', run: () => dropSheet(book) },
    book.status !== 'wish' && { icon: 'cart', label: 'برای خرید', run: () => go('wish', 'به فهرست خرید رفت') },
  ];
  return actionSheet('وضعیت کتاب', items);
}

// ---------- loans ----------

export function loanSheet(book) {
  const person = field({ label: 'به چه کسی دادی؟', required: true, autofocus: true, maxlength: 80 });
  const when = dateField({ label: 'از چه روزی', value: Date.now() });
  const note = field({ label: 'یادداشت', maxlength: 300 });
  return formSheet({
    title: 'امانت دادن',
    submit: 'ثبت امانت',
    fields: [h('p', { class: 'sheet-sub muted' }, h('bdi', {}, book.title)), person, when, note],
    onSubmit: async () => {
      if (!person.value.trim()) { person.invalid('نام را بنویس.'); return false; }
      const at = when.value;
      if (at === undefined) { when.focus(); toast('تاریخ درست نیست.', { icon: 'x' }); return false; }
      if (at && at > Date.now() + fmt.DAY) { when.focus(); toast('تاریخ امانت در آینده است.', { icon: 'x' }); return false; }
      await store.lend({ book_id: book.id, person: person.value, lent_at: at || Date.now(), note: note.value });
      toast('امانت ثبت شد', { icon: 'user' });
    },
  });
}

export async function returnLoan(loan) {
  await store.returnLoan(loan.id);
  toast('کتاب برگشت', { action: 'برگردان', icon: 'check', duration: 6000, onAction: () => store.returnLoan(loan.id, false) });
}

// ---------- lists ----------

export function listNameSheet(list = null, onSaved) {
  const name = field({ label: 'نام فهرست', value: list?.name, required: true, autofocus: true, placeholder: 'مثلاً: رمان‌هایی که خوانده‌ام', maxlength: 60 });
  return formSheet({
    title: list ? 'تغییر نام فهرست' : 'فهرست تازه',
    submit: list ? 'ذخیره' : 'ساختن',
    fields: [name],
    onSubmit: async () => {
      if (!name.value.trim()) { name.invalid('نام فهرست را بنویس.'); return false; }
      if (list) { await store.renameList(list.id, name.value); onSaved?.(list); }
      else { const l = await store.addList(name.value); onSaved?.(l); }
    },
  });
}

export async function deleteList(list, onDone) {
  const n = store.booksInList(list.id).length;
  const ok = await confirmDialog({
    title: `حذف «${list.name}»`,
    message: n ? `فقط فهرست حذف می‌شود؛ ${fmt.num(n)} کتابِ آن در کتابخانه می‌ماند.` : 'این فهرست خالی است.',
    ok: 'حذف فهرست', danger: true,
  });
  if (!ok) return;
  await store.removeList(list.id);
  toast('فهرست حذف شد', { icon: 'trash' });
  onDone?.();
}

/** Pick which lists a book belongs to. */
export function bookListsSheet(book) {
  const chosen = new Set(book.lists);
  const box = h('div', { class: 'checks' });
  const draw = () => {
    box.innerHTML = '';
    const all = store.lists();
    if (!all.length) add(box, h('p', { class: 'muted' }, 'هنوز فهرستی نساخته‌ای. فهرست یعنی دسته‌ای به سلیقه‌ی خودت، مثل «کتاب‌هایی که عاشقشانم».'));
    for (const l of all) {
      const input = h('input', { type: 'checkbox', class: 'check-input' });
      input.checked = chosen.has(l.id);
      input.addEventListener('change', () => { if (input.checked) chosen.add(l.id); else chosen.delete(l.id); });
      add(box, h('label', { class: 'check-row' }, input, h('bdi', {}, l.name), h('span', { class: 'muted small' }, fmt.num(store.booksInList(l.id).length))));
    }
  };
  draw();
  const newList = h('button', { type: 'button', class: 'btn', html: `${icon('plus')}<span>فهرست تازه</span>`, onclick: () => listNameSheet(null, (l) => { if (l) chosen.add(l.id); draw(); }) });
  return formSheet({
    title: 'فهرست‌های این کتاب',
    fields: [box],
    extra: newList,
    onSubmit: async () => { await store.setBookLists(book.id, [...chosen]); },
  });
}

// ---------- delete a book ----------

export async function deleteBook(book, onDone) {
  const ok = await confirmDialog({
    title: `حذف «${book.title}»`,
    message: 'کتاب با خلاصه‌ها و نقل‌قول‌هایش از اپ می‌رود. تا چند ثانیه می‌شود برش گرداند.',
    ok: 'حذف کتاب', danger: true,
  });
  if (!ok) return;
  await store.removeBook(book.id);
  onDone?.();
  toast('کتاب حذف شد', { action: 'برگردان', icon: 'trash', duration: 8000, onAction: () => store.restoreBook(book.id) });
}

/** Read-only text in a sheet (long review, note). */
export function textSheet(title, text) {
  return sheet(h('p', { class: 'long-text', dir: 'auto' }, text), { title });
}
