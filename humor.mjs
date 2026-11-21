#!/usr/bin/env node
/* githito.xapi: the Humor page's stories, made ahead of time.

   The Humor page (githitosh.github.io/news-shorts/humor/) plays loving exchanges. Stories are built
   here ahead of time into v1/humor-<lang>.json; the page only reads that file.

   Prefer accounts listed in the private memo's humor-accounts.json (--memo or XAPI_MEMO_DIR).
   New accounts are recorded first by humor-find.mjs (~50 loving-reply accounts each half-hour run);
   this program then reads those registered accounts' exchanges. A loving reply from an unregistered
   partner is kept when the other speaker is already on the memo, and that partner is appended to the
   memo (couple-first growth). When the memo is missing, a short open romance search still fills
   anonymized stories so Reply News is not empty. News accounts (private memo news-famous.json) are a
   different file; this program does not read them.

     node humor.mjs                  build once into ./public (Japanese)
     node humor.mjs --timelines 40   how many registered accounts' timelines to read
     node humor.mjs --dry            print the counts, write nothing
     node humor.mjs --no-search      ask nothing: judge the saved stories again and drop the old ones

   A run works in rounds for up to the minutes in config: a way in that refuses is left alone while
   the others go on. It stops asking once it has enough new stories:
     1. The latest posts of the registered accounts (FxTwitter timeline).
     2. Each answered post is read as a whole exchange (conversation); every post-and-reply pair that
        may play and involves at least one registered account is kept: two different people, neither famous,
        talking plainly, clear romantic feeling, nothing violent, sexual or heavy.
     3. When the conversation is refused, the parent post is read through vxTwitter / FixupX.
   Nobody fills the file: four stories for one person at most, two of them from one run.
   Settings are in config.json under "humor"; "on": false turns it off. Node 20 or newer; no packages. */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stamp, readJson, charLen, cleanText, readFixupX } from './rules.mjs';
import { lean, spread, deal } from './pick.mjs';
import { slander, alcohol, tobacco, cruel, personal, advert, NEGATIVE, politicalTarget, ATTACK } from './filters.mjs';
import { humorAccounts, addHumorAccounts } from './humor-accounts.mjs';
const harsh = t => !!(slander(t) || cruel(t) || personal(t) || advert(t) || NEGATIVE.test(String(t || '')) || politicalTarget(t) || ATTACK.test(String(t || '')));
const isOpaqueHandle = h => /^s\d+$/i.test(String(h || ''));

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
  timelines: num('timelines', 150), // registered accounts whose latest posts are read (raise toward ~2000 stock)
  conversations: num('conversations', 600), // exchanges read whole (a post, what came before it, the replies under it)
  enough: num('enough', 160),    // a run stops asking once it has this many new stories
  keep: num('keep', 2500),       // stories the file holds (aim for ~2000 videos in stock)
  hours: num('hours', 96),       // a story leaves the file after four days
  rest: num('rest', 240000),     // milliseconds a way in is left alone after it refuses (the others go on meanwhile)
  minutes: num('minutes', 14),   // how long one run may last: a refusal passes in a quarter of an hour, so a run waits it out
  dry: flag('dry'),
  noSearch: flag('no-search') || process.env.XAPI_NO_SEARCH === '1',
  /* Private memo folder: humor-accounts.json (registration). Empty: no humor account is read. */
  memo: opt('memo', process.env.XAPI_MEMO_DIR || '') ? path.resolve(opt('memo', process.env.XAPI_MEMO_DIR || '')) : '',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shuffle = list => list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);

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
/* Fan / work talk is not couple talk. Underground-idol news coverage is also out (idols as private
   people in a couple exchange may pass; cheki / tokuten / oshi-news language does not). */
const FAN = /拡散|リポスト|\bRT\b|フォロー|イラスト|作品|配信|推し|\bALT\b|当選|企画|プレゼント|お迎え|納品|ご依頼|スペース|リスナー|ライブ|チケット|グッズ|新曲|アルバム|\bMV\b|動画|投稿|写真集|てぇてぇ|てえてえ|尊[いすみ]|メンバー|キャプテン|センター|ペア|コンビ|絵柄|色味|描い|塗り|立ち絵|衣装|アバター|スキン|選びました|シーン|リスペクト|曲|歌っ|歌う|ゲーム|ガチャ|イベント|タグ|呼びタメ|タメ口|タメで|お言葉に甘え|尊い|\bFGO\b|とうらぶ|くっつ[くけ]|みんな|皆|ポスト|写真|解禁|戦型|対戦|勝[っちて]|かてた|負け|ランク|甘えてしま|デビュー|地下アイドル|地下ドル|チェキ|特典会|物販|握手会|リリイベ|生誕祭|対バン|アイドル活動/;
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
  /* Nothing of alcohol or smoking on this page (it is read by the young too). */
  if (FAN.test(text) || BODY.test(text) || FAMILY.test(text) || alcohol(text) || tobacco(text)) return '';
  if (MINOR_BIO.test(bio) || YOUTH.test(String(a.description || '')) || NOT_A_PERSON.test(bio) || a.protected || st.possibly_sensitive) return '';
  if (lang === 'en') {
    if ((text.match(/[぀-ヿ一-鿿]/g) || []).length > 2 || !/[A-Za-z]{2,}/.test(text) || text.length < 4) return '';
  } else if ((text.match(/[぀-ヿ]/g) || []).length < 1 || charLen(text) < 2) return '';
  return text;
}
/* Japan-time hour of a post (0–23), or -1 when unknown. */
export function japanHour(iso) {
  const ms = Date.parse(iso || 0);
  if (!Number.isFinite(ms) || !ms) return -1;
  return new Date(ms + 9 * 3600e3).getUTCHours();
}
/* morning 4–10, night 21–3, otherwise day. */
export function daySlot(hour) {
  if (hour >= 4 && hour < 11) return 'morning';
  if (hour >= 21 || (hour >= 0 && hour < 4)) return 'night';
  return 'day';
}
/* The kind of talk, by what the two say — and by when it was posted (おはよう at 15:00 is not morning). */
export function talkKind(text, at) {
  const t = String(text || '');
  let k = 'other';
  if (/おは|朝だ|morning|rise and shine|sunshine|☀/i.test(t)) k = 'morning';
  else if (/愛してる|あいしてる|いちゃ|イチャ|くっつ[きいこ]|甘え|一生離さない|ずっと一緒|大好き|だいすき|だいしゅき|好きだよ|すきだよ|ちゅ[ー〜♡っ！!\s]|ちゅ$|ぎゅ|i love you|love you (?:so much|more|forever)|cuddle|snuggle/i.test(t)) k = 'icha';
  else if (/おやす|ねんね|すや|寝る|寝よ|眠|night|sleep|dream|💤|😴/i.test(t)) k = 'night';
  else if (/ただいま|おかえり|おつかれ|お疲れ|がんばった|頑張った|home|welcome back/i.test(t)) k = 'home';
  else if (/会いたい|あいたい|寂し|さみし|miss/i.test(t)) k = 'miss';
  else if (/好き|すき|しゅき|愛|ぎゅ|ちゅ|なでなで|love|kiss|hug|♡|❤|💕/i.test(t)) k = 'love';
  const h = japanHour(at);
  if (h < 0) return k;
  const slot = daySlot(h);
  /* Greetings only keep their slot when the post was written in that part of the day. */
  if (k === 'morning' && slot !== 'morning') return /好き|すき|愛|love|♡|❤/i.test(t) ? 'love' : 'other';
  if (k === 'night' && slot !== 'night') return /好き|すき|愛|love|♡|❤/i.test(t) ? 'love' : 'other';
  return k;
}

/* ---------- asking ---------- */
/* X is read through more than one way in, so that one of them being refused does not stop a run:
   - FxTwitter's timeline gives the latest posts of registered humor accounts;
   - FxTwitter's conversation gives a post together with what came before it and the replies under
     it, so one request gives the whole exchange;
   - when the conversation is refused, the post a reply answers is read through vxTwitter and its
     writer through FxTwitter's profile.
   Finding new accounts to register is humor-find.mjs, not this file. */
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
/* ---------- pairs ---------- */
const replyScore = (text, lang) => (charLen(text) <= SHORT[lang] ? 4 : 0) + (CUTE[lang].test(text) ? 5 : 0) + (ICHA[lang].test(text) ? 6 : 0) + (PLAIN[lang].test(text) ? -5 : 0) + Math.random() * 3;
/* Clearly romantic replies only: heart / affection emoji, clear love words, or a funny romantic
   greeting form (おはよん♡, night night babe). Ordinary replies on a romance thread (うん, そうだね,
   plain おはよう / thanks with no feeling) are dropped — they are not interesting here. */
const HEART = /♡|❤|♥|💕|💗|💖|💘|💞|🥰|😘|😚|😍|🤗/;
/* Clear romance: hearts, affection words (including bare 好き/すき), cute greeting play. Plain おはよう alone is still out (CUTE / HEART required for greetings). */
const FEELING = {
  ja: /大好き|だいすき|だいしゅき|すきすき|好きだよ|すきだよ|好き|すき|愛してる|あいしてる|愛して|ぎゅ[ー〜っ]*|ちゅ[ー〜っ]*|なでなで|よしよし|会いたい|あいたい|いちゃ|イチャ|くっつ[きいこ]|甘え|しゅき|ずっと一緒|一生離さない|かわいい|可愛い/,
  en: /i love you|love you(?: so much| more| forever)?|love ya|luv u|\bily\b|cuddle|snuggle|miss you(?: more)?|my love|\bbabe\b|\bbaby\b|honey|sweetheart|cutie|xoxo|night night|nighty|sunshine|rise and shine|sleep tight|sweet dreams/i,
};
export function clearlyRomantic(text, lang) {
  const t = String(text || '');
  if (!t) return false;
  if (HEART.test(t) || FEELING[lang].test(t)) return true;
  /* Cute romantic greeting forms already encode loving playfulness; plain greetings do not. */
  if (CUTE[lang].test(t)) return true;
  return false;
}
/* A post and the reply to it, when both may play: two different people, neither famous, the reply
   clearly romantic, and the post loving, short, or itself an answer to the same person. */
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
  /* Insults, criticism, pile-ons, politics, ads, alcohol: never on Humor. */
  if (harsh(aText) || harsh(bText)) return why('unkind or critical words');
  if (alcohol(aText) || alcohol(bText) || tobacco(aText) || tobacco(bText)) return why('alcohol or smoking');
  if (followers(pst) > 20000 || followers(cst) > 20000) return why('famous');
  if (!clearlyRomantic(bText, lang)) return why('reply not clearly romantic');
  if (!(WORDS[lang].test(bText) || HEART.test(bText))) return why('reply has no romantic words');
  const mutual = parentOf(pst).who.toLowerCase() === bHandle.toLowerCase();
  if (!LOVE[lang].test(aText) && !mutual && charLen(aText) > (lang === 'en' ? 40 : 16)) return why('the post is about something else');
  if (PLAIN[lang].test(aText) && PLAIN[lang].test(bText) && !HEART.test(aText + bText) && !CUTE[lang].test(bText)) return why('two plain greetings');
  const score = replyScore(bText, lang) + (CUTE[lang].test(aText) ? 4 : 0) + (ICHA[lang].test(aText) ? 4 : 0) + (mutual ? 6 : 0);
  const at = whenOf(cst) || whenOf(pst);
  return {
    id: bId, kind: talkKind(aText + ' ' + bText, at), mutual, score: Math.round(score * 10) / 10,
    a: { handle: aHandle, text: aText, id: aId },
    b: { handle: bHandle, text: bText, id: bId },
    at, found: stamp(),
  };
}
/* Somebody whose posts or profile speak of school is left out altogether, whatever else they write. */
const SKIP = new Map();
const speaksOfSchool = st => { const a = (st && st.author) || {}; return YOUTH.test(String((st && st.text) || '')) || AGE.test(String((st && st.text) || '')) || MINOR_BIO.test(String(a.description || '') + ' ' + String(a.name || '')); };
function noteYouth(list) { list.forEach(st => { const h = handleOf(st).toLowerCase(); if (h && speaksOfSchool(st)) SKIP.set(h, stamp()); }); }
const skipped = handle => SKIP.has(String(handle || '').toLowerCase());
/* The whole talk a pair belongs to: the messages the two wrote to each other before it and after it, in
   order, each one fit to play here (romanceText, slander), each answering the one before. The pair's two
   are among them. At most three before and four after. t: [{ h, x (the words), i (the post's number) }] */
const TALK = { before: 3, after: 4 };
function talkOf(pst, cst, byId, lang) {
  const two = new Set([handleOf(pst), handleOf(cst)].map(h => h.toLowerCase()));
  const said = st => { const x = romanceText(st, lang); return x && charLen(x) <= LONG[lang] && !slander(x) ? { h: handleOf(st), x, i: statusId(st) } : null; };
  const before = [];
  for (let cur = pst, k = 0; k < TALK.before; k++) {
    const p = byId.get(parentOf(cur).id);
    if (!p || !two.has(handleOf(p).toLowerCase()) || handleOf(p).toLowerCase() === handleOf(cur).toLowerCase()) break;
    const m = said(p);
    if (!m) break;
    before.unshift(m);
    cur = p;
  }
  const after = [];
  for (let cur = cst, k = 0; k < TALK.after; k++) {
    const id = statusId(cur), who = handleOf(cur).toLowerCase();
    let next = null;
    for (const st of byId.values()) {
      if (parentOf(st).id !== id || !two.has(handleOf(st).toLowerCase()) || handleOf(st).toLowerCase() === who) continue;
      const m = said(st);
      if (m) { next = [st, m]; break; }
    }
    if (!next) break;
    after.push(next[1]);
    cur = next[0];
  }
  return [...before, { h: handleOf(pst), x: romanceText(pst, lang), i: statusId(pst) }, { h: handleOf(cst), x: romanceText(cst, lang), i: statusId(cst) }, ...after];
}
/* Every post-and-reply pair among the posts of one exchange, with the talk it belongs to: the longest talk
   first, then the best. */
function pairsIn(list, lang) {
  noteYouth(list);
  const byId = new Map();
  list.forEach(st => { const id = statusId(st); if (id && !byId.has(id)) byId.set(id, st); });
  const out = [];
  byId.forEach(cst => {
    const pst = byId.get(parentOf(cst).id);
    const pair = pst && !skipped(handleOf(pst)) && !skipped(handleOf(cst)) ? pairFrom(pst, cst, lang) : null;
    if (!pair) return;
    const t = talkOf(pst, cst, byId, lang);
    if (t.length > 2) pair.t = t;
    out.push(pair);
  });
  return out.sort((x, y) => ((y.t || []).length - (x.t || []).length) || (y.score - x.score));
}

/* ---------- the order the page plays in ---------- */
/* Chosen here, at random, after every collection (see pick.mjs); the page plays from the top and leaves
   out what its reader has seen. Three orders, matched to the current time band so romance replies feel
   like realtime reply news for that part of the day (prefer posts written in the same Japan-time slot):
   - morning (4–11): mostly morning greetings from morning hours, then loving exchanges;
   - day: mostly love / icha / miss from daytime, then homecoming;
   - night (21–4): night / miss and love from night hours, then homecoming.
   About eight or nine of ten slots match the band. Nobody comes twice in any stretch of eight stories. */
function humorPlay(stories) {
  const personKey = (side, fallback) => {
    if (side && side.handle) return 'p' + String(side.handle).toLowerCase();
    if (side && side.s != null) return 's' + side.s + ':' + (side.id || fallback || '');
    if (side && side.id) return 'id' + side.id;
    return 'x' + (fallback || Math.random());
  };
  const people = s => [personKey(s.a, s.id), personKey(s.b, s.id)];
  const order = list => spread(lean(list, s => s.found || s.at, 12), people, 8);
  const ids = list => list.map(s => s.id);
  const slotOk = (s, slot) => { const h = japanHour(s.at || s.found); return h < 0 || daySlot(h) === slot; };
  const pick = (kinds, slot) => order(stories.filter(s => kinds.includes(s.kind) && slotOk(s, slot)));
  const morningMain = pick(['morning'], 'morning');
  const morningFill = pick(['love', 'icha', 'miss'], 'morning');
  const dayMain = pick(['icha', 'love', 'miss'], 'day');
  const dayHome = pick(['home'], 'day');
  const nightFeel = pick(['night', 'miss'], 'night');
  const nightLove = pick(['icha', 'love'], 'night');
  const nightMain = nightFeel.length >= 3 ? deal(nightFeel, nightLove, 0.35, 0, true) : deal(nightLove, nightFeel, 0.2, 1, true);
  const nightHome = pick(['home'], 'night');
  return {
    made: stamp(),
    morning: ids(deal(morningMain.length ? morningMain : morningFill, morningFill, 0.15, 1, true)),
    day: ids(deal(dayMain, dayHome, 0.2, 2, true)),
    night: ids(deal(nightMain, nightHome, 0.15, 2, true)),
  };
}
/* Public humor JSON: comment / reply text only. No real account names, handles, or profile URLs.
   news-shorts still filters on a.handle / b.handle (goodStories), so we publish opaque handle "s0"/"s1"
   (same indices as s) — never a real @name. */
function publicStory(s) {
  const speakers = new Map();
  let n = 0;
  const sid = h => {
    const k = String(h || '').toLowerCase();
    if (/^s\d+$/.test(k)) {
      const i = Number(k.slice(1));
      if (!speakers.has(k)) speakers.set(k, i);
      if (i >= n) n = i + 1;
      return speakers.get(k);
    }
    if (!speakers.has(k)) speakers.set(k, n++);
    return speakers.get(k);
  };
  const sa = sid(s.a.handle != null ? s.a.handle : (s.a.s != null ? 's' + s.a.s : ''));
  const sb = sid(s.b.handle != null ? s.b.handle : (s.b.s != null ? 's' + s.b.s : ''));
  const out = {
    id: s.id, kind: s.kind, mutual: !!s.mutual, score: s.score, at: s.at || '', found: s.found || '',
    a: { text: s.a.text, id: s.a.id, s: sa, handle: 's' + sa },
    b: { text: s.b.text, id: s.b.id, s: sb, handle: 's' + sb },
  };
  if (Array.isArray(s.t) && s.t.length > 2) {
    out.t = s.t.map(m => {
      const si = sid(m.h != null ? m.h : (m.s != null ? 's' + m.s : ''));
      return { x: m.x, i: m.i, s: si, h: 's' + si };
    });
  }
  return out;
}

/* ---------- one language ---------- */
async function build(lang) {
  const file = path.join(CONF.out, 'v1', `humor-${lang}.json`);
  const before = await readJson(file, { stories: [] });
  const old = (Array.isArray(before.stories) ? before.stories : []).filter(s => s && s.id && s.a && s.b && s.a.text && s.b.text);
  const have = new Set(old.flatMap(s => [s.id, s.a.id, ...(Array.isArray(s.t) ? s.t.map(m => m.i) : [])]));
  const texts = new Set(old.flatMap(s => [squash(s.a.text).slice(0, 50), squash(s.b.text).slice(0, 50)]));
  const conv = {};
  Object.entries((before.conv && typeof before.conv === 'object') ? before.conv : {}).forEach(([id, at]) => { if (Date.now() - Date.parse(at || 0) < CONF.hours * 3600e3) conv[id] = at; });
  const count = { timelines: 0, posts: 0, conversations: 0, otherWay: 0, stories: 0 };
  Object.entries((before.skip && typeof before.skip === 'object') ? before.skip : {}).forEach(([h, at]) => { if (Date.now() - Date.parse(at || 0) < 14 * 24 * 3600e3) SKIP.set(h, at); });
  const perPerson = new Map();
  const perRun = new Map();
  old.forEach(s => [s.a && s.a.handle, s.b && s.b.handle].forEach(h => { if (!h) return; const k = String(h).toLowerCase(); perPerson.set(k, (perPerson.get(k) || 0) + 1); }));
  const off = CONF.noSearch;

  const ACC = await humorAccounts(CONF.memo);
  const allow = ACC.handles;
  const registered = (ACC[lang] || []).map(e => e.h).filter(h => !skipped(h));
  const openBoot = ACC.missing && !off && !CONF.noSearch;
  if (ACC.missing) console.log(`  ${lang}: no humor-accounts.json: ${openBoot ? 'open romance bootstrap for display stock' : 'no humor account is read'}`);
  else console.log(`  ${lang}: ${registered.length} humor accounts from the private memo`);
  if (!CONF.memo) console.log(`  ${lang}: no private folder for the memo (--memo)`);
  /* Align on private humor-accounts.json only; never leave legacy humor-memo-*.json in the public out. */
  if (!CONF.dry) await rm(path.join(CONF.out, 'v1', `humor-memo-${lang}.json`), { force: true });

  const readAt = {};
  Object.entries((before.people && typeof before.people === 'object') ? before.people : {}).forEach(([h, at]) => { if (Date.now() - Date.parse(at || 0) < 7 * 24 * 3600e3) readAt[h] = at; });
  const known = new Set();
  const people = [];
  const meet = handle => {
    const h = String(handle || '');
    const k = h.toLowerCase();
    if (!h || known.has(k) || skipped(h) || !allow.has(k)) return;
    known.add(k);
    people.push(h);
  };
  shuffle(registered).sort((x, y) => (Date.parse(readAt[x.toLowerCase()] || 0) || 0) - (Date.parse(readAt[y.toLowerCase()] || 0) || 0)).forEach(meet);
  if (people.length) console.log(`  ${lang}: ${people.length} registered accounts queued for timelines`);

  const posts = [];
  const seen = new Set();
  const found = [];
  const toRegister = new Set();
  const keep = pair => {
    const ak = squash(pair.a.text).slice(0, 50), bk = squash(pair.b.text).slice(0, 50);
    if (have.has(pair.id) || texts.has(ak) || texts.has(bk)) { why('already in the file'); return false; }
    const who = [pair.a.handle, pair.b.handle].map(h => String(h).toLowerCase());
    /* Couple-first: at least one speaker on the memo. Missing partners are recorded for growth.
       Memo missing (open bootstrap): keep clearly romantic pairs and anonymize on publish. */
    if (!openBoot) {
      if (!who.some(h => allow.has(h))) { why('not a registered account'); return false; }
      who.filter(h => !allow.has(h)).forEach(h => { allow.add(h); toRegister.add(pair.a.handle.toLowerCase() === h ? pair.a.handle : pair.b.handle); });
    }
    if (who.some(h => skipped(h) || (perPerson.get(h) || 0) >= 4 || (perRun.get(h) || 0) >= 2)) { why('that person has enough stories'); return false; }
    who.forEach(h => { perPerson.set(h, (perPerson.get(h) || 0) + 1); perRun.set(h, (perRun.get(h) || 0) + 1); });
    have.add(pair.id);
    texts.add(ak);
    texts.add(bk);
    found.push(pair);
    return true;
  };

  const deadline = Date.now() + CONF.minutes * 60e3;
  const restUntil = { timeline: 0, conversation: 0, search: 0 };
  const refusedTimes = { timeline: 0, conversation: 0, search: 0 };
  const open = way => Date.now() >= restUntil[way];
  const refuse = (way, e) => { refusedTimes[way]++; restUntil[way] = Date.now() + CONF.rest; console.log(`  ${way} ${e ? e.message : 'refused'}: left alone for ${Math.round(CONF.rest / 60000)} minutes`); };
  let pi = 0;
  let readThisRun = 0;
  const canAsk = !off && ((!ACC.missing && allow.size > 0) || openBoot);
  /* Open romance search (memo missing): couple-first queries so Reply News still gets display stock. */
  const BOOT_Q = {
    ja: [
      '(だいしゅき OR すきすき OR ぎゅーして OR ちゅー OR 会いたいよ OR なでなで) (♡ OR 💕 OR 🥰)',
      '(愛してる OR 大好きだよ OR 好きだよ) (♡ OR 💕 OR ぎゅ)',
      '(おやすみ OR ねんね) (♡ OR 好き OR 大好き OR ぎゅー)',
      '(おはよう OR おはよん OR おっはー) (♡ OR 💕 OR 好き OR ぎゅ)',
    ],
    en: [
      '("i love you" OR "love you more" OR "miss you more") (❤ OR 😘 OR 🥰)',
      '("night night" OR "sweet dreams") (love OR babe OR ❤)',
      '("good morning" OR sunshine) (love OR babe OR ❤ OR 😘)',
    ],
  };
  async function searchRomance(q) {
    const now = Math.floor(Date.now() / 1000);
    const start = now - 8 * 3600;
    const full = `${q} since_time:${start} until_time:${start + 6 * 3600}`;
    const d = await fxJson('https://api.fxtwitter.com/2/search?count=80&q=' + encodeURIComponent(full));
    return Array.isArray(d.results) ? d.results : [];
  }
  if (openBoot && Date.now() < deadline && found.length < Math.min(48, CONF.enough)) {
    console.log(`  ${lang}: bootstrapping anonymized romance stories (memo empty)`);
    for (const q of shuffle(BOOT_Q[lang] || []).slice(0, 10)) {
      if (Date.now() >= deadline || found.length >= Math.min(48, CONF.enough) || !open('search')) break;
      let list;
      try { list = await searchRomance(q); }
      catch (e) { if (!(e instanceof Refused)) throw e; refuse('search', e); break; }
      for (const st of list) {
        if (found.length >= Math.min(48, CONF.enough) || Date.now() >= deadline) break;
        const id = statusId(st);
        const parent = parentOf(st);
        if (!id || !parent.id || !clearlyRomantic(romanceText(st, lang), lang)) continue;
        try {
          const thread = await conversation(id).catch(() => null);
          if (thread && thread.length) {
            pairsIn(thread, lang).forEach(pair => keep(pair));
            continue;
          }
        } catch (e) { if (!(e instanceof Refused)) throw e; }
        const pst = await parentOtherWay(parent.who || handleOf(st), parent.id);
        if (pst) {
          noteYouth([pst, st]);
          const pair = pairFrom(pst, st, lang);
          if (pair) keep(pair);
        }
        await sleep(800);
      }
      await sleep(1500);
    }
    console.log(`  ${lang}: open bootstrap found ${found.length} stories so far`);
  }
  while (canAsk && Date.now() < deadline && found.length < CONF.enough) {
    let did = 0;
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
    posts.sort((x, y) => (x.done ? 1 : 0) - (y.done ? 1 : 0) || y.replies - x.replies);
    const next = () => {
      const p = posts.find(x => !x.done);
      if (p) p.done = true;
      return p;
    };
    for (let k = 0; k < 12 && open('conversation') && readThisRun < CONF.conversations && found.length < CONF.enough; k++) {
      const batch = [next(), next(), next(), next()].filter(Boolean);
      if (!batch.length) break;
      const got = await Promise.all(batch.map(x => conversation(x.id).catch(e => { if (e instanceof Refused) return null; throw e; })));
      if (got.every(g => !g)) {
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
        list.forEach(st => meet(handleOf(st)));
        let pairs = 0;
        const taken = new Set();
        pairsIn(list, lang).forEach(pair => {
          const ids = (pair.t || [pair.a, pair.b]).map(m => String(m.i || m.id));
          if (pairs >= 2 || ids.some(i => taken.has(i))) return;
          if (keep(pair)) { pairs++; ids.forEach(i => taken.add(i)); }
        });
      });
      await sleep(1500);
    }
    const waiting = posts.some(x => !x.done);
    const more = (pi < people.length && count.timelines < CONF.timelines) || waiting;
    if (!more) break;
    console.log(`  ${lang} round: ${count.timelines} timelines, ${count.conversations} exchanges read, ${found.length} new stories`);
    if (!did) await sleep(Math.max(15000, Math.min(60000, Math.min(...Object.values(restUntil).filter(t => t > Date.now()).concat(Date.now() + 60000)) - Date.now())));
  }
  if (found.length >= CONF.enough) console.log(`  ${lang}: ${found.length} new stories, which is enough for one run`);
  count.stories = found.length;
  count.refused = refusedTimes;
  console.log('  pairs not kept: ' + JSON.stringify(WHY));

  const fresh = s => Date.now() - Date.parse(s.found || 0) < CONF.hours * 3600e3;
  const pairText = s => s.a.text + ' ' + s.b.text;
  const replyOf = s => String((s && s.b && s.b.text) || '');
  const ok = s => cleanText(s.a.text) && cleanText(s.b.text) && clearlyRomantic(replyOf(s), lang) && !harsh(pairText(s)) && !alcohol(pairText(s)) && !tobacco(pairText(s)) && !UNSAFE_ROMANCE.test(pairText(s)) && !YOUTH.test(pairText(s)) && !AGE.test(s.a.text) && !AGE.test(s.b.text) && !EMOJI_HINT.test(pairText(s))
    && !FAN.test(pairText(s)) && !BODY.test(pairText(s)) && !FAMILY.test(pairText(s)) && (lang === 'en' || (!POLITE.test(s.a.text) && !POLITE.test(s.b.text)));
  /* Opaque s0/s1 (already published) or text-only stories passed the memo check when written.
     Real @handles still need at least one speaker on humor-accounts.json (couple-first). */
  const registeredStory = s => {
    if (!(s && s.a && s.b && s.a.text && s.b.text)) return false;
    const real = [s.a.handle, s.b.handle].filter(h => h && !isOpaqueHandle(h));
    if (!real.length) return true;
    if (openBoot || ACC.missing) return true;
    return real.some(h => allow.has(String(h).toLowerCase()));
  };
  const fine = x => cleanText(x) && !slander(x) && !alcohol(x) && !tobacco(x) && !UNSAFE_ROMANCE.test(x) && !YOUTH.test(x) && !AGE.test(x) && !EMOJI_HINT.test(x) && !FAN.test(x) && !BODY.test(x) && !FAMILY.test(x) && (lang === 'en' || !POLITE.test(x));
  const talk = s => {
    if (!Array.isArray(s.t)) return s;
    const at = s.t.findIndex(m => String(m.i) === String(s.a.id));
    let from = at, to = at + 1;
    while (from > 0 && fine(s.t[from - 1].x)) from--;
    while (to + 1 < s.t.length && fine(s.t[to + 1].x)) to++;
    const t = at < 0 ? [] : s.t.slice(from, to + 1);
    const { t: _, ...rest } = s;
    return t.length > 2 ? { ...rest, t } : rest;
  };
  /* Rejudge past stories too: drop ordinary replies that are not clearly romantic.
     Memo briefly missing / opaque ids: keep fresh clearly-romantic stories (do not empty Reply News). */
  const skipHandle = h => h && !isOpaqueHandle(h) && skipped(h);
  const keepOld = (openBoot || ACC.missing)
    ? s => fresh(s) && ok(s) && !!(s.a && s.a.text && s.b && s.b.text)
    : s => fresh(s) && ok(s) && registeredStory(s) && !skipHandle(s.a && s.a.handle) && !skipHandle(s.b && s.b.handle);
  const droppedOrdinary = old.filter(s => s && s.b && s.b.text && !clearlyRomantic(replyOf(s), lang)).length;
  if (droppedOrdinary) console.log(`  ${lang}: dropped ${droppedOrdinary} old stories whose reply was not clearly romantic`);
  const fullStories = found.filter(s => !skipHandle(s.a.handle) && !skipHandle(s.b.handle) && registeredStory(s) && clearlyRomantic(replyOf(s), lang))
    .concat(old.filter(keepOld).map(s => ({ ...s, kind: talkKind(pairText(s), s.at || s.found) }))).map(talk).slice(0, CONF.keep);
  if (toRegister.size && CONF.memo && !CONF.dry) {
    const n = await addHumorAccounts(CONF.memo, lang, [...toRegister]);
    if (n) console.log(`  ${lang}: recorded ${n} reply partners into the private memo (names not printed)`);
  }
  const kinds = {};
  fullStories.forEach(s => { kinds[s.kind] = (kinds[s.kind] || 0) + 1; });
  const play = humorPlay(fullStories);
  const stories = fullStories.map(publicStory);
  console.log(`  ${lang}: ${count.timelines} timelines gave ${count.posts} answered posts; ${count.conversations} exchanges read whole (${count.otherWay} posts another way); ${count.stories} new stories. The file holds ${stories.length} ${JSON.stringify(kinds)} (handles stripped for privacy).`);
  return { version: 4, lang, updated: stamp(), privacy: 'text-only', run: off ? (before.run || null) : { at: stamp(), ...count }, kinds, conv, people: readAt, skip: Object.fromEntries(SKIP), play, stories };
}

async function main() {
  if (!CONF.on) { console.log('Humor stories are turned off (config.json, "humor": { "on": false }).'); return; }
  for (const lang of CONF.langs.length ? CONF.langs : ['ja']) {
    console.log(`Humor stories, ${lang}: loving exchanges from humor-accounts.json only`);
    const out = await build(lang);
    if (CONF.dry) continue;
    await mkdir(path.join(CONF.out, 'v1'), { recursive: true });
    await writeFile(path.join(CONF.out, 'v1', `humor-${lang}.json`), JSON.stringify(out) + '\n');
    await writeFile(path.join(CONF.out, '.changed'), stamp() + '\n');
  }
  console.log(`Asked api.fxtwitter.com for ${timelineAsked} timelines (${timelineGave} answered) and ${convAsked} conversations; posts read another way: vxTwitter ${via.vxtwitter}, FixupX ${via.fixupx}.`);
}
/* (For checking the talks against exchanges read by hand.) */
export { pairsIn };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message || e); process.exit(1); });
