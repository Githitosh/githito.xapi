#!/usr/bin/env node
/* githito.xapi: what people reply to the news on X, collected ahead of time.

   The News page (githitosh.github.io/news-shorts/) plays replies: each card is one reply, and under it
   the card says which news the reply is about. Searching X for that when Update is pressed takes too
   long, so this program does it three times a day and writes one file, v1/news-<lang>.json, that the
   page only reads.

     node news.mjs                   build once into ./public (Japanese)
     node news.mjs --searches 40     fewer searches (160 unless told)
     node news.mjs --dry             print the counts, write nothing
     node news.mjs --no-search       search nothing: judge the saved replies again and drop the old ones

   How:
     1. Searches of replies written to news accounts ("to:nhk_news"), each over a few hours of the
        last day and a half. A search gives about 20 replies.
     2. A reply may play when it is short, says something, and attacks nobody: no insults, no blame,
        nothing violent, sexual or heavy, no advertising.
     3. The post each reply answers is read once (many replies answer the same post). It must be the
        news account's own post, and the news must not be about a death, a crime, an accident, a
        disaster or a war: jokes under such news are not for a video.
     4. The file keeps up to 2000 replies for 48 hours, at most a few for one piece of news.
   Settings are in config.json under "news"; "on": false turns it off. Node 20 or newer; no packages. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stamp, readJson, charLen, cleanText, genreOf } from './rules.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = name => args.includes('--' + name);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
let FILE = {};
try { FILE = (JSON.parse(await readFile(path.join(HERE, 'config.json'), 'utf8')).news) || {}; } catch (e) {}
const num = (name, d) => { const v = Number(opt(name, FILE[name])); return Number.isFinite(v) && v > 0 ? v : d; };
const CONF = {
  on: FILE.on !== false,
  langs: (Array.isArray(FILE.langs) ? FILE.langs : ['ja']).filter(l => l === 'ja'),
  out: path.resolve(opt('out', path.join(HERE, 'public'))),
  searches: num('searches', 160), // searches one run may make (about 20 replies each)
  parents: num('parents', 500),   // news posts read in one run
  keep: num('keep', 2000),        // replies the file holds
  perNews: num('perNews', 8),     // replies kept for one piece of news
  hours: num('hours', 48),        // a reply leaves the file after this many hours
  window: num('window', 4),       // hours one search covers
  back: num('back', 36),          // how many hours back the searches reach
  pause: num('pause', 4000),      // milliseconds between two searches
  rest: num('rest', 90000),       // milliseconds to rest when a search is refused
  patience: num('patience', 4),   // refusals in a row before a run stops searching
  dry: flag('dry'),
  noSearch: flag('no-search') || process.env.XAPI_NO_SEARCH === '1',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shuffle = list => list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
let WORDS = { genres: [] };
try { WORDS = JSON.parse(await readFile(path.join(HERE, 'words.json'), 'utf8')); } catch (e) {}

/* ---------- whose news ---------- */
/* The account, the name the page shows, the genre of its news when the words do not say, and its share
   of the searches. An account that never gives a reply is left out after three tries. */
const ACCOUNTS = {
  ja: [
    ['livedoornews', 'ライブドアニュース', '', 6],
    ['YahooNewsTopics', 'Yahoo!ニュース', '', 5],
    ['oricon', 'オリコンニュース', 'entertainment', 6],
    ['modelpress', 'モデルプレス', 'entertainment', 6],
    ['natalie_mu', '音楽ナタリー', 'entertainment', 3],
    ['eiga_natalie', '映画ナタリー', 'entertainment', 2],
    ['owarai_natalie', 'お笑いナタリー', 'entertainment', 2],
    ['comic_natalie', 'コミックナタリー', 'culture', 2],
    ['cinematoday', 'シネマトゥデイ', 'entertainment', 3],
    ['mantanweb', 'MANTANWEB', 'entertainment', 3],
    ['crank_in_net', 'クランクイン！', 'entertainment', 2],
    ['thetvjp', 'ザテレビジョン', 'entertainment', 2],
    ['realsoundjp', 'リアルサウンド', 'entertainment', 1],
    ['encountofficial', 'ENCOUNT', 'entertainment', 1],
    ['AnimeAnime_jp', 'アニメ！アニメ！', 'entertainment', 1],
    ['famitsu', 'ファミ通', 'entertainment', 2],
    ['4GamerNews', '4Gamer', 'entertainment', 1],
    ['dengekionline', '電撃オンライン', 'entertainment', 1],
    ['nikkansports', '日刊スポーツ', 'sports', 5],
    ['SportsHochi', 'スポーツ報知', 'sports', 5],
    ['sponichiannex', 'スポニチ', 'sports', 5],
    ['Daily_Online', 'デイリースポーツ', 'sports', 4],
    ['sanspocom', 'サンスポ', 'sports', 3],
    ['Fullcountc2', 'Full-Count', 'sports', 3],
    ['baseballkingjp', 'BASEBALL KING', 'sports', 2],
    ['SoccerKingJP', 'サッカーキング', 'sports', 2],
    ['gekisaka', 'ゲキサカ', 'sports', 1],
    ['sportsnavi', 'スポーツナビ', 'sports', 2],
    ['theanswerc2', 'THE ANSWER', 'sports', 1],
    ['numberweb', 'Number', 'sports', 1],
    ['itm_nlab', 'ねとらぼ', 'culture', 4],
    ['grapeejp', 'grape', 'culture', 2],
    ['maidonanews', 'まいどなニュース', 'culture', 2],
    ['jtown_net', 'Jタウンネット', 'local', 1],
    ['withnewsjp', 'withnews', 'culture', 1],
    ['BuzzFeedJapan', 'BuzzFeed Japan', 'culture', 1],
    ['HuffPostJapan', 'ハフポスト', '', 1],
    ['KAI_YOU_ed', 'KAI-YOU', 'culture', 1],
    ['dailyportalz', 'デイリーポータルZ', 'culture', 1],
    ['karapaia', 'カラパイア', 'science', 1],
    ['fashionpressnet', 'ファッションプレス', 'culture', 3],
    ['rocketnews24', 'ロケットニュース24', 'food', 3],
    ['macaroni_news', 'macaroni', 'food', 1],
    ['gnavi', 'ぐるなび', 'restaurant', 1],
    ['walkerplus_news', 'ウォーカープラス', 'local', 1],
    ['itmedia_news', 'ITmedia NEWS', 'science', 3],
    ['gigazine', 'GIGAZINE', 'science', 2],
    ['wired_jp', 'WIRED', 'science', 1],
    ['NazologyInfo', 'ナゾロジー', 'science', 1],
    ['NatGeoMagJP', 'ナショナル ジオグラフィック', 'science', 1],
    ['sorae_jp', 'sorae', 'space', 2],
    ['AstroArts', 'アストロアーツ', 'space', 1],
    ['JAXA_jp', 'JAXA', 'space', 1],
    ['wni_jp', 'ウェザーニュース', 'local', 3],
    ['tenkijp', 'tenki.jp', 'local', 2],
    ['nhk_news', 'NHKニュース', '', 3],
    ['tbsnewsdig', 'TBS NEWS DIG', '', 2],
    ['news24ntv', '日テレNEWS', '', 2],
    ['FNN_News', 'FNNプライムオンライン', '', 2],
    ['tv_asahi_news', 'テレ朝news', '', 2],
    ['asahi', '朝日新聞', '', 1],
    ['mainichi', '毎日新聞', '', 1],
    ['Yomiuri_Online', '読売新聞', '', 2],
    ['nikkei', '日本経済新聞', '', 2],
    ['Sankei_news', '産経ニュース', '', 1],
    ['kyodo_official', '共同通信', '', 1],
    ['jijicom', '時事通信', '', 1],
    ['47news_official', '47NEWS', '', 1],
    ['entabejp', 'えん食べ', 'food', 1],
  ],
};
const GENRES = ['space', 'politics', 'science', 'culture', 'local', 'entertainment', 'safety', 'sports', 'food', 'restaurant'];

/* ---------- what may play ---------- */
/* A reply that attacks or blames somebody is not for a video with that person's name under it. */
const NASTY = /辞めろ|やめろ|辞任|辞職|罷免|解散しろ|責任(?:を)?取|税金|増税|マスゴミ|偏向|工作員|スパイ|国賊|帰れ|出て[いけ行]け|追放|逮捕|死刑|極刑|天罰|ざま[あぁ]|自業自得|いい気味|許さ[なん]|許せ[なん]|ふざけ|最悪|最低|ゴミ|クソ|くそ|糞|オワコン|終わって[るん]|狂って|異常|嫌い|きらい|うんざり|不快|むかつ|ムカつ|腹立|腹が立|ひど[いすく]|酷[いすく]|恥ずかし|情けな|いらない|要らない|不要|邪魔|迷惑|害悪|有害|詐欺|犯罪|違法|炎上|叩[かきくけ]|批判|非難|抗議|謝罪|謝れ|訴え|裁判|賠償|利権|癒着|忖度|闇|黒幕|陰謀|洗脳|デマ|フェイク|嘘|ウソ|うそ|信用でき|信じられ[なん]|がっかり|失望|残念な[人奴]|見損な|呆れ|あきれ|バカに|馬鹿に|笑えない|胸糞|地獄|絶望|終わり[だで]|日本終|国が終/;
/* Groups of people named in anger are left out whatever the rest says. */
const GROUPS = /中国人|韓国人|朝鮮人|外国人|移民|難民|在日|日本人じゃ|女さん|まんさん|男さん|フェミ|老人|高齢者は|若者は|ゆとり|氷河期|生活保護|ナマポ|宗教|信者|創価|統一教会|共産|自民|立憲|維新|公明|れいわ|参政|国民民主|保守党|与党|野党|総理|首相|大臣|議員|知事|市長|政権|政府|官僚|財務省|天皇|皇室/;
/* Unkind about somebody: tired of them, telling them off, judging how they look or what they can do. */
const UNKIND = /飽き|卒業し[てろ]|使う[所とこ]|マシ|しょ[ーう]もな|つまら[なん]|いらん|ダメ|だめ|駄目|下手|ヘタ|微妙|キツ[いイ]|きつい|痛々|誰[？?]|誰やねん|誰だよ|知らん|興味[なね]|どうでも|劣化|老け|太っ[たて]|痩せ[ろた]|整形|顔バレ|ないのか|舐め|なめられ|おかしい|キチンと|ちゃんと(?:しろ|して|やれ|せ)|しろ[！!。]|しろよ|やれよ|すべき|べき[だで]|ありえ|あり得|イヤ|いやだ|嫌だ|無理|ムリ|頭[がの](?:悪|おか|弱)|レベル[がの]低|程度[がの]低|民度|境界知能|知能|底辺|貧乏|貧困|乞食|キモ|きも|ウザ|うざ|消え[ろて]|黙[れっ]|うるせ|うるさ|調子に乗|勘違い|自慢|あざと|媚び|ステマ|ゴリ押し|ごり押し|枕|コネ|七光り|干され|落ち目|オワ|需要[がな]|誰得|不細工|ブサ|デブ|ハゲ|ババ|ジジ|おばさん|おじさん|年増|若作り|痛い[人奴女男]|やらかし|前科|黒歴史|嘘くさ|胡散臭|うさんくさ|怪し|あやし|信者|アンチ|叩き|晒|通報|ブロック|訴|こいつ|コイツ|あいつ|アイツ|そいつ|この人|あの人|この女|この男|奴[はがらに]|やつ[はがら]|起こすな|すんな|するな[よ。！!]?$|印象操作|騒動|スキャンダル|不倫|熱愛|文春|暴露|拒否反応|問題児|お騒がせ/;
const SPAM = /フォロー|拡散|リポスト|\bRT\b|プロフ|固ツイ|\bDM\b|ＤＭ|LINE|副業|稼[げぎ]|儲[けか]|投資|仮想通貨|ビットコイン|\bNFT\b|当選|プレゼント|キャンペーン|応募|無料|クーポン|ポイ活|案件|宣伝|予約|販売|通販|出会い|裏垢|配信中|見に来て|チャンネル登録|@grok|grok/i;
/* Nothing that says how old somebody is, and no one whose profile says they are under age. */
const MINOR_BIO = /(?:^|[^0-9])1[0-7]\s*(?:歳|才|y\/?o\b|years? old)|高[1-3１-３一二三](?:$|[^0-9０-９])|中[1-3１-３一二三](?:$|[^0-9０-９])|高校|中学|小学|学生|ＪＫ|ＪＣ|[LSF]?JK|\bJC\b|\bDK\b|\bminor\b|\bunder ?18\b|\bteen\b/i;
const BOT_BIO = /\bbot\b|ボット|自動|公式|official|株式会社|広報|事務局|運営/i;
/* Saying nothing: one word of agreement, a laugh alone, a greeting. */
const EMPTY = /^(?:草+|笑+|w+|ｗ+|へ[ぇえー〜]+|ほ[ぉおー〜]+|なるほど|そうなん(?:だ|ですね)?|すごい|凄い|おお+|えっ*|まじ(?:か)?|マジ(?:か)?|うん|はい|おめでとう(?:ございます)?|ありがとう(?:ございます)?|おはよう(?:ございます)?|こんにちは|こんばんは|おやすみ(?:なさい)?|お疲れ様(?:です)?)[!！?？。、〜ー…\s\p{Extended_Pictographic}️‍]*$/u;
/* News a light reply should not sit under: deaths, crimes, accidents, disasters, wars, illness. */
const GRAVE = /逮捕|容疑|送検|起訴|被告|判決|懲役|実刑|有罪|無罪|裁判|提訴|詐欺|窃盗|横領|わいせつ|盗撮|痴漢|不同意|性的|性被害|性加害|暴力|傷害|脅迫|ストーカー|ＤＶ|\bDV\b|ハラスメント|セクハラ|パワハラ|不祥事|戦争|戦闘|空爆|爆撃|ミサイル|攻撃(?!陣|力|的)|侵攻|停戦|テロ|爆発|発砲|銃撃|拉致|人質|行方不明|不明者|被害|被災|犠牲|負傷|重体|重傷|軽傷|ケガ|怪我|搬送|救急|意識不明|心肺停止|倒壊|土砂|浸水|氾濫|噴火|避難|警報|特別警報|台風|豪雨|大雪|遭難|墜落|衝突|脱線|転落|溺|襲われ|襲撃|クマに|熊に|感染|コロナ|インフル|ウイルス|がん(?!ば|が|ら|こ)|(?<![ァ-ヶー])ガン(?![ァ-ヶー])|難病|障害|障がい|認知症|介護|貧困|倒産|破産|解雇|リストラ|訃報|死去|逝去|急逝|葬儀|告別式|追悼|慰霊|原爆|被爆|震災|原発|放射|汚染|差別|ヘイト|中傷|誹謗|いじめ|虐待|自殺|自死|薬物|大麻|覚醒剤|麻薬|飲酒運転|ひき逃げ|あおり運転|火事|出火|全焼|漏えい|漏洩|流出|不正アクセス|炎上|謝罪|辞任|辞職|更迭|疑惑|不正|汚職|裏金|賄賂|違反|処分|懲戒|停職|活動休止|休養|離婚|不倫|破局|騒動|スキャンダル|熱愛|密会|文春|週刊誌|暴露|告発|降板|契約解除|解雇|書類/;
/* News of politics, government, other countries' affairs and the Imperial family: what is written under
   it is argument about people, which is not for this page. Such news plays as headlines, not as replies. */
const STATE = /首相|総理|大臣|官房|内閣|政府|政権|与党|野党|自民|立憲|維新|公明|共産党|国民民主|れいわ|参政党|保守党|議員|国会|衆院|参院|選挙|出馬|当選確実|知事|市長|町長|村長|市議|県議|都議|防衛|自衛隊|安保|外交|外相|外務省|財務省|厚労省|文科省|経産省|国交省|総務省|法務省|省庁|審議会|首脳|大統領|習近平|プーチン|トランプ|ゼレンスキー|金正恩|中国|韓国|北朝鮮|ロシア|ウクライナ|イスラエル|ガザ|パレスチナ|イラン|台湾|米政権|米政府|関税|制裁|増税|減税|税制|予算|国債|年金|保険料|生活保護|給付金|補助金|マイナ|移民|難民|外国人|入管|憲法|法案|法改正|条例|最高裁|地裁|高裁|検察|警察|警視庁|県警|皇室|天皇|皇后|愛子さま|悠仁|秋篠宮|佳子さま|眞子|宮内庁|靖国|慰安婦|徴用工|領土|尖閣|竹島|核兵器|デモ|陰謀論|都市伝説|宗教|教会|創価|LGBT|ジェンダー|同性婚|夫婦別姓|ハラール|モスク|クルド|(?<![甘辛])党|総裁|幹事長|政界|政治|政策|公約|世論調査|支持率|閣僚|閣議|答弁|国家|官邸|内閣府|デジタル庁|こども家庭庁|金融庁|消費者庁|警察庁|検察庁|防衛省|新税|課税|税収|国政|都政|県政|市政|国連|NATO|G7|G20|APEC|サミット|会談|大使|領事|戦闘機|空母|基地問題|高市|石破|岸田|安倍|小沢一郎|山本太郎|神谷宗幣|百田|立花孝志|米中|日中|日米|日韓|日ロ|中ロ|米ロ|欧米|地政学|覇権|情勢|同盟|軍事|国防|有事|侵略|戦後|戦時|植民地|歴史認識|教科書問題|愛国|右傾|左傾|リベラル|保守派|ワクチン|反ワク|長官|厚生|不法投棄|不法|違法/;
const squash = text => String(text || '').toLowerCase().replace(/[\s　"'“”‘’「」『』（）()\[\]【】、。，．,.!?！？…・:：;；\-–—~〜ｗw]+/g, '');
/* A post's own words: no links, no names it answers at the start, no tags. */
const postText = st => String((st && st.text) || '').replace(/https?:\/\/\S+/g, ' ').replace(/^(?:\s*@\w+)+/, ' ').replace(/[#＃][^\s#＃]+/g, ' ').replace(/\s+/g, ' ').trim();
const handleOf = st => String((st && st.author && st.author.screen_name) || '').replace(/^@+/, '');
const statusId = st => { const m = String((st && st.url) || '').match(/status(?:es)?\/(\d+)/); return (st && st.id && /^\d+$/.test(String(st.id)) ? String(st.id) : '') || (m ? m[1] : ''); };
const whenOf = st => { const t = st && (st.created_timestamp ? st.created_timestamp * 1000 : Date.parse(st.created_at || '')); return Number.isFinite(t) && t > 0 ? new Date(t).toISOString().replace(/\.\d+Z$/, 'Z') : ''; };
function parentOf(st) {
  const rt = st && st.replying_to;
  const id = (rt && typeof rt === 'object' && (rt.status || rt.post || rt.status_id || rt.id)) || (st && (st.replying_to_status || st.in_reply_to_status_id_str || st.in_reply_to_status_id)) || '';
  const who = (rt && typeof rt === 'object' && (rt.screen_name || rt.username)) || (typeof rt === 'string' ? rt : '') || '';
  return { id: /^\d+$/.test(String(id)) ? String(id) : '', who: String(who).replace(/^@+/, '') };
}
/* The words of a reply, when it may play; '' when it may not. */
function replyOk(text) {
  const n = charLen(text);
  if (!text || n < 5 || n > 42) return false;
  if ((text.match(/[぀-ヿ]/g) || []).length < 2) return false;
  if (/@\w/.test(text) || /[ｦ-ﾟ]{3,}/.test(text) || /(.)\1{5,}/u.test(text)) return false;
  return cleanText(text) && !NASTY.test(text) && !UNKIND.test(text) && !GROUPS.test(text) && !SPAM.test(text) && !EMPTY.test(text) && !GRAVE.test(text) && !STATE.test(text);
}
function replyText(st) {
  const text = postText(st);
  const a = (st && st.author) || {};
  const bio = String(a.description || a.bio || '') + ' ' + String(a.name || '');
  if (!replyOk(text)) return '';
  if (MINOR_BIO.test(bio) || BOT_BIO.test(bio) || a.protected || st.possibly_sensitive) return '';
  return text;
}
/* How much a reply says: short, lively ones first. */
function replyScore(text, st) {
  const n = charLen(text);
  let s = 0;
  if (n >= 8 && n <= 36) s += 4; else if (n > 48) s -= 2;
  if (/笑|[wｗ]{1,3}$|草|😂|🤣|😆|😅|[！!？?]{2,}|〜|～/u.test(text)) s += 2;
  if (/[？?]/.test(text)) s += 1;
  if (/かわいい|可愛い|すごい|凄い|最高|うれしい|嬉しい|楽しみ|食べたい|行きたい|欲しい|ほしい|好き|おめでと|ありがと|がんばれ|頑張れ|応援/.test(text)) s += 2;
  const likes = Number(st && (st.likes ?? st.favorite_count)) || 0;
  s += Math.min(6, Math.log2(likes + 1) * 1.5);
  return Math.round((s + Math.random() * 2) * 10) / 10;
}
/* A bracket that is opened and not closed: the line goes on. */
const openBracket = t => ['「」', '『』', '【】', '（）', '()', '“”'].some(([a, b]) => String(t).split(a).length > String(t).split(b).length);
/* What the news is, in one line: the post's first line without links and tags, cut to fit a card. */
export function headlineOf(raw) {
  const t = String(raw || '').replace(/https?:\/\/\S+/g, ' ').replace(/[#＃][^\s#＃]+/g, ' ').replace(/[ \t　]+/g, ' ');
  const lines = t.split(/\n+/).map(s => s.trim()).filter(Boolean);
  let h = lines[0] || '';
  const open = openBracket;
  for (let k = 1; k < lines.length && (charLen(h) < 12 || (open(h) && charLen(h) < 40)); k++) h += (open(h) ? '' : ' ') + lines[k];
  if (charLen(h) > 44) { const m = h.match(/^(.{12,48}?[。！？!?])/u); if (m) h = m[1]; }
  h = h.replace(/^(?:【(?:ヤフートピックス|Yahoo!ニュース|ニュース|記事)】)\s*/, '').replace(/[。、\s]+$/, '').trim().replace(/^【([^【】]+)】$/, '$1');
  const chars = [...h];
  return chars.length > 46 ? chars.slice(0, 45).join('') + '…' : h;
}
function newsOk(text, headline) {
  if (!headline || charLen(headline) < 8 || (openBracket(headline) && !/…$/.test(headline))) return false;
  if ((headline.match(/[぀-ヿ一-鿿]/g) || []).length < 4) return false;
  return cleanText(text) && !GRAVE.test(text) && !STATE.test(text) && !SPAM.test(headline);
}

/* The genre: the account's own when it has one; otherwise the genre the news names with one of its main words. */
const SPORTS_WORD = /野球|サッカー|相撲|力士|場所|ゴルフ|テニス|バスケ|バレー|ラグビー|ボクシング|マラソン|駅伝|競馬|騎手|柔道|卓球|水泳|体操|フィギュア|スケート|スキー|陸上|五輪|オリンピック|W杯|ワールドカップ|リーグ|MLB|NPB|[JＪ][1-3１-３]|代表|選手|監督|コーチ|試合|優勝|連勝|連敗|勝利|敗れ|契約更改|年俸|移籍|ドラフト|投手|打者|捕手|本塁打|安打|登板|先発|得点|ゴール|金メダル|阪神|巨人|中日|広島|ヤクルト|DeNA|オリックス|ソフトバンク|ロッテ|楽天|西武|日本ハム|ドジャース|大谷/;
function genreFor(account, text, lang) {
  const g = genreOf(text, lang, WORDS.genres || []);
  const named = g.word && GENRES.includes(g.genre) && g.genre !== 'politics' && g.genre !== 'safety' ? g.genre : '';
  const own = (account && account[2]) || '';
  /* A sports paper also writes about singers and actors: its news is sports when it says so. */
  if (own === 'sports') return SPORTS_WORD.test(text) ? 'sports' : (named && named !== 'sports' ? named : '');
  return own || named;
}
/* A reply that only says the news again says nothing. */
const echoes = (reply, news) => { const r = squash(reply), n = squash(news); return r.length >= 8 && (n.includes(r.slice(0, 10)) || r.includes(n.slice(0, 12))); };

/* ---------- asking ---------- */
let asked = 0;
let readCount = 0;
let viaOther = 0;
class Refused extends Error {}
async function fxJson(url) {
  let res;
  try { res = await fetch(url, { headers: { 'user-agent': 'githito.xapi collector' }, signal: AbortSignal.timeout(25000) }); }
  catch (e) { throw new Refused('no answer'); }
  const data = await res.json().catch(() => null);
  if (res.status !== 200 || (data && data.code && data.code !== 200)) throw new Refused('refused (' + res.status + ')');
  return data;
}
/* Replies written to an account in the hours that start at the given time. */
async function search(handle, lang, start) {
  asked++;
  const q = `to:${handle} filter:replies -filter:links lang:${lang} since_time:${start} until_time:${start + CONF.window * 3600}`;
  const data = await fxJson('https://api.fxtwitter.com/2/search?count=100&q=' + encodeURIComponent(q));
  return (data && data.results) || [];
}
/* A news post: its words, who wrote it, when. FxTwitter first; when it refuses, vxTwitter. */
async function newsPost(handle, id) {
  readCount++;
  try {
    const d = await fxJson('https://api.fxtwitter.com/2/status/' + id);
    const st = d && (d.status || d.tweet);
    if (st && st.text) return { text: String(st.text), handle: handleOf(st) || handle, at: whenOf(st), reply: !!parentOf(st).id };
  } catch (e) {}
  try {
    const res = await fetch(`https://api.vxtwitter.com/${handle}/status/${id}`, { headers: { 'user-agent': 'githito.xapi collector', accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const d = await res.json().catch(() => null);
    if (!d || !d.text) return null;
    viaOther++;
    return { text: String(d.text), handle: d.user_screen_name || handle, at: d.date_epoch ? new Date(d.date_epoch * 1000).toISOString().replace(/\.\d+Z$/, 'Z') : '', reply: !!d.replyingToID };
  } catch (e) { return null; }
}

/* ---------- one language ---------- */
async function build(lang) {
  const file = path.join(CONF.out, 'v1', `news-${lang}.json`);
  const before = await readJson(file, {});
  const oldNews = (before.news && typeof before.news === 'object') ? before.news : {};
  const oldItems = (Array.isArray(before.items) ? before.items : []).filter(x => x && x.id && x.h && x.t && x.n && oldNews[x.n]);
  const tally = (before.accounts && typeof before.accounts === 'object') ? before.accounts : {};
  const accounts = ACCOUNTS[lang] || [];
  const byHandle = new Map(accounts.map(a => [a[0].toLowerCase(), a]));
  const have = new Set(oldItems.map(x => x.id));
  const texts = new Set(oldItems.map(x => squash(x.t).slice(0, 40)));
  const count = { searches: 0, replies: 0, candidates: 0, read: 0, news: 0, items: 0 };

  /* 1. The searches: each account by its share, an account that never answered left out. */
  const alive = accounts.filter(a => { const t = tally[a[0]]; return !(t && t.tries >= 3 && !t.replies); });
  const weight = alive.reduce((s, a) => s + a[3], 0) || 1;
  const now = Math.floor(Date.now() / 1000);
  const plan = [];
  alive.forEach(a => {
    const n = Math.max(1, Math.round(CONF.searches * a[3] / weight));
    for (let i = 0; i < n; i++) plan.push({ a, start: now - CONF.window * 3600 - Math.floor(Math.random() * Math.max(1, CONF.back - CONF.window)) * 3600 });
  });
  const cands = [];
  let refusals = 0;
  for (const p of CONF.noSearch ? [] : shuffle(plan).slice(0, CONF.searches)) {
    const handle = p.a[0];
    let list;
    try { list = await search(handle, lang, p.start); count.searches++; refusals = 0; }
    catch (e) {
      if (!(e instanceof Refused)) throw e;
      if (++refusals >= CONF.patience) { console.log(`  search ${e.message}: stopping with what was found`); break; }
      console.log(`  search ${e.message}: resting`);
      await sleep(CONF.rest);
      continue;
    }
    const t = tally[handle] = tally[handle] || { tries: 0, replies: 0, kept: 0 };
    t.tries++;
    t.replies += list.length;
    count.replies += list.length;
    let got = 0;
    list.forEach(st => {
      const h = handleOf(st);
      const id = statusId(st);
      const parent = parentOf(st);
      if (!h || !id || !parent.id || have.has(id)) return;
      /* The reply answers the news account itself, not somebody else under its post. */
      if (parent.who.toLowerCase() !== handle.toLowerCase() || byHandle.has(h.toLowerCase())) return;
      const text = replyText(st);
      const tk = squash(text).slice(0, 40);
      if (!text || texts.has(tk)) return;
      have.add(id);
      texts.add(tk);
      cands.push({ id, h, t: text, n: parent.id, at: whenOf(st), s: replyScore(text, st), account: p.a });
      got++;
    });
    console.log(`  ${lang} @${handle}: ${list.length} replies, ${got} may play (${cands.length} so far)`);
    await sleep(CONF.pause);
  }
  count.candidates = cands.length;

  /* 2. The news each reply answers, read once. News with the most replies first. */
  const groups = new Map();
  cands.forEach(c => { if (!groups.has(c.n)) groups.set(c.n, []); groups.get(c.n).push(c); });
  const news = {};
  const todo = [...groups.entries()].filter(([id]) => !oldNews[id]).sort((x, y) => y[1].length - x[1].length || (x[0] < y[0] ? 1 : -1)).slice(0, CONF.parents);
  const failed = new Set();
  for (let i = 0; i < todo.length; i += 4) {
    const batch = todo.slice(i, i + 4);
    const posts = await Promise.all(batch.map(([id, list]) => newsPost(list[0].account[0], id)));
    posts.forEach((post, k) => {
      const [id, list] = batch[k];
      const a = list[0].account;
      if (!post) { failed.add(id); return; }
      count.read++;
      /* The account's own post that starts a thread: the news itself. */
      if (post.handle.toLowerCase() !== a[0].toLowerCase() || post.reply) return;
      const headline = headlineOf(post.text);
      if (!newsOk(post.text, headline)) return;
      news[id] = { h: a[0], n: a[1], t: headline, g: genreFor(a, post.text, lang), at: post.at || '', full: post.text };
    });
  }
  count.news = Object.keys(news).length;

  /* 3. The replies whose news may play, the best of each piece of news. */
  const found = [];
  groups.forEach((list, id) => {
    const about = news[id] || oldNews[id];
    if (!about) return;
    const room = CONF.perNews - oldItems.filter(x => x.n === id).length;
    list.filter(c => !echoes(c.t, about.full || about.t)).sort((x, y) => y.s - x.s).slice(0, Math.max(0, room)).forEach(c => {
      found.push({ id: c.id, h: c.h, t: c.t, n: id, at: c.at, s: c.s, found: stamp() });
      const t = tally[c.account[0]]; if (t) t.kept++;
    });
  });
  count.items = found.length;

  /* The file: this run's replies and the earlier ones that are still young and still may play. */
  Object.values(news).forEach(a => { delete a.full; });
  Object.entries(oldNews).forEach(([id, a]) => { const acc = byHandle.get(String(a.h).toLowerCase()); oldNews[id] = { ...a, g: genreFor(acc, a.t, lang) }; });
  const allNews = { ...oldNews, ...news };
  const fresh = x => Date.now() - Date.parse(x.found || 0) < CONF.hours * 3600e3;
  const stillOk = x => replyOk(x.t) && allNews[x.n] && newsOk(allNews[x.n].t, allNews[x.n].t) && !echoes(x.t, allNews[x.n].t);
  const items = found.concat(oldItems.filter(x => fresh(x) && stillOk(x))).slice(0, CONF.keep);
  const usedNews = {};
  items.forEach(x => { usedNews[x.n] = allNews[x.n]; });
  const genres = {};
  const sources = {};
  items.forEach(x => { const a = usedNews[x.n]; genres[a.g || 'other'] = (genres[a.g || 'other'] || 0) + 1; sources[a.n] = (sources[a.n] || 0) + 1; });
  console.log(`  ${lang}: ${count.searches} searches gave ${count.replies} replies; ${count.candidates} may play; ${count.read} news posts read (${failed.size} could not be read), ${count.news} may play; ${count.items} new replies. The file holds ${items.length} replies to ${Object.keys(usedNews).length} pieces of news.`);
  console.log('  by genre: ' + JSON.stringify(genres));
  console.log('  by source: ' + JSON.stringify(sources));
  const quiet = accounts.filter(a => { const t = tally[a[0]]; return t && t.tries >= 3 && !t.replies; }).map(a => a[0]);
  if (quiet.length) console.log('  accounts that gave nothing (left out): ' + quiet.join(', '));
  return { version: 1, lang, updated: stamp(), run: CONF.noSearch ? (before.run || null) : { at: stamp(), ...count }, genres, accounts: tally, news: usedNews, items };
}

async function main() {
  if (!CONF.on) { console.log('Replies to the news are turned off (config.json, "news": { "on": false }).'); return; }
  for (const lang of CONF.langs.length ? CONF.langs : ['ja']) {
    console.log(`Replies to the news, ${lang}`);
    const out = await build(lang);
    console.log(`Asked api.fxtwitter.com for ${asked} searches and ${readCount} posts (${viaOther} of them read through api.vxtwitter.com).`);
    if (CONF.dry) continue;
    const file = path.join(CONF.out, 'v1', `news-${lang}.json`);
    await mkdir(path.dirname(file), { recursive: true });
    const text = JSON.stringify(out);
    let was = '';
    try { was = await readFile(file, 'utf8'); } catch (e) {}
    const same = was && JSON.stringify({ ...JSON.parse(was), updated: '' }) === JSON.stringify({ ...out, updated: '' });
    if (same) { console.log('Nothing changed.'); continue; }
    await writeFile(file, text);
    await writeFile(path.join(CONF.out, '.changed'), stamp());
    console.log(`Wrote ${file} (${Math.round(text.length / 1024)} KB).`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message || e); process.exit(1); });
