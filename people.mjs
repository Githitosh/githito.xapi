/* people.mjs: News posts. Only the accounts in the private memo's news-famous.json (the folder
   XAPI_MEMO_DIR or --memo names). No paper, no broadcaster, no built-in list of people, and no
   replies under someone else's post. When that file is missing, no news account is read.

   A post kept here is the account's own (not a reply, not a repost), from the last three days, liked
   by many (one in twenty thousand followers, a hundred at least): the best two of each person a run.
   The account is used when its name shows the expected part and it has 50,000 followers, or when it
   has 100,000 followers whatever the name. An account that is not that person is left for a week.

   Left out, as everywhere else: cruel, personal, slander, alcohol, smoking, a post that runs someone
   down, and advertising. Names from the memo are not printed, and the list of who was read is written
   back into the memo (news-read.json), never into the public files.

   Humor does not read this file. Reply News stays on ordinary accounts.

     v1/people-ja.json   { version, lang, updated, people: [{ id, h, n, f, l, t, on, own, g, at, found }] }
     v1/people-en.json   the same in English

     node people.mjs --out public [--minutes 4] [--memo <folder>] */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { cruel, personal, slander, alcohol, tobacco, politicalAttack, advert } from './filters.mjs';
import { newsAccounts } from './news-accounts.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const CONF = {
  out: path.resolve(opt('out', 'public')),
  minutes: Number(opt('minutes', 4)) || 4,
  hours: 72,
  keep: 1000,
};
const MEMO_DIR = opt('memo', process.env.XAPI_MEMO_DIR || '');
const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const len = t => [...String(t || '')].length;
const readJson = async (file, d) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { return d; } };
const tidy = t => String(t || '').replace(/^(?:\s*[@＠][A-Za-z0-9_]+)+/, '').replace(/https?:\/\/\S+/g, ' ').replace(/[#＃][^\s#＃]+/g, ' ').replace(/[─-▟]+/g, ' ').replace(/\s+/g, ' ').trim();

/* What is never shown, on a person's own post as on any other. */
const famousOk = t => !(cruel(t) || personal(t) || slander(t) || alcohol(t) || tobacco(t) || politicalAttack(t) || advert(t));

let MEMO = { ja: [], en: [], handles: new Set(), missing: true };
let FAMOUS = { ja: [], en: [] };

async function ownPosts(handle) {
  const res = await fetch('https://api.fxtwitter.com/2/profile/' + handle + '/statuses?count=40', { headers: { 'user-agent': 'githito.xapi collector' }, signal: AbortSignal.timeout(25000) });
  const d = await res.json().catch(() => null);
  if (res.status !== 200 || !d || (d.code && d.code !== 200)) throw new Error('did not answer (' + res.status + ')');
  return Array.isArray(d.results) ? d.results : [];
}
/* Their own posts of the last three days that many liked (one in twenty thousand followers, a hundred at
   least): the best two of each person a run. Names are not printed. */
async function famous(lang, people, have, readAt, notThem, minutes) {
  const list = (FAMOUS[lang] || []).filter(([h]) => !notThem[h] || Date.now() - Date.parse(notThem[h]) > 7 * 24 * 3600e3)
    .sort((x, y) => (Date.parse(readAt[x[0]] || 0) || 0) - (Date.parse(readAt[y[0]] || 0) || 0));
  const deadline = Date.now() + minutes * 60e3;
  let asked = 0, answered = 0, got = 0;
  for (const [h, key, g] of list) {
    if (Date.now() > deadline) break;
    asked++;
    let posts;
    try { posts = await ownPosts(h); } catch (e) { await sleep(1500); continue; }
    readAt[h] = stamp();
    const own = posts.filter(st => st && st.author && String(st.author.screen_name).toLowerCase() === h.toLowerCase() && !st.reposted_by && !(st.replying_to && (st.replying_to.status || st.replying_to.screen_name)));
    const a = own[0] && own[0].author;
    if (!a) { await sleep(1000); continue; }
    /* The person: the expected name (with 50,000 followers), or 100,000 followers whatever the name. */
    const fl = Number(a.followers) || 0;
    const them = (key && String(a.name || '').toLowerCase().includes(key.toLowerCase()) && fl >= 50000) || fl >= 100000;
    if (!them || a.protected) { notThem[h] = stamp(); await sleep(1000); continue; }
    answered++;
    const least = Math.max(100, Math.round((Number(a.followers) || 0) / 20000));
    const found = own.map(st => {
      const t = tidy(st.text);
      const likes = Number(st.likes) || 0;
      const at = st.created_at ? new Date(st.created_at).toISOString().replace(/\.\d+Z$/, 'Z') : '';
      if (likes < least || Date.now() - Date.parse(at || 0) > 72 * 3600e3 || have.has(String(st.id)) || st.possibly_sensitive) return null;
      if (lang === 'en' ? (t.length < 20 || t.length > 200 || /[ぁ-ヿ一-鿿]/.test(t)) : (len(t) < 8 || len(t) > 100 || (t.match(/[ぁ-ヿ一-鿿]/g) || []).length < 4)) return null;
      if (!famousOk(t)) return null;
      return { id: String(st.id), h: a.screen_name, n: String(a.name).slice(0, 40), f: Number(a.followers) || 0, l: likes, t, on: '', own: 1, g, at, found: stamp() };
    }).filter(Boolean).sort((x, y) => y.l - x.l).slice(0, 2);
    found.forEach(p => { people.push(p); have.add(p.id); got++; });
    await sleep(1000);
  }
  console.log(`  news (${lang}): ${asked} accounts asked, ${answered} answered as themselves, ${got} posts kept`);
  return got;
}

/* Who was read, and who was not the person, stays in the private memo. The public file has posts only. */
async function loadState() {
  const empty = () => ({ read: {}, not: {} });
  if (!MEMO_DIR || MEMO.missing) return { ja: empty(), en: empty() };
  const d = await readJson(path.join(path.resolve(MEMO_DIR), 'news-read.json'), {});
  const young = at => Date.now() - Date.parse(at || 0) < 7 * 24 * 3600e3;
  const one = lang => {
    const s = d[lang] && typeof d[lang] === 'object' ? d[lang] : {};
    const keep = (o, test) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([, at]) => test(at)));
    return { read: keep(s.read, young), not: keep(s.not, young) };
  };
  return { ja: one('ja'), en: one('en') };
}
async function saveState(state) {
  if (!MEMO_DIR || MEMO.missing) return;
  await writeFile(path.join(path.resolve(MEMO_DIR), 'news-read.json'), JSON.stringify(state) + '\n');
}

async function gather(lang, state, minutes) {
  const file = path.join(CONF.out, 'v1', `people-${lang}.json`);
  const before = await readJson(file, { people: [] });
  const fresh = at => Date.now() - Date.parse(at || 0) < CONF.hours * 3600e3;
  const allow = new Set((FAMOUS[lang] || []).map(([h]) => h.toLowerCase()));
  /* Posts already kept are kept only when the account is still in the memo, and the post is their own.
     A reply under someone else's news, and any account that is not in the memo, is not refilled. */
  const people = (Array.isArray(before.people) ? before.people : []).filter(p => p && p.id && p.t && p.own && p.h && allow.has(String(p.h).toLowerCase()) && fresh(p.found) && famousOk(p.t));
  const have = new Set(people.map(p => p.id));
  const got = await famous(lang, people, have, state.read, state.not, minutes);
  people.sort((a, b) => (Date.parse(b.found) || 0) - (Date.parse(a.found) || 0));
  const out = { version: 1, lang, updated: stamp(), people: people.slice(0, CONF.keep) };
  await writeFile(file, JSON.stringify(out) + '\n');
  if (got || out.people.length !== (Array.isArray(before.people) ? before.people.length : 0)) await writeFile(path.join(CONF.out, '.changed'), stamp() + '\n');
  console.log(`News (${lang}): ${got} new posts kept; the file holds ${out.people.length}.`);
}

async function main() {
  await mkdir(path.join(CONF.out, 'v1'), { recursive: true });
  MEMO = await newsAccounts(MEMO_DIR);
  FAMOUS = {
    ja: MEMO.ja.map(e => [e.h, e.k, e.g]),
    en: MEMO.en.map(e => [e.h, e.k, e.g]),
  };
  if (MEMO.missing) console.log('No news-famous.json: no news account is read.');
  else console.log(`News accounts from the private memo: ${FAMOUS.ja.length} Japanese, ${FAMOUS.en.length} English.`);
  const state = await loadState();
  await gather('ja', state.ja, CONF.minutes);
  await gather('en', state.en, CONF.minutes);
  await saveState(state);
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) main().catch(e => { console.error(e.message || e); process.exit(1); });
