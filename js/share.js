// Share images, drawn on a canvas: a quote card and the year recap.
import { h, icon, sheet, toast, segmented } from './ui.js';
import * as fmt from './fmt.js';
import { download, shareFile, canShareFile, slug } from './files.js';

const FONT = "'Vazirmatn', system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif";
const SIZES = { post: [1080, 1350], story: [1080, 1920], square: [1080, 1080] };
const THEMES = {
  paper: { bg: '#F4F4F0', text: '#1A1D22', muted: '#5F646B', brand: '#1F3A5F', line: '#D9D9D2', signal: '#2F7A55', soft: 'rgba(31,58,95,.10)' },
  navy: { bg: '#1F3A5F', text: '#FFFFFF', muted: '#B9CBE2', brand: '#A9C6EC', line: 'rgba(255,255,255,.22)', signal: '#6FCB97', soft: 'rgba(255,255,255,.10)' },
  dark: { bg: '#0E1217', text: '#E9ECEF', muted: '#97A1AD', brand: '#8DB1E0', line: '#253040', signal: '#6FCB97', soft: 'rgba(141,177,224,.12)' },
};

async function fontsReady() {
  try {
    await Promise.all([400, 600, 800].map((w) => document.fonts.load(`${w} 40px Vazirmatn`, 'آزمایش Geek ۱۲۳')));
  } catch { /* draw with the fallback font */ }
}

const isRtl = (s) => {
  const rtl = (s.match(/[֐-ࣿיִ-ﻼ]/g) || []).length;
  const ltr = (s.match(/[A-Za-zÀ-ɏЀ-ӿ]/g) || []).length;
  return rtl >= ltr;
};

/** Break text into lines that fit `maxWidth` with the current ctx.font. Keeps the author's line breaks. */
function wrap(ctx, text, maxWidth) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let line = '';
    for (let w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width <= maxWidth) { line = test; continue; }
      if (line) lines.push(line);
      // a single word wider than the line: break it by characters
      while (ctx.measureText(w).width > maxWidth && w.length > 1) {
        let cut = w.length - 1;
        while (cut > 1 && ctx.measureText(w.slice(0, cut)).width > maxWidth) cut--;
        lines.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      line = w;
    }
    lines.push(line);
    lines.ends = (lines.ends || new Set()).add(lines.length - 1);
  }
  return lines;
}

/** Draw wrapped text; x is the inline-start edge for the text's own direction. Returns the y after the block.
 *  With `justify` (v1.0.2), Persian text is set justified like a printed book: every line except the last line of a
 *  paragraph is stretched to the full width by widening the spaces. Latin words that follow each other stay together
 *  as one piece, so their order is kept. English quotes are left as they are: their lines are short and would get
 *  big holes. A line that would need a gap wider than MAX_GAP spaces is left as it is. */
const MAX_GAP = 4;   // widest gap, in spaces, a justified line may get
function pieces(line) {
  const out = [];
  for (const w of line.split(' ').filter(Boolean)) {
    const latin = /[A-Za-z]/.test(w);
    if (latin && out.length && out[out.length - 1].latin) out[out.length - 1].text += ` ${w}`;
    else out.push({ text: w, latin });
  }
  return out;
}
/** Gap (in spaces) each line would need; Infinity for a lone word that is not a paragraph end. */
function worstGap(ctx, lines, ends, width) {
  const space = ctx.measureText(' ').width;
  let worst = 0;
  lines.forEach((line, i) => {
    if (ends.has(i)) return;
    const pc = pieces(line);
    if (pc.length < 2) { worst = Infinity; return; }
    const used = pc.reduce((sum, p) => sum + ctx.measureText(p.text).width, 0);
    worst = Math.max(worst, (width - used) / (pc.length - 1) / space);
  });
  return worst;
}

function drawText(ctx, lines, { x, y, lineHeight, rtl, width, justify = false, ends = new Set(), maxGap = MAX_GAP }) {
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  const ax = rtl ? x + width : x;
  const space = ctx.measureText(' ').width;
  lines.forEach((line, i) => {
    let done = false;
    if (justify && rtl && !ends.has(i)) {
      const pcs = pieces(line);
      if (pcs.length > 1) {
        const used = pcs.reduce((sum, pc) => sum + ctx.measureText(pc.text).width, 0);
        const gap = (width - used) / (pcs.length - 1);
        if (gap <= space * maxGap) {
          let cx = ax;
          for (const pc of pcs) {
            const pw = ctx.measureText(pc.text).width;
            if (pc.latin) { ctx.direction = 'ltr'; ctx.textAlign = 'left'; ctx.fillText(pc.text, cx - pw, y); ctx.direction = 'rtl'; ctx.textAlign = 'right'; }
            else ctx.fillText(pc.text, cx, y);
            cx -= pw + gap;
          }
          done = true;
        }
      }
    }
    if (!done) ctx.fillText(line, ax, y);
    y += lineHeight;
  });
  return y;
}

function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

/** The "GeekBook▍" wordmark, left-to-right, with its right edge at x. */
function wordmark(ctx, t, x, y, size) {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 ${size}px ${FONT}`;
  const wGeek = ctx.measureText('Geek').width, wBook = ctx.measureText('Book').width;
  const cursorW = size * 0.14, gap = size * 0.1;
  const left = x - (wGeek + wBook + gap + cursorW);
  ctx.fillStyle = t.text; ctx.fillText('Geek', left, y);
  ctx.fillStyle = t.brand; ctx.fillText('Book', left + wGeek, y);
  ctx.fillStyle = t.signal;
  roundRect(ctx, left + wGeek + wBook + gap, y - size * 0.76, cursorW, size * 0.9, cursorW * 0.2);
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
}

function newCanvas(size, theme) {
  const [w, hgt] = SIZES[size];
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = hgt;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = THEMES[theme].bg;
  ctx.fillRect(0, 0, w, hgt);
  ctx.textBaseline = 'alphabetic';
  return { canvas, ctx, w, hgt, t: THEMES[theme] };
}

export function drawQuote(quote, book, { size = 'post', theme = 'paper' } = {}) {
  const { canvas, ctx, w, hgt, t } = newCanvas(size, theme);
  const M = 104;
  const inner = w - M * 2;
  const rtl = isRtl(quote.text);

  // opening mark
  ctx.fillStyle = t.brand;
  ctx.globalAlpha = 0.22;
  ctx.font = `800 300px ${FONT}`;
  ctx.direction = 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  const top = size === 'story' ? 380 : 250;
  ctx.fillText(rtl ? '«' : '“', rtl ? w - M + 14 : M - 14, top + (rtl ? 0 : 90));
  ctx.globalAlpha = 1;

  // attribution block, measured first so the quote knows how much room it has
  const metaH = 190;
  const footY = hgt - M + 8;
  const metaTop = footY - 70 - metaH;
  const areaTop = top + 40, areaBottom = metaTop - 60;

  // quote text: the largest size that fits
  // Persian quotes are justified; when one size breaks the lines so that a line would need wide gaps, a few
  // slightly smaller sizes are tried and the first one whose lines all justify evenly is kept (v1.0.2).
  let fs = 68, lines, lh, maxGap = MAX_GAP, first = null;
  for (; fs >= 30; fs -= 2) {
    ctx.font = `600 ${fs}px ${FONT}`;
    lh = Math.round(fs * (rtl ? 1.85 : 1.55));
    lines = wrap(ctx, quote.text, inner);
    if (lines.length * lh > areaBottom - areaTop) continue;
    if (!rtl) break;
    if (!first) first = { fs, lines, lh };
    const lone = lines.length > 1 && pieces(lines[lines.length - 1]).length < 2;   // one word alone on the last line
    if (worstGap(ctx, lines, new Set(lines.ends), inner) <= MAX_GAP && !lone) break;
    if (fs <= first.fs - 10) { ({ fs, lines, lh } = first); maxGap = 6; ctx.font = `600 ${fs}px ${FONT}`; break; }
  }
  if (fs < 30 && first) { ({ fs, lines, lh } = first); maxGap = 6; ctx.font = `600 ${fs}px ${FONT}`; }
  const maxLines = Math.max(1, Math.floor((areaBottom - areaTop) / lh));
  const ends = new Set(lines.ends);
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,3}$/, '…'); ends.add(maxLines - 1); }
  const blockH = lines.length * lh;
  const y0 = areaTop + Math.max(0, (areaBottom - areaTop - blockH) / 2) + fs;
  ctx.fillStyle = t.text;
  drawText(ctx, lines, { x: M, y: y0, lineHeight: lh, rtl, width: inner, justify: true, ends, maxGap });

  // rule + book
  const bookRtl = isRtl(book.title);
  ctx.fillStyle = t.signal;
  roundRect(ctx, bookRtl ? w - M - 12 : M, metaTop, 12, metaH - 40, 4);
  ctx.fill();
  const tx = bookRtl ? M : M + 44, tw = inner - 44;
  ctx.fillStyle = t.text;
  ctx.font = `800 46px ${FONT}`;
  drawText(ctx, [ellipsize(ctx, book.title, tw)], { x: tx, y: metaTop + 48, lineHeight: 0, rtl: bookRtl, width: tw });
  ctx.fillStyle = t.muted;
  ctx.font = `400 34px ${FONT}`;
  const by = [book.author, quote.page ? `صفحه‌ی ${fmt.num(quote.page)}` : ''].filter(Boolean).join(' · ');
  if (by) drawText(ctx, [ellipsize(ctx, by, tw)], { x: tx, y: metaTop + 112, lineHeight: 0, rtl: bookRtl, width: tw });

  // footer
  ctx.fillStyle = t.line;
  ctx.fillRect(M, footY - 62, inner, 2);
  wordmark(ctx, t, M + 250, footY, 34);
  return canvas;
}

export function drawRecap(s, { size = 'post', theme = 'navy' } = {}) {
  const { canvas, ctx, w, hgt, t } = newCanvas(size, theme);
  const M = 96;
  const inner = w - M * 2;
  let y = size === 'story' ? 330 : 190;

  ctx.direction = 'rtl'; ctx.textAlign = 'right';
  ctx.fillStyle = t.muted;
  ctx.font = `600 40px ${FONT}`;
  ctx.fillText('کتاب‌خوانی من در سال', w - M, y);
  y += 150;
  ctx.fillStyle = t.text;
  ctx.font = `800 170px ${FONT}`;
  ctx.fillText(fmt.num(s.jy), w - M, y);
  ctx.fillStyle = t.signal;
  const yw = ctx.measureText(fmt.num(s.jy)).width;
  roundRect(ctx, w - M - yw - 44, y - 128, 22, 140, 6);
  ctx.fill();
  y += 80;

  // 2 × 2 numbers
  const cells = [
    [fmt.num(s.finished.length), 'کتاب تمام‌شده'],
    [fmt.grouped(s.pages), 'صفحه'],
    [fmt.num(s.days), 'روز مطالعه'],
    [fmt.num(s.bestStreak), 'روز پیاپی'],
  ];
  const gap = 28, cw = (inner - gap) / 2, ch = size === 'story' ? 236 : 204;
  cells.forEach(([value, label], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const cx = w - M - col * (cw + gap) - cw, cy = y + row * (ch + gap);
    ctx.fillStyle = t.soft;
    roundRect(ctx, cx, cy, cw, ch, 36);
    ctx.fill();
    ctx.fillStyle = t.text;
    ctx.font = `800 96px ${FONT}`;
    ctx.fillText(value, cx + cw - 40, cy + ch * 0.53);
    ctx.fillStyle = t.muted;
    ctx.font = `600 36px ${FONT}`;
    ctx.fillText(label, cx + cw - 40, cy + ch * 0.81);
  });
  y += ch * 2 + gap + (size === 'story' ? 96 : 76);

  // highlights
  const rows = [
    s.favorite && ['بهترین کتاب', s.favorite.title],
    s.genres[0] && ['موضوع پرتکرار', s.genres[0].name],
    s.bestMonth && ['پرکارترین ماه', `${s.bestMonth.name} · ${fmt.grouped(s.bestMonth.pages)} صفحه`],
    s.longest && size === 'story' && ['بلندترین کتاب', `${s.longest.title} · ${fmt.grouped(s.longest.pages)} صفحه`],
  ].filter(Boolean);
  for (const [label, value] of rows) {
    if (y + 64 > hgt - M - 80) break;
    ctx.fillStyle = t.muted;
    ctx.font = `600 32px ${FONT}`;
    ctx.direction = 'rtl'; ctx.textAlign = 'right';
    ctx.fillText(label, w - M, y);
    ctx.fillStyle = t.text;
    ctx.font = `800 46px ${FONT}`;
    const rtl = isRtl(value);
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.fillText(ellipsize(ctx, value, inner), w - M, y + 64);
    y += size === 'story' ? 148 : 132;
  }

  const footY = hgt - M + 8;
  ctx.fillStyle = t.line;
  ctx.fillRect(M, footY - 62, inner, 2);
  wordmark(ctx, t, M + 250, footY, 34);
  return canvas;
}

/** Preview sheet with size/theme choices and share/save buttons. */
async function cardSheet({ title, draw, fileName, shareText, defaults, sizes = ['post', 'story', 'square'] }) {
  await fontsReady();
  let opts = { ...defaults };
  let blob = null;
  const stage = h('div', { class: 'card-stage' });
  const shareBtn = h('button', { class: 'btn btn-primary', type: 'button', html: `${icon('share')}<span>اشتراک‌گذاری</span>` });
  const saveBtn = h('button', { class: 'btn', type: 'button', html: `${icon('download')}<span>ذخیره‌ی تصویر</span>` });
  const name = () => `${fileName}-${opts.size}.png`;

  const render = () => {
    blob = null;
    const canvas = draw(opts);
    canvas.className = `card-canvas card-${opts.size}`;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', title);
    stage.replaceChildren(canvas);
    // the blob is made ahead of the tap, because sharing must start inside the tap itself
    canvas.toBlob((b) => { blob = b; shareBtn.hidden = !b || !canShareFile(b, name()); }, 'image/png');
  };
  shareBtn.addEventListener('click', async () => {
    if (!blob) return;
    const r = await shareFile(blob, name(), shareText);
    if (r === 'unsupported') { download(blob, name()); toast('تصویر ذخیره شد', { icon: 'download' }); }
  });
  saveBtn.addEventListener('click', () => { if (blob) { download(blob, name()); toast('تصویر ذخیره شد', { icon: 'download' }); } });

  const body = h('div', { class: 'card-sheet' },
    stage,
    h('div', { class: 'card-opts' },
      segmented([['post', 'پست'], ['story', 'استوری'], ['square', 'مربع']].filter(([k]) => sizes.includes(k)), opts.size, (v) => { opts.size = v; render(); }, 'اندازه'),
      segmented([['paper', 'روشن'], ['navy', 'سرمه‌ای'], ['dark', 'تاریک']], opts.theme, (v) => { opts.theme = v; render(); }, 'رنگ')),
    h('div', { class: 'btn-row' }, shareBtn, saveBtn));
  render();
  return sheet(body, { title });
}

export function quoteCard(quote, book) {
  return cardSheet({
    title: 'کارت نقل‌قول',
    draw: (o) => drawQuote(quote, book, o),
    fileName: `geekbook-${slug(book.title, 'quote')}`,
    defaults: { size: 'post', theme: 'paper' },
  });
}

export function recapCard(stats) {
  return cardSheet({
    title: `جمع‌بندی سال ${fmt.num(stats.jy)}`,
    draw: (o) => drawRecap(stats, o),
    fileName: `geekbook-${stats.jy}`,
    defaults: { size: 'post', theme: 'navy' },
    sizes: ['post', 'story'],
  });
}
