// One book as a Markdown file: details, review, summaries in reading order, quotes by page.
import * as store from './store.js';
import * as fmt from './fmt.js';
import { saveFile, slug } from './files.js';
import { toast } from './ui.js';
import { daysToFinish } from './stats.js';

const quoteBlock = (text) => text.split('\n').map((l) => `> ${l}`).join('\n');

export function bookMarkdown(book) {
  const out = [`# ${book.title}`, ''];
  const facts = [
    ['نویسنده', book.author], ['مترجم', book.translator], ['ناشر', book.publisher], ['موضوع', book.genre],
    ['تعداد صفحه', book.pages ? fmt.num(book.pages) : ''],
    ['وضعیت', store.STATUSES[book.status].label],
    ['صفحه‌ی فعلی', book.status === 'reading' || book.status === 'dropped' ? fmt.num(book.current_page || 0) : ''],
    ['کجا ماندم', book.status === 'reading' ? book.bookmark : ''],
    ['شروع', book.started_at ? fmt.fullDate(book.started_at) : ''],
    ['پایان', book.finished_at ? fmt.fullDate(book.finished_at) : ''],
    ['مدت خواندن', daysToFinish(book) ? fmt.span(daysToFinish(book)) : ''],
    ['امتیاز', book.rating ? `${fmt.num(book.rating)} از ${fmt.num(5)}` : ''],
    ['دلیل رها کردن', book.status === 'dropped' ? book.drop_reason : ''],
  ].filter(([, v]) => v);
  for (const [k, v] of facts) out.push(`- **${k}:** ${v}`);
  if (book.review) out.push('', '## نظر من', '', book.review);
  if (book.note) out.push('', '## یادداشت', '', book.note);

  const logs = store.logsOf(book.id).filter((l) => l.summary).reverse();
  if (logs.length) {
    out.push('', '## خلاصه‌ها');
    for (const l of logs) {
      const range = l.to_page > l.from_page ? `صفحه‌ی ${fmt.num(l.from_page)} تا ${fmt.num(l.to_page)}` : `صفحه‌ی ${fmt.num(l.to_page)}`;
      out.push('', `### ${fmt.fullDate(l.at)} · ${range}`, '', l.summary);
    }
  }
  const quotes = store.quotesOf(book.id);
  if (quotes.length) {
    out.push('', '## نقل‌قول‌ها');
    for (const q of quotes) {
      out.push('', quoteBlock(q.text));
      const tail = [q.page ? `صفحه‌ی ${fmt.num(q.page)}` : '', q.note].filter(Boolean).join(' · ');
      if (tail) out.push('', `— ${tail}`);
    }
  }
  out.push('', '---', '', `ساخته‌شده با GeekBook · ${fmt.fullDate(Date.now())}`, '');
  return out.join('\n');
}

export async function exportBook(book) {
  const blob = new Blob([bookMarkdown(book)], { type: 'text/markdown' });
  if (await saveFile(blob, `${slug(book.title)}.md`)) toast('فایل Markdown آماده شد', { icon: 'file' });
}
