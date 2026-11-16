// JSON export / import.
import * as store from './store.js';
import { setMeta } from './db.js';
import { toast } from './ui.js';
import { dateToJalali } from './jalali.js';
import { saveFile } from './files.js';
import * as fmt from './fmt.js';

export async function exportFile() {
  const data = store.exportData();
  const json = JSON.stringify(data, null, 2);
  const j = dateToJalali(new Date());
  const name = `geekbook-backup-${j.jy}-${String(j.jm).padStart(2, '0')}-${String(j.jd).padStart(2, '0')}.json`;
  const saved = await saveFile(new Blob([json], { type: 'application/json' }), name);
  if (!saved) return;
  await setMeta('lastBackupAt', Date.now());
  toast(`پشتیبان ساخته شد · ${fmt.num(store.counts().books)} کتاب`, { icon: 'download' });
  document.dispatchEvent(new CustomEvent('geekbook:backup'));
}

export function pickAndImport() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const data = JSON.parse(await file.text());
        const r = await store.importData(data);
        const parts = [];
        if (r.added) parts.push(`${fmt.num(r.added)} مورد تازه`);
        if (r.updated) parts.push(`${fmt.num(r.updated)} به‌روزشده`);
        if (r.settingsApplied) parts.push('تنظیمات');
        toast(parts.length ? `وارد شد: ${parts.join('، ')}` : 'چیز تازه‌ای در فایل نبود', { icon: 'upload', duration: 5000 });
        resolve(r);
      } catch (err) {
        toast(err instanceof SyntaxError ? 'این فایل JSON سالم نیست.' : err.message, { icon: 'x', duration: 5000 });
        resolve(null);
      }
    });
    input.click();
  });
}
