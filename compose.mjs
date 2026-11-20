/* compose.mjs: the words of every card, written here and checked here, so that the pages only read them.

   News (speed-read news, a card in three beats): a keyword, then what happened, then who did it, said it
   or showed it. newsCard turns a collected headline into that:
     ja: [what, who]   who: the person, the office or the survey the headline names (whoOf)
     ja: [part, part]  a long headline that names nobody, cut where its sentence turns (cutJa)
     ja: [whole, more] a short headline and the line its post added
     ja: [whole, paper] a short headline and the paper that wrote it
   Each part is checked (partOk) and mended where it can be (fixPart): labels such as 【速報】, emoji and
   ruled lines out; a tail cut off in mid-phrase (…への…) taken back to where the sentence turns; brackets
   that open and do not close, a hole where a name was, a part that begins or ends on a particle: such a
   part is not used. A headline none of whose forms passes makes no card.

   Reply News: a video is a conversation. Each message is a card in two beats: a part of it taken out
   (excerpt: the greeting or the loving word in it), then the whole message (talkCards). A talk is the
   back-and-forth humor.mjs kept between two people (story.t), or the post and its reply. For an account a
   reader asked for, the reply alone (replyCard).

   Nothing here asks anything of anybody: it reads the files the collectors wrote. */
import { cruel, personal, slander, alcohol } from './filters.mjs';

/* ---------- who the news is about ---------- */
/* A card of speed-read news says what happened on its second beat and who did it, said it or showed it on
   its third. whoOf finds that "who" in a headline, as the papers write one:
     - a person where a phrase starts: a full name (a common family name and a given name), a name with a
       title (高市首相, 田嶋幸三氏, 安住アナ), names joined by ＆ or ×, a name after its group
       (超特急・柏木悠), or whoever stands right before what was said (末澤誠也「…」, 自民「…」);
     - or the one the news comes from, at the end: an office, a court, a survey (…―国交省, … 東京電力,
       … 内閣府調査).
   It answers { who, what } (the headline without the name), or null when the headline names nobody that
   way: a wrong word in the place of a name is worse than no name. */
const FAMILY = ('佐藤 鈴木 高橋 田中 伊藤 渡辺 渡邊 渡部 山本 中村 小林 加藤 吉田 山田 佐々木 山口 松本 井上 木村 斎藤 斉藤 齋藤 清水 山崎 池田 橋本 阿部 石川 山下 中島 中嶋 石井 小川 前田 岡田 長谷川 藤田 後藤 近藤 村上 遠藤 青木 坂本 福田 太田 西村 藤井 金子 岡本 藤原 中野 三浦 原田 中川 松田 竹内 小野 田村 中山 和田 石田 森田 上田 内田 柴田 酒井 宮崎 横山 高木 安藤 宮本 大野 小島 工藤 谷口 今井 高田 増田 丸山 杉山 村田 大塚 新井 小山 平野 藤本 河野 上野 野口 武田 松井 千葉 岩崎 菅原 木下 久保 佐野 野村 松尾 市川 菊地 菊池 杉本 古川 大西 島田 水野 桜井 櫻井 高野 吉川 山内 西田 飯田 西川 小松 北村 安田 五十嵐 川口 平田 中田 久保田 服部 岩田 土屋 川崎 福島 本田 樋口 秋山 田口 永井 山中 中西 吉村 川上 石原 大橋 松岡 馬場 浜田 濱田 森本 星野 矢野 浅野 大久保 松下 吉岡 小池 野田 荒木 大谷 内藤 松浦 熊谷 黒田 尾崎 永田 川村 望月 田辺 松村 荒井 大島 平井 早川 菅野 栗原 広瀬 廣瀬 横田 石橋 萩原 岩本 片山 関口 宮田 大石 高山 本間 吉野 須藤 岡崎 小田 伊東 鎌田 上原 篠原 小西 松原 福井 古田 大森 小泉 成田 奥村 内山 沢田 澤田 川島 桑原 三宅 片岡 富田 杉浦 八木 奥田 小沢 小澤 松永 北川 関根 河合 平山 牧野 白石 今村 寺田 青山 中尾 小倉 渋谷 上村 小野寺 大山 足立 岡村 坂口 天野 多田 佐久間 根本 豊田 田島 飯塚 角田 村山 武藤 白井 宮下 塚本 榎本 神田 水谷 坂田 児玉 大川 松崎 竹田 竹下 大竹 新垣 綾瀬 有村 浜辺 永野 今田 福原 目黒 向井 宮舘 深澤 羽生 八村 三笘 堂安 梅津 末澤 曽野 柏木 知念 仲野 吉沢 吉澤 菅田 神木 松坂 窪田 中条 橋爪 二宮 相葉 大倉 山﨑 髙橋 平手 生田 堀田 志田 指原 板野 篠田 黒木 亀梨 赤西 東出 山里 蒼井 高市 石破 岸田 玉木 麻生 茂木').split(' ');
const FAMILY_RE = FAMILY.slice().sort((a, b) => b.length - a.length).join('|');
/* Titles a paper writes after a name. */
const TITLE = '氏|さん|さま|様|陛下|殿下|GM|主将|横綱|大関|親方|首相|総理|大統領|副大統領|外相|財務相|防衛相|経産相|厚労相|文科相|国交相|総務相|法相|農相|環境相|官房長官|報道官|幹事長|政調会長|委員長|党首|議長|総裁|会長|社長|CEO|知事|市長|区長|町長|村長|監督|コーチ|選手|投手|捕手|騎手|名人|竜王|九段|八段|七段|六段|教授|博士|医師|弁護士|アナ|キャスター|代表|大臣';
const TITLE_END = new RegExp(`(?:${TITLE})$`);
/* What a given name does not end on: these make a place, a school or a thing of a family name (石川県, 松本城). */
const NOT_GIVEN = /[県市区町村駅城犬線港山川島湾沖組屋店社寺園院校館場庁署局部課会党軍系風流式型製産発行]$|地方|地域|学院|大学|高校|神社|通り|公園|空港|病院|新聞|電鉄|電力|銀行|工業|産業|建設|自動車/;
/* Words that stand before a title in quotation marks: a kind of work or of news, not somebody who speaks. */
const NOT_SPEAKER = /(映画|ドラマ|アニメ|劇場版|舞台|曲|番組|特集|連載|小説|漫画|マンガ|コミック|ゲーム|作|写真集|アルバム|シングル|CM|MV|イベント|企画|展|ミュージカル|劇|映像|予告|主題歌|書籍|絵本|雑誌|作品|シリーズ|アプリ|サービス|商品|機能|キャンペーン|フェア|コラボ|ツアー|ライブ|公演|賞|ランキング|限定|発売|登場|開催|決定|公開|解禁|速報|独占|話題|人気|注目|最新|特別)$/;
/* Whom news comes from, as the last word of a headline. */
const WHO_SOURCE = /(調査|発表|省|庁|内閣府|政府|日銀|地裁|高裁|最高裁|地検|県警|府警|道警|警視庁|警察|電力|銀行|証券|自動車|製薬|協会|連盟|委員会|委|院|審|団|党|当局|研究所|機構|大学|HD|グループ|ホールディングス)$/;
/* Who speaks for an office, a party or a country, before what was said (自民「正解はない」, 中国紙「…」). */
const SAYS = '自民|立民|立憲|維新|公明|共産|国民|れいわ|参政|社民|民改|民主改革|与党|野党|政府|日銀|米|中国|ロシア|韓国|北朝鮮|ウクライナ|イスラエル|イラン|EU|NATO|国連|WHO|IMF|FRB';
const SAYS_END = '紙|省|庁|党|側|団|局|軍|地裁|高裁|地検|府|委|当局|首脳|幹部|大使|特使|報道官|GM|監督';
/* The letter a given name ends on, for a name whose family name is not in the list (山城奈々「…」). */
const NAME_END = '也哉弥太汰介助輔祐佑裕優雄夫男郎朗斗人仁翔将昌誠真慎信伸進治司史志之行幸子美香奈花菜華恵絵江代葉乃衣希紀樹輝貴喜結唯愛彩綾里理梨莉凛玲麗月陽葵空海洋浩宏弘博啓圭健賢光康孝航剛豪隆俊純潤淳順秀修章彰昭聖成清晴聡智哲徹典登平馬実未吾悟和一吉久穂帆歩保芳邦朋友勇悠由直尚那南羽春遥耀卓拓巧功晃紅佳夏歌雅芽紗沙咲桜央緒音夢睦瑞瑛英栄永々';
const KJ = '一-鿿々ヶ', HR = 'ぁ-ゟ', KT = 'ァ-ヿ';
const NAME_CH = `${KJ}${KT}A-Za-z0-9Ａ-Ｚａ-ｚ０-９`;
/* After a name: a mark, a space, or the particle that follows it. */
const AFTER = `(?=[、「『“\\s　]|[がはもとにをへの](?![${HR}])|ら(?:[がはも、\\s]|$)|$)`;
const GIVEN = `[${KJ}${HR}${KT}]{1,3}?`;
const FULL = `(?:${FAMILY_RE})${GIVEN}`;
const ONE = `(?:${FULL}|[${NAME_CH}]{1,10}(?:${TITLE}))`;
/* A name written beside another with ＆ or ×: kanji first, a few letters (黒木華, 横山めぐみ). */
const NEXT = `[${KJ}][${KJ}${HR}${KT}]{1,5}?`;
const PERSON_RE = new RegExp(`^(?:([${NAME_CH}！!.\\/ ]{1,12})・)?(${ONE}(?:[＆&×](?:${ONE}|${NEXT})){0,4})${AFTER}`);
const JOINED_RE = new RegExp(`^(${NEXT}(?:[＆&×]${NEXT}){1,4})(?=[、「『“\\s　]|[がはも](?![${HR}])|$)`);
const FOREIGN_RE = new RegExp(`^([${KT}]{1,6}(?:・[${KT}]{1,8}){1,2})(?=[、「“\\s　]|[がはも](?![${HR}])|$)`);
const SPEAKER_RE = new RegExp(`^([${KJ}]{2,4}[${NAME_END}])(?=[「“][^」”]*[${HR}][^」”]*[」”])`);
const SAYS_RE = new RegExp(`^((?:${SAYS})|[${NAME_CH}]{1,8}(?:${SAYS_END}))(?=[「“][^」”]*[${HR}][^」”]*[」”])`);
function personAt(s, noSays) {
  let m = s.match(PERSON_RE);
  if (m && m[2].split(/[＆&×]/).every(n => TITLE_END.test(n) || !NOT_GIVEN.test(n))) return (m[1] ? m[1] + '・' : '') + m[2];
  m = s.match(JOINED_RE);
  if (m && m[1].split(/[＆&×]/).every(n => !NOT_SPEAKER.test(n) && !NOT_GIVEN.test(n))) return m[1];
  m = s.match(FOREIGN_RE);
  if (m && !NOT_SPEAKER.test(m[1])) return m[1];
  m = s.match(SPEAKER_RE);
  if (m && !NOT_SPEAKER.test(m[1])) return m[1];
  m = noSays ? null : s.match(SAYS_RE);
  if (m) return m[1];
  return '';
}
export function whoOf(headline, detail) {
  const s = String(headline || '').replace(/^【[^】]{0,12}】\s*/, '').replace(/\s+/g, ' ').trim();
  if (!s || !/[ぁ-ヿ一-鿿]/.test(s)) return null;
  const len = t => [...t].length;
  const tidy = t => t.replace(/\s+/g, ' ').replace(/^[\s、，,：:・＆&×－―—]+|[\s、，,：:・＆&×－―—]+$/g, '').trim();
  const enough = t => len(t.replace(/[\s「」『』“”、。…！？!?]/g, '')) >= 5;
  /* Two who speak (自民“…” 民改“…”): neither is the one the news is about. */
  const many = (s.match(new RegExp(`(?:^|[\\s　])(?:${SAYS})(?=[「“])`, 'g')) || []).length > 1;
  /* A person where a phrase starts: at the start of the headline, or after a space or a dash. (Not after
     a comma: there a name is one of a list.) */
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && !/[\s　―—－]/.test(s[i - 1])) continue;
    const who = personAt(s.slice(i), many);
    if (!who) continue;
    /* The particle after the name goes with it (安住アナに視聴者爆笑: 視聴者爆笑). */
    const rest = s.slice(i + who.length).replace(/^ら/, '').replace(/^[がはもとにをへの](?![ぁ-ゟ])/, '').replace(/^[、\s]+/, '');
    const before = s.slice(0, i).replace(/[\s－―—]+$/, '');
    const what = tidy(before + (before ? ' ' : '') + rest);
    if (enough(what)) return { who, what };
    break;
  }
  /* Whom the news comes from: the last word, after a dash or a space, when it is an office, a court, a survey. */
  const m = s.match(/^(.{6,}?)(?:[―—＝=]\s*|[\s　])([^\s　―—＝=、。「」ぁ-ゟ]{2,12})$/);
  if (m && WHO_SOURCE.test(m[2]) && enough(m[1])) return { who: m[2], what: tidy(m[1]) };
  /* A short headline that names nobody, and the line the post added begins with the name
     (“大トリ宣言”の真相告白 / 佐野晶哉、紅白コメント別パターンの構想も). */
  const d = String(detail || '').replace(/\s+/g, ' ').trim();
  if (d && len(s) <= 16) { const who = personAt(d); if (who && !s.includes(who)) return { who, what: tidy(s) }; }
  return null;
}

/* ---------- the parts of a card ---------- */
const len = t => [...String(t || '')].length;
const NO_START = '、。，．・：；？！ー）」』】〕”’ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々〜…‥%％';
const JA = /[ぁ-ヿ一-鿿]/g;
const jaCount = t => (String(t || '').match(JA) || []).length;
/* Emoji, flags, skin tones and the marks that join them. */
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu;
/* A label a headline starts with: 【速報】, ［独自］, ＼新発売／. */
const LABEL = /^(?:【[^】]{1,14}】|［[^］]{1,14}］|\[[^\]]{1,14}\]|＼[^／]{1,30}／|〈[^〉]{1,8}〉)\s*/;
/* An advertisement is no news. */
const AD = /BuyPR|〈PR〉|【PR】|\[PR\]|＜PR＞|[#＃]PR(?![A-Za-z])|(?:^|\s)PR$|プロモーション|広告/;
export function tidyNews(text) {
  let s = String(text || '').replace(/[─-▟]+/g, ' ').replace(EMOJI, '').replace(/\s+/g, ' ').trim();
  for (let k = 0; k < 3 && LABEL.test(s); k++) s = s.replace(LABEL, '');
  return s.replace(/\s*[:：]\s*[^\s:：]{2,12}(?:新聞|通信|ニュース|オンライン|デジタル)$/, '').replace(/^[\s、，・：:]+|[\s、，・：:]+$/g, '').trim();
}
const PAIRS = [['「', '」'], ['『', '』'], ['（', '）'], ['(', ')'], ['“', '”'], ['【', '】'], ['〈', '〉'], ['《', '》']];
const count = (s, ch) => s.split(ch).length - 1;
/* (Some papers write both quotation marks as ”: an even number of them is balanced.) */
const balanced = s => PAIRS.every(([a, b]) => count(s, a) === count(s, b) || (a === '“' && count(s, a) === 0 && count(s, b) % 2 === 0));
/* A part says something by itself: a few words, brackets that close, no hole where a name was taken out
   (…を挙げた さんが), and it neither starts nor ends on a word that belongs to the words beside it. */
export function partOk(text, role) {
  const s = String(text || '');
  if (!s) return false;
  if (role === 'who') return len(s) >= 2 && len(s) <= 24 && balanced(s) && !/^[、。・＆&×]|[、・＆&×]$/.test(s);
  if (jaCount(s) < 3 || len(s) > 64 || !balanced(s)) return false;
  /* A hole: a name or a word that was a tag in the post and was taken out (死去した さん, 今週の は). */
  if (/(?:^|[\s、，])(?:さん|氏|容疑者|被告|選手|監督|さま)(?=[がはものにと、]|$)/.test(s) || /[ぁ-ゟ]\s[はがをにもの](?=[一-鿿゠-ヿ])/.test(s)) return false;
  if (/^[をにがはでとへものや、。・，．）」』】〕ー〜]/.test(s)) return false;
  /* (A headline may end on へ, に, も: 打ち上げへ, 400円に, ルーらも.) */
  if (/[をがはでとやの、，・＆&×（「『【“〈]$/.test(s)) return false;
  if (/[をにがはでとへもやの]…$|[をにがはでとへもやの]\.\.\.$/.test(s)) return false;
  /* (The news is held to the same lists as when it was collected, cruel and personal: the list of insults
     would take 宇宙ゴミ, space debris, for one.) */
  if (cruel(s) || personal(s)) return false;
  return true;
}
/* Mend what can be mended: a tail cut off in mid-phrase (…新春公演への…) goes back to the last place
   the sentence turns; a bracket left open at the end is closed off by leaving out what it opened. */
export function fixPart(text) {
  let s = tidyNews(text);
  if (!s) return '';
  const cutBack = t => {
    const c = [...t];
    for (let i = c.length - 1; i >= 6; i--) {
      if (!/[\s　、。！？!?」』）)】]/.test(c[i - 1])) continue;
      const kept = c.slice(0, i).join('').replace(/[\s　、]+$/, '').trim();
      if (kept && balanced(kept) && !/[をにがはでとへもやの]$/.test(kept)) return kept;
    }
    return t;
  };
  /* (A long line that ends in dots was cut off by the paper or by an older collector: 打ち上…) */
  if (/[をにがはでとへもやの](?:…|\.\.\.)$/.test(s) || (len(s) >= 40 && /[^…。！？!?」』）)](?:…|\.\.\.)$/.test(s))) s = cutBack(s.replace(/(?:…|\.\.\.)$/, ''));
  if (!balanced(s)) {
    const open = s.search(/[「『（(“【〈《][^「『（(“【〈《]*$/);
    if (open >= 6) s = s.slice(0, open).replace(/[\s、]+$/, '').trim();
  }
  return s;
}
/* A headline in two parts, cut where its sentence turns, as near the middle as such a place is found. */
export function cutJa(text) {
  const s = tidyNews(text);
  const c = [...s];
  const n = c.length;
  if (n < 16) return [s, ''];
  const least = Math.max(5, Math.floor(n * 0.28));
  const OPEN = '「『（(【〔', CLOSE = '」』）)】〕';
  const kind = ch => (/[ぁ-ゟ]/.test(ch) ? 'h' : /[゠-ヿ]/.test(ch) ? 'k' : /[一-鿿々]/.test(ch) ? 'j' : /[0-9A-Za-z０-９Ａ-Ｚａ-ｚ.,%％]/.test(ch) ? 'a' : 'o');
  let depth = 0;
  let best = null;
  for (let i = 1; i < n; i++) {
    const prev = c[i - 1], next = c[i];
    if (OPEN.includes(prev)) depth++;
    if (CLOSE.includes(prev)) depth = Math.max(0, depth - 1);
    if (i < least || n - i < least || next === ' ') continue;
    let gain = -1;
    if (prev === ' ') gain = kind(c[i - 2] || '') === 'a' && kind(next) === 'a' ? -1 : 10;
    else if ('。！？!?'.includes(prev)) gain = 10;
    else if ('、，'.includes(prev)) gain = 8;
    else if ('…‥'.includes(prev)) gain = 9;
    else if ('―－–—／'.includes(prev)) gain = 7;
    else if (CLOSE.includes(prev) && !NO_START.includes(next) && kind(next) !== 'h') gain = 6;
    else if (OPEN.includes(next) && !OPEN.includes(prev)) gain = 6;
    else if (/[はがをにでとへも]/.test(prev) && kind(next) !== 'h' && !NO_START.includes(next)) gain = 3;
    else if (kind(prev) === 'h' && kind(next) !== 'h' && !NO_START.includes(next)) gain = 1;
    if (gain < 0) continue;
    if (depth > 0 && !OPEN.includes(next)) gain -= 6;
    const off = Math.abs(i - n / 2) / n;
    const score = gain * 10 - off * off * 400;
    if (!best || score > best.score) best = { score, i, gain };
  }
  if (!best || best.gain < 1) return [s, ''];
  const a = c.slice(0, best.i).join('').replace(/[\s、，―－–—／]+$/, '').trim();
  const b = c.slice(best.i).join('').replace(/^[\s、，。―－–—／]+/, '').trim();
  return a && b ? [a, b] : [s, ''];
}
/* A long line ends where its sentence turns, before the limit. */
function shorten(text, limit) {
  const c = [...String(text || '')];
  if (c.length <= limit) return c.join('');
  for (let i = limit; i >= Math.floor(limit / 2); i--) {
    if (!(/[\s　、。！？!?」』）)】]/.test(c[i - 1]) || /[「『（(【]/.test(c[i] || ''))) continue;
    const kept = c.slice(0, i).join('').replace(/[\s　、]+$/, '').trim();
    if (kept && balanced(kept)) return kept;
  }
  return '';
}
/* The word a card opens on (its first beat, large): the longest katakana word of what happened, else its
   first kanji word. */
const PLAIN_WORD = /^(?:今日|明日|昨日|今週|来週|先週|今月|来月|今年|来年|昨年|午前|午後|前年|年間|以上|以下|一部|全国|最新|速報|特集|発表|決定|開始|公開|情報|話題|注目|人気|今回|今後|最大|最高|最低|初めて)$/;
export function keyword(text) {
  const t = String(text || '').replace(/【[^】]*】|「[^」]*」/g, m => (len(m) > 12 ? ' ' : m));
  /* The words as the dictionary divides them: a katakana word of three letters or more, else the first
     word in kanji that is no date, number or plain word (１０月消費者物価: 消費者, not 月消費者). */
  let words = [];
  try { words = [...new Intl.Segmenter('ja', { granularity: 'word' }).segment(t)].filter(x => x.isWordLike).map(x => x.segment); } catch (e) { words = []; }
  const kata = words.filter(w => /^[゠-ヿ]{3,10}$/.test(w)).sort((a, b) => len(b) - len(a))[0];
  if (kata) return kata.slice(0, 8);
  const kanji = words.find(w => /^[一-鿿々]{2,6}$/.test(w) && !PLAIN_WORD.test(w));
  if (kanji) return kanji;
  const katas = t.match(/[゠-ヿ]{2,8}/g) || [];
  if (katas.length) return katas.sort((a, b) => len(b) - len(a))[0].slice(0, 8);
  const run = t.match(/(?<![0-9０-９])[一-鿿]{2,4}/);
  if (run) return run[0];
  const kana = t.match(/[ぁ-ゟ]{2,6}/);
  if (kana) return kana[0];
  /* Nothing outside the quotation marks: a word from inside them. */
  return t === String(text || '') ? 'NEWS' : keyword(String(text || '').replace(/[「」【】]/g, ' '));
}
/* The line a post adds to its headline, unless it only says the headline again. */
function extra(t, d) {
  if (!d) return '';
  const bare = x => String(x || '').replace(/【[^】]*】/g, '').replace(/[\s、。，．・「」『』（）()！!？?…]/g, '');
  const a = bare(t), b = bare(d);
  return !b || a.includes(b) || b.includes(a) || a.slice(0, 12) === b.slice(0, 12) ? '' : d;
}

/* ---------- News ---------- */
/* x: a headline as news.mjs keeps it ({ id, h, n, t, d, g, at, q }). The card, or null. */
export function newsCard(x) {
  if (!x || !x.id || !x.t || AD.test(String(x.t) + ' ' + String(x.d || ''))) return null;
  const t = fixPart(x.t);
  const d = fixPart(extra(t, tidyNews(x.d || '')));
  if (!t) return null;
  /* The whole headline, when it is short enough for one beat (a long one ends where it turns). */
  const whole = len(t) <= 44 ? t : '';
  const tries = [];
  const w = whoOf(t, d);
  if (w) {
    let what = fixPart(w.what);
    /* Of a long headline, what happened is its first part. */
    if (len(what) > 34) { const c = cutJa(what); if (c[1] && len(c[0]) >= 8) what = fixPart(c[0]); }
    tries.push(['who', what, w.who]);
  }
  const cut = cutJa(t);
  const two = cut[1] ? ['cut', fixPart(cut[0]), fixPart(cut[1])] : null;
  /* A short headline and the line its post added say more than the headline cut in two. */
  if (d && len(t) <= 24) tries.push(['more', whole, d]);
  if (two) tries.push(two);
  if (d) tries.push(['more', whole, d]);
  const paper = String(x.n || '').replace(EMOJI, '').trim();
  if (paper && paper !== 'X') tries.push(['paper', whole, paper]);
  for (const [how, a, b] of tries) {
    if (!partOk(a, 'what') || !partOk(b, how === 'who' || how === 'paper' ? 'who' : 'what')) continue;
    if (a === b || a.includes(b) && how !== 'who') continue;
    return { id: String(x.id), h: x.h, n: x.n || '', g: x.g || '', at: x.at || x.found || '', kw: keyword(a) === 'NEWS' && how === 'who' ? keyword(b) : keyword(a), ja: [a, b], how, ...(x.q ? { q: 1 } : {}) };
  }
  return null;
}

/* ---------- Reply News ---------- */
const tidyTalk = t => String(t || '').replace(/^(?:\s*[@＠][A-Za-z0-9_]+)+/, '').replace(/https?:\/\/\S+/g, ' ').replace(/[\u2500-\u259f]+/g, ' ').replace(/\s+/g, ' ').trim();
/* Greetings, and words said with love: the centre of the page. */
export const GREET = /おはよ[うー〜ぉっんー]*|おはおは|おっはー|おやすみ(?:なさい|ん)?|おやす[ーみ]|おやぴ|ねんね|おかえり(?:なさい)?|ただいま|ただまー|いってらっしゃい|いってきます|いてら[ーっ〜]?|お疲れさま|おつかれさま|おつかれ|お疲れ|こんばんは|こんにちは|good ?morning|good ?night|night night|sweet dreams|welcome (?:home|back)/i;
export const LOVE = /大好き|だいすき|だいしゅき|すきすき|好きだよ|すきだよ|好き|すき|しゅき|愛してる|あいしてる|会いたい|あいたい|ぎゅー*|ちゅー*|なでなで|よしよし|かわいい|可愛い|かわゆ|かっこいい|嬉しい|うれしい|ありがと[うー〜]*|♡|❤|💕|🥰|😘|love you|miss you|\bbabe\b/i;
/* The part of a message the card opens on: its greeting, else its loving word, else its first phrase,
   else its keyword. Letters only (no emoji, no faces), ten at most. */
export function excerptOf(text) {
  const plain = String(text || '').replace(EMOJI, ' ').replace(/[^ぁ-ヿ一-鿿々A-Za-z0-9ー〜！？!?♡、。\s]+/g, ' ').replace(/\s+/g, ' ').trim();
  const grab = re => { const m = plain.match(re); return m ? (m[0] + (plain.slice(m.index + m[0].length).match(/^[ー〜！!♡]{1,2}/) || [''])[0]).trim() : ''; };
  /* (Not a loving word said the other way: 好きではなかった, かわいくない.) */
  let x = grab(GREET) || grab(/(?:大好き|だいすき|だいしゅき|すきすき|好きだよ|すきだよ|愛してる|あいしてる|会いたい|あいたい|ぎゅー+|ちゅー+|なでなで|よしよし|かわいい|可愛い|かっこいい|嬉しい|うれしい|好き|すき|しゅき)(?!では|じゃ|じゃな|くな|にな[れら]な)/);
  if (!x) x = (plain.split(/[。、！？!?\s]+/).find(p => len(p) >= 2) || '').trim();
  /* A long first phrase: its first words, as the dictionary divides them, up to nine letters (痩せても落ちない),
     not a piece cut out of a word (せても). */
  if (len(x) > 10) {
    let words = [];
    try { words = [...new Intl.Segmenter('ja', { granularity: 'word' }).segment(x)].map(w => w.segment); } catch (e) { words = []; }
    let out = '';
    for (const w of words) { if (len(out + w) > 9) break; out += w; }
    x = len(out.trim()) >= 2 ? out.trim() : keyword(x);
  }
  return [...(x || keyword(plain) || '')].slice(0, 10).join('');
}
/* A conversation: its messages in order, each a card { i (the post's number), h (who wrote it), to (whom
   it answers), ja: [the part, the whole] }. gl: 2 for a greeting said with love, 1 for either, 0 for
   neither. Null when a message may not play. */
export function talkCards(s) {
  if (!s || !s.id || !s.a || !s.b) return null;
  const msgs = Array.isArray(s.t) && s.t.length > 2 ? s.t.map(m => ({ h: m.h, x: m.x, i: m.i })) : [{ h: s.a.handle, x: s.a.text, i: s.a.id }, { h: s.b.handle, x: s.b.text, i: s.b.id }];
  const m = [];
  for (const [k, x] of msgs.entries()) {
    const full = tidyTalk(x.x);
    if (!full || slander(full) || cruel(full) || alcohol(full)) return null;
    m.push({ i: String(x.i || ''), h: x.h, ...(k ? { to: msgs[k - 1].h } : {}), ja: [excerptOf(full), full] });
  }
  if (m.length < 2 || m[0].h === m[1].h) return null;
  const all = m.map(x => x.ja[1]).join(' ');
  const greet = GREET.test(all), love = LOVE.test(all);
  return { i: String(s.id), k: s.kind || '', at: s.at || s.found || '', s: Number(s.score) || 0, gl: greet && love ? 2 : greet || love ? 1 : 0, m };
}
/* A reply to an account a reader asked for: the reply alone (the account's own post would read like
   News), the part and the whole. on: the account's headline, for News. */
export function replyCard(x, post) {
  if (!x || !x.id || !post) return null;
  const r = tidyTalk(x.t);
  if (!r || slander(r) || cruel(r) || alcohol(r)) return null;
  const on = fixPart(len(post.t) > 30 ? shorten(tidyNews(post.t), 30) || tidyNews(post.t) : tidyNews(post.t));
  return { id: String(x.id), ask: post.h, at: x.at || '', a: { h: post.h, i: String(x.n) }, b: { h: x.h, i: String(x.id) }, kw: excerptOf(r), ja: [excerptOf(r), r], on };
}
