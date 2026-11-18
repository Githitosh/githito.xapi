#!/usr/bin/env node
/* githito.xapi: Reply News' own search data ("pseudo-search").

   Three times a day this program looks for people's posts on X about the genres' words, reads the
   replies under each, keeps the pairs that make a good talk (a person's post, then a lively reply),
   and writes them as plain JSON files. Those files are the API: Reply News reads them and makes its
   videos from them, so the page itself never searches X and never waits for a search.

     node collect.mjs                 collect once into ./public (Japanese)
     node collect.mjs --langs ja,en   both languages
     node collect.mjs --add 40        stop after 40 new talks (170 unless told)
   One run gathers about 2000 posts and replies (50 searches of posts about love and 50 of replies,
   about 20 each) and puts them through three filters, counting what each lets by:
     1. may it play, and whose account is it;  2. is it what is wanted (a person's own talk of love;
     a reply with a punch or a reaction of a few words);  3. read from X itself and judged again.
     node collect.mjs --dry           print the counts, write nothing
     node collect.mjs --no-search     search nothing: judge what is saved again by the rules as they are now

   How the posts are found is set in config.json ("source"), or by XAPI_SOURCE:
     fxtwitter  Two stages, so that the unofficial service is asked as little as possible and cannot
                steer what a genre shows:
                1. Searches of replies with everyday words that belong to no genre (words.json,
                   "any"), each over two hours drawn at random. That is all api.fxtwitter.com is
                   asked; it is not told which genres are wanted.
                2. This program filters what came back (rules.mjs), reads the reply and the post it
                   answers from X's official embed API (publish.x.com), keeps X's own words, and
                   sorts the talks into genres by what they say. The post a reply answers may
                   itself be part of a longer talk, and many talks belong to no genre ("other").
                The same run also fills Matching News' data (v1/match-<lang>.json): people's own
                posts about love, found by a few searches of posts with words of love (words.json,
                "match"), and the replies that bring no subject of their own (a laugh, a "really?"),
                so that the page can put a post beside a reply written to some other post.
     official   X's own API (v2, recent search). Needs the key X_BEARER_TOKEN; X charges for every post
                it returns, so a run stops at a number of posts ("reads" in config.json).
     auto       official when the key is set, otherwise off.
     off        nothing is collected.
   Node 20 or newer; no packages to install. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { talkPost, pickReplies, zest, stamp, readJson, writeApi, writeIndex, young, stillOk, readEmbed, genreOf, plain, pickLine, lineOf, lineKey, asks, cleanText, postOk, writeMatch, lovePost, loveSafe, loveFit, replySafe, sideOf, wishes, freeOf, sayOk, sayText, pairable, pairUp, lexiconWords, romanceWords, romanceSay } from './rules.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = name => args.includes('--' + name);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const num = (name, d) => { const v = Number(process.env['XAPI_' + name.toUpperCase()] || opt(name, d)); return Number.isFinite(v) && v > 0 ? v : d; };
let FILE = {};
try { FILE = JSON.parse(await readFile(path.join(HERE, 'config.json'), 'utf8')); } catch (e) {}
const CONF = {
  token: process.env.X_BEARER_TOKEN || '',
  source: String(process.env.XAPI_SOURCE || opt('source', FILE.source || 'off')).toLowerCase(),
  langs: String(process.env.XAPI_LANGS || opt('langs', (FILE.langs || ['ja']).join(','))).split(',').map(s => s.trim()).filter(l => l === 'ja' || l === 'en'),
  out: path.resolve(opt('out', path.join(HERE, 'public'))),
  add: num('add', FILE.add || 170),    // new talks wanted from one run
  keep: num('keep', FILE.keep || 500), // talks the API holds
  posts: num('posts', FILE.posts || 400), // posts Matching News' data holds
  lines: num('lines', FILE.lines || 300), // lines Matching News' data holds
  searches: num('searches', FILE.searches || 50), // searches of replies one run may make (about 20 replies each)
  /* Searches of posts about love (the earlier matching). 0 in config.json turns them off. */
  loveSearches: FILE.loveSearches === 0 && !opt('lovesearches', '') ? 0 : num('lovesearches', FILE.loveSearches || 50),
  saySearches: num('saysearches', FILE.saySearches || 50), // searches of posts for short sayings (about 20 posts each)
  says: num('says', FILE.says || 800), // sayings Matching News' data holds
  /* How many posts and replies one extra host (vxTwitter, FixupX) is asked for in a run. */
  perHost: num('perhost', FILE.perHost || 2000),
  extra: (Array.isArray(FILE.extra) ? FILE.extra : ['vxtwitter', 'fixupx']).map(s => String(s).toLowerCase()).filter(s => s === 'vxtwitter' || s === 'fixupx'),
  reads: num('reads', FILE.reads || 300), // posts X may return in one run (X charges for each)
  perWord: num('perword', 6),    // talks one word may give in a run
  hours: num('hours', 48),       // a talk leaves the API after this many hours
  pause: num('pause', 6000),     // milliseconds between two searches
  rest: num('rest', 120000),     // milliseconds to rest when a search is refused
  patience: num('patience', 4),  // refusals in a row before a run stops searching
  dry: flag('dry'),
  noSearch: flag('no-search') || process.env.XAPI_NO_SEARCH === '1', // judge what is saved again with the rules as they are now; ask nothing
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- where the posts come from ---------- */
/* X's answers are turned into a plain record, which is all the rules above look at. */
let asked = 0;
let read = 0;
class Refused extends Error {}
const iso = v => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString().replace(/\.\d+Z$/, 'Z') : ''; };
/* api.fxtwitter.com: asked one kind of question only, a search of replies that say an everyday word.
   Its answer tells which replies there are and which post each one answers. The words that are saved
   are read from X (twoStages below). */
const fx = {
  name: 'fxtwitter',
  record(st) {
    const a = (st && st.author) || {};
    const to = (st && st.replying_to) || {};
    return {
      id: String((st && st.id) || ''), raw: String((st && st.text) || ''),
      user: { username: String(a.screen_name || ''), name: a.name || '', description: a.description || '', protected: !!a.protected, org: false, followers: a.followers || 0, statuses: a.statuses || 0, joined: iso(a.joined) },
      replyTo: to.status ? String(to.status) : '', replyToHandle: String(to.screen_name || ''), isReply: !!to.status,
      quote: !!(st && st.quote), repost: !!(st && st.reposted_by), replies: (st && st.replies) || 0, likes: (st && st.likes) || 0,
      sensitive: !!(st && st.possibly_sensitive), media: false, picture: !!(st && st.media && Object.keys(st.media).length), at: iso(st && st.created_at),
    };
  },
  async ask(q) {
    asked++;
    let res;
    try { res = await fetch((process.env.XAPI_FX_BASE || 'https://api.fxtwitter.com') + '/2/search?count=100&q=' + encodeURIComponent(q), { headers: { 'user-agent': 'githito.xapi collector' }, signal: AbortSignal.timeout(30000) }); }
    catch (e) { throw new Refused('search did not answer'); }
    const data = await res.json().catch(() => null);
    /* A search that is refused answers 404 (one that finds nothing answers 200 with no results). */
    if (res.status !== 200 || (data && data.code && data.code !== 200)) throw new Refused('search refused (' + res.status + ')');
    return ((data && data.results) || []).map(st => this.record(st));
  },
  /* Posts and replies alike (no reposts or links) that say the word: short sayings are mostly replies. */
  any(word, lang) {
    const until = Math.floor(Date.now() / 1000) - (1 + Math.floor(Math.random() * 46)) * 3600;
    return this.ask(`${word} -filter:retweets -filter:links lang:${lang} since_time:${until - 7200} until_time:${until}`);
  },
  /* People's own posts (no replies, reposts or links) that say the word, written in two hours drawn from the last two days. */
  posts(word, lang) {
    const until = Math.floor(Date.now() / 1000) - (1 + Math.floor(Math.random() * 46)) * 3600;
    return this.ask(`${word} -filter:replies -filter:retweets -filter:links lang:${lang} since_time:${until - 7200} until_time:${until}`);
  },
  /* Replies that say the word, written in two hours drawn from the last two days. */
  search(word, lang) {
    const until = Math.floor(Date.now() / 1000) - (1 + Math.floor(Math.random() * 46)) * 3600;
    return this.ask(`${word} filter:replies -filter:retweets lang:${lang} since_time:${until - 7200} until_time:${until}`);
  },
};
/* vxTwitter and FixupX do not search. FxTwitter search only finds the posts. The words that are kept
   for a match are read again from these two, 2000 from each, then filtered and paired at random. */
const decode = t => String(t || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
const meta = (html, prop) => {
  const a = String(html || '').match(new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]*)"`, 'i'));
  const b = String(html || '').match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${prop}"`, 'i'));
  return decode((a || b || [])[1] || '');
};
async function readVx(handle, id) {
  const res = await fetch(`https://api.vxtwitter.com/${handle}/status/${id}`, { headers: { 'user-agent': 'githito.xapi collector', accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data || !data.tweetID || !data.text) return null;
  return {
    text: String(data.text).replace(/https?:\/\/\S+/g, '').trim(),
    handle: data.user_screen_name || handle,
    replyTo: data.replyingToID ? String(data.replyingToID) : '',
    replyToHandle: data.replyingTo || '',
  };
}
async function readFixup(handle, id) {
  const res = await fetch(`https://fixupx.com/${handle}/status/${id}`, { headers: { 'user-agent': 'Discordbot/2.0', accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok) return null;
  const html = await res.text();
  const title = meta(html, 'og:title');
  const text = meta(html, 'og:description').replace(/https?:\/\/\S+/g, '').trim();
  if (!text) return null;
  const who = (title.match(/@([A-Za-z0-9_]{1,15})/) || [])[1] || handle;
  return { text, handle: who, replyTo: '', replyToHandle: '' };
}
const readHost = { vxtwitter: readVx, fixupx: readFixup };
/* A post or a reply read from X itself (its official embed API), as the plain record the rules read. */
async function fromX(handle, id, replyTo) {
  const e = await readEmbed(handle, id);
  if (!e) return null;
  read++;
  return {
    id: e.id, raw: e.raw,
    user: { username: e.handle, name: e.name, description: '', protected: false, org: false, followers: 0 },
    replyTo: replyTo || '', isReply: !!replyTo, quote: false, repost: false, replies: 1, likes: 0, sensitive: false, media: false, at: '',
  };
}
/* Matching News' posts: people's own posts about love. A few searches of posts with words of love; this
   program's rules choose (rules.mjs, lovePost: no partner-seeking, no selling, no fiction, no school
   age, an account that is old and ordinary); then the post is read from X itself and X's words are
   judged again and saved. */
async function loveStage(lang, words, wordsShe) {
  const posts = [];
  /* Posts that speak of a girlfriend are much rarer than posts that speak of a boyfriend, and a match
     needs one of each: every other search is for the girlfriend side. */
  const a = shuffle(words), b = shuffle(wordsShe || []);
  const list = [];
  for (let k = 0; k < Math.max(a.length, b.length) * 2; k++) { const from = k % 2 === 0 && b.length ? b : a; if (from.length) list.push(from[Math.floor(k / 2) % from.length]); }
  const count = { gathered: 0, filter1: 0, filter2: 0, filter3: 0 };
  let searches = 0;
  let refusals = 0;
  for (let n = 0; !CONF.noSearch && n < CONF.loveSearches && list.length; n++) {
    const word = list[n % list.length];
    let got;
    try { got = await fx.posts(word, lang); searches++; refusals = 0; }
    catch (e) {
      if (!(e instanceof Refused)) throw e;
      if (++refusals >= CONF.patience) { console.log(`  ${e.message}: stopping with what was found`); break; }
      console.log(`  ${e.message}: resting two minutes`);
      await sleep(CONF.rest);
      n--;
      continue;
    }
    count.gathered += got.length;
    /* Filter 1: may it play, and whose account is it. Filter 2: is it a person's own talk about love. */
    const safe1 = got.map(p => ({ ...p, media: p.picture })).filter(p => loveSafe(p, lang));
    count.filter1 += safe1.length;
    const cands = safe1.filter(p => loveFit(loveSafe(p, lang).text, lang) && !posts.some(x => x.handle.toLowerCase() === p.user.username.toLowerCase()));
    count.filter2 += cands.length;
    let kept = 0;
    /* Filter 3: X itself is asked for the post, and X's words go through filters 1 and 2 again. */
    for (let i = 0; i < cands.length; i += 4) {
      const read4 = await Promise.all(cands.slice(i, i + 4).map(async c => {
        const x = await fromX(c.user.username, c.id, '');
        return x ? lovePost({ ...c, raw: x.raw, user: { ...c.user, username: x.user.username, name: x.user.name || c.user.name } }, lang) : null;
      }));
      read4.forEach(post => {
        if (!post || posts.some(x => x.id === post.id || x.handle.toLowerCase() === post.handle.toLowerCase())) return;
        posts.push({ ...post, genre: 'romance', word: word.replace(/[がにとの]$/, ''), found: stamp() });
        kept++;
      });
    }
    console.log(`  ${lang} love search ${n + 1} "${word}": ${got.length} posts, ${safe1.length} pass filter 1, ${cands.length} pass filter 2, ${kept} pass filter 3 (${posts.length} so far)`);
    await sleep(CONF.pause);
  }
  count.filter3 = posts.length;
  console.log(`  ${lang} posts about love: ${searches} searches gathered ${count.gathered} -> filter 1 (may it play, whose account) ${count.filter1} -> filter 2 (a person's own talk of love) ${count.filter2} -> filter 3 (read from X, judged again) ${count.filter3}.`);
  STAGES[lang] = { ...(STAGES[lang] || {}), posts: count };
  return posts;
}
/* Matching News' sayings: short things people say, found by searches (of posts and replies alike) with
   the words that pairs turn on (words.json, pairs). The same three filters: 1 and 2 are rules.mjs
   sayOk (whose account, may it play, is it short and its own); 3 is X itself: the saying is read from
   X's embed API and X's words are judged again. A reply is read with the post it answers, and kept
   only when that post may be shown too, because the reply's address leads there. */
const SAYS = {};
async function readSay(c, lang) {
  if (c.replyTo) {
    if (!c.replyToHandle) return null;
    const p = await fromX(c.replyToHandle, c.replyTo, '');
    if (!p || !cleanText(plain(p.raw))) return null;
  }
  const x = await fromX(c.user.username, c.id, c.replyTo || '');
  const say = x ? sayOk({ ...c, raw: x.raw, user: { ...c.user, username: x.user.username, name: x.user.name || c.user.name } }, lang) : null;
  return say ? { ...say, to: c.replyTo || '' } : null;
}
async function sayStage(lang, lex, anyWords) {
  const says = [];
  /* Find posts with FxTwitter (the only one of the three that searches). A romance lexicon is searched
     with romance words only: everyday words such as ねむい were filling the pool. Odd searches are replies. */
  const romance = lex && lex.romance ? romanceWords(lex) : lexiconWords(lex || {});
  const list = shuffle(lex && lex.romance ? romance : [].concat(romance, anyWords || []));
  const seen = new Set();
  const pool = [];
  const count = { gathered: 0, posts: 0, replies: 0, hosts: {} };
  let searches = 0;
  let refusals = 0;
  for (let n = 0; !CONF.noSearch && n < CONF.saySearches && (count.posts < CONF.perHost || count.replies < CONF.perHost) && list.length; n++) {
    const word = list[n % list.length];
    /* Replies until that side has 2000, then posts, so neither side is left thin. */
    const replies = count.replies < CONF.perHost && (count.posts >= CONF.perHost || n % 2 === 1);
    let got;
    try { got = replies ? await fx.search(word, lang) : await fx.any(word, lang); searches++; refusals = 0; }
    catch (e) {
      if (!(e instanceof Refused)) throw e;
      if (++refusals >= CONF.patience) { console.log(`  ${e.message}: stopping with what was found`); break; }
      console.log(`  ${e.message}: resting two minutes`);
      await sleep(CONF.rest);
      n--;
      continue;
    }
    count.gathered += got.length;
    got.forEach(p => {
      if (!p.id || seen.has(p.id)) return;
      seen.add(p.id);
      pool.push({ ...p, media: p.picture });
      if (p.replyTo) count.replies++; else count.posts++;
    });
    console.log(`  ${lang} find ${n + 1} "${word}" ${replies ? 'replies' : 'posts'}: ${got.length} (posts ${count.posts}, replies ${count.replies})`);
    if (count.posts < CONF.perHost || count.replies < CONF.perHost) await sleep(CONF.pause);
  }
  /* Each host is asked for up to 2000 posts and 2000 replies, drawn at random. The safety filter runs after. */
  for (const host of CONF.extra) {
    const sample = shuffle(pool.filter(p => !p.replyTo)).slice(0, CONF.perHost).concat(shuffle(pool.filter(p => p.replyTo)).slice(0, CONF.perHost));
    const read = readHost[host];
    let kept = 0;
    for (let i = 0; i < sample.length; i += 4) {
      const batch = await Promise.all(sample.slice(i, i + 4).map(async c => {
        let got;
        try { got = await read(c.user.username, c.id); }
        catch (e) { return null; }
        if (!got || !got.text) return null;
        const say = sayOk({ ...c, raw: got.text, user: { ...c.user, username: got.handle || c.user.username }, replyTo: got.replyTo || c.replyTo, replyToHandle: got.replyToHandle || c.replyToHandle }, lang);
        if (!say) return null;
        return { ...say, to: got.replyTo || c.replyTo || '', via: host, found: stamp() };
      }));
      batch.forEach(say => {
        if (!say || says.some(x => x.id === say.id)) return;
        says.push(say);
        kept++;
      });
    }
    count.hosts[host] = { read: sample.length, kept };
    console.log(`  ${lang} ${host}: read ${sample.length}, ${kept} passed the filter (${says.length} sayings so far)`);
  }
  count.kept = says.length;
  console.log(`  ${lang} sayings: ${searches} searches gathered ${count.gathered} (${count.posts} posts, ${count.replies} replies) -> ${CONF.extra.map(h => h + ' ' + ((count.hosts[h] && count.hosts[h].kept) || 0)).join(', ')} after the filter. ${says.length} sayings.`);
  STAGES[lang] = { ...(STAGES[lang] || {}), sayings: count };
  SAYS[lang] = says;
  return says;
}
/* The two stages. */
async function twoStages(lang, genres, any) {
  const file = path.join(CONF.out, 'v1', `talks-${lang}.json`);
  const before = await readJson(file, { talks: [] });
  /* Talks collected the earlier way (genre words) leave; the ones found this way and the ones sent by hand stay. */
  const old = (Array.isArray(before.talks) ? before.talks : []).filter(t => t && t.id && t.post && Array.isArray(t.replies) && (t.manual || t.via === 'random'));
  const have = new Set(old.map(t => t.id));
  const people = new Set();
  const found = [];
  const words = shuffle(any);
  let searches = 0;
  let refusals = 0;
  let replies = 0;
  let passed = 0;
  let gone = 0;
  let safe1 = 0;
  let saidGathered = 0;
  let saidKept = 0;
  /* For Matching News: the lines this run reads from X. */
  const lines = [];
  for (let n = 0; !CONF.noSearch && n < CONF.searches && found.length < CONF.add; n++) {
    /* Stage 1: one search, with a word that belongs to no genre. */
    const word = words[n % words.length];
    let list;
    try { list = await fx.search(word, lang); searches++; refusals = 0; }
    catch (e) {
      if (!(e instanceof Refused)) throw e;
      if (++refusals >= CONF.patience) { console.log(`  ${e.message}: stopping with what was found`); break; }
      console.log(`  ${e.message}: resting two minutes`);
      await sleep(CONF.rest);
      n--;
      continue;
    }
    replies += list.length;
    /* Filter 1: the writer may be shown and the words may play. */
    safe1 += list.filter(r => replySafe(r, lang)).length;
    /* Stage 2, here: which replies have a punch, about a post not yet kept. */
    const cands = [];
    let alone = 0;
    list.forEach(r => {
      if (!r.replyTo || !r.replyToHandle || have.has(r.replyTo)) return;
      if (people.has(r.replyToHandle.toLowerCase()) || cands.some(c => c.parent.id === r.replyTo)) return;
      const parent = { id: r.replyTo, handle: r.replyToHandle };
      const kept = pickReplies({ ...parent, text: '' }, [r], lang);
      const line = pickLine(r, lang);
      if (kept.length) cands.push({ parent, reply: kept[0], talk: true, line: !!line });
      /* A reply without a punch can still be a line for Matching News: a few of those from each search. */
      else if (line && alone < 6) { alone++; cands.push({ parent, reply: line, talk: false, line: true }); }
    });
    passed += cands.length;
    /* A short reply can be a saying for Matching News too: a few from each search, when it says a
       word that pairs turn on, asks, or looks for agreement. It is read from X with the post it
       answers, and kept when both may be shown. */
    if (LEX[lang]) {
      const short = list.map(r => ({ r, say: sayOk({ ...r, media: r.picture }, lang) })).filter(x => x.say && x.r.replyTo && x.r.replyToHandle && pairable(x.say.text, LEX[lang])).slice(0, 8);
      saidGathered += short.length;
      for (let i = 0; i < short.length; i += 4) {
        const read4 = await Promise.all(short.slice(i, i + 4).map(({ r }) => readSay({ ...r, media: r.picture }, lang)));
        read4.forEach(say => { if (say && !(SAYS[lang] || []).some(x => x.id === say.id)) { (SAYS[lang] = SAYS[lang] || []).push({ ...say, found: stamp() }); saidKept++; } });
      }
    }
    /* Then X itself is asked for the post and for the reply, and the rules judge X's own words. */
    let got = 0;
    for (let i = 0; i < cands.length && found.length < CONF.add; i += 4) {
      const pairs = await Promise.all(cands.slice(i, i + 4).map(async c => {
        const p = await fromX(c.parent.handle, c.parent.id, '');
        if (!p) { gone++; return null; }
        const post = talkPost(p, lang);
        /* A line is kept only when the post it was written to may be shown too: its address leads there. */
        if (!post && !(c.line && cleanText(plain(p.raw)))) return null;
        const r = await fromX(c.reply.handle, c.reply.id, c.parent.id);
        if (!r) { gone++; return post ? { post, replies: [], line: null } : null; }
        const kept = post && c.talk ? pickReplies(post, [r], lang) : [];
        const line = c.line ? pickLine({ ...r, replyToHandle: p.user.username }, lang) : null;
        return { post, replies: kept, line };
      }));
      pairs.forEach(t => {
        if (!t) return;
        if (t.line && !lines.some(x => x.id === t.line.id)) lines.push({ ...t.line, found: stamp() });
        if (!t.post || !t.replies.length) return;
        if (found.length >= CONF.add || have.has(t.post.id) || people.has(t.post.handle.toLowerCase())) return;
        have.add(t.post.id);
        people.add(t.post.handle.toLowerCase());
        /* Sorted into a genre by what the talk says. */
        const g = genreOf(t.post.text + ' ' + t.replies.map(r => r.text).join(' '), lang, genres);
        found.push({ id: t.post.id, genre: g.genre, word: g.word, found: stamp(), via: 'random', post: t.post, replies: t.replies });
        got++;
      });
    }
    console.log(`  ${lang} search ${n + 1} "${word}": ${list.length} replies, ${cands.length} pass the reply rules, ${got} talks (${found.length} so far)`);
    if (found.length < CONF.add) await sleep(CONF.pause);
  }
  const talks = shuffle(found).concat(old.filter(t => young(t, CONF.hours) && stillOk(t))).slice(0, CONF.keep);
  const made = {};
  found.forEach(t => { made[t.genre] = (made[t.genre] || 0) + 1; });
  console.log(`  ${lang} replies: ${searches} random searches gathered ${replies} -> filter 1 (may it play, whose account) ${safe1} -> filter 2 (a reply with a punch, or a reaction of a few words) ${passed} -> filter 3 (reply and its post read from X, judged again) ${lines.length} lines, ${found.length} talks ${JSON.stringify(made)}; ${gone} were not shown by X. ${talks.length} talks in the API.`);
  console.log(`  ${lang} sayings from replies: ${saidGathered} short replies passed filters 1 and 2 -> filter 3 (reply and its post read from X) ${saidKept}.`);
  STAGES[lang] = { ...(STAGES[lang] || {}), replies: { gathered: replies, filter1: safe1, filter2: passed, filter3: { lines: lines.length, talks: found.length, sayings: saidKept } } };
  NEW[lang] = { posts: (NEW[lang] && NEW[lang].posts) || [], lines };
  return { version: 1, lang, updated: stamp(), source: 'fxtwitter', count: talks.length, talks };
}
/* ---------- Matching News' data ---------- */
/* Two lists: people's posts about love (loveStage), and lines that can answer a post they were not
   written to (rules.mjs, lineOf). The posts come from this run and from the list saved before; the
   lines also from the talks in the API; all as long as they are young. The page draws a post and a line at random and
   shows them together, with both addresses; which post a line was really written to is kept ("to"), so
   the page never passes a real pair off as a match, nor a match as a real pair. Posts about politics
   are left out of the matching. */
const NEW = {};
/* The words pairs turn on, for each language (words.json, pairs). */
const LEX = {};
/* What each filter let by in this run, for each language: written into the API beside the data. */
const STAGES = {};
async function matchOf(lang, genres, talks, source) {
  const before = await readJson(path.join(CONF.out, 'v1', `match-${lang}.json`), {});
  const fresh = x => Date.now() - Date.parse(x.found || 0) < CONF.hours * 3600e3;
  const now = NEW[lang] || { posts: [], lines: [] };
  const posts = [];
  const lines = [];
  /* A post about politics is not matched: a laugh put beside it would read as that person's opinion. */
  const pol = genres.find(g => g.id === 'politics');
  const polWords = pol ? (pol[lang] || []).concat((pol.tell && pol.tell[lang]) || []).map(w => w.toLowerCase()) : [];
  const political = text => { const t = String(text || '').toLowerCase(); return polWords.some(w => t.includes(w)); };
  const addPost = (p, found) => {
    if (!postOk(p, lang) || political(p.text) || posts.some(x => x.id === p.id || x.handle.toLowerCase() === p.handle.toLowerCase())) return;
    posts.push({ id: p.id, handle: p.handle, text: p.text, url: p.url, at: p.at || '', genre: 'romance', word: p.word || '', asks: asks(p.text), side: sideOf(p.text, lang), wish: wishes(p.text, lang), free: freeOf(p.text, lang), via: 'love', found });
  };
  const addLine = (l, found) => {
    if (!l || !l.id || !l.handle || !l.to || !cleanText(l.text)) return;
    const k = lineOf(l.text, lang);
    const key = lineKey(l.text);
    if (!k || lines.some(x => x.id === l.id || x.key === key)) return;
    lines.push({ id: l.id, handle: l.handle, text: l.text, url: l.url, to: l.to, toHandle: l.toHandle || '', needs: k.needs, kind: k.kind, found, key });
  };
  shuffle(now.posts).forEach(p => addPost(p, p.found));
  shuffle(now.lines).forEach(l => addLine(l, l.found));
  /* Lines also from the talks in the API (not the ones sent by hand: those were chosen as a pair). */
  talks.filter(t => !t.manual).forEach(t => t.replies.forEach(r => addLine({ ...r, to: t.post.id, toHandle: t.post.handle }, t.found)));
  /* Earlier posts stay only when they were found as posts about love. */
  (Array.isArray(before.posts) ? before.posts : []).filter(p => fresh(p) && p.via === 'love').forEach(p => addPost(p, p.found));
  (Array.isArray(before.lines) ? before.lines : []).filter(fresh).forEach(l => addLine(l, l.found));
  /* The sayings: this run's, and the earlier ones that are still young and still pass the rules. One
     saying of the same words by the same person is enough. */
  const says = [];
  const addSay = x => {
    if (!x || !x.id || !x.handle || !x.url || !sayText(x.text, lang)) return;
    if (says.some(y => y.id === x.id || (y.handle.toLowerCase() === x.handle.toLowerCase() && lineKey(y.text) === lineKey(x.text)))) return;
    says.push({ id: x.id, handle: x.handle, text: x.text, url: x.url, reply: !!x.reply, to: x.to || '', found: x.found });
  };
  shuffle(SAYS[lang] || []).forEach(addSay);
  (Array.isArray(before.says) ? before.says : []).filter(fresh).forEach(addSay);
  /* What the API already holds, read from X and judged before, is a source too: the short posts and
     replies of the talks, and the lines. A reply keeps the post it was really written to ("to"), so
     the two are never paired as a match. */
  talks.filter(t => !t.manual).forEach(t => {
    addSay({ ...t.post, found: t.found });
    t.replies.forEach(r => addSay({ ...r, reply: true, to: t.post.id, found: t.found }));
  });
  lines.forEach(l => addSay({ ...l, reply: true, found: l.found }));
  const love = shuffle(says.filter(s => romanceSay(s.text)));
  const rest = shuffle(says.filter(s => !romanceSay(s.text)));
  /* Romance keeps sayings about love. Sleepy and everyday lines from the previous file are not carried over. */
  const kept = (LEX[lang] && LEX[lang].romance ? love : love.concat(rest)).slice(0, CONF.says);
  const pairs = LEX[lang] ? pairUp(kept, LEX[lang], lang) : [];
  const kinds = {};
  pairs.forEach(p => { kinds[p.kind] = (kinds[p.kind] || 0) + 1; });
  console.log(`  ${lang} matching: ${kept.length} sayings make ${pairs.length} pairs ${JSON.stringify(kinds)}.`);
  /* A run that searched nothing keeps the counts of the last run that did. */
  const stages = CONF.noSearch || !STAGES[lang] ? (before.stages || null) : { at: stamp(), ...STAGES[lang] };
  const out = { version: 2, lang, updated: stamp(), source, stages, says: kept, pairs, posts: posts.slice(0, CONF.posts), lines: lines.slice(0, CONF.lines).map(({ key, ...l }) => l) };
  const sides = k => out.posts.filter(p => p.side === k).length;
  console.log(`  ${lang} matching: ${out.posts.length} posts (${sides('boyfriend')} speak of a boyfriend, ${sides('girlfriend')} of a girlfriend, ${sides('')} of neither; ${out.posts.filter(p => p.wish).length} wish for one; ${out.posts.filter(p => p.free).length} are free to be matched) and ${out.lines.length} lines.`);
  return out;
}
const official = {
  name: 'official',
  fields: {
    'tweet.fields': 'author_id,conversation_id,created_at,lang,public_metrics,referenced_tweets,in_reply_to_user_id,possibly_sensitive,note_tweet,attachments',
    expansions: 'author_id',
    'user.fields': 'username,name,description,protected,verified_type,public_metrics',
  },
  record(t, users) {
    const u = users.get(t.author_id) || {};
    const ref = type => ((t.referenced_tweets || []).find(r => r.type === type) || {}).id || '';
    const m = t.public_metrics || {};
    return {
      id: String(t.id), raw: (t.note_tweet && t.note_tweet.text) || t.text || '',
      user: { username: u.username || '', name: u.name || '', description: u.description || '', protected: !!u.protected, org: u.verified_type === 'business' || u.verified_type === 'government', followers: (u.public_metrics && u.public_metrics.followers_count) || 0 },
      replyTo: ref('replied_to'), isReply: !!(ref('replied_to') || t.in_reply_to_user_id), quote: !!ref('quoted'), repost: !!ref('retweeted'),
      replies: m.reply_count || 0, likes: m.like_count || 0, sensitive: !!t.possibly_sensitive,
      media: !!(t.attachments && (t.attachments.media_keys || []).length), at: iso(t.created_at),
    };
  },
  async get(params) {
    asked++;
    const res = await fetch((process.env.X_API_BASE || 'https://api.x.com/2') + '/tweets/search/recent?' + new URLSearchParams({ ...params, ...this.fields }), { headers: { authorization: 'Bearer ' + CONF.token }, signal: AbortSignal.timeout(20000) });
    if (res.status === 429) throw new Refused('X answered 429');
    if (!res.ok) throw new Error(`X answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    const data = await res.json();
    const users = new Map(((data.includes && data.includes.users) || []).map(u => [u.id, u]));
    read += (data.data || []).length;
    return (data.data || []).map(t => this.record(t, users));
  },
  posts(word, lang) {
    const hours = 2 + Math.floor(Math.random() * 6);
    return this.get({ query: `${/\s/.test(word) ? '"' + word + '"' : word} -is:reply -is:retweet -is:quote lang:${lang}`, max_results: '50', end_time: new Date(Date.now() - hours * 3600e3).toISOString().replace(/\.\d+Z$/, 'Z') });
  },
  replies(id) { return this.get({ query: `conversation_id:${id} is:reply -is:retweet`, max_results: '20' }); },
};

/* ---------- one language ---------- */
const shuffle = list => list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
async function collect(lang, genres, src) {
  const file = path.join(CONF.out, 'v1', `talks-${lang}.json`);
  const before = await readJson(file, { talks: [] });
  const old = (Array.isArray(before.talks) ? before.talks : []).filter(t => t && t.id && t.post && Array.isArray(t.replies));
  const have = new Set(old.map(t => t.id));
  const people = new Set();
  const lately = new Set(old.slice(0, 150).map(t => t.word));
  /* Every genre in turn, a word at a time; the words that gave the newest talks wait. */
  const lists = genres.map(g => { const words = g[lang] || []; const fresh = shuffle(words.filter(w => !lately.has(w))); return { genre: g.id, words: fresh.concat(shuffle(words.filter(w => lately.has(w)))) }; });
  const queue = [];
  for (let i = 0; lists.some(l => l.words.length > i); i++) lists.forEach(l => { if (l.words[i]) queue.push({ genre: l.genre, word: l.words[i] }); });
  const found = [];
  let searches = 0;
  let refusals = 0;
  for (const { genre, word } of queue) {
    if (found.length >= CONF.add || searches >= CONF.searches) break;
    if (read >= CONF.reads) { console.log(`  ${read} posts read: the run's limit (${CONF.reads}) is reached`); break; }
    let posts;
    try { posts = await src.posts(word, lang); searches++; refusals = 0; }
    catch (e) {
      if (!(e instanceof Refused)) throw e;
      /* Refused: rest, then go on. Three refusals in a row end the run with what was found. */
      if (++refusals >= 3) { console.log(`  ${e.message}: stopping with what was found`); break; }
      console.log(`  ${e.message}: resting 90 seconds`);
      await sleep(90000);
      continue;
    }
    const cands = [];
    posts.forEach(p => {
      const post = talkPost(p, lang);
      if (!post || have.has(post.id) || people.has(post.handle.toLowerCase())) return;
      cands.push({ post, z: zest(post.text, p, lang) });
    });
    cands.sort((a, b) => b.z - a.z);
    let got = 0;
    for (let i = 0; i < cands.length && got < CONF.perWord && i < 12 && read < CONF.reads; i += 4) {
      const batch = cands.slice(i, i + 4);
      const lists2 = await Promise.all(batch.map(c => src.replies(c.post.id).catch(e => { if (e instanceof Refused) return []; throw e; })));
      batch.forEach((c, k) => {
        if (got >= CONF.perWord || found.length >= CONF.add) return;
        const replies = pickReplies(c.post, lists2[k] || [], lang);
        if (!replies.length) return;
        have.add(c.post.id);
        people.add(c.post.handle.toLowerCase());
        found.push({ id: c.post.id, genre, word, found: stamp(), post: c.post, replies });
        got++;
      });
    }
    console.log(`  ${lang} ${genre} "${word}": ${posts.length} posts, ${cands.length} can open a talk, ${got} talks (${found.length} so far)`);
    await sleep(CONF.pause);
  }
  /* New talks first, then the earlier ones that are still young; the API holds CONF.keep of them. */
  const talks = shuffle(found).concat(old.filter(t => young(t, CONF.hours) && stillOk(t))).slice(0, CONF.keep);
  console.log(`  ${lang}: ${found.length} new talks, ${talks.length} in the API (${searches} searches)`);
  return { version: 1, lang, updated: stamp(), source: src.name, count: talks.length, talks };
}

async function main() {
  let name = CONF.source;
  if (name === 'auto') name = CONF.token ? 'official' : 'off';
  if (name !== 'official' && name !== 'fxtwitter') {
    console.log('The source is "' + CONF.source + '", so nothing was collected and no file was changed.\nSet "source" in config.json to fxtwitter, or to official with the key X_BEARER_TOKEN. See README.md.');
    return;
  }
  const src = name === 'official' ? official : fx;
  if (src === official && !CONF.token) throw new Error('The source is official but X_BEARER_TOKEN is not set.');
  const { genres, any, match: loveWords, matchShe: sheWords, pairs: pairWords } = JSON.parse(await readFile(path.join(HERE, 'words.json'), 'utf8'));
  const outs = [];
  const matches = [];
  for (const lang of (CONF.langs.length ? CONF.langs : ['ja'])) {
    console.log(src === fx ? `Collecting ${lang}: searches, this program's filter, words read from X` : `Collecting ${lang} from X's API`);
    LEX[lang] = (pairWords && pairWords[lang]) || null;
    if (src === fx && LEX[lang]) await sayStage(lang, LEX[lang], (any && any[lang]) || []);
    if (src === fx) NEW[lang] = { posts: CONF.loveSearches ? await loveStage(lang, (loveWords && loveWords[lang]) || [], (sheWords && sheWords[lang]) || []) : [], lines: [] };
    const out = src === fx ? await twoStages(lang, genres, (any && any[lang]) || []) : await collect(lang, genres, src);
    outs.push(out);
    const match = await matchOf(lang, genres, out.talks, src.name);
    matches.push(match);
    if (!CONF.dry) { await writeApi(CONF.out, out, genres); await writeMatch(CONF.out, match); }
  }
  if (!CONF.dry) await writeIndex(CONF.out, src.name, outs, matches);
  console.log(src === fx ? `Asked api.fxtwitter.com ${asked} times to find posts. Read conversations and replies from ${CONF.extra.join(' and ') || 'nowhere else'}, up to ${CONF.perHost} each, then paired at random. Read ${read} posts from X's official embed API for the talks.` : `Asked X ${asked} times; X returned ${read} posts.`);
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
