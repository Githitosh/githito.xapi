/* githito.xapi: what may play, and the shape of the API's files. Used by collect.mjs and ingest.mjs. */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

export const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
export async function readJson(file, empty) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { return empty; } }

/* ---------- what may play ---------- */
const VIOLENT = /murder|stabbed|shot dead|shooting|killed|beheading|homicide|massacre|rape|sexual assault|robbery|凶悪|殺人|殺害|刺殺|遺体|刺され|死傷|銃乱射|暴行|強盗|レイプ|強姦/i;
const HEAVY = /(?:^|[^必])死(?!ぬほど|ぬかと|んだ笑)|亡くな|遺体|事故|災害|震災|地震|津波|火災|病気|闘病|入院|がん(?!ば|が)|癌|自殺|自死|いじめ|虐待|差別|\bdied\b|\bdeath\b|\bcrash\b|\bdisaster\b|\bcancer\b|\bsuicide\b|\bbull(?:y|ied|ying)\b|\bracis/i;
const SUGGESTIVE = /🔞|🍆|🍑|😏|💋|👅|寝かさない|抱いて|抱かれ|夜這い|ベッドで|一緒にお風呂|色っぽ|セクシー|えちえち|\bsexy\b|\bspicy\b|\bnaughty\b|\bin bed\b|(?<!ア)マゾ(?!ン)|ドM|ドＭ|ドS|ドＳ|変態|ヘンタイ|\bkink/i;
const ADULT = /セックス|エッチ|えっち|ｴｯﾁ|エロ|下ネタ|ヤる|ヤれ|体位|下着|裸|おっぱい|乳首|ちんこ|ちんちん|まんこ|射精|中出し|勃起|ムラムラ|性欲|童貞|処女|ラブホ|\bsex|nsfw|nude|naked|horny|kinky/i;
const NEVER = /ヤリモク|風俗|パパ活|ママ活|援交|AV女優|アダルト|porn|onlyfans|中学|小学|ＪＫ|ＪＣ|ＪＳ|\bJ[KCS]\b|高校生|女子高生|男子高生|未成年|ロリ|ショタ|\bteen|high school|middle school|underage|\bloli|\bshota|ＤＶ|\bDV\b|モラハラ|殴られ|abuse|レイプ|強姦|無理やり|盗撮|痴漢/i;
const UNSAFE = new RegExp(ADULT.source + '|' + NEVER.source, 'i');
const MINOR_BIO = /(?:^|[^0-9])1[0-7]\s*(?:歳|才|y\/?o\b|years? old)|高[1-3１-３一二三](?:$|[^0-9０-９])|中[1-3１-３一二三](?:$|[^0-9０-９])|高校生|中学生|ＪＫ|ＪＣ|\bJ[KC]\b|\bminor\b|\bunder ?18\b|\bteen\b/i;
const AD = /PR|広告|キャンペーン|プレゼント企画|応募|フォロー[&＆]|RTで|リツイートで|セール|クーポン|予約受付|販売中|\bgiveaway\b|\bsale\b|\bpromo\b|\bdiscount\b|\bsponsored\b/i;
const TOXIC = /バカ|ばか(?!り)|馬鹿|アホ|あほ(?!う)|阿呆|クズ|カス(?![タテ])|キモ(?:[いイッ]|$)|きも[いっ]|気持ち悪|気色[わ悪]|ウザ|うざ[いっ]|消えろ|黙れ|だまれ|お前|おまえ|てめ[えぇー]|貴様|低脳|低能|無能|老害|痴呆|キチガイ|ガイジ|チー牛|ブス|デブ|ババア|ジジイ|嘘つき|ウソつき|うそつき|捏造|売国|反日|左翼|右翼|パヨク|ネトウヨ|恥を知|頭悪|頭おかし|\b(?:idiot|stupid|moron|dumb|loser|trash|shut up|stfu|libtard|clown)\b/i;
const GREET = /^[\s\p{Extended_Pictographic}️]*(?:おは|オハ|こんにち|こんばん|おやす|おつ|お疲れ|おめで|ありがと|はじめまして|初めまして|good morning|gm\b|good night|congrat|thank)|良い一日|よい一日|良い1日|素敵な(?:一日|1日|週末)|今日も(?:一日|1日)?(?:頑張|がんば|よろしく)|よろしくお願い|フォロー(?:ありがとう|失礼|させて)|have a (?:great|good|nice) day/iu;
const GLOOM = /骨折|折って|怪我|ケガ|手術|通院|発熱|インフル|コロナ|訃報|葬儀|お葬式|遺影|倒産|解雇|失業|借金|離婚|亡き|\b(?:injur|surgery|funeral|divorce|laid off|fired)\w*/i;
const OFFICIAL = /公式|official|ニュース|新聞|news|報道|速報|通信社|放送|テレビ|編集部|広報|株式会社|\bbot\b|情報局|まとめ|運営|事務局|shop|store|online\b|オンライン|デイリースポーツ|日刊|スポニチ|サンスポ|スポーツ報知|メディア|magazine|マガジン/i;
const POLITE = /素敵|楽しみ|頑張って|がんばって|お気をつけ|気をつけて|大変です|お疲れ|おつかれ|お大事|ゆっくり|楽しんで|いってらっしゃい|行ってらっしゃい|大丈夫[？?]|ですね[…。！!✨😊☺️🥰]*$|いいですね|良いですね|羨まし|うらやまし|\b(?:lovely|beautiful|so nice|well done|great job)\b/i;
const ZEST = {
  ja: /なんよ|なんだが|してしまっ|しまった|のに|なぜ|なんで|まさか|結局|気になる|わからん|分からん|無理|やばい|ヤバ|つら|詰んだ|終わった|泣|忘れ|寝坊|間違え|気づいた|気付いた|って何|[？?]|💦|😱|😇|🫠|🥲/,
  en: /\b(?:why|somehow|accidentally|forgot|again|help|can't|cannot|never|nobody|apparently|turns out)\b|[?]/i,
};
const QUIP = {
  ja: /かい[！!ｗw笑]*$|やん|やろ|やねん|じゃん|すぎ|なんで|なぜ|それな|まさか|だったんだ|じゃないの|のでは|ってこと|[？?]+[\s\p{Extended_Pictographic}️]*$|[wｗ]+$/u,
  en: /\b(?:wait|bro|nah|same|literally|imagine|plot twist|so you|not the)\b|[?]+\s*$/i,
};
export const CJK = /[぀-ヿ一-鿿]/;
export const charLen = t => [...String(t || '')].length;
const squash = t => String(t || '').toLowerCase().replace(/[\s　"'“”‘’「」『』（）()\[\]【】、。，．,.!?！？…・:：;；\-–—~〜ｗw]+/g, '');
function isFunny(text, lang) {
  if (lang === 'en') return /\b(lol|lmao|lmfao|rofl|haha\w*|hilarious|i'?m dead|dying)\b|😂|🤣|💀|😆/i.test(text);
  const t = String(text || '').replace(/笑顔|笑み|民草|草の根/g, '');
  return /笑|ワロタ|ワロ[^ッ]|草草|(?:^|[\s　、。！？(（])草(?:$|[\s　、。！？)）])|[てでにのが]草(?=$|[\s　、。！？)）ｗw]|$)|ｗ{2,}|w{2,}|😂|🤣|😆|😅|面白い|冗談|ウケる/.test(t);
}
/* The words of a post: addresses, @names and hashtags are left out. */
export function plain(raw) {
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
/* chosen: the talk was picked by hand, so who wrote it and how it opens are not judged; only what may
   never play is, and the length. */
export function talkPost(p, lang, chosen) {
  if (!p || !p.id) return null;
  if (!chosen && (p.replyTo || p.isReply || p.quote || p.repost || !personal(p.user) || minor(p.user))) return null;
  if (/^\s*[>＞]|\n\s*[>＞]/.test(p.raw)) return null;
  const text = plain(p.raw);
  const n = charLen(text);
  if (n < (lang === 'en' ? 12 : chosen ? 4 : 10) || n > (lang === 'en' ? (chosen ? 280 : 220) : (chosen ? 140 : 110))) return null;
  if (lang === 'en' ? !/[A-Za-z]{3,}/.test(text) : !CJK.test(text) || (!chosen && (text.match(/[぀-ヿ]/g) || []).length < 4)) return null;
  if (!safe(text, p) || GLOOM.test(text)) return null;
  if (!chosen && (GREET.test(text) || !(p.replies > 0))) return null;
  /* A few words beside a picture say little without it. */
  if (p.media && n < 20) return null;
  return { id: p.id, handle: p.user.username, text, url: 'https://x.com/' + p.user.username + '/status/' + p.id, at: p.at };
}
/* How lively a post is: a little trouble, a question or a laugh draws funny replies. */
export function zest(text, p, lang) {
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
export function pickReplies(post, list, lang, chosen) {
  const picks = [];
  list.forEach(p => {
    const u = p.user;
    if (!u.username || u.protected || minor(u) || u.username.toLowerCase() === post.handle.toLowerCase() || p.replyTo !== post.id) return;
    const text = plain(p.raw);
    const n = charLen(text);
    if (n < (chosen ? 2 : 3) || n > (lang === 'en' ? (chosen ? 200 : 140) : (chosen ? 80 : 50)) || charLen(post.text) + n > (lang === 'en' ? (chosen ? 360 : 280) : (chosen ? 180 : 140))) return;
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
    const punch = (funny || quip || trail) && score >= 4;
    if (!punch && !chosen) return;
    picks.push({ id: p.id, handle: u.username, text, url: 'https://x.com/' + u.username + '/status/' + p.id, tk, score, punch });
  });
  picks.sort((a, b) => b.score - a.score);
  /* Picked by hand: the replies with a punch, or else the best one that may play. */
  const kept = chosen ? (picks.some(x => x.punch) ? picks.filter(x => x.punch) : picks.slice(0, 1)) : picks;
  return kept.slice(0, 2).map(({ tk, score, punch, ...r }) => r);
}

/* ---------- X's official embed API ---------- */
/* publish.x.com/oembed: X publishes it for showing posts on other sites. No key, no charge, no login.
   It answers with the post as a quote; its words are the first paragraph. Links to pictures and pages are left out. */
const entities = t => t.replace(/&mdash;/g, '—').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)));
function wordsOf(html) {
  const m = String(html || '').match(/<blockquote[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/i);
  if (!m) return '';
  return entities(m[1].replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (all, t) => (/^(?:https?:\/\/|pic\.(?:twitter|x)\.com\/)|^[\w-]+(?:\.[\w-]+)+\//i.test(t.trim()) ? ' ' : t))
    .replace(/<[^>]+>/g, ''));
}
/* A post read from X itself: its words and who wrote it. null when X does not show it (deleted, private). */
export async function readEmbed(handle, id) {
  const url = 'https://x.com/' + handle + '/status/' + id;
  let data = null;
  for (let attempt = 0; attempt < 2 && !data; attempt++) {
    try {
      const res = await fetch('https://publish.x.com/oembed?omit_script=1&dnt=true&url=' + encodeURIComponent(url), { signal: AbortSignal.timeout(20000) });
      if (res.ok) data = await res.json();
      else if (res.status === 404 || res.status === 403) return null;
    } catch (e) {}
  }
  if (!data || !data.html) return null;
  const who = (String(data.author_url || '').match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})/i) || [])[1] || handle;
  return { id: String(id), handle: who, name: data.author_name || '', raw: wordsOf(data.html) };
}
/* The same words, whatever the spaces and marks. */
export const sameWords = (a, b) => squash(plain(a)) === squash(plain(b));

/* ---------- the API's files ---------- */
/* One language: every talk, and one file for each genre (the answer to "search this genre"). */
export async function writeApi(outDir, out, genres) {
  const dir = path.join(outDir, 'v1', 'search', out.lang);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(outDir, 'v1', `talks-${out.lang}.json`), JSON.stringify(out) + '\n');
  const ids = [...new Set(genres.map(g => g.id).concat(out.talks.map(t => t.genre)))];
  for (const id of ids) {
    const talks = out.talks.filter(t => t.genre === id);
    await writeFile(path.join(dir, id + '.json'), JSON.stringify({ version: 1, lang: out.lang, genre: id, updated: out.updated, count: talks.length, talks }) + '\n');
  }
}
/* The index: when each language was last written and how many talks each genre has.
   .changed tells the workflow that there is something new to publish. */
export async function writeIndex(outDir, source, outs) {
  const index = await readJson(path.join(outDir, 'v1', 'index.json'), {});
  const langs = { ...(index.langs || {}) };
  outs.forEach(out => {
    const genres = {};
    out.talks.forEach(t => { genres[t.genre] = (genres[t.genre] || 0) + 1; });
    langs[out.lang] = { updated: out.updated, count: out.talks.length, genres };
  });
  await writeFile(path.join(outDir, 'v1', 'index.json'), JSON.stringify({ version: 1, updated: stamp(), source, langs }, null, 1) + '\n');
  await writeFile(path.join(outDir, '.changed'), stamp() + '\n');
}
/* A talk saved earlier is judged again by the rules as they are now, so a rule added later also clears
   what is already in the API. Talks sent by hand were chosen by the owner and stay. */
const cleanText = t => !!t && !UNSAFE.test(t) && !VIOLENT.test(t) && !HEAVY.test(t) && !SUGGESTIVE.test(t) && !TOXIC.test(t);
export const stillOk = t => !!t.manual || (cleanText(t.post.text) && !OFFICIAL.test(t.post.handle) && t.replies.every(r => cleanText(r.text)));
/* How long a talk stays: two days when collected, two weeks when sent by hand. */
export const young = (t, hours) => Date.now() - Date.parse(t.found || 0) < (t.manual ? 14 * 24 : hours) * 3600e3;
