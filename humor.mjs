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
     node humor.mjs --searches 20    fewer searches (40 unless told); --timelines, --conversations likewise
     node humor.mjs --dry            print the counts, write nothing
     node humor.mjs --no-search      ask nothing: judge the saved stories again and drop the old ones

   It runs every hour. X is read through more than one way in, so that one being refused does not
   stop a run. A run works in rounds for up to 35 minutes: a way in that refuses is left alone for a
   few minutes while the others go on (a refusal passes within a quarter of an hour). It stops asking
   once it has 100 new stories:
     1. Searches of replies with loving words (FxTwitter), in the hours just past. Greetings are
        searched in the hours they are said: good mornings from 5 to 10 in Japan, good nights from 21
        to 2, welcome homes from 17 to 23.
     2. The latest posts of people already in the file that somebody has answered (FxTwitter's
        timeline). No search is needed for these.
     3. Each of these is read as a whole exchange (FxTwitter's conversation: the post, what came
        before it, the replies under it), and every post-and-reply pair in it that may play is kept:
        two different people, neither famous, talking plainly (no polite forms, no さん: those are
        followers and fans, not a couple), words of love or of a greeting (a heart alone is not
        enough), nothing violent, sexual or heavy, nothing of the body, no talk about works, streams
        or campaigns. Somebody whose posts or profile speak of school is left out altogether.
     4. When the conversation is refused, the post a reply answers is read through vxTwitter and its
        writer through FxTwitter's profile.
   Nobody fills the file: four stories for one person at most, two of them from one run.
   Settings are in config.json under "humor"; "on": false turns it off. Node 20 or newer; no packages. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stamp, readJson, charLen, cleanText, readFixupX } from './rules.mjs';
import { lean, spread, deal } from './pick.mjs';

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
  searches: num('searches', 60), // searches one run may make (about 20 replies each)
  timelines: num('timelines', 60), // people whose latest posts are read (those in the file and those met in the exchanges)
  conversations: num('conversations', 400), // exchanges read whole (a post, what came before it, the replies under it)
  enough: num('enough', 100),    // a run stops asking once it has this many new stories
  keep: num('keep', 1500),       // stories the file holds
  hours: num('hours', 72),       // a story leaves the file after three days
  pause: num('pause', 3000),     // milliseconds between two searches
  rest: num('rest', 240000),     // milliseconds a way in is left alone after it refuses (the others go on meanwhile)
  minutes: num('minutes', 13),   // how long one run may last: a refusal passes in a quarter of an hour, so a run waits it out
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
/* Words of love or of a greeting. A heart alone does not make a reply a loving one: some people end
   every line with one. */
const WORDS = {
  ja: /大好き|だいすき|だいしゅき|しゅき|好き|すき|愛して|あいして|いちゃ|イチャ|くっつ[きいこ]|甘え|会いたい|あいたい|ぎゅ|ちゅ[ー〜♡っ！!\s]|ちゅ$|なでなで|よしよし|かわいい|可愛い|かっこいい|おやす|ねんね|おはよ|おはおは|おっはー|おつかれ|お疲れ|ただいま|おかえり|いってらっしゃ|いってきます|行ってらっしゃ|行ってきます|気をつけて|がんばったね|ありがと|ずっと一緒|一緒に|ハグ/,
  en: /love you|love ya|luv u|\bily\b|cuddle|snuggle|miss you|my love|\bbabe\b|\bbaby\b|honey|sweetheart|cutie|handsome|beautiful|good ?night|night night|nighty|good ?morning|sunshine|rise and shine|sleep well|sleep tight|sweet dreams|home safe|take care|thank you/i,
};
const SHORT = { ja: 30, en: 90 };
const LONG = { ja: 60, en: 180 };
/* Not for this page: partings and quarrels, school age, children beside couple talk, innuendo. */
const UNSAFE_ROMANCE = /カニバ|食べちゃ|浮気|不倫|別れ|離婚|ブロック|死ね|殺|嫌い|最低|ストーカー|cheat|divorce|break ?up|hate you/i;
const YOUTH = /がこお[わつ]|がっこ[うー]|ガッコ|下校|登校|給食|宿題|勉強|塾|中間テスト|期末|模試|内申|日本史|世界史|数学|古文|現代文|物理|化学|生物の|英単語|単語帳|小テスト|追試|赤点|共テ|共通テスト|偏差値|志望校|席替え|クラス替え|体育|早退|保健室|学校|放課後|部活|修学旅行|制服|受験|担任|学年|文化祭|体育祭|授業|テスト|先生|クラス|\bschool\b|\bprom\b|\bhomework\b|\bgrade\b|\bclass\b|\bteacher\b/i;
const MINOR_BIO = /(?:^|[^0-9])1[0-7]\s*(?:歳|才|y\/?o\b|years? old)|高[1-3１-３一二三](?:$|[^0-9０-９])|中[1-3１-３一二三](?:$|[^0-9０-９])|高校|中学|小学|学生|ＪＫ|ＪＣ|[LSF]?JK|\bJC\b|\bDK\b|\bminor\b|\bunder ?18\b|\bteen\b/i;
/* An age in the words: nothing that may be about somebody under age plays here. */
const AGE = /(?:^|[^0-9０-９\/:.月])(?:1[0-9]|[1-9])\s*(?:歳|才|さい)|(?:^|[^0-9０-９\/:.月])1[0-9](?:だね|になっ|にな[るり]|[?？]|こえ|超え|越え|過ぎ|すぎて|まで|なのに|やのに|未満)|未成年|十代|10代/;
const EMOJI_HINT = /🍑|🍆|😏|🔞|💦|👅/u;
const MOURN = /ご冥福|追悼|亡くな|お悔やみ|死去|\brip\b|passed away/i;
/* Shops, media and bots greet everybody; a couple is two people. */
const NOT_A_PERSON = /公式|official|ニュース|新聞|news|放送|テレビ|編集部|広報|株式会社|\bbot\b|情報局|まとめ|運営|事務局|shop|store|店|サロン|クリニック|占い|鑑定|配信|ライバー|VTuber|Vtuber|アイドル|声優|モデル|コンカフェ|キャスト|メンエス|セラピスト/i;
/* Two people who are close talk plainly. Polite forms and names with さん or 様 are a follower greeting
   a stranger, a fan writing to a star, a shop thanking a customer. */
const POLITE = /さん|様|氏|先生|先輩|ございます|でした[。！!✨\s]|でしたね|いたします|致します|ください|下さい|ですね|ますね|ですよ|ましょう|です[！!。✨♡\s]|です$|ます[！!。✨\s]|ます$|ました|ますように|ありがとうござ/;
/* Births and children are family news, not couple talk. */
const FAMILY = /成人したら|成人する|うちの子|我が子|わが子|育児|子育て|保育園|幼稚園|出産|妊娠|赤ちゃん|男の子|女の子|息子|娘|子供|子ども|こども|孫|ママ友|パパ友/;
/* Talk about works, streams and campaigns is not talk between a couple; "ALT" is a picture's caption. */
const FAN = /拡散|リポスト|\bRT\b|フォロー|イラスト|作品|配信|推し|\bALT\b|当選|企画|プレゼント|お迎え|納品|ご依頼|スペース|リスナー|ライブ|チケット|グッズ|新曲|アルバム|\bMV\b|動画|投稿|写真集|てぇてぇ|てえてえ|尊[いすみ]|メンバー|キャプテン|センター|ペア|コンビ|絵柄|色味|描い|塗り|立ち絵|衣装|アバター|スキン|選びました|シーン|リスペクト|曲|歌っ|歌う|ゲーム|ガチャ|イベント|タグ|呼びタメ|タメ口|タメで|お言葉に甘え|尊い|\bFGO\b|とうらぶ|くっつ[くけ]|みんな|皆|ポスト|写真|解禁|戦型|対戦|勝[っちて]|かてた|負け|ランク|甘えてしま|デビュー/;
/* Nothing of the body on this page. */
const BODY = /ベッ[ドト]|添い寝|お風呂|風呂|脱[がぎぐい]|裸|舐|胸|尻|下着|えっち|エッチ|エロ|ホテル|お泊|泊ま|濡れ|お口|唇|くちびる|ばぶ|おっぱ|乙π|π|デカすぎ|でかすぎ|巨乳|貧乳|谷間|太もも|ふともも|パンツ|🍌|🍒|💦|🍑|🍆|🤱|👄|😛|🤤|🍼|👶/u;
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
  if (/愛してる|あいしてる|いちゃ|イチャ|くっつ[きいこ]|甘え|一生離さない|ずっと一緒|大好き|だいすき|だいしゅき|好きだよ|すきだよ|ちゅ[ー〜♡っ！!\s]|ちゅ$|ぎゅ|i love you|love you (?:so much|more|forever)|cuddle|snuggle/i.test(t)) return 'icha';
  if (/おやす|ねんね|すや|寝る|寝よ|眠|night|sleep|dream|💤|😴/i.test(t)) return 'night';
  if (/ただいま|おかえり|おつかれ|お疲れ|がんばった|頑張った|home|welcome back/i.test(t)) return 'home';
  if (/愛してる|あいしてる|いちゃ|イチャ|くっつ[きいこ]|甘え|一生離さない|ずっと一緒|i love you|cuddle|snuggle/i.test(t)) return 'icha';
  if (/会いたい|あいたい|寂し|さみし|miss/i.test(t)) return 'miss';
  if (/好き|すき|しゅき|愛|ぎゅ|ちゅ|なでなで|love|kiss|hug|♡|❤|💕/i.test(t)) return 'love';
  return 'other';
}

/* ---------- asking ---------- */
/* X is read through more than one way in, so that one of them being refused does not stop a run:
   - FxTwitter's search finds loving replies;
   - FxTwitter's conversation gives a post together with what came before it and the replies under
     it, so one request gives the whole exchange (and needs no search for what follows);
   - FxTwitter's timeline gives the latest posts of people already in the file;
   - when the conversation is refused, the post a reply answers is read through vxTwitter and its
     writer through FxTwitter's profile. */
let asked = 0;
let convAsked = 0;
let timelineAsked = 0;
let timelineGave = 0;
const via = { conversation: 0, vxtwitter: 0, fixupx: 0 };
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
/* An exchange: the post, the posts before it, and the replies under it. */
async function conversation(id) {
  convAsked++;
  const d = await fxJson('https://api.fxtwitter.com/2/conversation/' + id);
  const list = [];
  if (d && d.status) list.push(d.status);
  ((d && Array.isArray(d.thread)) ? d.thread : []).forEach(st => list.push(st));
  ((d && Array.isArray(d.replies)) ? d.replies : []).forEach(st => list.push(st));
  return list;
}
/* A person's own latest posts. */
async function timeline(handle) {
  timelineAsked++;
  const d = await fxJson('https://api.fxtwitter.com/2/profile/' + handle + '/statuses?count=40');
  const list = ((d && Array.isArray(d.results)) ? d.results : []).filter(st => !st.reposted_by && handleOf(st).toLowerCase() === handle.toLowerCase());
  if (list.length) timelineGave++;
  return list;
}
/* The post a reply answers, another way: its words through vxTwitter, its writer through FxTwitter's
   profile (who the writer is must be known: a profile that cannot be read is not played). */
async function parentOtherWay(handle, id) {
  try {
    let post = null;
    try {
      const res = await fetch(`https://api.vxtwitter.com/${handle || 'i'}/status/${id}`, { headers: { 'user-agent': 'githito.xapi collector', accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      const d = res.ok ? await res.json().catch(() => null) : null;
      if (d && d.text && d.user_screen_name) {
        via.vxtwitter++;
        post = { text: String(d.text), who: d.user_screen_name, name: d.user_name || '', at: Number(d.date_epoch) || 0, sensitive: !!d.possibly_sensitive, to: d.replyingToID ? { screen_name: d.replyingTo || '', status: String(d.replyingToID) } : null };
      }
    } catch (e) {}
    if (!post) {
      const d = await readFixupX(handle, id);
      if (d && d.raw && d.handle) { via.fixupx++; post = { text: String(d.raw), who: d.handle, name: '', at: 0, sensitive: false, to: null }; }
    }
    if (!post) return null;
    const p = await fxJson('https://api.fxtwitter.com/' + post.who);
    const u = p && p.user;
    if (!u) return null;
    return {
      id: String(id), url: `https://x.com/${post.who}/status/${id}`, text: post.text, created_timestamp: post.at, possibly_sensitive: post.sensitive,
      author: { screen_name: post.who, name: u.name || post.name || '', description: u.description || '', followers: u.followers, protected: !!u.protected },
      replying_to: post.to,
    };
  } catch (e) { return null; }
}
const whenOf = st => { const t = st && (st.created_timestamp ? st.created_timestamp * 1000 : Date.parse(st.created_at || '')); return Number.isFinite(t) && t > 0 ? new Date(t).toISOString().replace(/\.\d+Z$/, 'Z') : ''; };
/* The start of a two-hour window. Loving talk: the hours just past, so that every run finds what is
   new. A greeting: the hours just past when they are its hours (Japan); otherwise one of its hours
   today or on one of the two days before. */
function windowStart(hours) {
  const now = Math.floor(Date.now() / 1000);
  if (!hours) return now - 7200 - Math.floor(Math.random() * 7) * 3600;
  const recent = [2, 3, 4].map(h => now - h * 3600).filter(t => hours.includes(Math.floor(((t + 9 * 3600) % 86400) / 3600)));
  if (recent.length) return recent[Math.floor(Math.random() * recent.length)];
  const jstMidnight = Math.floor((now + 9 * 3600) / 86400) * 86400 - 9 * 3600;
  for (let k = 0; k < 40; k++) {
    const t = jstMidnight - Math.floor(Math.random() * 3) * 86400 + hours[Math.floor(Math.random() * hours.length)] * 3600;
    if (t + 7200 <= now && now - t < 60 * 3600) return t;
  }
  return now - 7200 - Math.floor(Math.random() * 44) * 3600;
}
/* A greeting is searched most in its own hours; outside them it gets a third of its share. */
const inItsHours = hours => { const h = Math.floor(((Date.now() / 1000 - 2 * 3600 + 9 * 3600) % 86400) / 3600); return !hours || hours.includes(h) || hours.includes((h + 23) % 24); };

/* ---------- pairs ---------- */
const replyScore = (text, lang) => (charLen(text) <= SHORT[lang] ? 4 : 0) + (CUTE[lang].test(text) ? 5 : 0) + (ICHA[lang].test(text) ? 6 : 0) + (PLAIN[lang].test(text) ? -5 : 0) + Math.random() * 3;
/* A post and the reply to it, when both may play: two different people, neither famous, the reply a
   loving one, and the post loving, short, or itself an answer to the same person. */
/* Why pairs were not kept, counted for the run's log. */
const WHY = {};
const why = reason => { WHY[reason] = (WHY[reason] || 0) + 1; return null; };
function pairFrom(pst, cst, lang) {
  const aHandle = handleOf(pst), bHandle = handleOf(cst), aId = statusId(pst), bId = statusId(cst);
  if (!aHandle || !bHandle || !aId || !bId) return why('no id');
  if (aHandle.toLowerCase() === bHandle.toLowerCase()) return why('same person');
  const aText = romanceText(pst, lang), bText = romanceText(cst, lang);
  if (!aText) return why('the post may not play');
  if (!bText) return why('the reply may not play');
  if (charLen(aText) > LONG[lang] || charLen(bText) > LONG[lang]) return why('too long');
  if (followers(pst) > 20000 || followers(cst) > 20000) return why('famous');
  if (!LOVE[lang].test(bText)) return why('the reply is not loving');
  if (!(WORDS[lang].test(bText) || WORDS[lang].test(aText))) return why('a heart but no words');
  const mutual = parentOf(pst).who.toLowerCase() === bHandle.toLowerCase();
  if (!LOVE[lang].test(aText) && !mutual && charLen(aText) > (lang === 'en' ? 40 : 16)) return why('the post is about something else');
  if (PLAIN[lang].test(aText) && PLAIN[lang].test(bText)) return why('two plain greetings');
  const score = replyScore(bText, lang) + (CUTE[lang].test(aText) ? 4 : 0) + (ICHA[lang].test(aText) ? 4 : 0) + (mutual ? 6 : 0);
  return {
    id: bId, kind: talkKind(aText + ' ' + bText), mutual, score: Math.round(score * 10) / 10,
    a: { handle: aHandle, text: aText, url: pst.url || `https://x.com/${aHandle}/status/${aId}`, id: aId },
    b: { handle: bHandle, text: bText, url: cst.url || `https://x.com/${bHandle}/status/${bId}`, id: bId },
    at: whenOf(cst), found: stamp(),
  };
}
/* Somebody whose posts or profile speak of school is left out altogether, whatever else they write. */
const SKIP = new Map();
const speaksOfSchool = st => { const a = (st && st.author) || {}; return YOUTH.test(String((st && st.text) || '')) || AGE.test(String((st && st.text) || '')) || MINOR_BIO.test(String(a.description || '') + ' ' + String(a.name || '')); };
function noteYouth(list) { list.forEach(st => { const h = handleOf(st).toLowerCase(); if (h && speaksOfSchool(st)) SKIP.set(h, stamp()); }); }
const skipped = handle => SKIP.has(String(handle || '').toLowerCase());
/* Every post-and-reply pair among the posts of one exchange, the best first. */
function pairsIn(list, lang) {
  noteYouth(list);
  const byId = new Map();
  list.forEach(st => { const id = statusId(st); if (id && !byId.has(id)) byId.set(id, st); });
  const out = [];
  byId.forEach(cst => {
    const pst = byId.get(parentOf(cst).id);
    const pair = pst && !skipped(handleOf(pst)) && !skipped(handleOf(cst)) ? pairFrom(pst, cst, lang) : null;
    if (pair) out.push(pair);
  });
  return out.sort((x, y) => y.score - x.score);
}

/* ---------- the order the page plays in ---------- */
/* Chosen here, at random, after every collection (see pick.mjs); the page plays from the top and leaves
   out what its reader has seen. Three orders, for the hour of the day:
   - morning: seven good mornings in ten, three loving exchanges;
   - day: seven loving exchanges in ten, three greetings of coming home;
   - night: seven loving exchanges in ten, three good nights or welcome homes.
   Nobody comes twice in any stretch of ten stories. */
function humorPlay(stories) {
  const people = s => ['p' + String(s.a.handle).toLowerCase(), 'p' + String(s.b.handle).toLowerCase()];
  const order = list => spread(lean(list, s => s.found || s.at, 24), people, 10);
  const ids = list => list.map(s => s.id);
  const loving = order(stories.filter(s => s.kind === 'icha' || s.kind === 'love' || s.kind === 'miss'));
  const mornings = order(stories.filter(s => s.kind === 'morning'));
  const homes = order(stories.filter(s => s.kind === 'home' || s.kind === 'other'));
  const nights = order(stories.filter(s => s.kind === 'night' || s.kind === 'home' || s.kind === 'other'));
  return { made: stamp(), morning: ids(deal(mornings, loving, 0.3, 2, true)), day: ids(deal(loving, homes, 0.3, 2, true)), night: ids(deal(loving, nights, 0.3, 2, true)) };
}

/* ---------- one language ---------- */
async function build(lang) {
  const file = path.join(CONF.out, 'v1', `humor-${lang}.json`);
  const before = await readJson(file, { stories: [] });
  const old = (Array.isArray(before.stories) ? before.stories : []).filter(s => s && s.id && s.a && s.b && s.a.text && s.b.text);
  const have = new Set(old.flatMap(s => [s.id, s.a.id]));
  const texts = new Set(old.flatMap(s => [squash(s.a.text).slice(0, 50), squash(s.b.text).slice(0, 50)]));
  /* What has been read as an exchange in the last two days is not read again. */
  const conv = {};
  Object.entries((before.conv && typeof before.conv === 'object') ? before.conv : {}).forEach(([id, at]) => { if (Date.now() - Date.parse(at || 0) < CONF.hours * 3600e3) conv[id] = at; });
  const count = { searches: 0, replies: 0, candidates: 0, timelines: 0, posts: 0, conversations: 0, otherWay: 0, stories: 0 };
  /* People left out in the last two weeks stay out. */
  Object.entries((before.skip && typeof before.skip === 'object') ? before.skip : {}).forEach(([h, at]) => { if (Date.now() - Date.parse(at || 0) < 14 * 24 * 3600e3) SKIP.set(h, at); });
  /* Nobody fills the file: four stories for one person at most, two of them from one run. */
  const perPerson = new Map();
  const perRun = new Map();
  old.forEach(s => [s.a.handle, s.b.handle].forEach(h => { const k = String(h).toLowerCase(); perPerson.set(k, (perPerson.get(k) || 0) + 1); }));
  const off = CONF.noSearch;

  /* The searches this run would make: each kind by its share, in the hours just past. */
  const plan = [];
  (SEARCHES[lang] || []).forEach(k => {
    const n = Math.max(1, Math.round(CONF.searches * k.share * (inItsHours(k.hours) ? 1 : 1 / 3)));
    for (let i = 0; i < n; i++) plan.push({ kind: k.kind, q: k.q[i % k.q.length], start: windowStart(k.hours) });
  });
  const searches = shuffle(plan).slice(0, CONF.searches);
  /* People whose latest posts are read (those that somebody has answered need no search): both sides
     of the stories in the file, and whoever is met in the exchanges read in this run. Those never read
     come first, then those read longest ago, so every run asks different people. */
  const readAt = {};
  Object.entries((before.people && typeof before.people === 'object') ? before.people : {}).forEach(([h, at]) => { if (Date.now() - Date.parse(at || 0) < 7 * 24 * 3600e3) readAt[h] = at; });
  const known = new Set();
  const people = [];
  const meet = handle => { const h = String(handle || ''); const k = h.toLowerCase(); if (!h || known.has(k) || skipped(h)) return; known.add(k); people.push(h); };
  shuffle(old.flatMap(s => [s.a.handle, s.b.handle])).sort((x, y) => (Date.parse(readAt[x.toLowerCase()] || 0) || 0) - (Date.parse(readAt[y.toLowerCase()] || 0) || 0)).forEach(meet);
  const cands = [];   // loving replies found by search, to be read as exchanges
  const posts = [];   // answered posts from the timelines, to be read as exchanges
  const seen = new Set();
  const found = [];
  const keep = pair => {
    const ak = squash(pair.a.text).slice(0, 50), bk = squash(pair.b.text).slice(0, 50);
    if (have.has(pair.id) || texts.has(ak) || texts.has(bk)) { why('already in the file'); return false; }
    const who = [pair.a.handle, pair.b.handle].map(h => String(h).toLowerCase());
    if (who.some(h => skipped(h) || (perPerson.get(h) || 0) >= 4 || (perRun.get(h) || 0) >= 2)) { why('that person has enough stories'); return false; }
    who.forEach(h => { perPerson.set(h, (perPerson.get(h) || 0) + 1); perRun.set(h, (perRun.get(h) || 0) + 1); });
    have.add(pair.id);
    texts.add(ak);
    texts.add(bk);
    found.push(pair);
    return true;
  };

  /* One run is a number of rounds: a few searches, a few timelines, then the exchanges waiting to be
     read. A way in that refuses is left alone for some minutes while the others go on; a refusal
     passes within a quarter of an hour, so the run waits it out instead of giving up. The run ends
     when it has enough new stories, when nothing is left to ask, or when its time is up. */
  const deadline = Date.now() + CONF.minutes * 60e3;
  const restUntil = { search: 0, timeline: 0, conversation: 0 };
  const refusedTimes = { search: 0, timeline: 0, conversation: 0 };
  const open = way => Date.now() >= restUntil[way];
  const refuse = (way, e) => { refusedTimes[way]++; restUntil[way] = Date.now() + CONF.rest; console.log(`  ${way} ${e ? e.message : 'refused'}: left alone for ${Math.round(CONF.rest / 60000)} minutes`); };
  let si = 0;
  let pi = 0;
  let ci = 0;
  let qi = 0;
  let readThisRun = 0;
  while (!off && Date.now() < deadline && found.length < CONF.enough) {
    let did = 0;
    /* A. Searches of loving replies. */
    for (let k = 0; k < 6 && si < searches.length && open('search'); k++) {
      const p = searches[si];
      let list;
      try { list = await search(p.q, lang, p.start); }
      catch (e) { if (!(e instanceof Refused)) throw e; refuse('search', e); break; }
      si++;
      did++;
      count.searches++;
      count.replies += list.length;
      let got = 0;
      list.forEach(st => {
        const handle = handleOf(st);
        const text = romanceText(st, lang);
        const parent = parentOf(st);
        const id = statusId(st);
        if (!handle || !text || !id || !parent.id || !LOVE[lang].test(text) || charLen(text) > LONG[lang]) return;
        if (followers(st) > 20000 || parent.who.toLowerCase() === handle.toLowerCase() || skipped(handle)) return;
        const tk = squash(text).slice(0, 50);
        if (seen.has(id) || seen.has(tk) || have.has(id) || have.has(parent.id) || conv[id]) return;
        seen.add(id);
        seen.add(tk);
        cands.push({ want: p.kind, id, st, parent, score: replyScore(text, lang) });
        got++;
      });
      count.candidates += got;
      console.log(`  ${lang} ${p.kind} "${p.q.slice(0, 28)}…": ${list.length} replies, ${got} may play`);
      await sleep(CONF.pause);
    }
    /* B. Timelines. */
    for (let k = 0; k < 5 && pi < people.length && count.timelines < CONF.timelines && open('timeline'); k++) {
      const handle = people[pi];
      let list;
      try { list = await timeline(handle); }
      catch (e) { if (!(e instanceof Refused)) throw e; refuse('timeline', e); break; }
      pi++;
      did++;
      count.timelines++;
      readAt[handle.toLowerCase()] = stamp();
      noteYouth(list);
      if (!skipped(handle)) list.forEach(st => {
        const id = statusId(st);
        const text = romanceText(st, lang);
        if (!id || !text || parentOf(st).id || have.has(id) || conv[id] || seen.has(id)) return;
        if ((Number(st.replies) || 0) < 1 || charLen(text) > LONG[lang] || followers(st) > 20000) return;
        if (Date.now() - Date.parse(whenOf(st) || 0) > 30 * 3600e3) return;
        seen.add(id);
        posts.push({ id, st, replies: Number(st.replies) || 0 });
        count.posts++;
      });
      await sleep(1200);
    }
    /* C. The exchanges waiting to be read: the best replies and the most answered posts in turn. Two
       pairs at most from one exchange. (Reading the file's own exchanges again gave the same pairs.) */
    cands.sort((x, y) => (x.done ? 1 : 0) - (y.done ? 1 : 0) || y.score - x.score);
    posts.sort((x, y) => (x.done ? 1 : 0) - (y.done ? 1 : 0) || y.replies - x.replies);
    const next = () => {
      const c = cands.find(x => !x.done), p = posts.find(x => !x.done);
      const pick = qi++ % 2 === 0 ? (c || p) : (p || c);
      if (pick) pick.done = true;
      return pick;
    };
    for (let k = 0; k < 12 && open('conversation') && readThisRun < CONF.conversations && found.length < CONF.enough; k++) {
      const batch = [next(), next(), next(), next()].filter(Boolean);
      if (!batch.length) break;
      const got = await Promise.all(batch.map(x => conversation(x.id).catch(e => { if (e instanceof Refused) return null; throw e; })));
      if (got.every(g => !g)) {
        /* Refused: the post each reply answers is read another way, and the exchanges wait their turn again. */
        const others = await Promise.all(batch.map(x => (x.st && x.parent ? parentOtherWay(x.parent.who, x.parent.id) : null)));
        others.forEach((pst, n) => {
          if (!pst) { batch[n].done = false; return; }
          count.otherWay++;
          noteYouth([pst, batch[n].st]);
          const pair = pairFrom(pst, batch[n].st, lang);
          if (pair) keep(pair);
          did++;
        });
        refuse('conversation');
        break;
      }
      got.forEach((list, n) => {
        if (!list) { batch[n].done = false; return; }
        did++;
        readThisRun++;
        count.conversations++;
        via.conversation++;
        conv[batch[n].id] = stamp();
        list.forEach(st => { if (followers(st) <= 20000) meet(handleOf(st)); });
        let pairs = 0;
        pairsIn(list, lang).forEach(pair => { if (pairs < 2 && keep(pair)) pairs++; });
      });
      await sleep(1500);
    }
    const waiting = cands.some(x => !x.done) || posts.some(x => !x.done);
    const more = si < searches.length || (pi < people.length && count.timelines < CONF.timelines) || waiting;
    if (!more) break;
    console.log(`  ${lang} round: ${count.searches} searches, ${count.timelines} timelines, ${count.conversations} exchanges read, ${found.length} new stories`);
    /* Nothing could be asked this round: wait for the way in that opens first. */
    if (!did) await sleep(Math.max(15000, Math.min(60000, Math.min(...Object.values(restUntil).filter(t => t > Date.now()).concat(Date.now() + 60000)) - Date.now())));
  }
  if (found.length >= CONF.enough) console.log(`  ${lang}: ${found.length} new stories, which is enough for one run`);
  count.stories = found.length;
  count.refused = refusedTimes;
  console.log('  pairs not kept: ' + JSON.stringify(WHY));

  /* The file: this run's stories and the earlier ones that are still young and still may play. */
  const fresh = s => Date.now() - Date.parse(s.found || 0) < CONF.hours * 3600e3;
  const pairText = s => s.a.text + ' ' + s.b.text;
  const ok = s => cleanText(s.a.text) && cleanText(s.b.text) && !UNSAFE_ROMANCE.test(pairText(s)) && !YOUTH.test(pairText(s)) && !AGE.test(s.a.text) && !AGE.test(s.b.text) && !EMOJI_HINT.test(pairText(s))
    && !FAN.test(pairText(s)) && !BODY.test(pairText(s)) && !FAMILY.test(pairText(s)) && (lang === 'en' || (!POLITE.test(s.a.text) && !POLITE.test(s.b.text)));
  const stories = found.filter(s => !skipped(s.a.handle) && !skipped(s.b.handle)).concat(old.filter(s => fresh(s) && ok(s) && !skipped(s.a.handle) && !skipped(s.b.handle)).map(s => ({ ...s, kind: talkKind(pairText(s)) }))).slice(0, CONF.keep);
  const kinds = {};
  stories.forEach(s => { kinds[s.kind] = (kinds[s.kind] || 0) + 1; });
  console.log(`  ${lang}: ${count.searches} searches gave ${count.replies} replies, ${count.candidates} of them may play; ${count.timelines} timelines gave ${count.posts} answered posts; ${count.conversations} exchanges read whole (${count.otherWay} posts another way); ${count.stories} new stories. The file holds ${stories.length} ${JSON.stringify(kinds)}.`);
  return { version: 3, lang, updated: stamp(), run: off ? (before.run || null) : { at: stamp(), ...count }, kinds, conv, people: readAt, skip: Object.fromEntries(SKIP), play: humorPlay(stories), stories };
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
  console.log(`Asked api.fxtwitter.com for ${asked} searches, ${timelineAsked} timelines (${timelineGave} answered) and ${convAsked} conversations; posts read another way: vxTwitter ${via.vxtwitter}, FixupX ${via.fixupx}.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message || e); process.exit(1); });
