/* githito.xapi: what may play, and the shape of the API's files. Used by collect.mjs and ingest.mjs. */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

export const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
export async function readJson(file, empty) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { return empty; } }

/* ---------- what may play ---------- */
const VIOLENT = /murder|stabbed|shot dead|shooting|killed|beheading|homicide|massacre|rape|sexual assault|robbery|凶悪|殺人|殺害|刺殺|遺体|刺され|死傷|銃乱射|暴行|強盗|レイプ|強姦/i;
const HEAVY = /(?:^|[^必])死(?!ぬほど|ぬかと|んだ笑)|亡くな|遺体|事故|災害|震災|地震|津波|火災|病気|闘病|入院|がん(?!ば|が)|癌|自殺|自死|心中|しにたい|消えたい|タヒ|[（(]しね[)）]|氏ね|いじめ|虐待|差別|ご冥福|追悼|\brest in peace\b|\bRIP\b|\bdied\b|\bdeath\b|\bcrash\b|\bdisaster\b|\bcancer\b|\bsuicide\b|\bbull(?:y|ied|ying)\b|\bracis/i;
const SUGGESTIVE = /🔞|🍆|🍑|😏|💋|👅|いやらし|やらしい|スケベ|すけべ|ｽｹﾍﾞ|助平|指で広げ|寝かさない|抱いて|抱かれ|夜這い|ベッドで|一緒にお風呂|色っぽ|セクシー|えちえち|\bsexy\b|\bspicy\b|\bnaughty\b|\bin bed\b|(?<!ア)マゾ(?!ン)|ドM|ドＭ|ドS|ドＳ|変態|ヘンタイ|\bkink|赤ちゃんプレイ|[SＳMＭ]プレイ/i;
const ADULT = /騎乗位|(?<![ァ-ヴー])イ(?:ク|[っッ][たてち])(?![ァ-ヴー])|挿入|喘[ぎいぐ]|性行為|絶頂|愛撫|前戯|フェラ|クンニ|素股|精子|精液|ゴム(?:なし|無し)|アナル|潮吹|ピストン|膣|陰部|性器|夜の営み|ワンナイ|㊙|セックス|エッチ|えっち|ｴｯﾁ|エロ|下ネタ|ヤる|ヤれ|体位|下着|裸|おっぱい|乳首|ちんこ|ちんちん|まんこ|射精|中出し|勃起|ムラムラ|性欲|童貞|処女|ラブホ|\bsex|nsfw|nude|naked|horny|kinky/i;
const NEVER = /ヤリモク|風俗|パパ活|ママ活|援交|AV女優|アダルト|porn|onlyfans|中学|小学|ＪＫ|ＪＣ|ＪＳ|\bJ[KCS]\b|高校生|女子高生|男子高生|未成年|ロリ|ショタ|\bteen|high school|middle school|underage|\bloli|\bshota|ＤＶ|\bDV\b|モラハラ|殴られ|abuse|レイプ|強姦|無理やり|盗撮|痴漢/i;
const UNSAFE = new RegExp(ADULT.source + '|' + NEVER.source, 'i');
const MINOR_BIO = /(?:^|[^0-9])1[0-7]\s*(?:歳|才|y\/?o\b|years? old)|高[1-3１-３一二三](?:$|[^0-9０-９])|中[1-3１-３一二三](?:$|[^0-9０-９])|高校生|中学生|ＪＫ|ＪＣ|\bJ[KC]\b|\bminor\b|\bunder ?18\b|\bteen\b/i;
const AD = /PR|広告|キャンペーン|プレゼント企画|抽選で|名様|応募|フォロー[&＆]|RTで|リツイートで|セール|クーポン|予約受付|販売中|\bgiveaway\b|\bsale\b|\bpromo\b|\bdiscount\b|\bsponsored\b/i;
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

/* ---------- matching: a line that can answer a post it was not written to ---------- */
/* Matching News puts a person's post beside a reply that was written to some other post. That reads as
   a talk only when the reply brings no subject of its own: a laugh, a "really?", a "same".
   So a line is kept with what it needs: the words in it that are about something (a word in kanji, in
   katakana or in Latin letters, a number) and are not plain words of reaction. A line may be matched
   to a post that says every word it needs; a line that needs nothing may be matched to any post. */
const REACT = new Set(('草 笑 爆笑 大爆笑 大草原 通 最高 最強 最悪 天才 可愛 美 綺麗 凄 好 大好 本当 無理 尊 神 優勝 素敵 流石 同意 同感 納得 共感 理解 確 分 全部 全 絶対 完全 完璧 '
  + '何 何故 一緒 私 俺 僕 自分 今 気 泣 嘘 意味 意味不明 不明 天使 正解 普通 逆 謎 強 怖 面白 楽 嬉 良 違 思 言 見 知 待 欲 出 来 行 人 方 事 時 感 感動 的 一番 一生 永遠 幸 幸せ 愛 大丈夫 元気 平和 世界 人生 '
  + 'ワロタ ワロ ワロス ヤバ ヤバイ ヤバス マジ ガチ ホント ホンマ ダメ ウケ スゴ スゴイ エグ エグイ ナイス オモロ ウソ ムリ ソレナ セヤナ カワイイ カワイ イイネ アカン ナニ ナゼ コレ ソレ アレ ドレ ツボ センス ワイ オレ ボク スキ サイコー サスガ '
  + 'lol lmao ok omg wow').split(' '));
const REACT_EN = new Set('same true agree agreed exactly right facts fact real really literally actually wait what why how this that thats these those love cute nice great good best haha hahaha hilarious funny crying dying dead yeah yes nope never always just very much more most even still here there with from your youre have been were they them their about would could should absolutely honestly totally perfect amazing awesome incredible legend genius king queen mood vibes relatable same'.split(' '));
const THANKS = /ありがと|あざす|あざっす|感謝|ごめん|すみません|すいません|失礼|申し訳|おめで|お疲れ|おつかれ|おはよ|こんにち|こんばん|おやすみ|よろしく|はじめまして|初めまして|いってら|行ってら|おかえり|お帰り|ただいま|フォロー|リプ|返信|ＤＭ|\bDM\b|\b(?:thanks?|thank you|sorry|congrat\w*|welcome|good (?:morning|night))\b/i;
const CALLED = /さん|くん|ちゃん|様|氏|先生|先輩|パイセン|ニキ|ネキ|[@＠]/;
const ANSWERS = /^[\s\p{Extended_Pictographic}️]*(?:はい|いいえ|いえ|うん|ううん|そうです|そうなん|ですです|です[ねよ]?[！!。]*$|yes\b|no\b|yep\b|nope\b)/iu;
const CUE = {
  ja: /やば|ヤバ|すご|スゴ|すげ|凄|まじ|マジ|ガチ|えぐ|エグ|かわい|カワイ|可愛|それな|わかる|分かる|わかりみ|たしかに|確かに|なぜ|何故|なんで|まさか|ほんと|ホント|本当|ホンマ|ほんま|最高|天才|さすが|流石|好き|すき|尊|神|無理|むり|ムリ|えっ|えー|おお|うわ|へぇ|へー|いいな|いいね|ええな|ええやん|うらやま|羨ま|つよ|強い|こわ|怖|じわ|ツボ|おもろ|面白|センス|優勝|ずる|ズル|しんど|泣|[！!？?]/,
  en: /\b(?:same|true|wait|what|why|how|wow|omg|nah|bro|literally|real|mood|love|cute|nice|great)\b|[!?]/i,
};
const AGREE = /その通り|そのとおり|それな|わかる|分かる|わかりみ|たしかに|確かに|ほんそれ|ほんとそれ|せやな|だよね|ですよね|同意|同感|同じく|\b(?:same|true|agreed?|exactly|facts)\b/i;
/* null, or what the line needs and whether it agrees (agreeing with a question does not read as an answer). */
export function lineOf(text, lang) {
  const t = String(text || '').trim();
  const n = charLen(t);
  if (n < 2 || n > (lang === 'en' ? 48 : 24) || THANKS.test(t) || CALLED.test(t) || ANSWERS.test(t)) return null;
  if (lang === 'en' ? !/[A-Za-z]{2,}/.test(t) : !CJK.test(t)) return null;
  /* A face drawn with letters ((゜ロ゜), ( ´∀｀)) breaks apart when the line is shown large. */
  if (FACE.test(t)) return null;
  if (!isFunny(t, lang) && !QUIP[lang].test(t) && !CUE[lang].test(t)) return null;
  const bare = t.replace(/\p{Extended_Pictographic}|️|‍/gu, ' ');
  const needs = [];
  const runs = lang === 'en' ? (bare.toLowerCase().match(/[a-z']{4,}|[0-9]+/g) || []) : (bare.match(/[一-龯々〆ヶ]+|[ァ-ヴー]{2,}|[A-Za-zＡ-Ｚａ-ｚ]{2,}|[0-9０-９]+/g) || []);
  runs.forEach(w => {
    const k = w.replace(/^ー+|ー+$/g, '');
    if (!k || /^[wWｗＷ]+$/.test(k) || (lang === 'en' ? REACT_EN : REACT).has(lang === 'en' ? k.replace(/'/g, '') : k) || REACT.has(k.toLowerCase())) return;
    if (!needs.includes(k)) needs.push(k);
  });
  if (needs.length > 2) return null;
  /* What is left without the laughs and the marks. A line that may answer any post is a few words; a
     longer one says something of its own, even in hiragana. */
  const core = charLen(bare.replace(/笑+|草+|[wWｗＷ]+|[\s　、。，．,.!?！？…・〜～ー\-⁉‼()（）「」]+/g, ''));
  if (core < 2 || core > (lang === 'en' ? (needs.length ? 40 : 24) : (needs.length ? 16 : 10))) return null;
  return { needs, kind: AGREE.test(t) ? 'agree' : 'react' };
}
/* A reply that can be such a line, as it is saved: its words, its writer, its own address, and the
   post it was really written to. */
export function pickLine(p, lang) {
  const u = p && p.user;
  if (!p || !p.id || !u || !u.username || u.protected || minor(u) || SCHOOL.test(String(u.description || '')) || !p.replyTo) return null;
  if (/^\s*(?:@\w+\s+)*[>＞]/.test(p.raw)) return null;
  const text = plain(p.raw);
  if (!safe(text, p) || POLITE.test(text) && !isFunny(text, lang)) return null;
  const line = lineOf(text, lang);
  if (!line) return null;
  return { id: p.id, handle: u.username, text, url: 'https://x.com/' + u.username + '/status/' + p.id, to: p.replyTo, toHandle: p.replyToHandle || '', needs: line.needs, kind: line.kind };
}
/* A post that stands by itself, for Matching News. X's embed API does not tell whether a post answers
   another one, so the words are judged: no thanks or greeting to someone, nobody called by name at the
   start, no opening that points back at what was said before ("それ", "私も"), not a headline in brackets,
   and long enough to say something. */
const BACK = /^[\s\p{Extended_Pictographic}️]*(?:そう|それ|あれ|その|あの|うん|はい|いや|いえ|ですよね|だよね|ですです|わー|やった|なるほど|たしかに|確かに|ほんと|ホント|本当に?[！!そ]|まじ[！!？?で]|マジ[！!？?で]|え[、っ！!ー？?]|おお|あー|わかる|分かる|ご本人|ですね|\b(?:yes|no|yeah|same|true|thanks?|lol)\b)/iu;
const NAMED_FIRST = /^[^\s、。！!？?]{1,12}(?:さん|ちゃん|くん|様|氏|先生)[、。！!〜ー\s\p{Extended_Pictographic}]/u;
const ME_TOO = /(?:私|わたし|俺|僕|うち|自分|わい|ワイ)も[^っ]|あなた|貴方|あんた|\bme too\b/i;
export function standsAlone(text, lang) {
  const t = String(text || '').trim();
  if (charLen(t) < (lang === 'en' ? 24 : 16)) return false;
  return !THANKS.test(t) && !BACK.test(t) && !NAMED_FIRST.test(t) && !ME_TOO.test(t) && !/^\s*[【\[［]/.test(t);
}
/* ---------- matching: a person's own post about love ---------- */
/* Matching News matches posts about love only. A search for such words also brings partner-seeking
   spam, advice sellers and talk about fictional couples, so a post is kept only when:
   - it talks of a boyfriend, a girlfriend or of being in love, in the writer's own life (LOVE), not of
     characters (FICTION), nor of married life, children or cheating (NOT_SINGLE), nor of the body (BODILY);
   - it asks nobody to meet, follow or write (SOLICIT), has no hashtag and no picture;
   - its writer's account is more than a year old, has posted a few hundred times, is neither tiny nor
     famous, and its profile sells or seeks nothing (SHADY_BIO);
   - nothing in the post or the profile points at school age (SCHOOL), beside the rules for minors above. */
/* 彼女 also means "she": it counts as a girlfriend only where it reads so. */
const GIRLFRIEND = '(?:俺|僕|おれ|ぼく|自分|私|うち)の彼女|彼女(?:さん)?(?:(?:が|は|も|を)?(?:でき|ほし|欲し|いな|おら|作り|つくり)|持ち|と(?:デート|付き合|同棲|別れ|会|電話|通話|遊|出かけ|旅行|ご飯|飯|過ご|行っ|行く|行き|食べ|観|見に|住|暮ら|喧嘩|仲直り)|に(?:振られ|フラれ|ふられ|会|怒られ|プレゼント|言われ|作っ|あげ|渡)|が(?:可愛|かわい|好き|作っ|くれ|怒|欲し|ほし|でき|い)|を(?:作|つく|大事|大切|幸せ|喜ば|迎え)|から|の(?:手料理|誕生日|プレゼント|家|ため))|元カノ|初彼女';
const LOVE = {
  /* 彼女 also means "she", so it counts only where it reads as a girlfriend. */
  ja: new RegExp('彼氏|彼ピ|' + GIRLFRIEND + '|恋人(?!達|たち)|片思い|片想い|好きな人|デート|同棲|告白(?:され|した|して|する|でき)|付き合って(?:る|た|ない|から|いる|いた|ほし|欲し|ください)|付き合(?:い始め|いたて|うことに|いたい|えた|える)|恋愛|失恋|元カレ|元彼|恋し(?:た|て)|恋バナ|遠距離恋愛|クリぼっち|惚れ'),
  en: /\b(?:boyfriend|girlfriend|crush|date|dating|anniversary|in love|my ex|single)\b/i,
};
/* Not for a matching: married life and children, cheating, and anything of the body. */
const NOT_SINGLE = /子持ち|家庭|旦那|嫁|夫|妻|結婚|既婚|子供|子ども|こども|息子|娘|長女|次女|三女|長男|次男|三男|出産|妊娠|妊っ|産院|育児|ママ|パパ|離婚|不倫|浮気|\b(?:husband|wife|married|marriage|kids?|pregnan\w+|divorce\w*|cheat\w*|affair)\b/i;
const BODILY = /第二ラウンド|ラウンド|経験人数|NTR|NTり|ＮＴＲ|寝取|女体|男体|ホスト|キャバ|クソ客|[^お]客|身体|カラダ|疼|触れられ|触られ|感覚を思い出|火照|濡れ|敏感|欲求|欲しがる|興奮|舐め|揉[まみむ]|肌|唇|首筋|耳元|吐息|抱きしめ|抱い[てた]|押し倒|襲[わっ]|我慢でき|夜になると|おじさん|車の中|ベッド|布団|風呂|シャワー|セクハラ|性的|ぎゅー|ぎゅっ|若い女|若い男|近親|下心|ワンナイト|お持ち帰り|体目的|体の関係|ホテル|泊ま|お泊|キス|ハグ|イチャ|いちゃ|添い寝|脱[がぎぐい]|胸|尻|フェチ|\b(?:kiss\w*|hook ?up|one night|hotel|bed)\b/i;
const FICTION = /描[かきくけこい]|物語|エピ|[0-9０-９]+話|読ませ|シーモア|\bMOD\b|敵|ＶＴ|\bVT\b|経験値|\bIEI\b|MBTI|㌧|[ｦ-ﾟ]{2,}|作品|彼氏面|彼女面|トモコレ|曲|ソング|歌詞|歌っ|新譜|アルバム|\bMV\b|主人公|ラブコメ|コント|両片思い|両片想い|BSS|[←→]|様|弊|周年|コス|衣装|ビジュ|社長|界隈|供給|尊い|さにわ|審神者|てぇてぇ|解釈|腐|夢見|プリン|ばつ丸|サンリオ|キャラ|ＣＰ|\bCP\b|カプ|推し|二次創作|夢小説|夢主|夢女|受け|攻め|原作|アニメ|漫画|マンガ|ドラマ|映画|小説|ゲーム|配信|ライブ|アイドル|声優|俳優|女優|芸能|タレント|熱愛|メンバー|担当|ファン|イベント|ガチャ|実装|公式|妄想|設定|\b(?:ship|fanfic|anime|manga|character|episode|season|drama|movie|idol|fandom)\b/i;
const SOLICIT = /募集|希望|誘っ|彼氏なし|彼女なし|恋人なし|フリーです|[^\s]\/[^\s]+\/|会える(?:人|方|子|男|女)|会えます|会いたい人|会ってくれる|住み|近くの人|あたりの人|近い人|裏垢|サブ垢|別垢|鍵垢|セフ|せふ|ＤＭ|\bDM\b|LINE|ライン|カカオ|通話|フォロ|繋がり|つながり|いいね|RT|リポスト|プロフ|固ツイ|固定|保存して|\b(?:dm me|hmu|follow|link in bio|looking for)\b/i;
const SHADY_BIO = /→\s*[@＠]|サブ|裏垢|別垢|過激|承認|会える|募集|希望|限定|\bDM\b|ＤＭ|LINE|出会い|パパ|ママ活|せふ|セフ|副業|稼|投資|占い|鑑定|相談|カウンセ|コーチ|講座|公式|アフィ|\bPR\b|婚活|恋愛(?:相談|コーチ|コンサル|アドバイ)|モテ|垢|\b(?:onlyfans|dating coach|dm for|18\+)\b/i;
const SCHOOL = /ハイスクール|学生|修学旅行|学校|高校|中学|小学|大学[1１一]年|部活|先生|クラス|授業|テスト|受験|放課後|制服|担任|学年|[LSF]?JK|\bDK\b|\bJC\b|\b(?:school|class|teacher|homework|grade)\b/i;
/* Somebody named: a post about a particular person (a friend, a streamer, a character) is not the
   writer's own talk of love, and a stranger's reaction beside it would be about that person.
   さん, ちゃん and くん count after a name, not in たくさん, ちゃんと, 彼氏くん, お兄さん. */
const SOMEBODY = /(?<!彼氏|彼女|お兄|お姉|兄|姉|店員|社員|皆|みな|お客|お母|お父|母|父|おば|おじ|お嬢|奥|旦那|息子|娘|看護師|お医者|運転手|業者|たく|[0-9０-９])さん(?!ざん|ぽ|ま[^し]|すう)|(?<!彼氏|彼女|赤|お兄|お姉|兄|姉|おじい|おばあ|お嬢|坊)ちゃん(?!と|ぽん)|(?<!彼氏|彼女|[くク])くん(?!くん|せい)|[一-龯ぁ-んァ-ヶA-Za-z]様|知り合い|バツ[0-9０-９一二三イチニ]/u;
/* What is too personal to be put beside a stranger's reaction: who one is drawn to, and the state of one's mind. */
const SENSITIVE = /ゲイ|レズ|バイセク|LGBT|ホモ|同性|障害|依存|メンヘラ|鬱|うつ病|病み|病ん|\b(?:gay|lesbian|bisexual|depress\w+|disorder)\b/i;
/* The start of a thread that goes on elsewhere. */
const TEASER = /続き|[↓⬇👇]|→$/u;
/* Lines of a story: it opens with speech in brackets, answered by more speech. */
const DIALOGUE = /^\s*「[^」]*」\s*「/;
/* Advice for sale and sweeping talk about men and women: lists, "men are…", "what women really…". */
/* Two emoji standing for a pair of characters (同棲🦌🧱が…): talk about a fictional couple. */
const PAIR = /\p{Extended_Pictographic}\p{Extended_Pictographic}[がはのをにと]/u;
const LECTURE = /男って|(?<!彼)女って|男は|(?<!彼)女は|男の(?:勘違い|本音|特徴)|女の(?:本音|特徴)|女性[がは]|男性[がは]|モテ|脈あり|脈なし|[■◆●▼✅👇☑]|[0-9０-９]+選|そう思ってた|気づけなかった|\b(?:men are|women are|guys who|girls who)\b/i;
/* Does the text talk of love, in a life and not in a story? */
export const loveText = (text, lang) => { const t = String(text || ''); return LOVE[lang].test(t) && !FICTION.test(t) && !SOLICIT.test(t) && !SCHOOL.test(t) && !NOT_SINGLE.test(t) && !BODILY.test(t) && !LECTURE.test(t) && !PAIR.test(t) && !DIALOGUE.test(t) && !SOMEBODY.test(t) && !SENSITIVE.test(t) && !TEASER.test(t); };
/* The filters a post about love goes through, one after the other. The collector counts what each lets by.
   Filter 1, loveSafe: may it play at all, and is it an ordinary person's account? What may never play
     (rules above), no hashtag, no picture, nothing of the body, no invitation, nothing pointing at
     school age; an account more than a year old with a few hundred posts, neither tiny nor famous,
     whose profile sells or seeks nothing.
   Filter 2, loveFit: is it a person's own talk about love? It stands by itself, it speaks of a
     boyfriend, a girlfriend or being in love, and it is not fiction, married life or a lecture.
   Filter 3 is the collector's: the post is read from X itself, and X's words go through 1 and 2 again.
   p: a post as the search told it (its writer's profile and numbers are known). */
export function loveSafe(p, lang) {
  const u = p && p.user;
  if (!p || !u || /[#＃]/.test(p.raw) || p.media) return null;
  if (SHADY_BIO.test(String(u.description || '') + ' ' + String(u.name || '')) || SCHOOL.test(String(u.description || ''))) return null;
  const days = (Date.now() - Date.parse(u.joined || 0)) / 86400e3;
  if (!(days > 365) || !(u.statuses >= 300) || !(u.followers >= 30) || u.followers > 50000) return null;
  /* The rules for a post that opens a talk hold too; being answered is not asked of it. */
  const post = talkPost({ ...p, replies: Math.max(1, p.replies || 0) }, lang);
  if (!post || SOLICIT.test(post.text) || SCHOOL.test(post.text) || BODILY.test(post.text)) return null;
  return post;
}
export const loveFit = (text, lang) => standsAlone(text, lang) && loveText(text, lang);
/* null, or the post as it is saved. */
export function lovePost(p, lang) {
  const post = loveSafe(p, lang);
  return post && loveFit(post.text, lang) ? post : null;
}
/* Filter 1 for a reply, whatever it is wanted for: its writer may be shown and its words may play. */
export function replySafe(p, lang) {
  const u = p && p.user;
  if (!p || !p.id || !u || !u.username || u.protected || minor(u) || SCHOOL.test(String(u.description || '')) || !p.replyTo) return false;
  if (/^\s*(?:@\w+\s+)*[>＞]/.test(p.raw)) return false;
  return safe(plain(p.raw), p);
}
/* ---------- matching: which side a post about love is on, and what it wishes ---------- */
/* Matching News puts a post that speaks of a boyfriend beside one that speaks of a girlfriend, as a
   matching app would put two people together. The side is read from the partner the post names, not
   from who wrote it: nobody's gender is stated or shown.
     'boyfriend'  the post speaks of a boyfriend (彼氏, 元カレ) and not of a girlfriend
     'girlfriend' the post speaks of a girlfriend (彼女 where it reads so, 元カノ) and not of a boyfriend
     ''           neither, or both: such a post is not matched */
const HE = { ja: /彼氏|彼ピ|元カレ|元彼/, en: /\b(?:boyfriend|bf)\b/i };
const SHE = { ja: new RegExp(GIRLFRIEND), en: /\b(?:girlfriend|gf)\b/i };
export function sideOf(text, lang) {
  const t = String(text || '');
  const he = HE[lang].test(t), she = SHE[lang].test(t);
  return he && !she ? 'boyfriend' : she && !he ? 'girlfriend' : '';
}
/* A post that wishes for a partner (ほしい, できない, いない, 作りたい), rather than telling of one. */
const WISH = {
  ja: /(?:彼氏|彼女|恋人|好きな人)(?:が|は|も|を|とか|って)?\s*(?:ほし|欲し|でき(?:な|ん|る気|たら|ます)|出来(?:な|ん)|いな|居な|おら|作り|つくり|作っ|つくっ)|恋(?:がしたい|したい|してみたい)|クリぼっち|ぼっち|独り身|ひとり身|出会いが(?:ない|無い|ほし|欲し)/,
  en: /\b(?:want|need|wish i had|looking for|no|never had) an? (?:boyfriend|girlfriend)|\bsingle\b/i,
};
export const wishes = (text, lang) => WISH[lang].test(String(text || ''));
/* A post that tells of a partner the writer has is not matched with anybody: a match is for people
   who are free. Free: the post wishes for a partner, or speaks of one who is gone (an ex, a parting,
   a love that was not returned), or names no partner at all. */
const GONE = { ja: /元カレ|元カノ|元彼|別れ(?:た(?!く)|て(?!ほし|欲し)|まし)|失恋|振られ|フラれ|ふられ|片思い|片想い|クリぼっち|独り身|フリー/, en: /\b(?:my ex|broke up|dumped|single|heartbroken|unrequited)\b/i };
/* "My boyfriend now", beside talk of an ex: the writer is not free. */
const NOW = { ja: /今の(?:彼氏|彼女|恋人)|今彼|今カレ|今カノ|初彼女|初彼氏/, en: /\bmy (?:new|current) (?:boyfriend|girlfriend)\b/i };
export const freeOf = (text, lang) => { const t = String(text || ''); return !sideOf(t, lang) || wishes(t, lang) || (GONE[lang].test(t) && !NOW[lang].test(t)); };
/* ---------- matching: two short sayings that answer one another ---------- */
/* Matching News shows two short things, said by two people, as an exchange:
     かわいい ー かっこいい            a word and the word that answers it (words.json, pairs.echo)
     大阪万博いつ始まるの？ ー 博多万博の後   a question, and a short saying with the same word in it
     ディズニーランドと間違えた ー 今USJ    two words of one family (pairs.kin)
     いい天気だな ー そうだね           a short remark, and a word of agreement (pairs.agree)
   The two were not written to each other. Which sayings go together is decided here, by these
   rules, and written into the API as pairs; the page only draws from them. */
const FACE = /[゜ﾟωДд∀´｀꒳ᐛ◍๑ᴗ╹°▽ε≧≦＞＜ꉂ𐤔]|[（(][^（()）]{1,8}[)）]|[ｦ-ﾟ]{2,}/;
/* Rough words, and politics: a match is a friendly exchange, and nobody's saying is put beside a party's name. */
const ROUGH = /クソ|くっそ|帰れ|うるさ|黙[れっ]|(?:自民|公明|立憲|共産|維新|国民民主|社民|参政|保守|れいわ|民主|与|野|政)党|政治|選挙|国会|首相|総理|議員|政府|大臣|知事|政権|増税|減税|法案|\b(?:shut up|damn|politic\w*|election)\b/i;
/* A saying, judged by its words alone: short, and nothing that may not play. */
export function sayText(text, lang) {
  const t = String(text || '').trim();
  const n = charLen(t);
  if (n < 2 || n > (lang === 'en' ? 60 : 30)) return false;
  if (lang === 'en' ? !/[A-Za-z]{2,}/.test(t) : !CJK.test(t)) return false;
  return cleanText(t) && !GLOOM.test(t) && !AD.test(t) && !SOLICIT.test(t) && !SCHOOL.test(t) && !BODILY.test(t)
    && !SOMEBODY.test(t) && !SENSITIVE.test(t) && !TEASER.test(t) && !FACE.test(t) && !ROUGH.test(t);
}
/* A saying as the search told it (its writer's profile and numbers are known): an ordinary person's
   account, more than a year old; no hashtag, picture, link or quote. null, or the saying as it is saved. */
export function sayOk(p, lang) {
  const u = p && p.user;
  if (!p || !p.id || !u || !personal(u) || minor(u) || p.quote || p.repost || p.sensitive || p.media) return null;
  if (/[#＃]|https?:\/\//.test(p.raw) || /^\s*(?:@\w+\s+)*[>＞]/.test(p.raw)) return null;
  if (SHADY_BIO.test(String(u.description || '') + ' ' + String(u.name || '')) || SCHOOL.test(String(u.description || ''))) return null;
  const days = (Date.now() - Date.parse(u.joined || 0)) / 86400e3;
  if (!(days > 365) || !(u.statuses >= 300) || !(u.followers >= 30) || u.followers > 50000) return null;
  const text = plain(p.raw);
  if (!sayText(text, lang)) return null;
  return { id: p.id, handle: u.username, text, url: 'https://x.com/' + u.username + '/status/' + p.id, reply: !!p.replyTo };
}
/* What a saying is about: its words in kanji, katakana or Latin letters, without the words every saying has. */
const PLAIN_WORDS = new Set(('今日 昨日 明日 今年 去年 来年 今月 来月 最近 自分 一緒 本当 時間 普通 人生 最高 大事 予定 毎日 一番 今回 今度 大好 好き 気持 結局 全部 絶対 最初 最後 '
  + '一人 二人 人間 意味 感じ 相手 場所 生活 理由 自体 以上 以外 以前 全然 多分 何故 無理 必要 大丈夫 可愛 実感 仕事 今週 来週 先週 今夜 今朝 午前 午後 時間 一日 一回 何回 何時 何度 何処 全員').split(' '));
/* A long word in kanji is often two words (大阪万博): its first two and its last two letters count too.
   Laughs, reaction words and the stems of everyday verbs are not what a saying is about. */
const STEMS = new Set('頑張 素晴 美味 面白 大変 最悪 最高 可愛 綺麗 大好 楽 嬉 悲 笑笑 何食 一緒 本当 今日 明日 昨日'.split(' '));
export const keywordsOf = text => {
  const out = [];
  (String(text || '').match(/[一-龯々〆ヶ]{2,}|[ァ-ヴー]{3,}|[A-Za-z]{3,}/g) || []).forEach(w => {
    const k = w.replace(/^ー+|ー+$/g, '');
    if (charLen(k) < 2 || /^[wWｗＷ]+$/.test(k) || /^[笑草]+$/.test(k)) return;
    out.push(k.toLowerCase());
    if (/^[一-龯々〆ヶ]{4,}$/.test(k)) out.push(k.slice(0, 2), k.slice(-2));
  });
  return [...new Set(out)].filter(w => !PLAIN_WORDS.has(w) && !STEMS.has(w) && !REACT.has(w) && !REACT.has(w.toUpperCase()));
};
const coreOf = text => String(text || '').replace(/\p{Extended_Pictographic}|️|‍/gu, '').replace(/笑+|草+|[wWｗＷ]+|[\s　、。，．,.!?！？…・〜～ー\-⁉‼()（）「」]+/g, '');
/* Does the saying say one of the words? The word it says, or ''. */
const saysWord = (t, w) => { const k = String(w).toLowerCase(); return /^[一-龯]$/.test(k) ? new RegExp('(?<![一-龯])' + k + '(?![一-龯])').test(t) : t.includes(k); };
const saysOne = (t, list) => (list || []).find(w => saysWord(t, w)) || '';
/* A lexicon's every word, for the collector: sayings worth reading say one of them, ask, or agree. */
export const lexiconWords = lex => [...new Set([].concat(...(lex.echo || []).map(e => e[0].concat(e[1])), ...(lex.kin || []), lex.agree || [], lex.seed || []))];
/* Words that find a romantic exchange: a confession and its answer, or a hint and a reply that plays along.
   Goodnight and sleepy lines (おやすみ, ねむい) are not romance. */
const ROMANCE_ECHO = /好き|会い|付き合|デート|告白|寂|幸せ|ただいま|おかえり/;
const SLEEPY = /ねむい|ねむた|眠い|眠た|おやすみ|寝よ|寝な|寝て/;
/* A saying that can open or answer a romantic pair. Used to keep those when the list is cut down. */
export const romanceSay = text => !SLEEPY.test(String(text || '')) && /好き(?:だよ|です|かも|なの)|大好き|付き合|告白|デート|彼氏|彼女と|匂わせ|わたしも|俺も|僕も|いいよ|羨ま|確定|それもう/.test(String(text || ''));
/* Search words: the romantic ones only. Bare answers (うん, いいよ, 私も) and sleepy words are left out,
   so the pool is not ordinary small talk. */
const ROMANCE_WORD = /好き|付き合|デート|告白|彼氏|彼女|匂わせ|会い|おかえり|ただいま|幸せ|寂|わたしも|お揃い|手を繋|手つない|迎えに来|プレゼント|奢って|おごって/;
const BROAD_WORD = new Set('うん いいよ いいね こちらこそ 待ってる おめでとう 詳しく ずるい いい夢 また明日 おやすみ 私も 俺も 僕も ぼくも'.split(' '));
export const romanceWords = lex => {
  const flat = pairs => (pairs || []).flatMap(([a, b]) => (a || []).concat(b || []));
  const echo = (lex.echo || []).filter(([L]) => ROMANCE_ECHO.test((L && L[0]) || '')).flatMap(([a, b]) => a.concat(b));
  return [...new Set(flat(lex.land).concat(flat(lex.hint), echo))].filter(w => ROMANCE_WORD.test(w) && !BROAD_WORD.has(w) && !SLEEPY.test(w));
};
export function pairable(text, lex) {
  const t = String(text || '').toLowerCase();
  return asks(text) || !!saysOne(t, lexiconWords(lex)) || /[なねわよ][ぁあー〜]*$/.test(coreOf(text));
}
/* The pairs: which saying may open and which may answer. items: sayings; lex: words.json's pairs for the
   language. Each pair is { a, b, kind, word }: the ids of the opening and the answering saying, the
   rule that made it, and the word they turn on. Two sayings of one person are never paired. */
export function pairUp(items, lex, lang) {
  const out = [];
  const seen = new Set();
  const uses = new Map();
  const mix = list => list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const T = items.map(x => ({ x, t: x.text.toLowerCase(), n: charLen(x.text), q: asks(x.text), core: coreOf(x.text) }));
  const add = (a, b, kind, word) => {
    if (a.x.id === b.x.id || a.x.handle.toLowerCase() === b.x.handle.toLowerCase()) return false;
    /* A reply and the post it was really written to are a real talk, not a match. */
    if ((a.x.to && a.x.to === b.x.id) || (b.x.to && b.x.to === a.x.id)) return false;
    const k = a.x.id + '|' + b.x.id;
    if (seen.has(k) || seen.has(b.x.id + '|' + a.x.id)) return false;
    /* One saying is not used in more than six pairs, so the videos do not turn on the same few. */
    if ((uses.get(a.x.id) || 0) >= 6 || (uses.get(b.x.id) || 0) >= 6) return false;
    /* Sleepy lines (ねむい, おやすみ) are not a romantic exchange. */
    if (lex.romance && SLEEPY.test(a.t + b.t)) return false;
    seen.add(k);
    uses.set(a.x.id, (uses.get(a.x.id) || 0) + 1);
    uses.set(b.x.id, (uses.get(b.x.id) || 0) + 1);
    out.push({ a: a.x.id, b: b.x.id, kind, word });
    return true;
  };
  /* turn: the longer saying opens and the shorter one answers (for rules that have no order of their own). */
  const cross = (A, B, kind, word, cap, turn) => {
    let n = 0;
    for (const a of mix(A)) { for (const b of mix(B)) { if (n >= cap) return; if (turn && b.n > a.n ? add(b, a, kind, word) : add(a, b, kind, word)) { n++; break; } } }
  };
  const short = (i, max) => !i.q && i.n <= max;
  const cold = /無理|うざ|キモ|きも|やめろ|嫌|むり|しつこい|別れよ|うざい/;
  /* Liking a song, a meal, or sleep is not a confession. */
  const notPerson = /ラーメン|寿司|焼肉|カレー|うどん|パスタ|美味|うまい|ご飯|食べ|飲み|歌|曲|ライブ|アニメ|ゲーム|サイゼ|映画|漫画|選手|試合|ねむ|眠い|おやす/;
  /* 恋愛成立: a short confession, and a short answer that accepts it. */
  const confess = i => {
    if (i.n > 26 || i.n < 2 || cold.test(i.t) || notPerson.test(i.t) || SLEEPY.test(i.t)) return false;
    /* A line that teases a hint ("付き合ってるじゃん") is the reply, not the confession. */
    if (/じゃん|匂わせ|羨ま|うらや|確定|それもう|詳しく|誰と|誰から|見せて/.test(i.t)) return false;
    if (/付き合(?:って|お|おう|いたい)|告白|デート(?:しよ|行こ|いこ|しない)|恋人にな/.test(i.t)) return true;
    return /好き(?:だよ|です|かも|なの|になった|すぎ)|大好き/.test(i.t);
  };
  const accept = i => i.n <= 18 && i.n >= 1 && !cold.test(i.t) && !notPerson.test(i.t) && !SLEEPY.test(i.t)
    && /(?:私も|わたしも|俺も|僕も|ぼくも|おれも|うちも|いいよ|こちらこそ|待って(?:た|る)|付き合お|好きだよ|大好き)/.test(i.t);
  /* 匂わせに乗る: the post hints at a partner, and the reply plays along. */
  const hintOpen = i => i.n <= 32 && i.n >= 4 && !cold.test(i.t) && !SLEEPY.test(i.t)
    && /彼氏|彼女と|彼女いる|彼女できた|彼女が好き|デート|プレゼント(?:もら|くれ|届)|奢ってく|おごってく|迎えに来て|匂わせ|お揃い|手を繋|手つない/.test(i.t);
  const hintRide = i => i.n <= 24 && i.n >= 2 && !cold.test(i.t) && !notPerson.test(i.t) && !SLEEPY.test(i.t)
    && /付き合|彼氏じゃん|彼女じゃん|匂わせ|羨ま|うらや|おめでとう|詳しく|ずる|ズル|確定|カップル|いいな|見せて|誰から|誰と|それもう|乗っか|脈あり|両思い/.test(i.t);
  cross(T.filter(confess), T.filter(accept), 'land', '好き', 80);
  cross(T.filter(hintOpen), T.filter(hintRide), 'hint', '匂わせ', 80);
  /* 1. A word and the word that answers it. The word is most of what each one says.
     Romance keeps only the couple exchanges (好き / 私も), not food or the weather. */
  const mostly = (i, list) => { const w = short(i, 16) ? saysOne(i.t, list) : ''; return !!w && i.core.length <= charLen(w) + 6; };
  (lex.echo || []).forEach(([L, R]) => {
    if (lex.romance && !ROMANCE_ECHO.test(L[0] || '')) return;
    cross(T.filter(i => mostly(i, L)), T.filter(i => mostly(i, R)), 'echo', L[0], 24);
  });
  if (lex.romance) return out.slice(0, 2000);
  /* 2. A question, and a short saying that has one of the question's words in it. */
  T.filter(i => i.q && i.n <= 24).forEach(i => {
    keywordsOf(i.x.text).forEach(K => cross([i], T.filter(j => short(j, 16) && j.t.includes(K)), 'ask', K, 2));
  });
  /* 3. Two words of one family (Disneyland and USJ, Osaka and Hakata). */
  (lex.kin || []).forEach(group => {
    const by = group.map(w => [w, T.filter(i => short(i, 18) && saysWord(i.t, w))]).filter(x => x[1].length);
    let n = 0;
    mix(by).forEach(([w, A]) => mix(by).forEach(([v, B]) => { if (w !== v && n < 30) { const before = out.length; cross(A, B, 'kin', w, 4, true); n += out.length - before; } }));
  });
  /* 4. Two sayings with the same word in them. */
  const byWord = new Map();
  T.filter(i => short(i, 18)).forEach(i => keywordsOf(i.x.text).forEach(K => { if (!byWord.has(K)) byWord.set(K, []); byWord.get(K).push(i); }));
  byWord.forEach((list, K) => { if (list.length > 1) cross(list, list, 'same', K, 1, true); });
  /* 5. A short remark that looks for agreement, and a word of agreement. */
  const agree = T.filter(i => (lex.agree || []).some(w => i.core === w || (i.core.startsWith(w) && i.core.length <= charLen(w) + 2)));
  const remark = T.filter(i => short(i, 16) && i.n >= 4 && !agree.includes(i) && /[なねわよ][ぁあー〜]*$/.test(i.core));
  /* A remark that was a post of its own reads best; a reply's remark may hang on what it answered. */
  cross(remark.filter(i => !i.x.reply), agree, 'agree', '', 80);
  cross(remark.filter(i => i.x.reply), agree, 'agree', '', 40);
  /* 6. Two short sayings with no word in common: a reply that does not fit the post (今USJ beside ディズニー). */
  const shorts = T.filter(i => !i.q && i.n >= 2 && i.n <= 28);
  let mismatch = 0;
  for (const a of mix(shorts)) {
    if (mismatch >= 500) break;
    const kwA = new Set(keywordsOf(a.x.text));
    for (const b of mix(shorts)) {
      if (mismatch >= 500) break;
      if (a.x.id === b.x.id) continue;
      const kwB = new Set(keywordsOf(b.x.text));
      if ([...kwA].some(k => kwB.has(k))) continue;
      const open = a.n >= b.n ? a : b, ans = a.n >= b.n ? b : a;
      if (add(open, ans, 'mismatch', '')) mismatch++;
    }
  }
  /* 7. Pairs drawn at random after the rules above — many combinations that share no rule. */
  const pool = mix(T.filter(i => i.n <= 32 && i.n >= 2));
  let random = 0;
  for (let i = 0; i < pool.length && random < 400; i++) {
    for (let j = i + 1; j < pool.length && random < 400; j++) {
      const a = pool[i], b = pool[j];
      const open = a.n >= b.n ? a : b, ans = a.n >= b.n ? b : a;
      if (add(open, ans, 'random', '')) random++;
    }
  }
  return out.slice(0, 2000);
}
/* A post that asks something. */
export const asks = text => /[？?][\s\p{Extended_Pictographic}️]*$/u.test(String(text || '').trim());
/* The same line, whatever its marks: one is enough. */
export const lineKey = text => squash(text);

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

/* ---------- which genre a talk is about ---------- */
/* Decided here, from the talk's own words: the genre whose words it says most. A word from the genre's
   main list names the talk (it becomes the talk's first card); the other telling words only sort it.
   A talk that says none of them is "other". */
export function genreOf(text, lang, genres) {
  const hay = String(text || '').toLowerCase();
  let best = { genre: 'other', word: '', score: 0 };
  genres.forEach(g => {
    let score = 0;
    let word = '';
    (g[lang] || []).forEach(x => { if (hay.includes(x.toLowerCase())) { score += 2 * [...x].length; if ([...x].length > [...word].length) word = x; } });
    ((g.tell && g.tell[lang]) || []).forEach(x => { if (hay.includes(x.toLowerCase())) score += [...x].length; });
    if (score > best.score) best = { genre: g.id, word, score };
  });
  return { genre: best.genre, word: best.word };
}

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
/* Matching News' data, one language: the posts and the lines that may be matched with one another. */
export async function writeMatch(outDir, match) {
  await mkdir(path.join(outDir, 'v1'), { recursive: true });
  await writeFile(path.join(outDir, 'v1', `match-${match.lang}.json`), JSON.stringify(match) + '\n');
}
/* The index: when each language was last written and how many talks each genre has.
   .changed tells the workflow that there is something new to publish. */
export async function writeIndex(outDir, source, outs, matches) {
  const index = await readJson(path.join(outDir, 'v1', 'index.json'), {});
  const langs = { ...(index.langs || {}) };
  outs.forEach(out => {
    const genres = {};
    out.talks.forEach(t => { genres[t.genre] = (genres[t.genre] || 0) + 1; });
    langs[out.lang] = { ...(langs[out.lang] || {}), updated: out.updated, count: out.talks.length, genres };
  });
  (matches || []).forEach(m => { langs[m.lang] = { ...(langs[m.lang] || {}), match: { posts: m.posts.length, boyfriend: m.posts.filter(p => p.side === 'boyfriend').length, girlfriend: m.posts.filter(p => p.side === 'girlfriend').length, free: m.posts.filter(p => p.free).length, lines: m.lines.length, sayings: (m.says || []).length, pairs: (m.pairs || []).length }, stages: m.stages || null }; });
  await writeFile(path.join(outDir, 'v1', 'index.json'), JSON.stringify({ version: 1, updated: stamp(), source, langs }, null, 1) + '\n');
  await writeFile(path.join(outDir, '.changed'), stamp() + '\n');
}
/* A talk saved earlier is judged again by the rules as they are now, so a rule added later also clears
   what is already in the API. Talks sent by hand were chosen by the owner and stay. */
export const cleanText = t => !!t && !UNSAFE.test(t) && !VIOLENT.test(t) && !HEAVY.test(t) && !SUGGESTIVE.test(t) && !TOXIC.test(t);
/* A post in Matching News' data is judged again the same way. */
export const postOk = (p, lang) => !!p && !!p.id && !!p.handle && cleanText(p.text) && !GLOOM.test(p.text) && !AD.test(p.text) && !OFFICIAL.test(p.handle) && standsAlone(p.text, lang) && loveText(p.text, lang);
export const stillOk = t => !!t.manual || (cleanText(t.post.text) && !OFFICIAL.test(t.post.handle) && t.replies.every(r => cleanText(r.text)));
/* How long a talk stays: two days when collected, two weeks when sent by hand. */
export const young = (t, hours) => Date.now() - Date.parse(t.found || 0) < (t.manual ? 14 * 24 : hours) * 3600e3;
