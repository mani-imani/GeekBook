// Settings: every option is a toggle or a choice.
import * as store from '../store.js';
import { h, icon, toast, add } from '../ui.js';
import { exportFile, pickAndImport } from '../backup.js';
import { getMeta } from '../db.js';
import * as fmt from '../fmt.js';
import { APP_VERSION } from '../version.js';

// navy is the GeekMani brand color and the default; dark = the same hue made readable on the dark theme
export const ACCENTS = {
  navy: { name: 'سرمه‌ای', color: '#1F3A5F', dark: '#8DB1E0' },
  green: { name: 'سبز', color: '#2a7d58', dark: '#6FCB97' },
  coral: { name: 'مرجانی', color: '#c94a36', dark: '#f08a78' },
  indigo: { name: 'نیلی', color: '#5151c9', dark: '#a3a3f5' },
  amber: { name: 'کهربایی', color: '#a76a0a', dark: '#e3b04b' },
  teal: { name: 'فیروزه‌ای', color: '#0e7f8a', dark: '#5fc9d3' },
  graphite: { name: 'گرافیتی', color: '#55525e', dark: '#b6b3c0' },
};

let lastBackup = null, persisted = false, loaded = false;

const set = (patch) => store.updateSettings(patch);

function group(title, ...rows) {
  return h('section', { class: 'card set-group' }, h('h2', { class: 'card-title' }, title), ...rows.filter(Boolean));
}
function rowEl(label, control, hint) {
  return h('div', { class: 'set-row' },
    h('div', { class: 'set-label' }, h('span', {}, label), hint ? h('span', { class: 'muted small' }, hint) : null),
    h('div', { class: 'set-control' }, control));
}
function toggle(key, label, hint) {
  const id = `t-${key}`;
  const input = h('input', { type: 'checkbox', id, class: 'switch', role: 'switch' });
  input.checked = !!store.settings()[key];
  input.addEventListener('change', () => set({ [key]: input.checked }));
  return h('label', { class: 'set-row toggle-row', for: id },
    h('div', { class: 'set-label' }, h('span', {}, label), hint ? h('span', { class: 'muted small' }, hint) : null), input);
}
function seg(key, options, label, hint) {
  const cur = store.settings()[key];
  const ctl = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label },
    ...options.map(([v, text]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === cur), 'data-fk': `${key}:${v}`, onclick: () => set({ [key]: v }) }, text)));
  return rowEl(label, ctl, hint);
}
function stepper(key, label, { min, max, step = 1, unit = '', zero }, hint) {
  const v = store.settings()[key];
  const out = h('output', {}, v === 0 && zero ? zero : `${fmt.num(v)} ${unit}`);
  const ctl = h('div', { class: 'stepper' },
    h('button', { type: 'button', class: 'icon-btn', 'data-fk': `${key}:+`, 'aria-label': `بیشتر: ${label}`, html: icon('plus'), onclick: () => set({ [key]: Math.min(max, v + step) }), disabled: v >= max }),
    out,
    h('button', { type: 'button', class: 'icon-btn', 'data-fk': `${key}:-`, 'aria-label': `کمتر: ${label}`, html: icon('minus'), onclick: () => set({ [key]: Math.max(min, v - step) }), disabled: v <= min }));
  return rowEl(label, ctl, hint);
}

async function load() {
  lastBackup = await getMeta('lastBackupAt');
  persisted = navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  loaded = true;
  document.dispatchEvent(new CustomEvent('geekbook:render'));
}
document.addEventListener('geekbook:backup', () => { loaded = false; });

export function render(root) {
  if (!loaded) load();
  const s = store.settings();
  const c = store.counts();
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'رنگ تأکید' },
    ...Object.entries(ACCENTS).map(([k, a]) => h('button', {
      type: 'button', role: 'radio', class: 'swatch', 'data-fk': `accent:${k}`, 'aria-checked': String(k === s.accent), 'aria-label': a.name, title: a.name,
      style: { '--sw': a.color }, onclick: () => set({ accent: k }),
    })));
  const sizeInput = h('input', { type: 'range', min: 14, max: 22, step: 1, value: s.fontSize, 'aria-label': 'اندازه‌ی متن', class: 'range' });
  sizeInput.addEventListener('input', () => document.documentElement.style.setProperty('--fs', sizeInput.value + 'px'));
  sizeInput.addEventListener('change', () => set({ fontSize: +sizeInput.value }));

  add(root, h('section', { class: 'view view-settings' },
    h('header', { class: 'view-head' }, h('h1', {}, 'تنظیمات')),

    group('هدف‌ها',
      stepper('dailyPages', 'صفحه در روز', { min: 0, max: 300, step: 5, unit: 'صفحه', zero: 'بدون هدف' }, 'روزهای پیاپی با هر مقدار مطالعه حساب می‌شود، نه فقط با رسیدن به هدف.'),
      stepper('yearlyBooks', 'کتاب در سال', { min: 0, max: 200, step: 1, unit: 'کتاب', zero: 'بدون هدف' })),

    group('خواندن و مرور',
      toggle('askSummary', 'خلاصه از حفظ', 'موقع ثبت مطالعه، جای نوشتن دو سه خط خلاصه هست'),
      toggle('review', 'مرور', 'خلاصه‌ها و نقل‌قول‌ها بعد از یک روز، یک هفته، یک ماه و… برمی‌گردند'),
      h('a', { class: 'set-row link-row', href: '#/guide' },
        h('div', { class: 'set-label' }, h('span', {}, 'روش درست خواندن'), h('span', { class: 'muted small' }, 'چند کار ساده برای تمرکز بیشتر و به یاد ماندن کتاب')),
        h('span', { class: 'muted', html: icon('chevL') }))),

    group('ظاهر',
      seg('theme', [['system', 'سیستم'], ['light', 'روشن'], ['dark', 'تاریک']], 'تم'),
      rowEl('رنگ تأکید', swatches),
      seg('font', [['vazirmatn', 'وزیرمتن'], ['rounded', 'نقطه‌گرد'], ['system', 'سیستم']], 'فونت'),
      rowEl('اندازه‌ی متن', h('div', { class: 'range-wrap' }, h('span', { class: 'aa small' }, 'آ'), sizeInput, h('span', { class: 'aa big' }, 'آ'))),
      seg('digits', [['fa', '۱۲۳'], ['en', '123']], 'ارقام')),

    group('داده و پشتیبان',
      h('p', { class: 'muted small set-note' }, `${fmt.num(c.books)} کتاب، ${fmt.num(c.logs)} ثبت مطالعه، ${fmt.num(c.quotes)} نقل‌قول. همه فقط روی همین دستگاه‌اند.`),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', type: 'button', html: `${icon('download')}<span>خروجی JSON</span>`, onclick: () => exportFile() }),
        h('button', { class: 'btn', type: 'button', html: `${icon('upload')}<span>ورودی JSON</span>`, onclick: () => pickAndImport() })),
      h('p', { class: 'muted small set-note' }, lastBackup ? `آخرین پشتیبان: ${fmt.relativeDay(lastBackup)}.` : 'هنوز پشتیبان نگرفته‌ای.',
        ' خروجی بگیر تا اگر مرورگر داده‌ها را پاک کرد، از دست نروند. وارد کردن دوباره‌ی یک فایل چیزی را تکراری نمی‌کند.'),
      toggle('backupReminder', 'یادآوری پشتیبان‌گیری'),
      s.backupReminder ? stepper('backupDays', 'یادآوری بعد از', { min: 7, max: 120, step: 7, unit: 'روز' }) : null,
      rowEl('ذخیره‌ی پایدار', persisted
        ? h('span', { class: 'badge ok', html: `${icon('shield')}<span>فعال</span>` })
        : h('button', {
          class: 'btn btn-small', type: 'button',
          onclick: async () => {
            const ok = await navigator.storage?.persist?.().catch(() => false);
            toast(ok ? 'مرورگر قول داد داده‌ها را پاک نکند' : 'مرورگر اجازه نداد؛ پشتیبان‌گیری مهم‌تر می‌شود', { icon: 'shield', duration: 5000 });
            loaded = false; load();
          },
        }, 'درخواست'), 'جلوی پاک شدن خودکار داده‌ها به دست مرورگر را می‌گیرد'),
      toggle('installPrompt', 'پیشنهاد نصب روی صفحه'),
      standalone ? null : h('button', { class: 'btn btn-small', type: 'button', onclick: () => document.dispatchEvent(new CustomEvent('geekbook:install')) }, 'نصب GeekBook روی این دستگاه')),

    h('footer', { class: 'about muted small' },
      h('p', {}, 'GeekBook · نسخه‌ی ', h('bdi', {}, APP_VERSION)),
      h('p', {}, 'از ', h('a', { href: 'https://maniimani.ir', target: '_blank', rel: 'noopener' }, 'گیک‌مانی'), ' · ',
        h('a', { href: 'https://github.com/mani-imani/GeekBook', target: '_blank', rel: 'noopener' }, 'کد منبع'), ' · مجوز MIT'),
      h('p', {}, 'بدون سرور، بدون ردیابی. همه‌چیز روی دستگاه خودت.'))));
}
