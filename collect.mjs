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

   Where the posts come from is set in config.json ("source"), or by XAPI_SOURCE:
     off        nothing is collected. This is how the repository starts.
     official   X's own API v2. Needs the key X_BEARER_TOKEN.
     fxtwitter  api.fxtwitter.com, a free service that searches X without a key.
     auto       official when X_BEARER_TOKEN is set, otherwise off.
   Node 20 or newer; no packages to install. */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
  searches: num('searches', 60), // searches one run may make
  perWord: num('perword', 4),    // talks one word may give in a run
  hours: num('hours', 48),       // a talk leaves the API after this many hours
  pause: num('pause', 4000),     // milliseconds between two searches
  dry: flag('dry'),
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

/* ---------- what may play ---------- */
const VIOLENT = /murder|stabbed|shot dead|shooting|killed|beheading|homicide|massacre|rape|sexual assault|robbery|凶悪|殺人|殺害|刺殺|遺体|刺され|死傷|銃乱射|暴行|強盗|レイプ|強姦/i;
const HEAVY = /(?:^|[^必])死(?!ぬほど|ぬかと|んだ笑)|亡くな|遺体|事故|災害|震災|地震|津波|火災|病気|闘病|入院|がん(?!ば|が)|癌|自殺|自死|いじめ|虐待|差別|\bdied\b|\bdeath\b|\bcrash\b|\bdisaster\b|\bcancer\b|\bsuicide\b|\bbull(?:y|ied|ying)\b|\bracis/i;
const SUGGESTIVE = /🔞|🍆|🍑|😏|💋|👅|寝かさない|抱いて|抱かれ|夜這い|ベッドで|一緒にお風呂|色っぽ|セクシー|えちえち|\bsexy\b|\bspicy\b|\bnaughty\b|\bin bed\b/i;
const ADULT = /セックス|エッチ|えっち|ｴｯﾁ|エロ|下ネタ|ヤる|ヤれ|体位|下着|裸|おっぱい|乳首|ちんこ|ちんちん|まんこ|射精|中出し|勃起|ムラムラ|性欲|童貞|処女|ラブホ|\bsex|nsfw|nude|naked|horny|kinky/i;
const NEVER = /ヤリモク|風俗|パパ活|ママ活|援交|AV女優|アダルト|porn|onlyfans|中学|小学|ＪＫ|ＪＣ|ＪＳ|\bJ[KCS]\b|高校生|女子高生|男子高生|未成年|ロリ|ショタ|\bteen|high school|middle school|underage|\bloli|\bshota|ＤＶ|\bDV\b|モラハラ|殴られ|abuse|レイプ|強姦|無理やり|盗撮|痴漢/i;
const UNSAFE = new RegExp(ADULT.source + '|' + NEVER.source, 'i');
const MINOR_BIO = /(?:^|[^0-9])1[0-7]\s*(?:歳|才|y\/?o\b|years? old)|高[1-3１-３一二三](?:$|[^0-9０-９])|中[1-3１-３一二三](?:$|[^0-9０-９])|高校生|中学生|ＪＫ|ＪＣ|\bJ[KC]\b|\bminor\b|\bunder ?18\b|\bteen\b/i;
const AD = /PR|広告|キャンペーン|プレゼント企画|応募|フォロー[&＆]|RTで|リツイートで|セール|クーポン|予約受付|販売中|\bgiveaway\b|\bsale\b|\bpromo\b|\bdiscount\b|\bsponsored\b/i;
const TOXIC = /バカ|ばか(?!り)|馬鹿|アホ|あほ(?!う)|阿呆|クズ|カス(?![タテ])|キモ[いイッ]|きも[いっ]|気持ち悪|気色[わ悪]|ウザ|うざ[いっ]|消えろ|黙れ|だまれ|お前|おまえ|てめ[えぇー]|貴様|低脳|低能|無能|老害|痴呆|キチガイ|ガイジ|チー牛|ブス|デブ|ババア|ジジイ|嘘つき|ウソつき|うそつき|捏造|売国|反日|左翼|右翼|パヨク|ネトウヨ|恥を知|頭悪|頭おかし|\b(?:idiot|stupid|moron|dumb|loser|trash|shut up|stfu|libtard|clown)\b/i;
const GREET = /^[\s\p{Extended_Pictographic}️]*(?:おは|オハ|こんにち|こんばん|おやす|おつ|お疲れ|おめで|ありがと|はじめまして|初めまして|good morning|gm\b|good night|congrat|thank)|良い一日|よい一日|良い1日|素敵な(?:一日|1日|週末)|今日も(?:一日|1日)?(?:頑張|がんば|よろしく)|よろしくお願い|フォロー(?:ありがとう|失礼|させて)|have a (?:great|good|nice) day/iu;
const GLOOM = /骨折|折って|怪我|ケガ|手術|通院|発熱|インフル|コロナ|訃報|葬儀|お葬式|遺影|倒産|解雇|失業|借金|離婚|亡き|\b(?:injur|surgery|funeral|divorce|laid off|fired)\w*/i;
const OFFICIAL = /公式|official|ニュース|新聞|news|報道|速報|通信社|放送|テレビ|編集部|広報|株式会社|\bbot\b|情報局|まとめ|運営|事務局|shop|store/i;
const POLITE = /素敵|楽しみ|頑張って|がんばって|お気をつけ|気をつけて|大変です|お疲れ|おつかれ|お大事|ゆっくり|楽しんで|いってらっしゃい|行ってらっしゃい|大丈夫[？?]|ですね[…。！!✨😊☺️🥰]*$|いいですね|良いですね|羨まし|うらやまし|\b(?:lovely|beautiful|so nice|well done|great job)\b/i;
const ZEST = {
  ja: /なんよ|なんだが|してしまっ|しまった|のに|なぜ|なんで|まさか|結局|気になる|わからん|分からん|無理|やばい|ヤバ|つら|詰んだ|終わった|泣|忘れ|寝坊|間違え|気づいた|気付いた|って何|[？?]|💦|😱|😇|🫠|🥲/,
  en: /\b(?:why|somehow|accidentally|forgot|again|help|can't|cannot|never|nobody|apparently|turns out)\b|[?]/i,
};
const QUIP = {
  ja: /かい[！!ｗw笑]*$|やん|やろ|やねん|じゃん|すぎ|なんで|なぜ|それな|まさか|だったんだ|じゃないの|のでは|ってこと|[？?]+[\s\p{Extended_Pictographic}️]*$|[wｗ]+$/u,
  en: /\b(?:wait|bro|nah|same|literally|imagine|plot twist|so you|not the)\b|[?]+\s*$/i,
};
const CJK = /[぀-ヿ一-鿿]/;
const charLen = t => [...String(t || '')].length;
const squash = t => String(t || '').toLowerCase().replace(/[\s　"'“”‘’「」『』（）()\[\]【】、。，．,.!?！？…・:：;；\-–—~〜ｗw]+/g, '');
function isFunny(text, lang) {
  if (lang === 'en') return /\b(lol|lmao|lmfao|rofl|haha\w*|hilarious|i'?m dead|dying)\b|😂|🤣|💀|😆/i.test(text);
  const t = String(text || '').replace(/笑顔|笑み|民草|草の根/g, '');
  return /笑|ワロタ|ワロ[^ッ]|草草|(?:^|[\s　、。！？(（])草(?:$|[\s　、。！？)）])|[てでにのが]草(?=$|[\s　、。！？)）ｗw]|$)|ｗ{2,}|w{2,}|😂|🤣|😆|😅|面白い|冗談|ウケる/.test(t);
}
/* The words of a post: addresses, @names and hashtags are left out. */
function plain(raw) {
  return String(raw || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/https?:\/\/\S+/g, ' ').replace(/@\w+/g, ' ').replace(/[#＃]\S+/g, ' ').replace(/\s+/g, ' ').trim();
}
function safe(text, p) {
  return !!text && !UNSAFE.test(text) && !VIOLENT.test(text) && !HEAVY.test(text) && !SUGGESTIVE.test(text)
    && !p.sensitive && !AD.test(p.raw) && !TOXIC.test(text);
}
const minor = u => MINOR_BIO.test(String(u.description || '') + ' ' + String(u.name || ''));
/* Media, companies and offices do not open a talk: the first post is a person's own words. */
const personal = u => !!u.username && !u.protected && !u.org && !OFFICIAL.test(String(u.name || '') + ' ' + u.username);
/* A post that can open a talk: a person's own post (not a reply, a repost or a quote), answered by
   someone, short enough to read whole. */
function talkPost(p, lang) {
  if (!p || !p.id || p.replyTo || p.isReply || p.quote || p.repost || !personal(p.user) || minor(p.user)) return null;
  if (/^\s*[>＞]|\n\s*[>＞]/.test(p.raw)) return null;
  const text = plain(p.raw);
  const n = charLen(text);
  if (n < (lang === 'en' ? 12 : 10) || n > (lang === 'en' ? 220 : 110)) return null;
  if (lang === 'en' ? !/[A-Za-z]{3,}/.test(text) : (text.match(/[぀-ヿ]/g) || []).length < 4) return null;
  if (!safe(text, p) || GREET.test(text) || GLOOM.test(text) || !(p.replies > 0)) return null;
  /* A few words beside a picture say little without it. */
  if (p.media && n < 20) return null;
  return { id: p.id, handle: p.user.username, text, url: 'https://x.com/' + p.user.username + '/status/' + p.id, at: p.at };
}
/* How lively a post is: a little trouble, a question or a laugh draws funny replies. */
function zest(text, p, lang) {
  let s = 0;
  if (isFunny(text, lang)) s += 2;
  if (ZEST[lang].test(text)) s += 3;
  s += Math.min(3, Math.log2(1 + p.replies));
  if (p.replies > 60) s -= 3;
  if (charLen(text) <= (lang === 'en' ? 120 : 60)) s += 2;
  if (p.user.followers > 200000) s -= 3;
  return s;
}
/* The replies said to the post itself, the ones with a punch first: a retort, a question back, a laugh.
   Greetings and polite small talk are left out. */
function pickReplies(post, list, lang) {
  const picks = [];
  list.forEach(p => {
    const u = p.user;
    if (!u.username || u.protected || minor(u) || u.username.toLowerCase() === post.handle.toLowerCase() || p.replyTo !== post.id) return;
    const text = plain(p.raw);
    const n = charLen(text);
    if (n < 3 || n > (lang === 'en' ? 140 : 50) || charLen(post.text) + n > (lang === 'en' ? 280 : 140)) return;
    if (lang === 'en' ? !/[A-Za-z]{2,}/.test(text) : !CJK.test(text)) return;
    if (/^\s*(?:@\w+\s+)*[>＞]/.test(p.raw) || !safe(text, p)) return;
    const greet = GREET.test(text);
    if (greet && n <= 14) return;
    const tk = squash(text).slice(0, 50);
    if (!tk || picks.some(x => x.tk === tk)) return;
    const funny = isFunny(text, lang);
    const quip = QUIP[lang].test(text);
    const trail = /…+$|\.{3}$/.test(text);
    let score = (funny ? 5 : 0) + (quip ? 3 : trail ? 2 : 0) + (n <= (lang === 'en' ? 70 : 25) ? 2 : 0) - (greet ? 3 : 0) - (POLITE.test(text) ? 2 : 0);
    score += Math.min(2, Math.log2(1 + p.likes));
    if (!(funny || quip || trail) || score < 4) return;
    picks.push({ id: p.id, handle: u.username, text, url: 'https://x.com/' + u.username + '/status/' + p.id, tk, score });
  });
  return picks.sort((a, b) => b.score - a.score).slice(0, 2).map(({ tk, score, ...r }) => r);
}

/* ---------- where the posts come from ---------- */
/* Both sources give the same plain record, so the rules above do not care which one answered. */
let asked = 0;
class Refused extends Error {}
const iso = v => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString().replace(/\.\d+Z$/, 'Z') : ''; };
const fx = {
  name: 'fxtwitter',
  record(st) {
    const a = (st && st.author) || {};
    const v = (a.verification && a.verification.type) || '';
    return {
      id: String((st && st.id) || ''), raw: String((st && st.text) || ''),
      user: { username: String(a.screen_name || ''), name: a.name || '', description: a.description || '', protected: !!a.protected, org: v === 'organization' || v === 'government', followers: a.followers || 0 },
      replyTo: st && st.replying_to && st.replying_to.status ? String(st.replying_to.status) : '', isReply: !!(st && st.replying_to),
      quote: !!(st && st.quote), repost: !!(st && st.reposted_by), replies: (st && st.replies) || 0, likes: (st && st.likes) || 0,
      sensitive: !!(st && st.possibly_sensitive), media: !!(st && st.media && Object.keys(st.media).length), at: iso(st && st.created_at),
    };
  },
  async get(pathname) {
    asked++;
    let res;
    try { res = await fetch((process.env.XAPI_FX_BASE || 'https://api.fxtwitter.com') + pathname, { headers: { 'user-agent': 'githito.xapi collector' }, signal: AbortSignal.timeout(20000) }); }
    catch (e) { return null; }
    const data = await res.json().catch(() => null);
    /* A search that is refused answers 404 (one that finds nothing answers 200 with no results). */
    if (pathname.startsWith('/2/search') && (res.status !== 200 || (data && data.code && data.code !== 200))) throw new Refused('search refused (' + res.status + ')');
    return res.ok ? data : null;
  },
  /* People's own posts about a word that someone answered; half the searches look at yesterday or the day before. */
  async posts(word, lang) {
    let range = '';
    if (Math.random() < 0.5) {
      const d = new Date(Date.now() - (1 + Math.floor(Math.random() * 2)) * 86400e3).toISOString().slice(0, 10);
      range = ` since:${d} until:${new Date(Date.parse(d) + 86400e3).toISOString().slice(0, 10)}`;
    }
    const data = await this.get('/2/search?q=' + encodeURIComponent(`${word} -filter:replies -filter:retweets min_replies:2 lang:${lang}${range}`));
    return ((data && data.results) || []).map(st => this.record(st));
  },
  async replies(id) {
    const data = await this.get('/2/conversation/' + id);
    return ((data && data.replies) || []).map(st => this.record(st));
  },
};
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
async function readJson(file, empty) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { return empty; } }
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
    for (let i = 0; i < cands.length && got < CONF.perWord && i < 8; i += 4) {
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
  const young = old.filter(t => Date.now() - Date.parse(t.found || 0) < CONF.hours * 3600e3);
  const talks = shuffle(found).concat(young).slice(0, CONF.keep);
  console.log(`  ${lang}: ${found.length} new talks, ${talks.length} in the API (${searches} searches)`);
  return { version: 1, lang, updated: stamp(), source: src.name, count: talks.length, talks };
}

/* The API's files for one language: every talk, and one file for each genre (the answer to "search this genre"). */
async function writeApi(out, genres) {
  const dir = path.join(CONF.out, 'v1', 'search', out.lang);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(CONF.out, 'v1', `talks-${out.lang}.json`), JSON.stringify(out) + '\n');
  for (const g of genres) {
    const talks = out.talks.filter(t => t.genre === g.id);
    await writeFile(path.join(dir, g.id + '.json'), JSON.stringify({ version: 1, lang: out.lang, genre: g.id, updated: out.updated, count: talks.length, talks }) + '\n');
  }
}
async function main() {
  let name = CONF.source;
  if (name === 'auto') name = CONF.token ? 'official' : 'off';
  if (name !== 'official' && name !== 'fxtwitter') {
    console.log('The source is "' + CONF.source + '", so nothing was collected and no file was changed.\nSet "source" in config.json to official (with the key X_BEARER_TOKEN) or to fxtwitter. See README.md.');
    return;
  }
  const src = name === 'official' ? official : fx;
  if (src === official && !CONF.token) throw new Error('The source is official but X_BEARER_TOKEN is not set.');
  const { genres } = JSON.parse(await readFile(path.join(HERE, 'words.json'), 'utf8'));
  const index = await readJson(path.join(CONF.out, 'v1', 'index.json'), {});
  const langs = { ...(index.langs || {}) };
  for (const lang of (CONF.langs.length ? CONF.langs : ['ja'])) {
    console.log(`Collecting ${lang} from ${src.name}`);
    const out = await collect(lang, genres, src);
    const byGenre = {};
    out.talks.forEach(t => { byGenre[t.genre] = (byGenre[t.genre] || 0) + 1; });
    langs[lang] = { updated: out.updated, count: out.count, genres: byGenre };
    if (CONF.dry) continue;
    await writeApi(out, genres);
  }
  if (!CONF.dry) {
    await writeFile(path.join(CONF.out, 'v1', 'index.json'), JSON.stringify({ version: 1, updated: stamp(), source: src.name, langs }, null, 1) + '\n');
    /* Tells the workflow that there is something new to publish. */
    await writeFile(path.join(CONF.out, '.changed'), stamp() + '\n');
  }
  console.log(`Asked ${src.name} ${asked} times.`);
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
