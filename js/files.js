// Getting a file out of the app: the share sheet where it can carry files (iPhone, Android),
// a plain download everywhere else.
const isTouchDevice = () => /iphone|ipad|ipod|android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function canShareFile(blob, name) {
  try {
    const file = new File([blob], name, { type: blob.type });
    return !!navigator.canShare?.({ files: [file] });
  } catch { return false; }
}

/** Share a file. Returns 'shared', 'cancelled' or 'unsupported'. Must run inside a tap. */
export async function shareFile(blob, name, text) {
  if (!canShareFile(blob, name)) return 'unsupported';
  try {
    const file = new File([blob], name, { type: blob.type });
    await navigator.share(text ? { files: [file], text } : { files: [file] });
    return 'shared';
  } catch (err) {
    return err?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

/** Save a file: on phones through the share sheet ("Save to Files"), otherwise download. */
export async function saveFile(blob, name) {
  if (isTouchDevice()) {
    const r = await shareFile(blob, name);
    if (r !== 'unsupported') return r === 'shared';
  }
  download(blob, name);
  return true;
}

/** A safe file name from a book title (keeps Persian letters). */
export function slug(s, fallback = 'book') {
  const out = String(s).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return out || fallback;
}
