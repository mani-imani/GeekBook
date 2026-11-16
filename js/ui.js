// Small UI toolkit: element builder, icons, toast, bottom sheet, confirm dialog.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val); else el.style[prop] = val;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Append children, skipping null/false (Element.append would print "null"). */
export function add(parent, ...children) {
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    parent.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return parent;
}

const P = {
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/>',
  addSquare: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  broom: '<path d="M19 3 11 11M8 12l4 4M3 21c1-4 3-7 5-9l4 4c-2 2-5 4-9 5z"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  dot: '<circle cx="12" cy="12" r="4"/>',
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  books: '<rect x="4" y="3.5" width="4.5" height="17" rx="1.2"/><rect x="9.75" y="6.5" width="4.5" height="14" rx="1.2"/><path d="m16.4 8.2 3.3-.9 3 12.2-3.3.9z"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/>',
  bookOpen: '<path d="M12 6.5C10.5 5 8 4.5 3 4.5v13c5 0 7.5.5 9 2 1.5-1.5 4-2 9-2v-13c-5 0-7.5.5-9 2z"/><path d="M12 6.5v13"/>',
  cards: '<rect x="3" y="7" width="14" height="13" rx="2.5"/><path d="M7.5 3.5H18.5A2.5 2.5 0 0 1 21 6v10"/>',
  quote: '<path d="M10 7H6.5A2.5 2.5 0 0 0 4 9.5V13h5v-3H6.5"/><path d="M9 13c0 2.5-1 4-3.5 4.5"/><path d="M20 7h-3.5A2.5 2.5 0 0 0 14 9.5V13h5v-3h-2.5"/><path d="M19 13c0 2.5-1 4-3.5 4.5"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
  bookmark: '<path d="M6.5 3.5h11v17L12 16.5l-5.5 4z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-3.6 3.4-5.5 7-5.5s6.4 1.9 7 5.5"/>',
  cart: '<path d="M3 4h2.5l2.2 10.5h10L20 7H6.3"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  flame: '<path d="M12 21c3.6 0 6-2.5 6-5.8 0-2.4-1.3-4.2-2.7-5.9-.3 1.4-1 2.3-2 2.8.3-3.2-.9-6.2-3.5-8.1.1 2.7-1 4.4-2.3 6C6.300 11.500 6 13.200 6 15.200 6 18.500 8.400 21 12 21z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  eye: '<path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z"/><circle cx="12" cy="12" r="2.800"/>',
  info: '<circle cx="12" cy="12" r="8.500"/><path d="M12 11v5.500M12 7.600v.1"/>',
  tag: '<path d="M3.500 12.500V4.500h8l9 9-8 8z"/><circle cx="8" cy="9" r="1.300"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
}
export const iconEl = (name, cls) => h('span', { class: 'ic-wrap', html: icon(name, cls) }).firstChild;

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- toast ----------
let toastTimer = null;
let currentToast = null;

export function toast(message, { action, onAction, duration = 3500, icon: ic } = {}) {
  const region = document.getElementById('toasts');
  dismissToast();
  const el = h('div', { class: 'toast', role: 'status' },
    ic ? h('span', { class: 'toast-ic', html: icon(ic) }) : null,
    h('span', { class: 'toast-msg' }, message));
  let progress = null;
  if (action) {
    const btn = h('button', { class: 'toast-btn', type: 'button' }, action);
    btn.addEventListener('click', () => { onAction?.(); dismissToast(); });
    el.append(btn);
    progress = h('span', { class: 'toast-progress' });
    progress.style.animationDuration = duration + 'ms';
    el.append(progress);
  }
  region.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  currentToast = el;
  toastTimer = setTimeout(dismissToast, duration);
  return { dismiss: dismissToast, el };
}

export function dismissToast() {
  clearTimeout(toastTimer);
  const el = currentToast;
  if (!el) return;
  currentToast = null;
  el.classList.remove('in');
  el.classList.add('out');
  setTimeout(() => el.remove(), 260);
}

// ---------- bottom sheet / dialog ----------
let openSheets = 0;

export function sheet(content, { title, onClose, className = '' } = {}) {
  const prevFocus = document.activeElement;
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const panel = h('div', { class: `sheet ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '' },
    h('div', { class: 'sheet-handle', 'aria-hidden': 'true' }),
    title ? h('div', { class: 'sheet-head' },
      h('h2', { class: 'sheet-title' }, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'بستن', html: icon('x'), onclick: () => close() })) : null,
    h('div', { class: 'sheet-body' }, content));
  const root = h('div', { class: 'sheet-root' }, backdrop, panel);
  document.body.append(root);
  openSheets++;
  document.body.classList.add('has-sheet');
  requestAnimationFrame(() => root.classList.add('in'));

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    root.classList.remove('in');
    root.classList.add('out');
    document.removeEventListener('keydown', onKey);
    const finish = () => {
      root.remove();
      if (--openSheets === 0) document.body.classList.remove('has-sheet');
      prevFocus?.focus?.({ preventScroll: true });
      onClose?.();
    };
    if (reducedMotion()) finish(); else setTimeout(finish, 300);
  }
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') { // simple focus trap
      const f = [...panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', close);

  // drag the handle/head down to dismiss (touch)
  let startY = null, dy = 0;
  const grab = panel.querySelector('.sheet-handle');
  const head = panel.querySelector('.sheet-head');
  for (const g of [grab, head].filter(Boolean)) {
    g.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      startY = e.clientY; dy = 0; panel.style.transition = 'none'; g.setPointerCapture(e.pointerId);
    });
    g.addEventListener('pointermove', (e) => {
      if (startY == null) return;
      dy = Math.max(0, e.clientY - startY);
      panel.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (startY == null) return;
      startY = null; panel.style.transition = ''; panel.style.transform = '';
      if (dy > 90) close();
    };
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
  }
  setTimeout(() => panel.querySelector('[autofocus], .sheet-head button, button')?.focus({ preventScroll: true }), 50);
  return { close, panel };
}

export function confirmDialog({ title, message, ok = 'تأیید', cancel = 'انصراف', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const body = h('div', { class: 'confirm' },
      message ? h('p', { class: 'muted' }, message) : null,
      h('div', { class: 'btn-row' },
        h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', autofocus: true, onclick: () => { answered = true; resolve(true); s.close(); } }, ok),
        h('button', { class: 'btn', type: 'button', onclick: () => { answered = true; resolve(false); s.close(); } }, cancel)));
    const s = sheet(body, { title, className: 'sheet-small', onClose: () => { if (!answered) resolve(false); } });
  });
}

// ---------- form helpers ----------
let fieldSeq = 0;

/**
 * A labelled field. Free text fields follow the direction of what is typed (dir="auto"),
 * so a Latin title in a Persian interface still reads correctly.
 * type: text | number | area
 */
export function field({ label, value = '', placeholder = '', type = 'text', hint, rows = 3, required = false, maxlength, autofocus = false }) {
  const id = `f${++fieldSeq}`;
  const common = { id, class: 'input', placeholder, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', autofocus: autofocus || null, maxlength: maxlength || null };
  let input;
  if (type === 'area') {
    input = h('textarea', { ...common, rows, dir: 'auto' });
    input.value = value ?? '';
  } else if (type === 'number') {
    // text + numeric keypad: lets Persian digits in, and iOS shows the number pad
    input = h('input', { ...common, type: 'text', inputmode: 'numeric', class: 'input input-num', dir: 'ltr' });
    input.value = value == null || value === '' ? '' : String(value);
  } else {
    input = h('input', { ...common, type: 'text', dir: 'auto', enterkeyhint: 'next' });
    input.value = value ?? '';
  }
  const el = h('div', { class: 'field' },
    h('label', { class: 'field-label', for: id }, label, required ? null : h('span', { class: 'field-opt' }, 'اختیاری')),
    input,
    hint ? h('p', { class: 'field-hint muted small' }, hint) : null);
  if (required) el.querySelector('.field-opt')?.remove();
  return { el, input, get value() { return input.value; }, invalid(msg) { el.classList.add('is-invalid'); input.focus(); if (msg) toast(msg, { icon: 'x' }); } };
}

/** A sheet holding a form: fields, then a primary button. onSubmit returns false to stay open. */
export function formSheet({ title, fields, submit = 'ذخیره', onSubmit, extra, danger }) {
  let s;
  let busy = false;
  const run = async (e) => {
    e?.preventDefault();
    if (busy) return;
    busy = true;
    try { if ((await onSubmit()) !== false) s.close(); } finally { busy = false; }
  };
  const form = h('form', { class: 'form', novalidate: true, onsubmit: run },
    ...fields.map((f) => (f && f.el) || f).filter(Boolean),
    h('div', { class: 'btn-row form-actions' },
      h('button', { class: 'btn btn-primary', type: 'submit' }, submit),
      extra || null,
      danger ? h('button', { class: 'btn btn-quiet-danger', type: 'button', onclick: () => { danger.run(() => s.close()); } }, danger.label) : null));
  // Enter in a single-line field moves on instead of submitting half a form
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.isComposing) return;
    const inputs = [...form.querySelectorAll('input, textarea')];
    const next = inputs[inputs.indexOf(e.target) + 1];
    if (next) { e.preventDefault(); next.focus(); }
  });
  s = sheet(form, { title });
  const first = form.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 80);
  return s;
}

/** Segmented choice. options: [[value, label], ...] */
export function segmented(options, value, onChange, label = '') {
  const el = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  const set = (v) => { for (const b of el.children) b.setAttribute('aria-checked', String(b.dataset.v === String(v))); };
  for (const [v, text] of options) {
    el.append(h('button', { type: 'button', role: 'radio', 'data-v': String(v), 'aria-checked': String(v === value), onclick: () => { set(v); onChange(v); } }, text));
  }
  return el;
}

/** A list of actions in a sheet. items: [{ icon, label, run, danger }] */
export function actionSheet(title, items) {
  let s;
  const body = h('div', { class: 'actions' }, ...items.filter(Boolean).map((it) => h('button', {
    type: 'button', class: `action${it.danger ? ' is-danger' : ''}`,
    onclick: () => { s.close(); setTimeout(() => it.run(), 60); },
  }, iconEl(it.icon || 'dot'), h('span', {}, it.label))));
  s = sheet(body, { title, className: 'sheet-small' });
  return s;
}
