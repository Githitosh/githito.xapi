/* Humor accounts, and nothing else.

   The only list is humor-accounts.json in the private memo (the folder --memo or XAPI_MEMO_DIR names):
   { ja: [{ h }], en: [...] }. h is the account. This repository has no built-in humor list. A missing
   folder or a missing file means there are no humor accounts (missing: true): nothing is used in its
   place. Videos are made only from accounts on this list. humor-find.mjs may append ~10 new accounts
   each half-hour run. Handles are not printed. News accounts (news-famous.json) are a different file;
   humor does not read that list. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

function normalize(data) {
  const list = lang => (Array.isArray(data && data[lang]) ? data[lang] : [])
    .filter(e => e && HANDLE.test(String(e.h || '').replace(/^@+/, '')))
    .map(e => ({ h: String(e.h).replace(/^@+/, '') }));
  const ja = list('ja');
  const en = list('en');
  const handles = new Set();
  for (const e of ja.concat(en)) handles.add(e.h.toLowerCase());
  return { version: Number(data && data.version) || 1, note: (data && data.note) || '', ja, en, handles, missing: false };
}

export async function humorAccounts(memoDir) {
  const empty = { version: 1, note: '', ja: [], en: [], handles: new Set(), missing: true };
  if (!memoDir) return empty;
  let text;
  try { text = await readFile(path.join(path.resolve(memoDir), 'humor-accounts.json'), 'utf8'); }
  catch (e) { return empty; }
  let data;
  try { data = JSON.parse(text); } catch (e) { return empty; }
  return normalize(data);
}

/* Append handles for one language. Returns how many were new. Does not print names. */
export async function addHumorAccounts(memoDir, lang, handles, note) {
  if (!memoDir || (lang !== 'ja' && lang !== 'en')) return 0;
  const dir = path.resolve(memoDir);
  const file = path.join(dir, 'humor-accounts.json');
  let data = { version: 1, note: note || 'Humor only. Ordinary accounts whose romantic replies may become humor videos.', ja: [], en: [] };
  try { data = { ...data, ...JSON.parse(await readFile(file, 'utf8')) }; } catch (e) {}
  const cur = normalize(data);
  const have = new Set((cur[lang] || []).map(e => e.h.toLowerCase()));
  const added = [];
  for (const raw of handles || []) {
    const h = String(raw || '').replace(/^@+/, '');
    if (!HANDLE.test(h) || have.has(h.toLowerCase())) continue;
    have.add(h.toLowerCase());
    added.push({ h });
  }
  if (!added.length) return 0;
  const next = {
    version: 1,
    note: data.note || cur.note || 'Humor only. Ordinary accounts whose romantic replies may become humor videos.',
    ja: lang === 'ja' ? (cur.ja || []).concat(added) : (cur.ja || []),
    en: lang === 'en' ? (cur.en || []).concat(added) : (cur.en || []),
    updated: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  };
  await mkdir(dir, { recursive: true });
  await writeFile(file, JSON.stringify(next, null, 2) + '\n');
  return added.length;
}

export async function saveHumorAccounts(memoDir, data) {
  if (!memoDir) return false;
  const dir = path.resolve(memoDir);
  const cur = normalize(data || {});
  const out = {
    version: 1,
    note: (data && data.note) || 'Humor only. Ordinary accounts whose romantic replies may become humor videos.',
    ja: cur.ja,
    en: cur.en,
    updated: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  };
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'humor-accounts.json'), JSON.stringify(out, null, 2) + '\n');
  return true;
}
