/* News accounts, and nothing else.

   Source of truth is the PUBLIC file docs/memo/news-famous.json in this repository
   { ja: [{ h, k, g }], en: [...] }. Collect also copies it into XAPI_MEMO_DIR for the run.
   Humor accounts are a different, private file and are not read here. Handles may appear in the
   public news list by design. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_NEWS = path.join(HERE, 'docs', 'memo', 'news-famous.json');

async function readNewsFile(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { return null; }
}

export async function newsAccounts(memoDir) {
  const empty = { ja: [], en: [], handles: new Set(), missing: true };
  const candidates = [];
  if (memoDir) candidates.push(path.join(path.resolve(memoDir), 'news-famous.json'));
  candidates.push(PUBLIC_NEWS);
  let data = null;
  for (const file of candidates) {
    data = await readNewsFile(file);
    if (data) break;
  }
  if (!data) return empty;
  const list = lang => (Array.isArray(data[lang]) ? data[lang] : [])
    .filter(e => e && HANDLE.test(String(e.h || '')))
    .map(e => ({ h: String(e.h), k: String(e.k || ''), g: String(e.g || 'entertainment') }));
  const ja = list('ja');
  const en = list('en');
  const handles = new Set();
  for (const e of ja.concat(en)) handles.add(e.h.toLowerCase());
  return { ja, en, handles, missing: false };
}
