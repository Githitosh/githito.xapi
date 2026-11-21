/* stock.mjs: the video stock. After every collection (every half hour) the cards are written from what was
   collected (compose.mjs: the words checked, and mended where they could be), and the cards are dealt into
   videos of ten. A video is made only when ten new cards are there. What a run already put in the stock
   stays: the next run adds the latest posts, and the videos and their cards are not thrown away when the
   posts leave the collection files (those files keep a few days; the stock the pages play keeps growing).

     v1/stock-news-ja.json   News: cards { id, h, n, g, at, kw, ja: [what, who], how, q? }
     v1/stock-news-en.json   News in English: cards from registered English accounts (nothing translated)
     v1/stock-humor-ja.json  Reply News: talks { i, k, at, s, gl, m: [{ i, s, ja: [part, whole] }] }
                             (a talk is a conversation; a message is a card; no account handles — privacy)
     both: videos [{ i, at, c: [card or talk ids], m?, slot? }], replies (to the accounts readers asked for), asked

   News cards are the private memo's accounts' own posts only (news-famous.json → people.mjs). A card
   that is not their own post, or whose account is not in that file, is dropped and is not refilled.
   Humor talks are humor-accounts.json only: a talk with nobody on that list is dropped. When either
   list is missing or empty, that stock is cleared (empty cards/talks and videos): pages must not keep
   showing unregistered content. Humor also rejudges past talks: ordinary replies without clear romantic
   feeling (hearts / love words / funny romantic greetings) are pruned on every run.

   News stock aims at about 2000 cards (~5 per registered account). Playback packing prefers unused cards,
   then cards shown least recently, so the same clip does not loop. The half-hour collect loop and the
   content bans are unchanged.

   The pages read these files and nothing else: they make no words of their own. A reader's page plays the
   newest video it has not played, or picks among the cards when the reader chose genres or words.

     node stock.mjs --out public [--videos N] [--size 10]
   --videos N keeps only the N newest videos. Without it, nothing is cut: the stock grows (aim ~2000). */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { talkCards, replyCard, personCard, personCardEn } from './compose.mjs';
import { newsAccounts } from './news-accounts.mjs';
import { humorAccounts } from './humor-accounts.mjs';
import { clearlyRomantic } from './humor.mjs';
import { slander, cruel, personal, advert, NEGATIVE, politicalTarget, ATTACK } from './filters.mjs';
const humorHarsh = t => !!(slander(t) || cruel(t) || personal(t) || advert(t) || NEGATIVE.test(String(t || '')) || politicalTarget(t) || ATTACK.test(String(t || '')));
const msgText = x => Array.isArray(x && x.ja) ? x.ja.join(' ') : '';
/* Drop ordinary comments from a talk; keep clearly romantic lines and their parent for context. */
function pruneRomanticTalk(t, lang = 'ja') {
  if (!t || !Array.isArray(t.m) || t.m.length < 2) return null;
  const keep = new Set();
  for (let i = 0; i < t.m.length; i++) {
    if (!clearlyRomantic(msgText(t.m[i]), lang)) continue;
    keep.add(i);
    if (i > 0) keep.add(i - 1);
  }
  const m = t.m.filter((_, i) => keep.has(i));
  if (m.length < 2) return null;
  if (!m.some(x => clearlyRomantic(msgText(x), lang))) return null;
  return { ...t, m };
}
/* Public humor stock: comment text only (opaque speaker index s). No handles or profile names. */
function anonymizeTalk(t) {
  if (!t || !Array.isArray(t.m)) return null;
  const speakers = new Map();
  let n = 0;
  const sid = h => {
    const k = String(h == null ? '' : h).toLowerCase();
    if (!k) return n;
    if (!speakers.has(k)) speakers.set(k, n++);
    return speakers.get(k);
  };
  const m = t.m.map(x => {
    const key = x.h != null ? x.h : (x.s != null ? 's' + x.s : '');
    return { i: String(x.i || ''), s: sid(key), ja: x.ja };
  });
  if (m.length < 2 || m[0].s === m[1].s) return null;
  return { i: t.i, k: t.k || '', at: t.at || '', s: t.s, gl: t.gl, m };
}
const speakerKey = x => (x && x.h != null ? String(x.h).toLowerCase() : (x && x.s != null ? 's' + x.s : ''));

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const OUT = path.resolve(opt('out', 'public'));
/* 0: do not cut the stock. A positive --videos keeps only that many of the newest videos. */
const videosOpt = opt('videos', '');
const MAX = videosOpt === '' ? 0 : Math.max(0, Number(videosOpt) || 0);
const SIZE = Number(opt('size', 10)) || 10;
/* News: about 2000 clips, about 5 per registered account; video packs prefer unused / less-recent. */
const NEWS_STOCK = Number(opt('newsstock', 2000)) || 2000;
const NEWS_PER = Number(opt('newsper', 5)) || 5;
const NEWS_VIDEOS = Math.max(SIZE, Math.ceil(NEWS_STOCK / SIZE));
const readJson = async (file, d) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { return d; } };
const time = x => Date.parse(x && x.at) || 0;
const bounded = (list, max) => (max > 0 ? list.slice(0, max) : list);
const shuffle = list => {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
/* A card or a talk already in the stock is kept. This run's copy of the same id replaces it.
   Nothing is dropped for age. */
function mergeStock(oldItems, freshItems, idOf) {
  const map = new Map();
  for (const item of oldItems) {
    const id = String(idOf(item) || '');
    if (id) map.set(id, item);
  }
  let added = 0;
  for (const item of freshItems) {
    const id = String(idOf(item) || '');
    if (!id) continue;
    if (!map.has(id)) added++;
    map.set(id, item);
  }
  return { items: [...map.values()], added, carried: map.size - added };
}
const cardKeep = c => c && c.id != null && Array.isArray(c.ja) && c.ja[0] && c.ja[1];
const talkKeep = t => t && t.i != null && Array.isArray(t.m) && t.m.length >= 2 && t.m.every(x => x && Array.isArray(x.ja) && x.ja[0] && x.ja[1]);
/* Last time a card id appeared in a video (0 = never). Used to prefer unused / less-recent stock. */
function lastShownAt(videos) {
  const last = new Map();
  for (const v of Array.isArray(videos) ? videos : []) {
    const at = Date.parse(v && v.at) || 0;
    for (const id of (v && v.c) || []) {
      const k = String(id);
      if (!last.has(k) || at > last.get(k)) last.set(k, at);
    }
  }
  return last;
}
/* Unused first, then least-recently shown; shuffle within the same bucket so packing is not fixed. */
function preferUnused(cards, videos) {
  const last = lastShownAt(videos);
  return shuffle(cards).sort((a, b) => {
    const la = last.get(String(a.id)) || 0;
    const lb = last.get(String(b.id)) || 0;
    if (!la !== !lb) return la ? 1 : -1;
    return la - lb;
  });
}
/* Cap at NEWS_PER per account, then NEWS_STOCK overall (liked / newer first). */
function trimNewsCards(cards) {
  const byH = new Map();
  for (const c of cards) {
    if (!cardKeep(c)) continue;
    const k = String(c.h || '').toLowerCase();
    if (!byH.has(k)) byH.set(k, []);
    byH.get(k).push(c);
  }
  const out = [];
  for (const list of byH.values()) {
    list.sort((a, b) => (Number(b.l) || 0) - (Number(a.l) || 0) || time(b) - time(a));
    out.push(...list.slice(0, NEWS_PER));
  }
  out.sort((a, b) => ((b.own || 0) - (a.own || 0)) || (Number(b.l) || 0) - (Number(a.l) || 0) || time(b) - time(a));
  return out.slice(0, NEWS_STOCK);
}
/* This run's cards, plus every card the stock already held, when allow says the account may stay.
   Own words first, then the newest. A card allow refuses is not carried and not added. */
function peopleCards(fresh, oldCards, allow) {
  const carried = (Array.isArray(oldCards) ? oldCards : []).filter(c => cardKeep(c) && !c.q && allow(c));
  const merged = mergeStock(carried, fresh.filter(allow), c => c.id);
  const said = trimNewsCards(merged.items);
  return { said, added: merged.added, carried: merged.carried };
}

/* Cards into videos. cards: in the order they should play (the first first). person(card): the accounts
   a card shows (nobody twice in a video); group(card): its genre or kind (at most cap of one in a video;
   the same one is not shown twice in a row). Videos whose cards are all still here are kept, and new
   videos are added. max > 0 keeps only that many of the newest; 0 keeps every video.
   With preferFresh, free cards are unused / less-recently-shown first; when every card is already in a
   video, the oldest packs are retired so those clips can be reshown instead of looping the same set. */
function deal(cards, before, { person, group, cap, tag, max = MAX, tail, version, preferFresh = false }) {
  const byId = new Map(cards.map(c => [c.id, c]));
  const known = new Set(byId.keys());
  if (tail) tail.pool.forEach(c => known.add(c.id));
  /* A video made by an older version of this program is made again. */
  let kept = bounded((Array.isArray(before) ? before : []).filter(v => v && Array.isArray(v.c) && v.c.length && (v.v || 1) === (version || 1) && v.c.every(id => known.has(id))), max);
  const usedOf = list => new Set(list.flatMap(v => (v.c || []).map(String)));
  let used = usedOf(kept);
  /* A cap that is already full takes only cards newer than its oldest video (older ones would be
     dealt, and dropped again, at every run). With no cap, every card not yet in a video can join one. */
  const freeNow = () => {
    const oldest = max > 0 && kept.length >= max ? Math.min(...kept.map(v => Date.parse(v.at || 0) || 0)) : -Infinity;
    return cards.filter(c => !used.has(String(c.id)) && time(c) > oldest);
  };
  /* Prefer unused / less-recent; if nothing free and we still want packs, retire oldest videos. */
  if (preferFresh) {
    let guard = kept.length + 1;
    while (freeNow().length < SIZE && kept.length && guard-- > 0) {
      kept = kept.slice().sort((a, b) => (Date.parse(a.at || 0) || 0) - (Date.parse(b.at || 0) || 0));
      kept.shift();
      used = usedOf(kept);
    }
  }
  let free = preferFresh ? preferUnused(freeNow(), before) : shuffle(freeNow());
  /* tail: cards that close each video (what people said, three in ten), each used once. */
  const tails = tail ? shuffle(tail.pool.filter(c => !used.has(String(c.id)))) : [];
  const made = [];
  const stamp = Date.now().toString(36);
  let lastPeople = new Set();
  for (;;) {
    const end = [];
    if (tail) for (const c of tails) { if (end.length >= tail.count) break; if (!end.some(e => person(e)[0] === person(c)[0])) end.push(c); }
    const size = SIZE - end.length;
    if (free.length < size) break;
    end.forEach(c => tails.splice(tails.indexOf(c), 1));
    free = preferFresh ? preferUnused(free, before.concat(made)) : shuffle(free);
    const v = [];
    const people = new Set();
    const groups = {};
    /* Prefer accounts not in the previous video; then nobody twice; then genre cap; then relax. */
    for (let pass = 0; pass < 4 && v.length < size; pass++) {
      for (const c of free) {
        if (v.length >= size) break;
        if (v.includes(c)) continue;
        const ps = person(c);
        if (pass < 3 && ps.some(p => people.has(p))) continue;
        if (pass < 1 && ps.some(p => lastPeople.has(p))) continue;
        const g = group(c);
        if (pass < 2 && g && (groups[g] || 0) >= cap) continue;
        v.push(c);
        ps.forEach(p => people.add(p));
        groups[g] = (groups[g] || 0) + 1;
      }
    }
    free = free.filter(c => !v.includes(c));
    /* The same genre not twice in a row where that can be helped; shuffle within that. */
    const order = [];
    const left = shuffle(v.slice());
    while (left.length) {
      const last = order.length ? group(order[order.length - 1]) : null;
      const k = left.findIndex(c => group(c) !== last);
      order.push(left.splice(k < 0 ? 0 : k, 1)[0]);
    }
    order.push(...end);
    lastPeople = new Set(order.flatMap(c => person(c)));
    made.push({ i: 'v' + stamp + made.length.toString(36), ...(version ? { v: version } : {}), at: order.reduce((m, c) => (time(c) > Date.parse(m || 0) ? c.at : m), ''), ...(tag ? tag(order) : {}), c: order.map(c => c.id) });
  }
  const videos = bounded(kept.concat(made).sort((x, y) => (Date.parse(y.at || 0) || 0) - (Date.parse(x.at || 0) || 0)), max);
  const now = new Set(videos.map(v => v.i));
  return { videos, made: made.filter(v => now.has(v.i)).length, kept: kept.filter(v => now.has(v.i)).length, waiting: free.length };
}
/* Write only what changed (the time it was made aside), so a run with nothing new publishes nothing. */
async function save(name, data) {
  const file = path.join(OUT, 'v1', name);
  const old = await readJson(file, null);
  const same = old && JSON.stringify({ ...old, made: '' }) === JSON.stringify({ ...data, made: '' });
  if (same) return false;
  await writeFile(file, JSON.stringify(data) + '\n');
  return true;
}

async function main() {
  await mkdir(path.join(OUT, 'v1'), { recursive: true });
  const news = await readJson(path.join(OUT, 'v1', 'news-ja.json'), {});
  const humor = await readJson(path.join(OUT, 'v1', 'humor-ja.json'), {});
  const oldNews = await readJson(path.join(OUT, 'v1', 'stock-news-ja.json'), {});
  const oldHumor = await readJson(path.join(OUT, 'v1', 'stock-humor-ja.json'), {});
  const made = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  /* githito.xapi's principles (PRINCIPLES.md), sent with the stock so that whoever reads the files reads them too. */
  const principles = ['A place to enjoy replies and to watch the news lightly.', 'No fear of being swayed by advertising: no ads, promotions or calls to buy.', 'Not a place for slander: nothing that hurts or runs people down, no attacks on politicians, parties, the government or the media.', 'Nothing that upsets anyone: no cruel news, nothing about one person\'s honour or private life, no alcohol or smoking.', 'Even-handed. When in doubt, a thing is left out.'];
  const asked = Array.isArray(news.asked) ? news.asked : [];
  const memo = await newsAccounts(opt('memo', process.env.XAPI_MEMO_DIR || ''));
  /* News videos: registered accounts' own posts only (news-famous.json + people.mjs).
     Replies, keyword search, and other people's posts never become news cards or videos. */
  const registered = c => !!c && !!c.own && memo.handles.has(String(c.h || '').replace(/^@+/, '').toLowerCase());
  const allowJa = c => registered(c) && ((String((c.ja || []).join('')).match(/[ぁ-ヿ一-鿿]/g) || []).length >= 4);
  const allowEn = c => {
    const t = String((c.ja || []).join(''));
    return registered(c) && (t.match(/[A-Za-z]/g) || []).length >= 12 && !/[ぁ-ヿ一-鿿\u0900-\u097F]/.test(t);
  };
  const newsReady = !memo.missing && memo.handles.size > 0;
  let changed = false;

  /* Replies to accounts a reader asked for (Settings): kept for that reader only, not dealt into news videos. */
  const posts = news.news && typeof news.news === 'object' ? news.news : {};
  const replies = (Array.isArray(news.items) ? news.items : []).map(x => replyCard(x, posts[x.n])).filter(Boolean)
    .sort((x, y) => time(y) - time(x)).slice(0, 200);

  /* News videos: people.mjs posts from the memo only. Older headline/reply cards are dropped. */
  const pplFile = await readJson(path.join(OUT, 'v1', 'people-ja.json'), {});
  const freshSaid = (Array.isArray(pplFile.people) ? pplFile.people : [])
    .filter(p => p && p.own && memo.handles.has(String(p.h || '').replace(/^@+/, '').toLowerCase()))
    .map(p => personCard(p, null)).filter(Boolean);
  if (!newsReady) {
    const file = { version: 2, lang: 'ja', made, principles, size: SIZE, cards: [], videos: [], replies, asked };
    if (await save('stock-news-ja.json', file)) changed = true;
    console.log('News: news-famous.json is missing or empty, so the news stock was cleared (unregistered cards must not stay).');
  } else {
    const { said, added, carried } = peopleCards(freshSaid, oldNews.cards, allowJa);
    const dropped = (Array.isArray(oldNews.cards) ? oldNews.cards : []).filter(c => cardKeep(c) && !allowJa(c)).length;
    /* version 4: drop videos built from the old non-registered / non-own generator.
       Prefer unused / less-recent cards; cap near NEWS_STOCK so the page does not loop a tiny set. */
    const newsMax = MAX > 0 ? MAX : NEWS_VIDEOS;
    const d = deal(said, oldNews.videos, { person: c => [String(c.h).toLowerCase()], group: c => c.g || 'other', cap: 4, version: 4, max: newsMax, preferFresh: true });
    const file = { version: 2, lang: 'ja', made, principles, size: SIZE, cards: said, videos: d.videos, replies, asked };
    if (await save('stock-news-ja.json', file)) changed = true;
    const cuts = {}; said.forEach(c => { cuts[c.cut] = (cuts[c.cut] || 0) + 1; });
    console.log(`News: ${said.length} cards from registered accounts (${added} added this run, ${carried} already in the stock; target ~${NEWS_STOCK}, ~${NEWS_PER}/account) ${JSON.stringify(cuts)}; ${dropped} unregistered/non-own cards dropped; videos: ${d.videos.length} (${d.made} new, ${d.kept} kept), ${d.waiting} cards wait for the next video; ${replies.length} replies to asked accounts.`);
  }

  /* News in English: the memo's English accounts (people-en.json), own posts only. */
  const oldEn = await readJson(path.join(OUT, 'v1', 'stock-news-en.json'), {});
  const pplEn = await readJson(path.join(OUT, 'v1', 'people-en.json'), {});
  const freshEn = (Array.isArray(pplEn.people) ? pplEn.people : [])
    .filter(p => p && p.own && memo.handles.has(String(p.h || '').replace(/^@+/, '').toLowerCase()))
    .map(p => personCardEn(p, null)).filter(Boolean);
  if (!newsReady) {
    const enFile = { version: 2, lang: 'en', made, principles, size: SIZE, cards: [], videos: [] };
    if (await save('stock-news-en.json', enFile)) changed = true;
    console.log('News in English: news-famous.json is missing or empty, so the English news stock was cleared.');
  } else {
    const en = peopleCards(freshEn, oldEn.cards, allowEn);
    const droppedEn = (Array.isArray(oldEn.cards) ? oldEn.cards : []).filter(c => cardKeep(c) && !allowEn(c)).length;
    const enMax = MAX > 0 ? MAX : NEWS_VIDEOS;
    const enDeal = deal(en.said, oldEn.videos, { person: c => [String(c.h).toLowerCase()], group: c => c.g || 'other', cap: 4, version: 4, max: enMax, preferFresh: true });
    const enFile = { version: 2, lang: 'en', made, principles, size: SIZE, cards: en.said, videos: enDeal.videos };
    if (await save('stock-news-en.json', enFile)) changed = true;
    console.log(`News in English: ${en.said.length} cards from registered accounts (${en.added} added this run, ${en.carried} already in the stock; target ~${NEWS_STOCK}); ${droppedEn} unregistered/non-own cards dropped; videos: ${enDeal.videos.length} (${enDeal.made} new, ${enDeal.kept} kept).`);
  }

  /* Reply News / Humor: a video is conversations, whole, about ten messages: greetings said with love first,
     then the longest talks; nobody in two talks of one video; in each video the talks follow the day.
     Only talks from registered humor accounts (humor-accounts.json). Past stock is rejudged every run:
     ordinary replies without clear romantic feeling are pruned; published talks never include handles. */
  const humorMemo = await humorAccounts(opt('memo', process.env.XAPI_MEMO_DIR || ''));
  const humorReady = !humorMemo.missing && humorMemo.handles.size > 0;
  /* Handles present → every author must be on the memo. Opaque speaker index (privacy v3+) → already filtered upstream. */
  const humorAllow = t => {
    if (!t || !Array.isArray(t.m) || t.m.length < 2) return false;
    const keyed = t.m.every(x => x && (x.h || x.s != null));
    if (!keyed) return false;
    if (t.m.every(x => x.h && !String(x.h).startsWith('s'))) {
      return t.m.every(x => humorMemo.handles.has(String(x.h).replace(/^@+/, '').toLowerCase()));
    }
    return true;
  };
  const stories = Array.isArray(humor.stories) ? humor.stories : [];
  const seenMsg = new Set();
  if (!humorReady) {
    const file = { version: 3, lang: 'ja', made, principles, size: SIZE, privacy: 'text-only', talks: [], videos: [], replies, asked };
    if (await save('stock-humor-ja.json', file)) changed = true;
    console.log('Reply News: humor-accounts.json is missing or empty, so the humor stock was cleared (unregistered talks must not stay).');
  } else {
    const jstH = iso => { const ms = Date.parse(iso || 0); return ms ? new Date(ms + 9 * 3600e3).getUTCHours() : -1; };
    const slotOfHour = h => (h >= 4 && h < 11 ? 'morning' : (h >= 21 || (h >= 0 && h < 4) ? 'night' : 'day'));
    const retimed = t => {
      if (!t) return null;
      const text = (t.m || []).map(x => (x.ja || []).join(' ')).join(' ');
      if (humorHarsh(text)) return null;
      const h = jstH(t.at);
      if (h >= 0 && t.k === 'morning' && slotOfHour(h) !== 'morning') t = { ...t, k: /好き|すき|愛|love|♡|❤/i.test(text) ? 'love' : 'other' };
      if (h >= 0 && t.k === 'night' && slotOfHour(h) !== 'night') t = { ...t, k: /好き|すき|愛|love|♡|❤/i.test(text) ? 'love' : 'other' };
      return t;
    };
    const prepare = t => {
      const r = retimed(t);
      if (!r || !talkKeep(r) || !humorAllow(r)) return null;
      return pruneRomanticTalk(r, 'ja');
    };
    const beforeCarry = Array.isArray(oldHumor.talks) ? oldHumor.talks.length : 0;
    const freshTalks = stories.map(talkCards).map(prepare).filter(t => t && !t.m.some(x => x.i && seenMsg.has(x.i)) && (t.m.forEach(x => x.i && seenMsg.add(x.i)), true));
    const carriedTalks = (Array.isArray(oldHumor.talks) ? oldHumor.talks : []).map(prepare).filter(Boolean);
    const prunedOrdinary = Math.max(0, beforeCarry - carriedTalks.length);
    if (prunedOrdinary) console.log(`Reply News: pruned ${prunedOrdinary} old talks that were not clearly romantic (ordinary comments dropped).`);
    /* A talk already in a video claims its messages first, so that video is not broken by a new copy of the same lines. */
    const freshIds = new Set(freshTalks.map(t => String(t.i)));
    const carriedIds = new Set(carriedTalks.map(t => String(t.i)));
    const inVideo = new Set((Array.isArray(oldHumor.videos) ? oldHumor.videos : []).flatMap(v => (v && v.c || []).map(String)));
    const mergedTalks = mergeStock(carriedTalks, freshTalks, t => t.i);
    const talkSeen = new Set();
    const rawTalks = [];
    const claimOrder = mergedTalks.items.slice().sort((a, b) => (inVideo.has(String(a.i)) ? 0 : 1) - (inVideo.has(String(b.i)) ? 0 : 1));
    for (const t of claimOrder) {
      if (t.m.some(x => x.i && talkSeen.has(String(x.i)))) continue;
      t.m.forEach(x => x.i && talkSeen.add(String(x.i)));
      rawTalks.push(t);
    }
    let videos = [];
    let built = [];
    let kept = [];
    if (rawTalks.length) {
      const rank = t => t.gl * 100 + Math.min(t.m.length, 8) * 6 + (Number(t.s) || 0);
      rawTalks.sort((x, y) => (rank(y) - rank(x)) || (time(y) - time(x)));
      const byId = new Map(rawTalks.map(t => [String(t.i), t]));
      /* Keep only videos tagged with a time slot whose talks all survived romance rejudge. */
      kept = bounded((Array.isArray(oldHumor.videos) ? oldHumor.videos : []).filter(v => v && v.slot && Array.isArray(v.c) && v.c.length && v.c.every(id => byId.has(String(id)))), MAX);
      const used = new Set(kept.flatMap(v => v.c.map(String)));
      const oldest = MAX > 0 && kept.length >= MAX ? Math.min(...kept.map(v => Date.parse(v.at || 0) || 0)) : -Infinity;
      let free = rawTalks.filter(t => !used.has(String(t.i)) && time(t) > oldest);
      const DAY = { morning: 0, home: 1, love: 2, icha: 2, miss: 2, other: 2, night: 3 };
      const jstHour = iso => { const ms = Date.parse(iso || 0); return ms ? new Date(ms + 9 * 3600e3).getUTCHours() : -1; };
      const daySlot = h => (h >= 4 && h < 11 ? 'morning' : (h >= 21 || (h >= 0 && h < 4) ? 'night' : 'day'));
      /* Prefer the hour the talk was posted (Japan time); fall back to the greeting kind. */
      const talkSlot = t => {
        const h = jstHour(t.at);
        if (h >= 0) return daySlot(h);
        if (t.k === 'morning') return 'morning';
        if (t.k === 'night') return 'night';
        return 'day';
      };
      const stamp = Date.now().toString(36);
      built = [];
      /* Build videos inside one time slot so morning greetings do not dominate evening plays. */
      const bySlot = { morning: [], day: [], night: [] };
      free.forEach(t => bySlot[talkSlot(t)].push(t));
      const pack = (pool, slot) => {
        let left = pool.slice();
        while (left.reduce((n, t) => n + t.m.length, 0) >= SIZE - 2) {
          const v = [];
          const people = new Set();
          let n = 0;
          for (const strict of [true, false]) {
            for (const t of left) {
              if (n >= SIZE) break;
              if (v.includes(t) || (n && n + t.m.length > SIZE + 2)) continue;
              const who = [...new Set(t.m.map(speakerKey).filter(Boolean))];
              if (strict && who.some(h => people.has(h))) continue;
              v.push(t); who.forEach(h => people.add(h)); n += t.m.length;
            }
            if (n >= SIZE - 2) break;
          }
          if (n < SIZE - 2) break;
          left = left.filter(t => !v.includes(t));
          /* Within a slot, order by kind so morning/home/night/love feel like realtime reply news. */
          v.sort((x, y) => (DAY[x.k] ?? 2) - (DAY[y.k] ?? 2));
          const g = Math.round(v.reduce((c, t) => c + t.gl * t.m.length, 0) / n * 10) / 10;
          built.push({
            i: 'v' + stamp + built.length.toString(36),
            at: v.reduce((m, t) => (time(t) > Date.parse(m || 0) ? t.at : m), ''),
            g, slot, ...(slot === 'morning' ? { m: 1 } : {}),
            c: v.map(t => t.i),
          });
        }
        return left;
      };
      const leftover = [];
      leftover.push(...pack(bySlot.morning, 'morning'));
      leftover.push(...pack(bySlot.day, 'day'));
      leftover.push(...pack(bySlot.night, 'night'));
      /* Rare leftovers of mixed hours: still one video, tagged by majority slot. */
      free = leftover;
      while (free.reduce((n, t) => n + t.m.length, 0) >= SIZE - 2) {
        const v = [];
        const people = new Set();
        let n = 0;
        for (const strict of [true, false]) {
          for (const t of free) {
            if (n >= SIZE) break;
            if (v.includes(t) || (n && n + t.m.length > SIZE + 2)) continue;
            const who = [...new Set(t.m.map(speakerKey).filter(Boolean))];
            if (strict && who.some(h => people.has(h))) continue;
            v.push(t); who.forEach(h => people.add(h)); n += t.m.length;
          }
          if (n >= SIZE - 2) break;
        }
        if (n < SIZE - 2) break;
        free = free.filter(t => !v.includes(t));
        const counts = { morning: 0, day: 0, night: 0 };
        v.forEach(t => { counts[talkSlot(t)] += t.m.length; });
        const slot = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        const g = Math.round(v.reduce((c, t) => c + t.gl * t.m.length, 0) / n * 10) / 10;
        built.push({ i: 'v' + stamp + built.length.toString(36), at: v.reduce((m, t) => (time(t) > Date.parse(m || 0) ? t.at : m), ''), g, slot, ...(slot === 'morning' ? { m: 1 } : {}), c: v.map(t => t.i) });
      }
      /* Greetings said with love first, then the newest. Every video stays unless --videos sets a cap. */
      videos = bounded(kept.concat(built).sort((x, y) => (Math.round((y.g || 0) * 2) - Math.round((x.g || 0) * 2)) || ((Date.parse(y.at || 0) || 0) - (Date.parse(x.at || 0) || 0))), MAX);
    }
    const talks = rawTalks.map(anonymizeTalk).filter(Boolean);
    /* Always write: empty / pruned talk list clears ordinary and unregistered content from public stock. */
    const file = { version: 3, lang: 'ja', made, principles, size: SIZE, privacy: 'text-only', talks, videos, replies, asked };
    if (await save('stock-humor-ja.json', file)) changed = true;
    if (talks.length) {
      const msgs = {}; talks.forEach(t => { msgs[t.m.length] = (msgs[t.m.length] || 0) + 1; });
      const gl = [0, 1, 2].map(g => talks.filter(t => t.gl === g).length);
      const addedN = talks.filter(t => freshIds.has(String(t.i)) && !carriedIds.has(String(t.i))).length;
      console.log(`Reply News: ${talks.length} clearly-romantic talks, handles stripped (${addedN} added this run, ${talks.length - addedN} already in the stock; messages per talk ${JSON.stringify(msgs)}; greeting with love ${gl[2]}, one of the two ${gl[1]}, neither ${gl[0]}); videos: ${videos.length} (${built.filter(v => videos.includes(v)).length} new, ${kept.filter(v => videos.includes(v)).length} kept, ${videos.filter(v => v.m).length} of the morning).`);
    } else console.log('Reply News: no clearly-romantic talks from the memo accounts; humor stock cleared of ordinary/unregistered content.');
  }

  if (changed) await writeFile(path.join(OUT, '.changed'), made + '\n');
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
