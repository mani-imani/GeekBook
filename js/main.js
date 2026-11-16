// App shell: theming, routing, navigation, banners, service worker.
import * as store from './store.js';
import { getMeta, setMeta } from './db.js';
import { h, icon, toast, sheet, reducedMotion } from './ui.js';
import { exportFile } from './backup.js';
import * as fmt from './fmt.js';
import * as homeView from './views/home.js';
import * as libraryView from './views/library.js';
import * as bookView from './views/book.js';
import * as reviewView from './views/review.js';
import * as statsView from './views/stats.js';
import * as recapView from './views/recap.js';
import * as settingsView from './views/settings.js';
import * as guideView from './views/guide.js';
import { ACCENTS } from './views/settings.js';

// tabs, in order; then pages that open from a tab (they keep that tab lit)
const TABS = {
  '': { view: homeView, label: 'خانه', icon: 'home' },
  library: { view: libraryView, label: 'کتابخانه', icon: 'books' },
  review: { view: reviewView, label: 'مرور', icon: 'cards' },
  stats: { view: statsView, label: 'آمار', icon: 'chart' },
  settings: { view: settingsView, label: 'تنظیمات', icon: 'settings' },
};
const PAGES = {
  book: { view: bookView, tab: 'library', label: 'کتاب' },
  recap: { view: recapView, tab: 'stats', label: 'جمع‌بندی سال' },
  guide: { view: guideView, tab: 'settings', label: 'روش درست خواندن' },
};

const scrollPos = new Map(); // hash → scrollY
let current = null;          // { key, route, param }
let main, nav, dateEl, deferredInstall = null;
let navIndex = 0;            // position in this session's history (0 = entry page)
let shownDay = null;
const meta = { installDismissed: false, lastBackupAt: null, backupSnoozeUntil: 0, firstUseAt: null };

// ---------- theme / appearance ----------
const mqDark = window.matchMedia('(prefers-color-scheme: dark)');

function applyAppearance() {
  const s = store.settings();
  const root = document.documentElement;
  const dark = s.theme === 'dark' || (s.theme === 'system' && mqDark.matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.font = s.font;
  const acc = ACCENTS[s.accent] || ACCENTS.navy;
  root.style.setProperty('--accent-l', acc.color);
  root.style.setProperty('--accent-d', acc.dark || acc.color);
  root.style.setProperty('--fs', s.fontSize + 'px');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0E1217' : '#F4F4F0');
}
mqDark.addEventListener?.('change', () => store.settings().theme === 'system' && applyAppearance());

// ---------- routing ----------
function parseHash() {
  const [route = '', ...rest] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  const param = rest.length ? decodeURIComponent(rest.join('/')) : null;
  if (TABS[route] && !param) return { key: route, route, param: null };
  if (PAGES[route]) return { key: `${route}/${param ?? ''}`, route, param };
  return { key: '', route: '', param: null };
}
const defOf = (r) => TABS[r.route] || PAGES[r.route];

/** Draw the current route. `fresh` = arrived by navigation (animate, restore scroll); otherwise a data refresh. */
function render(fresh = false) {
  const r = parseHash();
  const leaving = current;
  const changed = !leaving || leaving.key !== r.key;
  if (changed && leaving) scrollPos.set(leaving.key, window.scrollY);
  const keepScroll = changed ? (scrollPos.get(r.key) || 0) : window.scrollY;
  // keep keyboard focus across a refresh (settings re-draw on every change)
  const ae = document.activeElement;
  const focusKey = !changed && ae && main.contains(ae) ? (ae.dataset.fk ? `[data-fk="${ae.dataset.fk}"]` : (ae.id ? `#${CSS.escape(ae.id)}` : null)) : null;

  current = r;
  const wrap = h('div', { class: 'view-wrap', 'data-route': r.route || 'home' });
  defOf(r).view.render(wrap, r.param);
  main.replaceChildren(wrap);
  if (r.route === '') renderBanners(homeView.banners());
  if (changed && fresh && !reducedMotion()) wrap.classList.add('view-in');
  window.scrollTo(0, keepScroll);
  if (focusKey) main.querySelector(focusKey)?.focus({ preventScroll: true });

  const tab = TABS[r.route] ? r.route : PAGES[r.route].tab;
  for (const b of nav.querySelectorAll('[data-route]')) {
    if (b.dataset.route === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  updateNavBadge();
  const d = defOf(r);
  document.title = r.route === '' ? 'GeekBook' : `${d.label} · GeekBook`;
  shownDay = fmt.dayKey(Date.now());
}

function buildNav() {
  nav.innerHTML = '';
  for (const [route, def] of Object.entries(TABS)) {
    nav.append(h('a', { href: `#/${route}`, class: 'tab', 'data-route': route, html: `${icon(def.icon)}<span class="tab-label">${def.label}</span>` }));
  }
}
function updateNavBadge() {
  const tab = nav.querySelector('[data-route="review"]');
  if (!tab) return;
  const n = store.dueReviews().length;
  tab.classList.toggle('has-badge', n > 0);
  tab.setAttribute('aria-label', n ? `مرور، ${fmt.num(n)} مورد برای امروز` : 'مرور');
}

function updateDate() {
  dateEl.textContent = fmt.fullDate(Date.now(), { withWeekday: true, withYear: false });
}

/** Track where we are in this session's history, so "back" buttons know if there is a page to go back to. */
function trackHistory() {
  if (history.state && typeof history.state.i === 'number') navIndex = history.state.i;
  else { navIndex += 1; history.replaceState({ i: navIndex }, ''); }
  window.__gbDepth = navIndex;
}

// ---------- banners (review, backup reminder, install) ----------
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /android/i.test(navigator.userAgent);
const isFirefoxDesktop = () => /firefox/i.test(navigator.userAgent) && !isAndroid();
const isMacSafari = () => !isIOS() && /macintosh/i.test(navigator.userAgent) && /safari/i.test(navigator.userAgent) && !/chrome|chromium|edg/i.test(navigator.userAgent);
/** Can this browser install the app at all (with its own prompt or by hand)? Firefox on desktop cannot. */
const canInstall = () => !isStandalone() && (deferredInstall || isIOS() || isAndroid() || !isFirefoxDesktop());

function renderBanners(slot) {
  if (!slot) return;
  slot.innerHTML = '';
  const s = store.settings();
  const bookCount = store.books().length;

  const due = store.dueReviews().length;
  if (due) {
    slot.append(banner({
      icon: 'cards',
      text: `${fmt.num(due)} مورد برای مرور امروز داری.`,
      actions: [{ label: 'مرور کن', primary: true, run: () => { location.hash = '#/review'; } }],
    }));
  }

  if (s.backupReminder && bookCount >= 3) {
    const since = meta.lastBackupAt || meta.firstUseAt || Date.now();
    const days = fmt.daysBetween(since, Date.now());
    if (days >= s.backupDays && Date.now() > meta.backupSnoozeUntil) {
      slot.append(banner({
        icon: 'download',
        text: meta.lastBackupAt ? `${fmt.num(days)} روز است که پشتیبان نگرفته‌ای.` : 'هنوز از کتابخانه‌ات پشتیبان نگرفته‌ای.',
        actions: [
          { label: 'خروجی بگیر', primary: true, run: () => exportFile() },
          { label: 'بعداً', run: async () => { meta.backupSnoozeUntil = Date.now() + 3 * fmt.DAY; await setMeta('backupSnoozeUntil', meta.backupSnoozeUntil); renderBanners(slot); } },
        ],
      }));
    }
  }

  // install suggestion, only when no other banner is showing
  if (!slot.childElementCount && s.installPrompt && !meta.installDismissed && canInstall()) {
    const dismiss = async () => { meta.installDismissed = true; await setMeta('installDismissed', true); renderBanners(slot); };
    slot.append(banner({
      icon: 'phone',
      text: 'GeekBook را می‌شود مثل یک اپ نصب کرد: تمام‌صفحه باز می‌شود و بدون اینترنت هم کار می‌کند.',
      actions: [{ label: deferredInstall ? 'نصب' : 'چطور؟', primary: true, run: async () => { if (await runInstall()) await dismiss(); else renderBanners(slot); } }],
      onClose: dismiss,
    }));
  }
}

async function runInstall() {
  if (deferredInstall) {
    const p = deferredInstall;
    deferredInstall = null;
    p.prompt();
    const { outcome } = await p.userChoice.catch(() => ({}));
    return outcome === 'accepted';
  }
  installGuide();
  return false;
}

function banner({ icon: ic, text, actions, onClose }) {
  return h('div', { class: 'banner', role: 'region', 'aria-label': text },
    h('span', { class: 'banner-ic', html: icon(ic) }),
    h('p', { class: 'banner-text' }, text),
    h('div', { class: 'banner-actions' },
      ...actions.map((a) => h('button', { type: 'button', class: `chip${a.primary ? ' chip-primary' : ''}`, onclick: a.run }, a.label)),
      onClose ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'بستن', html: icon('x'), onclick: onClose }) : null));
}

function installGuide() {
  const done = h('li', {}, 'حالا GeekBook مثل یک اپ روی صفحه‌ی اصلی است و بدون اینترنت هم کار می‌کند.');
  let title, steps;
  if (isIOS()) {
    title = 'نصب روی آیفون و آیپد';
    steps = [
      h('li', { html: `در نوار مرورگر (Safari یا Chrome) دکمه‌ی اشتراک‌گذاری ${icon('share', 'inline')} را بزن.` }),
      h('li', { html: `گزینه‌ی «<bdi>Add to Home Screen</bdi>» ${icon('addSquare', 'inline')} را انتخاب کن.` }),
      h('li', { html: 'بالای صفحه «<bdi>Add</bdi>» را بزن.' }), done];
  } else if (isAndroid()) {
    title = 'نصب روی اندروید';
    steps = [
      h('li', { html: 'منوی مرورگر (سه نقطه‌ی بالا یا پایین صفحه) را باز کن.' }),
      h('li', { html: 'گزینه‌ی «<bdi>Install app</bdi>» یا «<bdi>Add to Home screen</bdi>» را بزن.' }),
      h('li', { html: 'تأیید کن.' }), done];
  } else if (isMacSafari()) {
    title = 'نصب روی مک';
    steps = [
      h('li', { html: 'از منوی <bdi>File</bdi> گزینه‌ی «<bdi>Add to Dock</bdi>» را بزن.' }),
      h('li', { html: '«<bdi>Add</bdi>» را بزن. GeekBook در Dock و Launchpad می‌آید.' })];
  } else {
    title = 'نصب روی کامپیوتر';
    steps = [
      h('li', { html: 'در Chrome یا Edge، آیکون نصب را در انتهای نوار آدرس بزن.' }),
      h('li', { html: 'اگر آیکون نبود، از منوی مرورگر گزینه‌ی «<bdi>Install GeekBook</bdi>» را بزن.' }),
      h('li', {}, 'GeekBook در پنجره‌ی خودش باز می‌شود و میان برنامه‌های سیستم هم پیدا می‌شود.')];
  }
  sheet(h('ol', { class: 'guide' }, ...steps), { title, className: 'sheet-small' });
}

document.addEventListener('geekbook:install', () => { runInstall(); });
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  if (current?.route === '') renderBanners(homeView.banners());
});
window.addEventListener('appinstalled', async () => {
  deferredInstall = null;
  meta.installDismissed = true;
  await setMeta('installDismissed', true);
  if (current?.route === '') renderBanners(homeView.banners());
});
document.addEventListener('geekbook:backup', async () => {
  meta.lastBackupAt = await getMeta('lastBackupAt');
  render();
});

// ---------- service worker ----------
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let refreshing = false;
  // reload only for an update; the very first install also changes the controller and must not reload the page
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = (worker) => toast('نسخه‌ی تازه‌ی GeekBook آماده است', {
      action: 'به‌روزرسانی', duration: 15000, icon: 'download',
      onAction: () => worker.postMessage({ type: 'SKIP_WAITING' }),
    });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
    // check for updates when the app comes back to the foreground
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}

// ---------- keyboard-aware sheets ----------
// On phones the keyboard covers the bottom of the screen; --kb lifts sheets above it.
function watchKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty('--kb', (kb > 80 ? kb : 0) + 'px');
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  document.addEventListener('focusin', (e) => {
    if (!e.target.closest?.('.sheet') || !e.target.matches('input, textarea')) return;
    setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }), 320);
  });
}

// ---------- boot ----------
async function boot() {
  await store.init();
  applyAppearance();
  [meta.installDismissed, meta.lastBackupAt, meta.backupSnoozeUntil, meta.firstUseAt] = await Promise.all([
    getMeta('installDismissed', false), getMeta('lastBackupAt'), getMeta('backupSnoozeUntil', 0), getMeta('firstUseAt'),
  ]);
  if (!meta.firstUseAt) { meta.firstUseAt = Date.now(); await setMeta('firstUseAt', meta.firstUseAt); }

  main = document.getElementById('main');
  nav = document.getElementById('nav');
  dateEl = document.getElementById('today');
  buildNav();
  updateDate();
  if (!history.state || typeof history.state.i !== 'number') history.replaceState({ i: 0 }, '');
  navIndex = history.state.i;
  window.__gbDepth = navIndex;

  store.subscribe((kind) => {
    if (kind === 'settings') applyAppearance();
    render();
  });
  window.addEventListener('hashchange', () => { trackHistory(); render(true); });
  document.addEventListener('geekbook:render', () => render());
  document.addEventListener('geekbook:route', () => render(true));
  render(true);
  document.body.classList.add('ready');

  // "today", streaks and due reviews change at midnight: redraw when the day turns
  const tick = () => {
    if (document.visibilityState !== 'visible') return;
    if (fmt.dayKey(Date.now()) !== shownDay && !document.body.classList.contains('has-sheet')) { updateDate(); render(); }
  };
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', tick);

  // no pinch or double-tap zoom inside the app (text size lives in Settings)
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  watchKeyboard();
  registerSW();
  // ask the browser once to keep the data (granted quietly for installed apps)
  if (store.books().length && navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('main').innerHTML = '<div class="empty"><p class="empty-title">GeekBook باز نشد.</p><p class="muted">اگر در حالت ناشناس (Private) هستی، ممکن است مرورگر اجازه‌ی ذخیره‌سازی ندهد.</p></div>';
});
