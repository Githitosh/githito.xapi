#!/usr/bin/env node
/* githito.xapi: Reply News' own search data ("pseudo-search").

   Three times a day this program looks for people's posts on X about the genres' words, reads the
   replies under each, keeps the pairs that make a good talk (a person's post, then a lively reply),
   and writes them as plain JSON files. Those files are the API: Reply News reads them and makes its
   videos from them, so the page itself never searches X and never waits for a search.

     node collect.mjs                 collect once into ./public (Japanese)
     node collect.mjs --langs ja,en   both languages
     node collect.mjs --add 40        stop after 40 new talks (170 unless told)
     node collect.mjs --dry           print the counts, write nothing

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
     official   X's own API (v2, recent search). Needs the key X_BEARER_TOKEN; X charges for every post
                it returns, so a run stops at a number of posts ("reads" in config.json).
     auto       official when the key is set, otherwise off.
     off        nothing is collected.
   Node 20 or newer; no packages to install. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { talkPost, pickReplies, zest, stamp, readJson, writeApi, writeIndex, young, stillOk, readEmbed, genreOf } from './rules.mjs';

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
  searches: num('searches', FILE.searches || 60), // searches one run may make
  reads: num('reads', FILE.reads || 300), // posts X may return in one run (X charges for each)
  perWord: num('perword', 6),    // talks one word may give in a run
  hours: num('hours', 48),       // a talk leaves the API after this many hours
  pause: num('pause', 6000),     // milliseconds between two searches
  dry: flag('dry'),
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
      user: { username: String(a.screen_name || ''), name: a.name || '', description: a.description || '', protected: !!a.protected, org: false, followers: a.followers || 0 },
      replyTo: to.status ? String(to.status) : '', replyToHandle: String(to.screen_name || ''), isReply: !!to.status,
      quote: !!(st && st.quote), repost: !!(st && st.reposted_by), replies: (st && st.replies) || 0, likes: (st && st.likes) || 0,
      sensitive: !!(st && st.possibly_sensitive), media: false, at: iso(st && st.created_at),
    };
  },
  /* Replies that say the word, written in two hours drawn from the last two days. */
  async search(word, lang) {
    asked++;
    const until = Math.floor(Date.now() / 1000) - (1 + Math.floor(Math.random() * 46)) * 3600;
    const q = `${word} filter:replies -filter:retweets lang:${lang} since_time:${until - 7200} until_time:${until}`;
    let res;
    try { res = await fetch((process.env.XAPI_FX_BASE || 'https://api.fxtwitter.com') + '/2/search?count=100&q=' + encodeURIComponent(q), { headers: { 'user-agent': 'githito.xapi collector' }, signal: AbortSignal.timeout(30000) }); }
    catch (e) { throw new Refused('search did not answer'); }
    const data = await res.json().catch(() => null);
    /* A search that is refused answers 404 (one that finds nothing answers 200 with no results). */
    if (res.status !== 200 || (data && data.code && data.code !== 200)) throw new Refused('search refused (' + res.status + ')');
    return ((data && data.results) || []).map(st => this.record(st));
  },
};
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
  for (let n = 0; n < CONF.searches && found.length < CONF.add; n++) {
    /* Stage 1: one search, with a word that belongs to no genre. */
    const word = words[n % words.length];
    let list;
    try { list = await fx.search(word, lang); searches++; refusals = 0; }
    catch (e) {
      if (!(e instanceof Refused)) throw e;
      if (++refusals >= 3) { console.log(`  ${e.message}: stopping with what was found`); break; }
      console.log(`  ${e.message}: resting 90 seconds`);
      await sleep(90000);
      continue;
    }
    replies += list.length;
    /* Stage 2, here: which replies have a punch, about a post not yet kept. */
    const cands = [];
    list.forEach(r => {
      if (!r.replyTo || !r.replyToHandle || have.has(r.replyTo)) return;
      if (people.has(r.replyToHandle.toLowerCase()) || cands.some(c => c.parent.id === r.replyTo)) return;
      const kept = pickReplies({ id: r.replyTo, handle: r.replyToHandle, text: '' }, [r], lang);
      if (kept.length) cands.push({ parent: { id: r.replyTo, handle: r.replyToHandle }, reply: kept[0] });
    });
    passed += cands.length;
    /* Then X itself is asked for the post and for the reply, and the rules judge X's own words. */
    let got = 0;
    for (let i = 0; i < cands.length && found.length < CONF.add; i += 4) {
      const pairs = await Promise.all(cands.slice(i, i + 4).map(async c => {
        const p = await fromX(c.parent.handle, c.parent.id, '');
        if (!p) { gone++; return null; }
        const post = talkPost(p, lang);
        if (!post) return null;
        const r = await fromX(c.reply.handle, c.reply.id, post.id);
        if (!r) { gone++; return null; }
        const kept = pickReplies(post, [r], lang);
        return kept.length ? { post, replies: kept } : null;
      }));
      pairs.forEach(t => {
        if (!t || found.length >= CONF.add || have.has(t.post.id) || people.has(t.post.handle.toLowerCase())) return;
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
  console.log(`  ${lang} stage 1: ${searches} random searches gave ${replies} replies.`);
  console.log(`  ${lang} stage 2: ${passed} passed the reply rules; ${found.length} became talks ${JSON.stringify(made)}; ${gone} were not shown by X. ${talks.length} talks in the API.`);
  return { version: 1, lang, updated: stamp(), source: 'fxtwitter', count: talks.length, talks };
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
  const { genres, any } = JSON.parse(await readFile(path.join(HERE, 'words.json'), 'utf8'));
  const outs = [];
  for (const lang of (CONF.langs.length ? CONF.langs : ['ja'])) {
    console.log(src === fx ? `Collecting ${lang}: random searches, this program's filter, words read from X` : `Collecting ${lang} from X's API`);
    const out = src === fx ? await twoStages(lang, genres, (any && any[lang]) || []) : await collect(lang, genres, src);
    outs.push(out);
    if (!CONF.dry) await writeApi(CONF.out, out, genres);
  }
  if (!CONF.dry) await writeIndex(CONF.out, src.name, outs);
  console.log(src === fx ? `Asked api.fxtwitter.com ${asked} times (random searches only). Read ${read} posts and replies from X's official embed API.` : `Asked X ${asked} times; X returned ${read} posts.`);
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
