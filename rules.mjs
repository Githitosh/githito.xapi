/* githito.xapi: what may play, and the shape of the API's files. Used by collect.mjs and ingest.mjs. */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

export const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
export async function readJson(file, empty) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { return empty; } }

/* ---------- what may play ---------- */
const VIOLENT = /murder|stabbed|shot dead|shooting|killed|beheading|homicide|massacre|rape|sexual assault|robbery|凶悪|殺人|殺害|刺殺|遺体|刺され|死傷|銃乱射|暴行|強盗|レイプ|強姦/i;
const HEAVY = /(?:^|[^必])死(?!ぬほど|ぬかと|んだ笑)|亡くな|遺体|事故|災害|震災|地震|津波|火災|病気|闘病|入院|がん(?!ば|が)|癌|自殺|自死|心中|いじめ|虐待|差別|ご冥福|追悼|\\brest in peace\\b|\\bRIP\\b|\bdied\b|\bdeath\b|\bcrash\b|\bdisaster\b|\bcancer\b|\bsuicide\b|\bbull(?:y|ied|ying)\b|\bracis/i;
const SUGGESTIVE = /🔞|🍆|🍑|😏|💋|👅|いやらし|やらしい|寝かさない|抱いて|抱かれ|夜這い|ベッドで|一緒にお風呂|色っぽ|セクシー|えちえち|\bsexy\b|\bspicy\b|\bnaughty\b|\bin bed\b|(?<!ア)マゾ(?!ン)|ドM|ドＭ|ドS|ドＳ|変態|ヘンタイ|\bkink|赤ちゃんプレイ|[SＳMＭ]プレイ/i;
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
  if (/[゜ﾟωДд∀´｀꒳ᐛ◍๑ᴗ╹°▽ε≧≦＞＜ꉂ𐤔]|[（(][^（()）]{1,8}[)）]/.test(t)) return null;
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
const LOVE = {
  /* 彼女 also means "she", so it counts only where it reads as a girlfriend. */
  ja: /彼氏|(?:俺|僕|おれ|ぼく|自分|私|うち)の彼女|彼女(?:でき|ほし|欲し|いな|おら|持ち|と(?:デート|付き合|同棲|別れ|会|電話|遊|出かけ|旅行|ご飯|飯)|に(?:振られ|フラれ|ふられ|会|怒られ|プレゼント|言われ)|が(?:可愛|かわい|好き|作っ|くれ|怒|欲し|ほし|でき|い)|から|の(?:手料理|誕生日|プレゼント|家))|恋人(?!達|たち)|片思い|片想い|好きな人|デート|同棲|告白(?:され|した|して|する|でき)|付き合って(?:る|た|ない|から|いる|いた|くれ|ほし|欲し|ください)|付き合(?:い始め|いたて|うことに|いたい|えた|える)|恋愛|失恋|元カレ|元カノ|元彼|恋し(?:た|て)|恋バナ|遠距離恋愛|惚れ/,
  en: /\b(?:boyfriend|girlfriend|crush|date|dating|anniversary|in love|my ex|single)\b/i,
};
/* Not for a matching: married life and children, cheating, and anything of the body. */
const NOT_SINGLE = /子持ち|家庭|旦那|嫁|夫|妻|結婚|既婚|子供|子ども|こども|息子|娘|長女|次女|三女|長男|次男|三男|出産|妊娠|妊っ|産院|育児|ママ|パパ|離婚|不倫|浮気|\b(?:husband|wife|married|marriage|kids?|pregnan\w+|divorce\w*|cheat\w*|affair)\b/i;
const BODILY = /身体|カラダ|疼|触れられ|触られ|感覚を思い出|火照|濡れ|敏感|欲求|欲しがる|興奮|舐め|揉[まみむ]|肌|唇|首筋|耳元|吐息|抱きしめ|抱い[てた]|押し倒|襲[わっ]|我慢でき|夜になると|おじさん|車の中|ベッド|布団|風呂|シャワー|セクハラ|性的|ぎゅー|ぎゅっ|若い女|若い男|近親|下心|ワンナイト|お持ち帰り|体目的|体の関係|ホテル|泊ま|お泊|キス|ハグ|イチャ|いちゃ|添い寝|脱[がぎぐい]|胸|尻|フェチ|\b(?:kiss\w*|hook ?up|one night|hotel|bed)\b/i;
const FICTION = /作品|彼氏面|彼女面|トモコレ|曲|ソング|歌詞|歌っ|新譜|アルバム|\\bMV\\b|主人公|ラブコメ|コント|両片思い|両片想い|BSS|[←→]|様|弊|周年|コス|衣装|ビジュ|社長|界隈|供給|尊い|さにわ|審神者|てぇてぇ|解釈|腐|夢見|プリン|ばつ丸|サンリオ|キャラ|ＣＰ|\bCP\b|カプ|推し|二次創作|夢小説|夢主|夢女|受け|攻め|原作|アニメ|漫画|マンガ|ドラマ|映画|小説|ゲーム|配信|ライブ|アイドル|声優|俳優|女優|芸能|タレント|熱愛|メンバー|担当|ファン|イベント|ガチャ|実装|公式|妄想|設定|\b(?:ship|fanfic|anime|manga|character|episode|season|drama|movie|idol|fandom)\b/i;
const SOLICIT = /募集|希望|誘っ|彼氏なし|彼女なし|恋人なし|フリーです|[^\s]\/[^\s]+\/|会える|会いたい人|会ってくれる|住み|近くの人|あたりの人|近い人|裏垢|サブ垢|別垢|鍵垢|セフ|せふ|ＤＭ|\bDM\b|LINE|ライン|カカオ|通話|フォロ|繋がり|つながり|いいね|RT|リポスト|プロフ|固ツイ|固定|保存して|\b(?:dm me|hmu|follow|link in bio|looking for)\b/i;
const SHADY_BIO = /→\s*[@＠]|サブ|裏垢|別垢|過激|承認|会える|募集|希望|限定|\bDM\b|ＤＭ|LINE|出会い|パパ|ママ活|せふ|セフ|副業|稼|投資|占い|鑑定|相談|カウンセ|コーチ|講座|公式|アフィ|\bPR\b|婚活|恋愛(?:相談|コーチ|コンサル|アドバイ)|モテ|垢|\b(?:onlyfans|dating coach|dm for|18\+)\b/i;
const SCHOOL = /ハイスクール|学生|修学旅行|学校|高校|中学|小学|大学[1１一]年|部活|先生|クラス|授業|テスト|受験|放課後|制服|担任|学年|[LSF]?JK|\bDK\b|\bJC\b|\b(?:school|class|teacher|homework|grade)\b/i;
/* Lines of a story: it opens with speech in brackets, answered by more speech. */
const DIALOGUE = /^\s*「[^」]*」\s*「/;
/* Advice for sale and sweeping talk about men and women: lists, "men are…", "what women really…". */
/* Two emoji standing for a pair of characters (同棲🦌🧱が…): talk about a fictional couple. */
const PAIR = /\p{Extended_Pictographic}\p{Extended_Pictographic}[がはのをにと]/u;
const LECTURE = /男って|女って|男は|女は|男の(?:勘違い|本音|特徴)|女の(?:本音|特徴)|女性[がは]|男性[がは]|モテ|脈あり|脈なし|[■◆●▼✅👇☑]|[0-9０-９]+選|そう思ってた|気づけなかった|\\b(?:men are|women are|guys who|girls who)\\b/i;
/* Does the text talk of love, in a life and not in a story? */
export const loveText = (text, lang) => { const t = String(text || ''); return LOVE[lang].test(t) && !FICTION.test(t) && !SOLICIT.test(t) && !SCHOOL.test(t) && !NOT_SINGLE.test(t) && !BODILY.test(t) && !LECTURE.test(t) && !PAIR.test(t) && !DIALOGUE.test(t); };
/* p: a post as the search told it (its writer's profile and numbers are known). null, or the post as it is saved. */
export function lovePost(p, lang) {
  const u = p && p.user;
  if (!p || !u || /[#＃]/.test(p.raw) || p.media) return null;
  if (SHADY_BIO.test(String(u.description || '') + ' ' + String(u.name || '')) || SCHOOL.test(String(u.description || ''))) return null;
  const days = (Date.now() - Date.parse(u.joined || 0)) / 86400e3;
  if (!(days > 365) || !(u.statuses >= 300) || !(u.followers >= 30) || u.followers > 50000) return null;
  /* The rules for a post that opens a talk hold too; being answered is not asked of it. */
  const post = talkPost({ ...p, replies: Math.max(1, p.replies || 0) }, lang);
  if (!post || !standsAlone(post.text, lang) || !loveText(post.text, lang)) return null;
  return post;
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
  (matches || []).forEach(m => { langs[m.lang] = { ...(langs[m.lang] || {}), match: { posts: m.posts.length, lines: m.lines.length } }; });
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
