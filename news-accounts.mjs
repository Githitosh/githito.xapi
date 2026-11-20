/* News accounts, and nothing else.

   The only list is news-famous.json in the private memo (the folder --memo or XAPI_MEMO_DIR names):
   { ja: [{ h, k, g }], en: [...] }. h is the account, k a part of the name it must show, g the genre.
   This repository has no paper, broadcaster or people list. A missing folder or a missing file means
   there are no news accounts (missing: true): nothing is used in its place. Handles are not printed. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

export async function newsAccounts(memoDir) {
  const empty = { ja: [], en: [], handles: new Set(), missing: true };
  if (!memoDir) return empty;
  let text;
  try { text = await readFile(path.join(path.resolve(memoDir), 'news-famous.json'), 'utf8'); }
  catch (e) { return empty; }
  let data;
  try { data = JSON.parse(text); } catch (e) { return empty; }
  const list = lang => (Array.isArray(data[lang]) ? data[lang] : [])
    .filter(e => e && HANDLE.test(String(e.h || '')))
    .map(e => ({ h: String(e.h), k: String(e.k || ''), g: String(e.g || 'entertainment') }));
  const ja = list('ja');
  const en = list('en');
  const handles = new Set();
  for (const e of ja.concat(en)) handles.add(e.h.toLowerCase());
  return { ja, en, handles, missing: false };
}
