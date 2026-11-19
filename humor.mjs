#!/usr/bin/env node
/* githito.xapi: the Humor page's stories, made ahead of time.

   The Humor page (githitosh.github.io/news-shorts/humor/) used to search X when Update was pressed:
   dozens of searches, then one more request for every post a reply answers. That took half a
   minute to a minute and a half. This program does the same work three times a day and writes the
   result as one file, v1/humor-<lang>.json, so the page only reads it and plays.

   What it makes: loving exchanges between two people, a post and the reply to it. Love is the
   centre; in the morning the page plays greetings first, so greetings said in the morning are
   collected with their own searches.

     node humor.mjs                  build once into ./public (Japanese)
     node humor.mjs --searches 20    fewer searches (90 unless told)
     node humor.mjs --dry            print the counts, write nothing
     node humor.mjs --no-search      search nothing: judge the saved stories again and drop the old ones

   How: the same way the page did it.
     1. Searches of replies with loving words, each over two hours of the last two days. Greetings
        are searched in the hours they are said: good mornings from 5 to 10 in Japan, good nights
        from 21 to 2, welcome homes from 17 to 23.
     2. Each reply that may play is ranked (cute ways of saying it first, plain "おはよう" last).
     3. The post the reply answers is read, and the pair is kept when both may play: two different
        people, neither famous, talking plainly (no polite forms, no さん: those are followers and
        fans, not a couple), nothing violent, sexual or heavy, nothing of the body, nothing pointing
        at school age, no talk about works, streams or campaigns.
   Settings are in config.json under "humor"; "on": false turns it off. Node 20 or newer; no packages. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stamp, readJson, charLen, cleanText } from './rules.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = name => args.includes('--' + name);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
let FILE = {};
try { FILE = (JSON.parse(await readFile(path.join(HERE, 'config.json'), 'utf8')).humor) || {}; } catch (e) {}
const num = (name, d) => { const v = Number(opt(name, FILE[name])); return Number.isFinite(v) && v > 0 ? v : d; };
const CONF = {
  on: FILE.on !== false,
  langs: (Array.isArray(FILE.langs) ? FILE.langs : ['ja']).filter(l => l === 'ja' || l === 'en'),
  out: path.resolve(opt('out', path.join(HERE, 'public'))),
  searches: num('searches', 90), // searches one run may make (about 20 replies each)
  parents: num('parents', 400),  // posts read to see what a reply answers
  keep: num('keep', 600),        // stories the file holds
  hours: num('hours', 48),       // a story leaves the file after this many hours
  pause: num('pause', 4000),     // milliseconds between two searches
  rest: num('rest', 90000),      // milliseconds to rest when a search is refused
  patience: num('patience', 4),  // refusals in a row before a run stops searching
  dry: flag('dry'),
  noSearch: flag('no-search') || process.env.XAPI_NO_SEARCH === '1',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shuffle = list => list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);

/* ---------- what is searched ---------- */
/* Each kind has its searches and the hours of the day (Japan) in which it is said. */
const SEARCHES = {
  ja: [
    { kind: 'morning', share: 0.28, hours: [5, 6, 7, 8, 9], q: [
      '(おはおは OR おはよーだよ OR おっはー OR おはよん OR おはよぉ OR おはよーん)',
      '(おはよう OR おはよ OR おはよー) (♡ OR 💕 OR 🥰 OR 😘 OR 好き OR 大好き OR ぎゅ)',
      '(おはよう OR おはよ) (今日も頑張 OR いってらっしゃい OR 気をつけてね OR 起きれた OR 起きた？ OR 寒いね)',
      '(おはよ♡ OR おはよう♡ OR おはよ〜 OR おはよっ OR おはよー！)',
    ] },
    { kind: 'night', share: 0.1, hours: [21, 22, 23, 0, 1], q: [
      '(おやすみん OR おやすー OR ねんね OR すやぁ OR おやぴ OR おやすみなさいませ)',
      '(おやすみ OR おやすみなさい) (♡ OR 💕 OR 🥰 OR 😘 OR 好き OR 大好き OR また明日)',
    ] },
    { kind: 'home', share: 0.1, hours: [17, 18, 19, 20, 21, 22], q: [
      '(ただいまー OR おかえりー OR おつかれさま♡ OR おかえりなさい♡ OR がんばったね)',
      '(おかえり OR お疲れさま OR おつかれさま) (♡ OR 💕 OR 🥰 OR えらい OR 頑張ったね OR ゆっくりしてね)',
    ] },
    { kind: 'love', share: 0.52, hours: null, q: [
      '(だいしゅき OR すきすき OR ぎゅーして OR ちゅー OR 会いたいよ OR なでなで OR ♡)',
      '(彼氏 OR 彼女 OR 旦那 OR 嫁) (すき OR ぎゅー OR だいすき OR ありがと)',
      '(愛してる OR あいしてる OR 愛してるよ OR 大好きすぎ OR ずっと一緒にいようね OR 一生離さない)',
      '(いちゃいちゃ OR イチャイチャ OR くっつきたい OR 甘えたい OR ぎゅーってして OR ちゅっ)',
      '(会いたい OR あいたい OR 寂しい OR さみしい) (♡ OR 💕 OR 🥺 OR 好き OR 大好き)',
      '(かわいい OR 可愛い OR かっこいい OR カッコいい) (好き OR 大好き OR ♡ OR 💕 OR 🥰)',
    ] },
  ],
  en: [
    { kind: 'morning', share: 0.34, hours: [5, 6, 7, 8, 9], q: ['("morning sunshine" OR "morning babe" OR "rise and shine" OR "good morning beautiful" OR "good morning handsome")', '("good morning" OR morning) ("love you" OR babe OR ❤ OR 😘 OR 🥰)'] },
    { kind: 'night', share: 0.12, hours: [21, 22, 23, 0, 1], q: ['("night night" OR "nighty night" OR "sweet dreams" OR "sleep tight")'] },
    { kind: 'love', share: 0.54, hours: null, q: ['("love you more" OR "miss you more" OR "love ya" OR "my love" OR babe)', '("i love you" OR "love you so much" OR "love you forever" OR cuddle OR snuggle OR "come cuddle")'] },
  ],
};
/* The loving, lovey-dovey kind of talk comes first. */
const ICHA = {
  ja: /愛してる|あいしてる|いちゃ|イチャ|くっつ[きいこ]|甘え|ぎゅーって|ちゅーして|ちゅっ|一生離さない|ずっと一緒|大好きすぎ/,
  en: /i love you|love you so much|love you forever|cuddle|snuggle|can'?t wait to (?:see|hold) you/i,
};
/* Cute, loving ways of saying things are preferred to plain greetings. */
const CUTE = {
  ja: /おやすみん|おやすー|おやぴ|おやすみなさいませ|ねんね|すや|おはおは|おはよーだよ|おっはー|おはよん|おはよぉ|おはよーん|だいしゅき|しゅき|すきすき|大好きだよ|好きだよ|すきだよ|ぎゅー|ちゅ|なでなで|よしよし|がんばったね|会いたいよ|♡|❤|💕|💗|💖|🥰|😘|😚|だよ[〜ー♡❤]|ね[〜ー♡]|よ[〜ー♡]/,
  en: /night night|nighty|sleep tight|sweet dreams|sunshine|rise and shine|love you more|miss you more|love ya|\bbabe\b|\bbaby\b|honey|cutie|xoxo|xxx|💕|🥰|😘|😚/i,
};
const PLAIN = {
  ja: /^(?:おやすみ(?:なさい)?|おはよ(?:う|ー)?(?:ございます)?|ただいま|おかえり|おつかれ(?:さま)?|お疲れ(?:様)?)[。！!〜~ー]?\s*[\p{Extended_Pictographic}‍️\s]*$/u,
  en: /^(?:good ?night|good ?morning|night|morning|hi|hey)[.!]?\s*[\p{Extended_Pictographic}‍️\s]*$/iu,
};
/* Everyday couple talk: greetings, thanks, missing each other, and love. */
const LOVE = {
  ja: /大好き|だいすき|だいしゅき|しゅき|好き|すき|愛して|あいして|いちゃ|イチャ|くっつ[きいこ]|甘え|会いたい|あいたい|ぎゅ|ちゅ|なでなで|よしよし|かわいい|可愛い|かっこいい|おやす|ねんね|すや|おはよ|おはおは|おっはー|おつかれ|お疲れ|ただいま|おかえり|いってらっしゃ|いってきます|気をつけて|がんばったね|ありがと|ずっと一緒|一緒に|ハグ|彼氏|彼女|旦那|嫁|♡|❤|♥|💕|💗|💓|💖|💘|💞|🥰|😘|😚|😍|🤗|💤|😴|☺/,
  en: /love you|love ya|luv u|\bily\b|cuddle|snuggle|miss you|my love|\bbabe\b|\bbaby\b|honey|sweetheart|cutie|handsome|beautiful|xoxo|xxx|forever|good ?night|night night|nighty|good ?morning|sunshine|rise and shine|sleep well|sleep tight|sweet dreams|home safe|take care|thank you|boyfriend|girlfriend|husband|wife|❤|♥|💕|💗|🥰|😘|😚|😍|🤗|💤|😴/i,
};
const SHORT = { ja: 30, en: 90 };
const LONG = { ja: 60, en: 180 };
/* Not for this page: partings and quarrels, school age, children beside couple talk, innuendo. */
const UNSAFE_ROMANCE = /浮気|不倫|別れ|離婚|ブロック|死ね|殺|嫌い|最低|ストーカー|cheat|divorce|break ?up|hate you/i;
const YOUTH = /学校|放課後|部活|修学旅行|制服|受験|担任|学年|文化祭|体育祭|授業|テスト|先生|クラス|\bschool\b|\bprom\b|\bhomework\b|\bgrade\b|\bclass\b|\bteacher\b/i;
const MINOR_BIO = /(?:^|[^0-9])1[0-7]\s*(?:歳|才|y\/?o\b|years? old)|高[1-3１-３一二三](?:$|[^0-9０-９])|中[1-3１-３一二三](?:$|[^0-9０-９])|高校|中学|小学|学生|ＪＫ|ＪＣ|[LSF]?JK|\bJC\b|\bDK\b|\bminor\b|\bunder ?18\b|\bteen\b/i;
/* An age in the words: nothing that may be about somebody under age plays here. */
const AGE = /(?:^|[^0-9０-９\/:.月])(?:1[0-9]|[1-9])\s*(?:歳|才|さい)|(?:^|[^0-9０-９\/:.月])1[0-9](?:だね|になっ|にな[るり]|[?？])|未成年|十代|10代/;
const EMOJI_HINT = /🍑|🍆|😏|🔞|💦|👅/u;
const MOURN = /ご冥福|追悼|亡くな|お悔やみ|死去|\brip\b|passed away/i;
/* Shops, media and bots greet everybody; a couple is two people. */
const NOT_A_PERSON = /公式|official|ニュース|新聞|news|放送|テレビ|編集部|広報|株式会社|\bbot\b|情報局|まとめ|運営|事務局|shop|store|店|サロン|クリニック|占い|鑑定|配信|ライバー|VTuber|Vtuber|アイドル|声優|モデル|コンカフェ|キャスト|メンエス|セラピスト/i;
/* Two people who are close talk plainly. Polite forms and names with さん or 様 are a follower greeting
   a stranger, a fan writing to a star, a shop thanking a customer. */
const POLITE = /さん|様|氏|先生|先輩|ございます|でした[。！!✨\s]|でしたね|いたします|致します|ください|下さい|ですね|ますね|ですよ|ましょう|です[！!。✨♡\s]|です$|ます[！!。✨\s]|ます$|しました|ありがとうござ/;
/* Births and children are family news, not couple talk. */
const FAMILY = /出産|妊娠|赤ちゃん|男の子|女の子|息子|娘|子供|子ども|こども|孫|ママ友|パパ友/;
/* Talk about works, streams and campaigns is not talk between a couple; "ALT" is a picture's caption. */
const FAN = /拡散|リポスト|\bRT\b|フォロー|イラスト|作品|配信|推し|\bALT\b|当選|企画|プレゼント|お迎え|納品|ご依頼|スペース|リスナー|ライブ|チケット|グッズ|新曲|アルバム|\bMV\b|動画|投稿|写真集|選びました|シーン|リスペクト|曲|歌っ|歌う|ゲーム|ガチャ|イベント|タグ|呼びタメ|タメ口|タメで|お言葉に甘え|尊い|\bFGO\b|とうらぶ|くっつ[くけ]/;
/* Nothing of the body on this page. */
const BODY = /ベッ[ドト]|添い寝|お風呂|風呂|脱[がぎぐい]|裸|舐|胸|尻|下着|えっち|エッチ|エロ|ホテル|お泊|泊ま|濡れ|お口|唇|くちびる|ばぶ|おっぱ|🍌|🍒|💦|🍑|🍆|🤱|👄|😛|🤤/u;
const squash = text => String(text || '').toLowerCase().replace(/[\s　"'“”‘’「」『』（）()\[\]【】、。，．,.!?！？…・:：;；\-–—~〜ｗw]+/g, '');
const postText = st => String((st && st.text) || '').replace(/https?:\/\/\S+/g, ' ').replace(/@\w+/g, ' ').replace(/[#＃]\S+/g, ' ').replace(/\s+/g, ' ').trim();
const handleOf = st => String((st && st.author && st.author.screen_name) || '').replace(/^@+/, '');
const statusId = st => { const m = String((st && st.url) || '').match(/status(?:es)?\/(\d+)/); return (st && st.id && /^\d+$/.test(String(st.id)) ? String(st.id) : '') || (m ? m[1] : ''); };
const followers = st => { const a = st && st.author; const n = a && (a.followers ?? a.followers_count); return typeof n === 'number' ? n : -1; };
function parentOf(st) {
  const rt = st && st.replying_to;
  const id = (rt && typeof rt === 'object' && (rt.status || rt.status_id || rt.id)) || (st && (st.replying_to_status || st.in_reply_to_status_id_str || st.in_reply_to_status_id)) || '';
  const who = (rt && typeof rt === 'object' && (rt.screen_name || rt.username)) || (typeof rt === 'string' ? rt : '') || '';
  return { id: /^\d+$/.test(String(id)) ? String(id) : '', who: String(who).replace(/^@+/, '') };
}
/* The words of a post, when it may play on this page; '' when it may not. */
function romanceText(st, lang) {
  const text = postText(st);
  const a = (st && st.author) || {};
  const bio = String(a.description || a.bio || '') + ' ' + String(a.name || '');
  if (!text || !cleanText(text) || UNSAFE_ROMANCE.test(text) || YOUTH.test(text) || AGE.test(text) || EMOJI_HINT.test(text) || MOURN.test(text)) return '';
  if (lang !== 'en' && (POLITE.test(text) || /[ｦ-ﾟ]{2,}/.test(text))) return '';
  if (FAN.test(text) || BODY.test(text) || FAMILY.test(text)) return '';
  if (MINOR_BIO.test(bio) || YOUTH.test(String(a.description || '')) || NOT_A_PERSON.test(bio) || a.protected || st.possibly_sensitive) return '';
  if (lang === 'en') {
    if ((text.match(/[぀-ヿ一-鿿]/g) || []).length > 2 || !/[A-Za-z]{2,}/.test(text) || text.length < 4) return '';
  } else if ((text.match(/[぀-ヿ]/g) || []).length < 1 || charLen(text) < 2) return '';
  return text;
}
/* The kind of talk, by what the two say. */
export function talkKind(text) {
  const t = String(text || '');
  if (/おは|朝だ|morning|rise and shine|sunshine|☀/i.test(t)) return 'morning';
  if (/おやす|ねんね|すや|寝る|寝よ|眠|night|sleep|dream|💤|😴/i.test(t)) return 'night';
  if (/ただいま|おかえり|おつかれ|お疲れ|がんばった|頑張った|home|welcome back/i.test(t)) return 'home';
  if (/愛してる|あいしてる|いちゃ|イチャ|くっつ[きいこ]|甘え|一生離さない|ずっと一緒|i love you|cuddle|snuggle/i.test(t)) return 'icha';
  if (/会いたい|あいたい|寂し|さみし|miss/i.test(t)) return 'miss';
  if (/好き|すき|しゅき|愛|ぎゅ|ちゅ|なでなで|love|kiss|hug|♡|❤|💕/i.test(t)) return 'love';
  return 'other';
}

/* ---------- asking ---------- */
let asked = 0;
let readCount = 0;
class Refused extends Error {}
async function fxJson(url) {
  let res;
  try { res = await fetch(url, { headers: { 'user-agent': 'githito.xapi collector' }, signal: AbortSignal.timeout(25000) }); }
  catch (e) { throw new Refused('no answer'); }
  const data = await res.json().catch(() => null);
  if (res.status !== 200 || (data && data.code && data.code !== 200)) throw new Refused('refused (' + res.status + ')');
  return data;
}
/* Replies that match, written in two hours that start at the given time. */
async function search(q, lang, start) {
  asked++;
  const data = await fxJson('https://api.fxtwitter.com/2/search?count=100&q=' + encodeURIComponent(`${q} filter:replies -filter:retweets -filter:links lang:${lang} since_time:${start} until_time:${start + 7200}`));
  return (data && data.results) || [];
}
/* The post a reply answers. */
async function status(id) {
  readCount++;
  try {
    const d = await fxJson('https://api.fxtwitter.com/2/status/' + id);
    return (d && (d.status || d.tweet)) || null;
  } catch (e) { return null; }
}
/* The start of a two-hour window: for a kind with hours, one of those hours (Japan) today or on one of
   the two days before, not in the future; otherwise any time in the last two days. */
function windowStart(hours) {
  const now = Math.floor(Date.now() / 1000);
  if (!hours) return now - 7200 - Math.floor(Math.random() * 44) * 3600;
  const jstMidnight = Math.floor((now + 9 * 3600) / 86400) * 86400 - 9 * 3600;
  for (let k = 0; k < 40; k++) {
    const t = jstMidnight - Math.floor(Math.random() * 3) * 86400 + hours[Math.floor(Math.random() * hours.length)] * 3600;
    if (t + 7200 <= now && now - t < 60 * 3600) return t;
  }
  return now - 7200 - Math.floor(Math.random() * 44) * 3600;
}

/* ---------- one language ---------- */
async function build(lang) {
  const file = path.join(CONF.out, 'v1', `humor-${lang}.json`);
  const before = await readJson(file, { stories: [] });
  const old = (Array.isArray(before.stories) ? before.stories : []).filter(s => s && s.id && s.a && s.b && s.a.text && s.b.text);
  const have = new Set(old.flatMap(s => [s.id, s.a.id]));
  const count = { searches: 0, replies: 0, candidates: 0, read: 0, stories: 0 };
  /* 1. The searches, each kind by its share. */
  const plan = [];
  (SEARCHES[lang] || []).forEach(k => { const n = Math.max(1, Math.round(CONF.searches * k.share)); for (let i = 0; i < n; i++) plan.push({ kind: k.kind, q: k.q[i % k.q.length], start: windowStart(k.hours) }); });
  const cands = [];
  const seen = new Set();
  let refusals = 0;
  for (const p of CONF.noSearch ? [] : shuffle(plan)) {
    let list;
    try { list = await search(p.q, lang, p.start); count.searches++; refusals = 0; }
    catch (e) {
      if (!(e instanceof Refused)) throw e;
      if (++refusals >= CONF.patience) { console.log(`  search ${e.message}: stopping with what was found`); break; }
      console.log(`  search ${e.message}: resting`);
      await sleep(CONF.rest);
      continue;
    }
    count.replies += list.length;
    let got = 0;
    list.forEach(st => {
      const handle = handleOf(st);
      const text = romanceText(st, lang);
      const parent = parentOf(st);
      const id = statusId(st);
      if (!handle || !text || !id || !parent.id || !LOVE[lang].test(text) || charLen(text) > LONG[lang]) return;
      if (followers(st) > 20000 || parent.who.toLowerCase() === handle.toLowerCase()) return;
      const tk = squash(text).slice(0, 50);
      if (seen.has(id) || seen.has(tk) || have.has(id) || have.has(parent.id)) return;
      seen.add(id);
      seen.add(tk);
      const score = (charLen(text) <= SHORT[lang] ? 4 : 0) + (CUTE[lang].test(text) ? 5 : 0) + (ICHA[lang].test(text) ? 6 : 0) + (PLAIN[lang].test(text) ? -5 : 0) + Math.random() * 3;
      cands.push({ want: p.kind, b: { handle, text, url: st.url || `https://x.com/${handle}/status/${id}`, id }, at: st.created_at ? new Date(st.created_at).toISOString() : '', parent, score });
      got++;
    });
    console.log(`  ${lang} ${p.kind} "${p.q.slice(0, 28)}…": ${list.length} replies, ${got} may play (${cands.length} so far)`);
    await sleep(CONF.pause);
  }
  count.candidates = cands.length;
  /* 2. The best of each kind first, so that no kind is left without stories when the reading stops. */
  const byKind = {};
  cands.sort((x, y) => y.score - x.score).forEach(c => { (byKind[c.want] = byKind[c.want] || []).push(c); });
  const ranked = [];
  for (let k = 0; ranked.length < CONF.parents && Object.values(byKind).some(l => l[k]); k++) Object.values(byKind).forEach(l => { if (l[k] && ranked.length < CONF.parents) ranked.push(l[k]); });
  /* 3. The post each reply answers; the pair is kept when both may play. */
  const found = [];
  const texts = new Set(old.flatMap(s => [squash(s.a.text).slice(0, 50), squash(s.b.text).slice(0, 50)]));
  for (let i = 0; i < ranked.length; i += 4) {
    const batch = ranked.slice(i, i + 4);
    const posts = await Promise.all(batch.map(c => status(c.parent.id)));
    posts.forEach((pst, k) => {
      const c = batch[k];
      if (!pst) return;
      count.read++;
      const aText = romanceText(pst, lang);
      const aHandle = handleOf(pst) || c.parent.who;
      const atk = squash(aText).slice(0, 50);
      if (!aText || !aHandle || aHandle.toLowerCase() === c.b.handle.toLowerCase() || charLen(aText) > LONG[lang] || followers(pst) > 20000) return;
      if (texts.has(atk) || texts.has(squash(c.b.text).slice(0, 50))) return;
      /* The post answers the same person: the two are talking with each other. */
      const mutual = parentOf(pst).who.toLowerCase() === c.b.handle.toLowerCase();
      if (!LOVE[lang].test(aText) && !mutual && charLen(aText) > (lang === 'en' ? 40 : 16)) return;
      /* Two plain greetings say nothing. */
      if (PLAIN[lang].test(aText) && PLAIN[lang].test(c.b.text)) return;
      texts.add(atk);
      texts.add(squash(c.b.text).slice(0, 50));
      const aId = statusId(pst) || c.parent.id;
      const both = (CUTE[lang].test(aText) ? 4 : 0) + (ICHA[lang].test(aText) ? 4 : 0) + (mutual ? 6 : 0);
      found.push({
        id: c.b.id, kind: talkKind(aText + ' ' + c.b.text), mutual, score: Math.round((c.score + both) * 10) / 10,
        a: { handle: aHandle, text: aText, url: pst.url || `https://x.com/${aHandle}/status/${aId}`, id: aId },
        b: c.b, at: c.at, found: stamp(),
      });
    });
  }
  count.stories = found.length;
  /* The file: this run's stories and the earlier ones that are still young and still may play. */
  const fresh = s => Date.now() - Date.parse(s.found || 0) < CONF.hours * 3600e3;
  const pairText = s => s.a.text + ' ' + s.b.text;
  const ok = s => cleanText(s.a.text) && cleanText(s.b.text) && !UNSAFE_ROMANCE.test(pairText(s)) && !YOUTH.test(pairText(s)) && !AGE.test(s.a.text) && !AGE.test(s.b.text) && !EMOJI_HINT.test(pairText(s))
    && !FAN.test(pairText(s)) && !BODY.test(pairText(s)) && !FAMILY.test(pairText(s)) && (lang === 'en' || (!POLITE.test(s.a.text) && !POLITE.test(s.b.text)));
  const stories = found.concat(old.filter(s => fresh(s) && ok(s)).map(s => ({ ...s, kind: talkKind(pairText(s)) }))).slice(0, CONF.keep);
  const kinds = {};
  stories.forEach(s => { kinds[s.kind] = (kinds[s.kind] || 0) + 1; });
  console.log(`  ${lang}: ${count.searches} searches gave ${count.replies} replies; ${count.candidates} may play; ${count.read} posts read; ${count.stories} new stories. The file holds ${stories.length} ${JSON.stringify(kinds)}.`);
  return { version: 1, lang, updated: stamp(), run: CONF.noSearch ? (before.run || null) : { at: stamp(), ...count }, kinds, stories };
}

async function main() {
  if (!CONF.on) { console.log('Humor stories are turned off (config.json, "humor": { "on": false }).'); return; }
  for (const lang of CONF.langs.length ? CONF.langs : ['ja']) {
    console.log(`Humor stories, ${lang}: loving exchanges, greetings in their hours`);
    const out = await build(lang);
    if (CONF.dry) continue;
    await mkdir(path.join(CONF.out, 'v1'), { recursive: true });
    await writeFile(path.join(CONF.out, 'v1', `humor-${lang}.json`), JSON.stringify(out) + '\n');
    await writeFile(path.join(CONF.out, '.changed'), stamp() + '\n');
  }
  console.log(`Asked api.fxtwitter.com for ${asked} searches and ${readCount} posts.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message || e); process.exit(1); });
