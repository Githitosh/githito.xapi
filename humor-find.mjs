#!/usr/bin/env node
/* githito.xapi: every half hour, record ~20 new accounts that write humorous romantic replies.

   Videos are still made only from accounts listed in humor-accounts.json (the private memo).
   This program finds fresh loving-reply accounts and appends them to that file (~20 per language
   per run; config humor.find). It does not publish names. Ways in:
     1. FxTwitter search for loving greetings (when search answers).
     2. Conversations of accounts already on the list: a partner who writes a loving reply is noted.

     node humor-find.mjs
     node humor-find.mjs --find 12
     node humor-find.mjs --dry

   Settings: config.json → humor.find (new accounts per lang), humor.findSearches, humor.findTimelines.
   Node 20 or newer; no packages. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { humorAccounts, addHumorAccounts } from './humor-accounts.mjs';
import { slander, cruel, personal, NEGATIVE, politicalTarget, ATTACK } from './filters.mjs';
const harsh = t => !!(slander(t) || cruel(t) || personal(t) || NEGATIVE.test(String(t || '')) || politicalTarget(t) || ATTACK.test(String(t || '')));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = name => args.includes('--' + name);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
let FILE = {};
try { FILE = (JSON.parse(await readFile(path.join(HERE, 'config.json'), 'utf8')).humor) || {}; } catch (e) {}
const num = (name, d) => { const v = Number(opt(name, FILE[name])); return Number.isFinite(v) && v > 0 ? v : d; };
const BOOT = flag('bootstrap');
const CONF = {
  langs: (Array.isArray(FILE.langs) ? FILE.langs : ['ja', 'en']).filter(l => l === 'ja' || l === 'en'),
  /* Bootstrap once: aim toward ~2000 registered accounts (CLI --find overrides). Half-hour runs add ~50/lang. */
  find: args.includes('--find') ? num('find', 50) : (BOOT ? 800 : Math.min(80, num('find', 50))),
  findSearches: BOOT ? Math.max(num('findSearches', 40), 80) : num('findSearches', 40),
  findTimelines: BOOT ? Math.max(num('findTimelines', 100), 160) : num('findTimelines', 100),
  dry: flag('dry'),
  noSearch: flag('no-search') || process.env.XAPI_NO_SEARCH === '1',
  memo: opt('memo', process.env.XAPI_MEMO_DIR || '') ? path.resolve(opt('memo', process.env.XAPI_MEMO_DIR || '')) : '',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shuffle = list => list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

/* Loving searches to discover accounts. Night/love/icha first so the list is not mostly morning greeters. */
const SEARCHES = {
  ja: [
    '(だいしゅき OR すきすき OR ぎゅーして OR ちゅー OR 会いたいよ OR なでなで OR いちゃいちゃ)',
    '(愛してる OR あいしてる OR 大好きだよ OR 好きだよ) (♡ OR 💕 OR 🥰 OR ぎゅ)',
    '(おやすみ OR おやすみなさい OR ねんね) (♡ OR 💕 OR 好き OR 大好き OR ぎゅー OR ちゅ)',
    '(おかえり OR ただいま) (♡ OR 好き OR ぎゅ OR 会いたかった OR ちゅ)',
    '(寂しい OR さみしい OR 会いたい) (♡ OR 好き OR ぎゅ OR ちゅ)',
    '(おはよう OR おはよ OR おはよー) (♡ OR 💕 OR 🥰 OR 😘 OR 好き OR 大好き OR ぎゅ)',
    '(おはおは OR おっはー OR おはよん OR おはようなの)',
  ],
  en: [
    '("love you more" OR "miss you more" OR "love ya" OR "my love" OR babe OR cuddle OR snuggle)',
    '("i love you" OR "love you so much") (❤ OR 😘 OR 🥰)',
    '("night night" OR "nighty night" OR "sweet dreams" OR "sleep tight") (love OR babe OR ❤)',
    '("miss you" OR "come home" OR "welcome home") (love OR babe OR ❤)',
    '("morning sunshine" OR "good morning beautiful" OR "good morning handsome")',
    '("good morning" OR morning) ("love you" OR babe OR ❤ OR 😘 OR 🥰)',
  ],
};

const LOVE = {
  ja: /大好き|だいすき|だいしゅき|しゅき|好き|すき|愛して|あいして|いちゃ|ぎゅ|ちゅ|なでなで|おやす|ねんね|おはよ|おはおは|おっはー|おつかれ|お疲れ|ただいま|おかえり|いってらっしゃ|いってきます|会いたい|♡|❤|💕|🥰|😘/,
  en: /love you|love ya|luv u|\bily\b|cuddle|snuggle|miss you|my love|\bbabe\b|\bbaby\b|honey|sweetheart|cutie|good ?night|night night|good ?morning|sunshine|rise and shine|sleep tight|sweet dreams|❤|💕|🥰|😘/i,
};
const CUTE = {
  ja: /おはようなの|おはよーだよ|おっはー|おはよん|おはよぉ|ねんね|だいしゅき|しゅき|ぎゅー|ちゅ|♡|❤|💕|🥰|😘/,
  en: /night night|sunshine|rise and shine|love you more|miss you more|\bbabe\b|honey|xoxo|💕|🥰|😘/i,
};
const UNSAFE = /カニバ|浮気|不倫|別れ|離婚|死ね|殺|cheat|divorce|break ?up|hate you|🍑|🍆|🔞/i;
const YOUTH = /学校|宿題|部活|受験|高校|中学|\bschool\b|\bhomework\b|\bteen\b/i;
/* Officials / shops / bots out. Idols as private people are OK; underground-idol news coverage is not. */
const NOT_A_PERSON = /公式|official|ニュース|news|\bbot\b|shop|store|店|占い|VTuber|事務所所属|所属事務所/i;
/* Couple / romance-forward signals (prefer these when growing toward ~2000). */
const COUPLE = {
  ja: /彼氏|彼女|旦那|嫁|夫|妻|恋人|カップル|交際|付き合|両想い|いちゃいちゃ|ぎゅー|ちゅー|おやすみ.*好き|好き.*おやす|ただいま.*好き|おかえり.*好き/,
  en: /boyfriend|girlfriend|husband|wife|fiancé|fiance|my love|\bbabe\b|partner|couple|dating you/i,
};
/* Underground-idol / otaku-news skew: allowed in small mix, heavily down-ranked so the page stays couple-first. */
const IDOL_NEWS = /地下アイドル|地下ドル|ライバー|コンカフェ|メンエス|チェキ|特典会|物販|握手会|推し|オタ|現場|リリイベ|リリースイベ|生誕祭|対バン|アイドル活動|地下生|読モ|グラドル|メンヘラ|#idol|fanclub|fancam/i;
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

const postText = st => String((st && st.text) || '').replace(/https?:\/\/\S+/g, ' ').replace(/@\w+/g, ' ').replace(/[#＃]\S+/g, ' ').replace(/\s+/g, ' ').trim();
const handleOf = st => String((st && st.author && st.author.screen_name) || '').replace(/^@+/, '');
const statusId = st => { const m = String((st && st.url) || '').match(/status(?:es)?\/(\d+)/); return (st && st.id && /^\d+$/.test(String(st.id)) ? String(st.id) : '') || (m ? m[1] : ''); };
const followers = st => { const a = st && st.author; const n = a && (a.followers ?? a.followers_count); return typeof n === 'number' ? n : -1; };
const parentOf = st => {
  const rt = st && st.replying_to;
  const id = (rt && typeof rt === 'object' && (rt.status || rt.status_id || rt.id)) || (st && (st.replying_to_status || st.in_reply_to_status_id_str)) || '';
  return { id: /^\d+$/.test(String(id)) ? String(id) : '' };
};

const HEART = /♡|❤|♥|💕|💗|💖|💘|💞|🥰|😘|😚|😍|🤗/;
const FEELING = {
  ja: /大好き|だいすき|だいしゅき|すきすき|好きだよ|すきだよ|愛してる|あいしてる|愛して|ぎゅ[ー〜っ]*|ちゅ[ー〜っ]*|なでなで|よしよし|会いたい|あいたい|いちゃ|しゅき/,
  en: /i love you|love you|love ya|luv u|\bily\b|cuddle|snuggle|miss you|my love|\bbabe\b|honey|sweetheart|xoxo|night night|sunshine/i,
};
const clearlyRomantic = (text, lang) => !!(HEART.test(text) || FEELING[lang].test(text) || CUTE[lang].test(text));
function mayRegister(st, lang) {
  const h = handleOf(st);
  const text = postText(st);
  const a = (st && st.author) || {};
  const bio = String(a.description || a.bio || '') + ' ' + String(a.name || '');
  if (!HANDLE.test(h) || !text) return null;
  if (UNSAFE.test(text) || YOUTH.test(text) || NOT_A_PERSON.test(bio) || NOT_A_PERSON.test(text) || harsh(text)) return null;
  if (followers(st) > 20000 || a.protected) return null;
  /* Only clearly romantic replies / funny romantic greetings — not ordinary comments. */
  if (!clearlyRomantic(text, lang)) return null;
  if (!(parentOf(st).id || /^(?:@\w+\s+)/.test(String(st.text || '')))) {
    /* Prefer replies; a loving greeting post may still be worth coming back to. */
    if (!CUTE[lang].test(text) && text.length > (lang === 'en' ? 80 : 40)) return null;
  }
  const idolish = IDOL_NEWS.test(text) || IDOL_NEWS.test(bio);
  /* Couple dynamics first. Idols OK in moderation; underground-idol news coverage is down-ranked hard. */
  let score = (CUTE[lang].test(text) ? 5 : 0) + (FEELING[lang].test(text) ? 4 : 0) + (HEART.test(text) ? 3 : 0)
    + (COUPLE[lang].test(text) || COUPLE[lang].test(bio) ? 8 : 0)
    + (text.length <= (lang === 'en' ? 60 : 24) ? 2 : 0)
    + (idolish ? -12 : 0);
  if (score < 1) return null;
  return { h, score, idolish: !!idolish };
}

class Refused extends Error {}
async function fxJson(url) {
  let res;
  try { res = await fetch(url, { headers: { 'user-agent': 'githito.xapi collector' }, signal: AbortSignal.timeout(25000) }); }
  catch (e) { throw new Refused('no answer'); }
  const data = await res.json().catch(() => null);
  if (res.status !== 200 || (data && data.code && data.code !== 200)) throw new Refused('refused (' + res.status + ')');
  return data;
}
async function search(q) {
  const now = Math.floor(Date.now() / 1000);
  /* Bootstrap looks further back so many new accounts can be found in one run. */
  const window = BOOT ? 48 * 3600 : 8 * 3600;
  const span = BOOT ? 36 * 3600 : 6 * 3600;
  const start = now - window;
  const full = `${q} since_time:${start} until_time:${start + span}`;
  const d = await fxJson('https://api.fxtwitter.com/2/search?count=100&q=' + encodeURIComponent(full));
  return Array.isArray(d.results) ? d.results : [];
}
async function timeline(handle) {
  const d = await fxJson('https://api.fxtwitter.com/2/profile/' + handle + '/statuses?count=40');
  return Array.isArray(d.results) ? d.results : [];
}
async function conversation(id) {
  const d = await fxJson('https://api.fxtwitter.com/2/conversation/' + id);
  const list = [];
  if (d && d.status) list.push(d.status);
  ((d && Array.isArray(d.thread)) ? d.thread : []).forEach(st => list.push(st));
  ((d && Array.isArray(d.replies)) ? d.replies : []).forEach(st => list.push(st));
  return list;
}

async function findFor(lang, have) {
  const found = new Map(); /* lower -> { h, score } */
  const note = st => {
    const r = mayRegister(st, lang);
    if (!r || have.has(r.h.toLowerCase()) || found.has(r.h.toLowerCase())) return;
    found.set(r.h.toLowerCase(), r);
  };
  let searches = 0, timelines = 0, conversations = 0, searchRefused = 0;

  if (!CONF.noSearch) {
    for (const q of shuffle(SEARCHES[lang] || []).slice(0, CONF.findSearches)) {
      if (found.size >= CONF.find) break;
      try {
        const list = await search(q);
        searches++;
        list.forEach(note);
      } catch (e) {
        if (!(e instanceof Refused)) throw e;
        searchRefused++;
        if (searchRefused >= 3) break;
        await sleep(4000);
        continue;
      }
      await sleep(2500);
    }
  }

  /* From accounts already registered: partners in their loving exchanges. */
  const ACC = await humorAccounts(CONF.memo);
  const seeds = shuffle(ACC[lang] || []).slice(0, CONF.findTimelines);
  for (const e of seeds) {
    if (found.size >= CONF.find) break;
    let list;
    try { list = await timeline(e.h); timelines++; }
    catch (err) { if (!(err instanceof Refused)) throw err; await sleep(1500); continue; }
    const answered = list.filter(st => (Number(st.replies) || 0) >= 1 && statusId(st)).slice(0, 2);
    for (const st of answered) {
      if (found.size >= CONF.find) break;
      try {
        const thread = await conversation(statusId(st));
        conversations++;
        thread.forEach(note);
      } catch (err) {
        if (!(err instanceof Refused)) throw err;
        break;
      }
      await sleep(1200);
    }
    await sleep(900);
  }

  /* Balanced pick: couple/romance-forward first; cap underground-idol-ish accounts so the mix does not skew. */
  const ranked = [...found.values()].sort((a, b) => b.score - a.score);
  const idolCap = Math.max(2, Math.floor(CONF.find * 0.15));
  const picked = [];
  let idols = 0;
  for (const x of ranked) {
    if (picked.length >= CONF.find) break;
    if (x.idolish && idols >= idolCap) continue;
    if (x.idolish) idols++;
    picked.push(x.h);
  }
  return { picked, searches, timelines, conversations, searchRefused, idolish: idols };
}

async function main() {
  if (!CONF.memo) {
    console.log('Humor find: no private memo (--memo or XAPI_MEMO_DIR): nothing is recorded.');
    return;
  }
  const ACC = await humorAccounts(CONF.memo);
  if (ACC.missing) console.log('Humor find: humor-accounts.json was missing; a new list will be created when accounts are found.');
  else console.log(`Humor find: memo already holds ${ACC.ja.length} Japanese and ${ACC.en.length} English accounts.`);

  for (const lang of CONF.langs) {
    const have = new Set((ACC[lang] || []).map(e => e.h.toLowerCase()));
    console.log(`Humor find, ${lang}: looking for about ${CONF.find} new romantic-reply accounts`);
    const { picked, searches, timelines, conversations, searchRefused, idolish } = await findFor(lang, have);
    console.log(`  ${lang}: search ${searches} (refused ${searchRefused}), timelines ${timelines}, conversations ${conversations}; ${picked.length} new accounts ready (couple-first; idol-leaning among them: ${idolish || 0})`);
    if (!picked.length) continue;
    if (CONF.dry) { console.log(`  ${lang}: dry run, not writing`); continue; }
    const n = await addHumorAccounts(CONF.memo, lang, picked);
    console.log(`  ${lang}: recorded ${n} new accounts in the private memo (names not printed)`);
  }
  console.log(`Humor find done at ${stamp()}.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message || e); process.exit(1); });
