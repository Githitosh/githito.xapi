#!/usr/bin/env node
/* githito.xapi: the news on X, and the replies to the accounts the owner asked for, collected ahead of time.

   The News page (githitosh.github.io/news-shorts/) plays the news accounts' own posts as headlines. It
   plays replies only for an account its reader added in Settings: the page sends that list here as an
   issue titled "account" (ingest.mjs), which writes v1/accounts.json. Replies are read only for those
   accounts' posts; with no account asked for, no reply is searched or read at all. Searching X when
   Update is pressed takes too long, so this program does it every half hour and writes one file,
   v1/news-<lang>.json, that the page only reads.

     node news.mjs                   build once into ./public (Japanese)
     node news.mjs --searches 40     fewer reply searches (80 unless told); --conversations and --headSearches likewise
     node news.mjs --dry             print the counts, write nothing
     node news.mjs --no-search       search nothing: judge the saved replies again and drop the old ones

   How: X is read through more than one service and more than one way in, so that one of them refusing
   does not stop a run.
     0. The news accounts' own latest posts: each account's timeline (FxTwitter), or a search when the
        timeline gives nothing. These are the headlines, and they say how many have replied. The
        accounts asked for are read first, every run; one that is not a news account gets "q": 1 on its
        posts, so that the page plays them only for a reader who asked for it.
     1. Replies to the accounts asked for, two ways:
        a. the replies under each news post, read directly (FxTwitter's conversation: one request gives
           a post and about twenty of its replies), the posts with the most replies first;
        b. searches of replies written to news accounts ("to:nhk_news"), each over a few hours of the
           last day and a half. The news post such a reply answers is read through vxTwitter, then X's
           own embed service (publish.x.com), then FxTwitter.
     2. A reply may play when it is an earnest one: a thought about the news in plain words, of 12 to
        80 characters, attacking nobody. No laughter, no cheering, no insults, no blame, nothing
        violent, sexual or heavy, no advertising.
     3. The post each reply answers is read once (many replies answer the same post). It must be the
        news account's own post, and the news must not be about a death, a crime, an accident, a
        disaster or a war: jokes under such news are not for a video.
     4. The file keeps up to 2000 replies for 72 hours, at most a few for one piece of news, and only
        replies to the accounts asked for (an account taken off the list takes its replies with it).
     5. The news accounts' own latest posts are kept too, as headlines (up to 900 for 36 hours). The
        page plays them when replies are switched off, and for news that gets no replies.
   Settings are in config.json under "news"; "on": false turns it off. Node 20 or newer; no packages. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stamp, readJson, charLen, cleanText, genreOf, readEmbed, readFixupX } from './rules.mjs';
import { lean, spread, deal } from './pick.mjs';

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
  searches: num('searches', 80),  // searches of replies written to news accounts (about 20 replies each)
  conversations: num('conversations', 250), // news posts whose replies are read directly (about 20 replies each)
  parents: num('parents', 500),   // news posts read in one run
  keep: num('keep', 2000),        // replies the file holds
  perNews: num('perNews', 8),     // replies kept for one piece of news
  headSearches: num('headSearches', 50), // searches for the news accounts' own posts (the headlines)
  headKeep: num('headKeep', 900), // headlines the file holds
  translate: num('translate', 400), // headlines put into English in one run (the News page shows both)
  headHours: num('headHours', 72), // a headline leaves the file after this many hours
  minutes: num('minutes', 10),    // how long one run may ask: it runs every half hour
  hours: num('hours', 72),        // a reply leaves the file after this many hours
  window: num('window', 4),       // hours one search covers
  back: num('back', 36),          // how many hours back the searches reach
  pause: num('pause', 4000),      // milliseconds between two searches
  rest: num('rest', 90000),       // milliseconds to rest when a search is refused
  patience: num('patience', 4),   // refusals in a row before a run stops searching
  enough: num('enough', 100),     // a run stops asking once this many new replies may play: the rest comes with the next runs
  maxRests: num('maxRests', 6),   // rests one way in may take in a run: refusals that come and go must not make a run last for hours
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
    ['oricon', 'オリコンニュース', 'entertainment', 4],
    ['modelpress', 'モデルプレス', 'entertainment', 3],
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
    ['numberweb', 'Number', 'sports', 2],
    ['itm_nlab', 'ねとらぼ', 'culture', 4],
    ['grapeejp', 'grape', 'culture', 2],
    ['maidonanews', 'まいどなニュース', 'culture', 2],
    ['jtown_net', 'Jタウンネット', 'local', 1],
    ['withnewsjp', 'withnews', 'culture', 1],
    ['BuzzFeedJapan', 'BuzzFeed Japan', 'culture', 1],
    ['HuffPostJapan', 'ハフポスト', '', 1],
    ['KAI_YOU_ed', 'KAI-YOU', 'culture', 1],
    ['dailyportalz', 'デイリーポータルZ', 'culture', 1],
    ['karapaia', 'カラパイア', 'science', 2],
    ['fashionpressnet', 'ファッションプレス', 'culture', 2],
    ['rocketnews24', 'ロケットニュース24', 'food', 3],
    ['macaroni_news', 'macaroni', 'food', 1],
    ['gnavi', 'ぐるなび', 'restaurant', 1],
    ['walkerplus_news', 'ウォーカープラス', 'local', 1],
    ['itmedia_news', 'ITmedia NEWS', 'science', 5],
    ['gigazine', 'GIGAZINE', 'science', 3],
    ['wired_jp', 'WIRED', 'science', 1],
    ['NazologyInfo', 'ナゾロジー', 'science', 2],
    ['NatGeoMagJP', 'ナショナル ジオグラフィック', 'science', 1],
    ['sorae_jp', 'sorae', 'space', 2],
    ['AstroArts', 'アストロアーツ', 'space', 1],
    ['JAXA_jp', 'JAXA', 'space', 1],
    ['wni_jp', 'ウェザーニュース', 'local', 3],
    ['tenkijp', 'tenki.jp', 'local', 2],
    ['nhk_news', 'NHKニュース', '', 5],
    ['tbsnewsdig', 'TBS NEWS DIG', '', 3],
    ['news24ntv', '日テレNEWS', '', 3],
    ['FNN_News', 'FNNプライムオンライン', '', 3],
    ['tv_asahi_news', 'テレ朝news', '', 3],
    ['asahi', '朝日新聞', '', 2],
    ['mainichi', '毎日新聞', '', 2],
    ['Yomiuri_Online', '読売新聞', '', 3],
    ['nikkei', '日本経済新聞', '', 5],
    ['Sankei_news', '産経ニュース', '', 2],
    ['kyodo_official', '共同通信', '', 2],
    ['jijicom', '時事通信', '', 2],
    ['47news_official', '47NEWS', '', 2],
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
const UNKIND = /飽き|卒業し[てろ]|使う[所とこ]|マシ|しょ[ーう]もな|つまら[なん]|いらん|ダメ|だめ|駄目|下手|ヘタ|微妙|キツ[いイ]|きつい|痛々|誰[？?]|誰やねん|誰だよ|知らん|興味[なね]|どうでも|劣化|老け|太っ[たて]|痩せ[ろた]|整形|顔バレ|ないのか|舐め|なめられ|おかしい|キチンと|ちゃんと(?:しろ|して|やれ|せ)|しろ[！!。]|しろよ|やれよ|すべき|べき[だで]|ありえ|あり得|イヤ|いやだ|嫌だ|無理|ムリ|頭[がの](?:悪|おか|弱)|レベル[がの]低|程度[がの]低|民度|境界知能|知能|底辺|貧乏|貧困|乞食|キモ|きも|ウザ|うざ|消え[ろて]|黙[れっ]|うるせ|うるさ|調子に乗|勘違い|自慢|あざと|媚び|ステマ|ゴリ押し|ごり押し|枕|コネ|七光り|干され|落ち目|オワ|需要[がな]|誰得|不細工|ブサ|デブ|ハゲ|ババ|ジジ|おばさん|おじさん|年増|若作り|痛い[人奴女男]|やらかし|前科|黒歴史|嘘くさ|胡散臭|うさんくさ|怪し|あやし|信者|アンチ|叩き|晒|通報|ブロック|訴|こいつ|コイツ|あいつ|アイツ|そいつ|この人|あの人|この女|この男|奴[はがらに]|やつ[はがら]|起こすな|すんな|するな[よ。！!]?$|印象操作|騒動|スキャンダル|不倫|熱愛|文春|暴露|拒否反応|問題児|お騒がせ|お荷物|どうすんの|持てよ|しろよ|顕示欲|承認欲求|意味[あな]|^で[？?]|場合ちゃう|場合じゃ|余計な|ビミョ|ダサ|だせ[ぇえー]|センス[なね]|がっかり|期待外れ|期待はずれ|時代遅れ|古い|安っぽ|パクリ|ぱくり|二番煎じ|炎上商法|話題作り|売名|悪魔|何考えて|何を考えて|出来レース|やらせ|ヤラセ|票操作|忖度|コロコロ変|手のひら返し|手のひらを返|ブレブレ|信用なら|恥かし|大人しくし|何も変わって|変わっていない|懲りない|学ばない|反省し|門渡り|股間|下半身|アソコ|下ネタ|乳首|パンツ|あの国|この国|国の名前|彼らには|対話が通じ|民族|国民性/;
const SPAM = /フォロー|拡散|リポスト|\bRT\b|プロフ|固ツイ|\bDM\b|ＤＭ|LINE|副業|稼[げぎ]|儲[けか]|投資|仮想通貨|ビットコイン|\bNFT\b|当選|プレゼント|キャンペーン|応募|無料|クーポン|ポイ活|案件|宣伝|予約|販売|通販|出会い|裏垢|配信中|見に来て|チャンネル登録|@grok|grok|はじめまして|初めまして|よろしくおねがい|よろしくお願い|おひさしぶり|お久しぶり|相互|フォロバ/i;
/* Nothing that says how old somebody is, and no one whose profile says they are under age. */
const MINOR_BIO = /(?:^|[^0-9])1[0-7]\s*(?:歳|才|y\/?o\b|years? old)|高[1-3１-３一二三](?:$|[^0-9０-９])|中[1-3１-３一二三](?:$|[^0-9０-９])|高校|中学|小学|学生|ＪＫ|ＪＣ|[LSF]?JK|\bJC\b|\bDK\b|\bminor\b|\bunder ?18\b|\bteen\b/i;
const BOT_BIO = /\bbot\b|ボット|自動|公式|official|株式会社|広報|事務局|運営/i;
/* Saying nothing: one word of agreement, a laugh alone, a greeting. */
const EMPTY = /^(?:草+|笑+|w+|ｗ+|へ[ぇえー〜]+|ほ[ぉおー〜]+|なるほど|そうなん(?:だ|ですね)?|すごい|凄い|おお+|えっ*|まじ(?:か)?|マジ(?:か)?|うん|はい|おめでとう(?:ございます)?|ありがとう(?:ございます)?|おはよう(?:ございます)?|こんにちは|こんばんは|おやすみ(?:なさい)?|お疲れ様(?:です)?)[!！?？。、〜ー…\s\p{Extended_Pictographic}️‍]*$/u;
/* News a light reply should not sit under: deaths, crimes, accidents, disasters, wars, illness. */
const GRAVE = /逮捕|容疑|送検|起訴|被告|判決|懲役|実刑|有罪|無罪|裁判|提訴|詐欺|窃盗|横領|わいせつ|盗撮|痴漢|不同意|性的|性被害|性加害|暴力|傷害|脅迫|ストーカー|ＤＶ|\bDV\b|ハラスメント|セクハラ|パワハラ|不祥事|戦争|戦闘|空爆|爆撃|ミサイル|攻撃(?!陣|力|的)|侵攻|停戦|テロ|爆発|発砲|銃撃|拉致|人質|行方不明|不明者|被害|被災|犠牲|負傷|重体|重傷|軽傷|ケガ|怪我|搬送|救急|意識不明|心肺停止|倒壊|土砂|浸水|氾濫|噴火|避難|警報|特別警報|台風|豪雨|大雪|遭難|墜落|衝突|脱線|転落|溺|襲われ|襲撃|クマに|熊に|感染|コロナ|インフル|ウイルス|がん(?!ば|が|ら|こ)|(?<![ァ-ヶー])ガン(?![ァ-ヶー])|難病|障害|障がい|認知症|介護|貧困|倒産|破産|解雇|リストラ|訃報|死去|逝去|急逝|葬儀|告別式|追悼|慰霊|原爆|被爆|震災|原発|放射|汚染|差別|ヘイト|中傷|誹謗|いじめ|虐待|自殺|自死|薬物|大麻|覚醒剤|麻薬|飲酒運転|ひき逃げ|あおり運転|火事|出火|全焼|漏えい|漏洩|流出|不正アクセス|炎上|謝罪|辞任|辞職|更迭|疑惑|不正|汚職|裏金|賄賂|違反|処分|懲戒|停職|活動休止|休養|離婚|不倫|破局|騒動|スキャンダル|熱愛|密会|文春|週刊誌|暴露|告発|降板|契約解除|解雇|書類/;
/* News of politics, government, other countries' affairs and the Imperial family: what is written under
   it is argument about people, which is not for this page. Such news plays as headlines, not as replies. */
const STATE = /首相|総理|大臣|官房|内閣|政府|政権|与党|野党|自民|立憲|維新|公明|共産党|国民民主|れいわ|参政党|保守党|議員|国会|衆院|参院|選挙|出馬|当選確実|知事|市長|町長|村長|市議|県議|都議|防衛|自衛隊|安保|外交|外相|外務省|財務省|厚労省|文科省|経産省|国交省|総務省|法務省|省庁|審議会|首脳|大統領|習近平|プーチン|トランプ|ゼレンスキー|金正恩|中国|韓国|北朝鮮|ロシア|ウクライナ|イスラエル|ガザ|パレスチナ|イラン|台湾|米政権|米政府|関税|制裁|増税|減税|税制|予算|国債|年金|保険料|生活保護|給付金|補助金|マイナ|移民|難民|外国人|入管|憲法|法案|法改正|条例|最高裁|地裁|高裁|検察|警察|警視庁|県警|皇室|天皇|皇后|愛子さま|悠仁|秋篠宮|佳子さま|眞子|宮内庁|靖国|慰安婦|徴用工|領土|尖閣|竹島|核兵器|デモ|陰謀論|都市伝説|宗教|教会|創価|LGBT|ジェンダー|同性婚|夫婦別姓|ハラール|モスク|クルド|(?<![甘辛])党|総裁|幹事長|政界|政治|政策|公約|世論調査|支持率|閣僚|閣議|答弁|国家|官邸|内閣府|デジタル庁|こども家庭庁|金融庁|消費者庁|警察庁|検察庁|防衛省|新税|課税|税収|国政|都政|県政|市政|国連|NATO|G7|G20|APEC|サミット|会談|大使|領事|戦闘機|空母|基地問題|高市|石破|岸田|安倍|小沢一郎|山本太郎|神谷宗幣|百田|立花孝志|米中|日中|日米|日韓|日ロ|中ロ|米ロ|欧米|地政学|覇権|情勢|同盟|軍事|国防|有事|侵略|戦後|戦時|植民地|歴史認識|教科書問題|愛国|右傾|左傾|リベラル|保守派|ワクチン|反ワク|長官|厚生|不法投棄|不法|違法|支援金|手当|控除|年収の壁|年収下限|賃上げ|物価高|値上げ|電気代|救命|AED|ポルノ|アダルト|うつ|鬱|メンタル|依存症|発達障|不登校|少子化|出生|未婚|孤独死|ホームレス|文科相|財務相|厚労相|経産相|防衛相|総務相|法相|農相|農水相|環境相|国交相|復興相|デジタル相|経済再生相|担当相|副大臣|政務官|献金|寄付|パーティー券|政治資金|裏金/;
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
/* The News page plays earnest replies: a thought about the news in plain words. Laughter, cheering
   and reactions made of emoji belong on the Humor page. */
const LAUGH = /笑|(?<![A-Za-z])[wｗ]+(?![A-Za-z])|草|ワロ|ウケ|うける|ネタ|ボケ|大喜利|ｗ|😂|🤣|😆|😁|😜|🤪|😝|😹/u;
const CHEER = /かっこい|カッコい|かわい|可愛|尊い|イケメン|ビジュ|大好き|だいすき|推し|最高|神[！!]|おめでと|ありがと|楽しみ|たのしみ|待って[るま]|嬉し|うれし|会いたい|頑張[っれ]|がんば|応援|ファイト|きゃー|やったー|わーい|すごい[！!]|素敵|すてき|癒|泣け|泣い|涙/;
const THOUGHT = /と思|思う|思い|思え|考え|感じ|気がする|気になる|だろう|でしょう|かもしれ|はず|必要|大事|大切|重要|期待|心配|不安|課題|影響|今後|将来|これから|対策|改善|理由|原因|背景|結果|なるほど|勉強に|参考に|確かに|たしかに|難しい|興味深|納得|同感|賛成|便利|助かる|ありがたい|安心|進歩|進化|変化|時代|需要|価格|値段|コスト|技術|仕組み|制度|ルール|選択肢|可能性|メリット|デメリット|バランス|注目|意外|さすが|実力|実績|経験|成長|判断|決断|戦略|方針|狙い|効果|品質|安全|環境|市場|業界|業績|競争|普及|活用|導入|開発|研究/;
const POLITE = /です|ます|でしょう|ません|でした|ました/;
const emojiCount = t => (String(t).match(/\p{Extended_Pictographic}/gu) || []).length;
/* Whether a reply is an earnest one. */
function earnest(text) {
  const n = charLen(text);
  if (n < 12 || n > 80) return false;
  if (LAUGH.test(text) || CHEER.test(text) || emojiCount(text) > 1 || /[！!]{2,}|[？?]{2,}|〜{2,}|ー{3,}|かと思った|かと思いき|と思ったら|お願いします|。。。|…。/.test(text)) return false;
  return THOUGHT.test(text) || POLITE.test(text) || n >= 20;
}
function replyOk(text) {
  const n = charLen(text);
  if (!text || n < 12 || n > 80 || !earnest(text)) return false;
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
/* How much a reply says: a thought, said politely, of a length that can be read on a card. */
function replyScore(text, st) {
  const n = charLen(text);
  let s = 0;
  if (n >= 18 && n <= 60) s += 3;
  s += Math.min(6, (text.match(new RegExp(THOUGHT.source, 'g')) || []).length * 2);
  if (POLITE.test(text)) s += 2;
  if (emojiCount(text)) s -= 1;
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
  for (let k = 1; k < lines.length && (charLen(h) < 18 || (open(h) && charLen(h) < 40)); k++) h += (open(h) ? '' : ' ') + lines[k];
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

/* ---------- the headlines ---------- */
/* The accounts whose own posts are kept as headlines: the page plays them when replies are switched
   off, and for news that gets no replies (politics, public safety). */
const HEAD_ONLY = { ja: [['ReutersJapan', 'ロイター', '', 0], ['bbcnewsjapan', 'BBCニュース', '', 0]] };
const HEADS = {
  ja: ['nhk_news', 'YahooNewsTopics', 'livedoornews', '47news_official', 'kyodo_official', 'jijicom', 'asahi', 'mainichi', 'Yomiuri_Online', 'nikkei',
    'Sankei_news', 'tbsnewsdig', 'news24ntv', 'FNN_News', 'tv_asahi_news', 'ReutersJapan', 'bbcnewsjapan', 'oricon', 'modelpress', 'nikkansports',
    'SportsHochi', 'sponichiannex', 'Fullcountc2', 'itmedia_news', 'gigazine', 'wni_jp', 'natalie_mu', 'cinematoday', 'famitsu', 'mantanweb'],
};
/* Never as a headline in a video, whatever the page's own switches say. */
const NOT_A_HEADLINE = /わいせつ|性的|性被害|性加害|性暴力|不同意|レイプ|強姦|児童ポルノ|盗撮|痴漢|自殺|自死|心中|虐待|遺体|殺害|殺人|刺殺|死傷/;
const CRIME = /逮捕|容疑|送検|起訴|被告|判決|懲役|警察|警視庁|県警|府警|道警|事件|詐欺|窃盗|強盗|横領|暴行|傷害|脅迫|飲酒運転|ひき逃げ|事故|火災|火事|消防|救急|行方不明|遭難|防犯|防災|避難|警報|注意報/;
const POLITICS = /首相|総理|大臣|官房長官|内閣|政権|与党|野党|自民|立憲|維新|公明党|共産党|国民民主|れいわ|参政党|保守党|議員|国会|衆院|参院|選挙|知事選|市長選|首脳|大統領|外相|外交|防衛費|安保|法案|閣議|政治|政府|[一-龥]{1,3}相(?:は|が|、|「|$)/;
function headGenre(account, text, lang) {
  if (POLITICS.test(text)) return 'politics';
  if (CRIME.test(text)) return 'safety';
  return genreFor(account, text, lang);
}
function headOk(text, headline) {
  if (!headline || charLen(headline) < 10 || (openBracket(headline) && !/…$/.test(headline))) return false;
  if ((headline.match(/[぀-ヿ一-鿿]/g) || []).length < 5) return false;
  /* A line dressed up with ＼ ／ or arrows is an advertisement for the account's own page, not a headline. */
  if (/^[＼\\／/▶▷►→↓⇒]|[／/＼\\]$/.test(headline.trim())) return false;
  return !NOT_A_HEADLINE.test(text) && !SPAM.test(text) && emojiCount(headline) < 2 && !/質問箱|お届けします|募集中|配信中|放送中|発売中|公開中|好評|詳しくは|こちらから/.test(headline);
}

/* ---------- the order the page plays in ---------- */
/* Chosen here, at random, after every collection (see pick.mjs); the page plays from the top and leaves
   out what its reader has seen. An entry is "r" and a reply's number, or "h" and a headline's.
   - replies: seven replies in ten, three headlines of news that gets no replies (politics, public
     safety); one reply for a piece of news and nobody twice in any stretch of twenty.
   - news: headlines only.
   - genre: for each genre, its replies with its headlines among them, or its headlines alone. */
const NO_REPLY = new Set(['politics', 'safety']);
/* What the post says after its headline: one more short line for the card, or ''. */
export function detailOf(raw, headline) {
  const t = String(raw || '').replace(/https?:\/\/\S+/g, ' ').replace(/[#＃][^\s#＃]+/g, ' ').replace(/[ \t　]+/g, ' ');
  const head = squash(headline).replace(/…$/, '').slice(0, 20);
  const lines = t.split(/\n+|(?<=[。！？])/).map(x => x.trim()).filter(Boolean);
  const at = lines.findIndex(l => squash(l).includes(head.slice(0, 12)) || head.includes(squash(l).slice(0, 12)));
  for (const l of lines.slice(at + 1)) {
    const line = l.replace(/[。\s]+$/, '');
    const n = charLen(line);
    if (n < 8 || n > 44 || (line.match(/[぀-ヿ一-鿿]/g) || []).length < 4) continue;
    if (/詳しく|こちら|記事|続き|全文|▼|↓|▶|→|動画|写真|ライブ|配信|無料|会員|登録|フォロー|#/.test(line) || squash(line).slice(0, 10) === head.slice(0, 10)) continue;
    return line;
  }
  return '';
}
/* Headlines put into English (Google's translation, asked without a key as a browser's page does):
   several at a time, joined by a mark that comes back unchanged. A refusal ends the work for this run;
   what is left is done in the next. */
async function intoEnglish(texts) {
  const out = texts.map(() => '');
  const mark = '\n###\n';
  for (let i = 0; i < texts.length; i += 6) {
    const slice = texts.slice(i, i + 6);
    try {
      const res = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=en&dt=t&q=' + encodeURIComponent(slice.join(mark)), { headers: { 'user-agent': 'githito.xapi collector' }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) { console.log(`  translation refused (${res.status}) after ${i} headlines`); break; }
      const data = await res.json();
      const parts = ((data && data[0]) || []).map(row => (row && row[0]) || '').join('').split(/\s*###\s*/);
      if (parts.length !== slice.length) { translatedOdd++; continue; }
      slice.forEach((src, k) => { const e = String(parts[k] || '').replace(/\s+/g, ' ').trim(); if (e && /[A-Za-z]{3}/.test(e) && !/[぀-ヿ]/.test(e)) out[i + k] = e; });
    } catch (e) { console.log('  translation did not answer: ' + (e.message || e)); break; }
    await sleep(700);
  }
  return out;
}
let translatedOdd = 0;
function newsPlay(items, news, heads) {
  const tag = (list, t) => list.map(x => t + x.id);
  const replies = spread(lean(items, x => (news[x.n] && news[x.n].at) || x.at, 24), x => ['n' + x.n, 'p' + String(x.h).toLowerCase()], 20);
  const headOrder = spread(lean(heads, x => x.at || x.found, 12), x => ['l' + squash(x.t).slice(0, 12)], 30);
  const apart = list => spread(list, x => ['s' + x.h], 3);
  const genre = {};
  GENRES.forEach(g => {
    const r = replies.filter(x => news[x.n] && news[x.n].g === g);
    const h = apart(headOrder.filter(x => x.g === g));
    const order = r.length ? deal(tag(r, 'r'), tag(h, 'h'), 0.3) : tag(h, 'h');
    if (order.length) genre[g] = order.slice(0, 300);
  });
  return {
    made: stamp(),
    /* The mixed order ends where the replies end: after that it would be headlines only. */
    replies: deal(tag(replies, 'r'), tag(apart(headOrder.filter(x => NO_REPLY.has(x.g))), 'h'), 0.3, 0, true).slice(0, 900),
    news: tag(apart(headOrder), 'h').slice(0, 600),
    genre,
  };
}

/* ---------- asking ---------- */
let asked = 0;
let readCount = 0;
let convCount = 0;
let timelineAsked = 0;
let timelineGave = 0;
const via = { vxtwitter: 0, fixupx: 0, x: 0, fxtwitter: 0 };
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
/* An account's own latest posts. Its timeline is asked first; when that gives nothing, the search
   (two ways to the same posts, so one being refused does not stop the run). */
async function ownPosts(handle, lang) {
  try {
    timelineAsked++;
    const d = await fxJson('https://api.fxtwitter.com/2/profile/' + handle + '/statuses?count=40');
    const list = (d && Array.isArray(d.results)) ? d.results.filter(st => !st.reposted_by) : [];
    if (list.length) { timelineGave++; return list; }
  } catch (e) {}
  asked++;
  const data = await fxJson('https://api.fxtwitter.com/2/search?count=100&q=' + encodeURIComponent(`from:${handle} -filter:replies -filter:retweets lang:${lang}`));
  return (data && data.results) || [];
}
/* A news post: its words, who wrote it, when. FxTwitter first; when it refuses, vxTwitter. */
async function newsPost(handle, id) {
  readCount++;
  /* vxTwitter. */
  try {
    const res = await fetch(`https://api.vxtwitter.com/${handle}/status/${id}`, { headers: { 'user-agent': 'githito.xapi collector', accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    const d = res.ok ? await res.json().catch(() => null) : null;
    if (d && d.text) {
      via.vxtwitter++;
      return { text: String(d.text), handle: d.user_screen_name || handle, at: d.date_epoch ? new Date(d.date_epoch * 1000).toISOString().replace(/\.\d+Z$/, 'Z') : '', reply: !!d.replyingToID };
    }
  } catch (e) {}
  /* FixupX: the words and the writer, no date. */
  try {
    const d = await readFixupX(handle, id);
    if (d && d.raw) { via.fixupx++; return { text: String(d.raw), handle: d.handle || handle, at: '', reply: false }; }
  } catch (e) {}
  /* X's own embed service (publish.x.com): the words and the writer, no date. */
  try {
    const d = await readEmbed(handle, id);
    if (d && d.raw) { via.x++; return { text: String(d.raw), handle: d.handle || handle, at: '', reply: false }; }
  } catch (e) {}
  /* FxTwitter, which the searches need, is asked last. */
  try {
    const d = await fxJson('https://api.fxtwitter.com/2/status/' + id);
    const st = d && (d.status || d.tweet);
    if (st && st.text) { via.fxtwitter++; return { text: String(st.text), handle: handleOf(st) || handle, at: whenOf(st), reply: !!parentOf(st).id }; }
  } catch (e) {}
  return null;
}
/* A news post and the replies under it, in one answer (FxTwitter's conversation). */
async function conversation(id) {
  convCount++;
  const d = await fxJson('https://api.fxtwitter.com/2/conversation/' + id);
  return { status: (d && d.status) || null, replies: (d && Array.isArray(d.replies)) ? d.replies : [] };
}

/* ---------- one language ---------- */
async function build(lang) {
  const file = path.join(CONF.out, 'v1', `news-${lang}.json`);
  const before = await readJson(file, {});
  const oldNews = (before.news && typeof before.news === 'object') ? before.news : {};
  const oldItems = (Array.isArray(before.items) ? before.items : []).filter(x => x && x.id && x.h && x.t && x.n && oldNews[x.n]);
  const tally = (before.accounts && typeof before.accounts === 'object') ? before.accounts : {};
  /* The accounts asked for (v1/accounts.json, written by ingest.mjs from the owner's "account" issue). */
  const askedFile = await readJson(path.join(CONF.out, 'v1', 'accounts.json'), {});
  const askedList = [...new Set((Array.isArray(askedFile.accounts) ? askedFile.accounts : []).map(a => String((a && a.h) || '')).filter(h => /^[A-Za-z0-9_]{1,15}$/.test(h)))].slice(0, 8);
  const asked = new Set(askedList.map(h => h.toLowerCase()));
  const isAsked = a => !!a && asked.has(String(a[0]).toLowerCase());
  const base = (ACCOUNTS[lang] || []).concat(HEAD_ONLY[lang] || []);
  const newsAccount = new Set(base.map(a => a[0].toLowerCase()));
  const oldNames = new Map((Array.isArray(before.asked) ? before.asked : []).filter(a => a && a.h).map(a => [String(a.h).toLowerCase(), String(a.n || '')]));
  /* An account asked for that is not in the table joins it for this run; a headline-only account asked for gets replies too. */
  const accounts = (ACCOUNTS[lang] || []).slice();
  askedList.forEach(h => {
    if (accounts.some(a => a[0].toLowerCase() === h.toLowerCase())) return;
    const known = base.find(a => a[0].toLowerCase() === h.toLowerCase());
    accounts.push(known ? [known[0], known[1], known[2], 3] : [h, oldNames.get(h.toLowerCase()) || '@' + h, '', 3]);
  });
  if (askedList.length) console.log(`  ${lang}: replies are read for @${askedList.join(', @')}`);
  else console.log(`  ${lang}: no account is asked for, so no reply is read (headlines only)`);
  const byHandle = new Map(accounts.map(a => [a[0].toLowerCase(), a]));
  const have = new Set(oldItems.map(x => x.id));
  const texts = new Set(oldItems.map(x => squash(x.t).slice(0, 40)));
  const count = { searches: 0, replies: 0, candidates: 0, read: 0, news: 0, items: 0, headSearches: 0, heads: 0, conversations: 0, convReplies: 0 };
  const deadline = Date.now() + CONF.minutes * 60e3;
  const late = () => Date.now() > deadline;
  const everyAccount = (HEAD_ONLY[lang] || []).filter(a => !byHandle.has(a[0].toLowerCase())).concat(accounts);
  const anyHandle = new Map(everyAccount.map(a => [a[0].toLowerCase(), a]));

  /* 0. The headlines: the news accounts' own latest posts. They are few searches, so they go first. */
  const oldHeads = (Array.isArray(before.heads) ? before.heads : []).filter(x => x && x.id && x.h && x.t);
  const haveHead = new Set(oldHeads.map(x => x.id));
  const newHeads = [];
  const posts = [];   // the news posts seen in this run: where replies are read from
  let headRefusals = 0;
  let headRests = 0;
  /* The accounts asked for first, then the main papers every run, then the other accounts by turns. */
  const mainHeads = (HEADS[lang] || []).filter(h => !asked.has(h.toLowerCase()));
  const otherHeads = shuffle(accounts.map(a => a[0]).filter(h => !asked.has(h.toLowerCase()) && !mainHeads.includes(h)));
  for (const handle of CONF.noSearch ? [] : askedList.concat(shuffle(mainHeads).concat(otherHeads).slice(0, CONF.headSearches))) {
    /* The accounts take a third of the run's time at most. */
    if (Date.now() > deadline - CONF.minutes * 40e3) { console.log('  headlines: time is up for this part'); break; }
    const a = anyHandle.get(handle.toLowerCase());
    if (!a) continue;
    let list;
    try { list = await ownPosts(handle, lang); count.headSearches++; headRefusals = 0; }
    catch (e) {
      if (!(e instanceof Refused)) throw e;
      if (++headRefusals >= CONF.patience || ++headRests > CONF.maxRests) { console.log(`  headlines ${e.message}: stopping with what was found`); break; }
      console.log(`  headlines ${e.message}: resting`);
      await sleep(CONF.rest);
      continue;
    }
    let got = 0;
    /* An account asked for that is not a news account: its name as X shows it. */
    const own = !newsAccount.has(handle.toLowerCase());
    const shown = list.find(st => handleOf(st).toLowerCase() === handle.toLowerCase() && st.author && st.author.name);
    if (own && shown) a[1] = String(shown.author.name).slice(0, 30);
    list.forEach(st => {
      const id = statusId(st);
      if (!id || handleOf(st).toLowerCase() !== handle.toLowerCase() || parentOf(st).id) return;
      const text = String(st.text || '');
      const headline = headlineOf(text);
      posts.push({ id, a, text, headline, replies: Number(st.replies) || 0, at: whenOf(st) });
      if (haveHead.has(id) || !headOk(text, headline)) return;
      haveHead.add(id);
      const detail = detailOf(text, headline);
      newHeads.push({ id, h: a[0], n: a[1], t: headline, ...(detail ? { d: detail } : {}), g: headGenre(a, text, lang), at: whenOf(st), rc: Number(st.replies) || 0, found: stamp(), ...(own ? { q: 1 } : {}) });
      got++;
    });
    console.log(`  ${lang} headlines @${handle}: ${list.length} posts, ${got} new`);
    await sleep(CONF.pause);
  }
  count.heads = newHeads.length;

  /* 0b. The replies under the news posts themselves. One request gives a post and about twenty of its
     replies, so no reply has to be traced back to its news. Posts with the most replies first; a post
     is read again only when many more have replied since. */
  const conv = {};
  Object.entries((before.conv && typeof before.conv === 'object') ? before.conv : {}).forEach(([id, v]) => { if (v && Date.now() - Date.parse(v.at || 0) < CONF.hours * 3600e3) conv[id] = v; });
  const news = {};
  const cands = [];
  const seenPost = new Set();
  const freshPosts = posts.filter(p => {
    if (seenPost.has(p.id)) return false;
    seenPost.add(p.id);
    if (p.replies < 2 || !newsOk(p.text, p.headline)) return false;
    const was = conv[p.id];
    return !was || p.replies >= (was.rc || 0) + 10;
  }).sort((x, y) => y.replies - x.replies);
  /* The headlines kept from earlier runs that were not seen again in this one: those that had replies
     when last seen. With these a run finds replies even when the accounts cannot be read. */
  const kept = oldHeads.filter(x => !seenPost.has(x.id) && !conv[x.id] && (Number(x.rc) || 0) >= 2 && newsOk(x.t, x.t))
    .map(x => ({ id: x.id, a: anyHandle.get(String(x.h).toLowerCase()), text: x.t, headline: x.t, replies: Number(x.rc) || 0, at: x.at || '' }))
    .filter(p => p.a).sort((x, y) => y.replies - x.replies);
  /* Replies are read only under the posts of the accounts asked for. */
  const targets = freshPosts.concat(kept).filter(p => isAsked(p.a)).slice(0, CONF.conversations);
  let convRefusals = 0;
  let convRests = 0;
  for (let i = 0; i < targets.length && !CONF.noSearch && !late(); i += 3) {
    const batch = targets.slice(i, i + 3);
    const got = await Promise.all(batch.map(p => conversation(p.id).catch(e => { if (e instanceof Refused) return null; throw e; })));
    if (got.every(g => !g)) {
      if (++convRefusals >= CONF.patience || ++convRests > CONF.maxRests) { console.log('  conversations refused: stopping with what was found'); break; }
      console.log('  conversations refused: resting');
      await sleep(CONF.rest);
      i -= 3;
      continue;
    }
    convRefusals = 0;
    got.forEach((g, k) => {
      if (!g) return;
      const p = batch[k];
      count.conversations++;
      count.convReplies += g.replies.length;
      /* The answer carries the news post itself: its whole text and how many have replied. */
      const whole = g.status && g.status.text ? String(g.status.text) : p.text;
      const headline = g.status && g.status.text ? headlineOf(whole) : p.headline;
      conv[p.id] = { at: stamp(), rc: Math.max(p.replies, Number(g.status && g.status.replies) || 0) };
      if (!newsOk(whole, headline) || (g.status && parentOf(g.status).id)) return;
      let n = 0;
      g.replies.forEach(st => {
        const h = handleOf(st);
        const id = statusId(st);
        /* A reply to the news post itself, not to somebody else under it, and not the paper's own. */
        if (!h || !id || have.has(id) || parentOf(st).id !== p.id || anyHandle.has(h.toLowerCase())) return;
        const text = replyText(st);
        const tk = squash(text).slice(0, 40);
        if (!text || texts.has(tk)) return;
        have.add(id);
        texts.add(tk);
        cands.push({ id, h, t: text, n: p.id, at: whenOf(st), s: replyScore(text, st), account: p.a });
        n++;
      });
      if (n && !oldNews[p.id]) news[p.id] = { h: p.a[0], n: p.a[1], t: headline, g: genreFor(p.a, whole, lang), at: p.at || (g.status ? whenOf(g.status) : ''), full: whole };
    });
    if ((i / 3) % 10 === 9) console.log(`  ${lang} conversations: ${count.conversations} read, ${count.convReplies} replies, ${cands.length} may play`);
    if (cands.length >= CONF.enough) { console.log(`  ${lang} conversations: ${cands.length} replies may play, which is enough for one run`); break; }
    await sleep(1500);
  }
  console.log(`  ${lang} conversations: ${targets.length} news posts chosen, ${count.conversations} read, ${count.convReplies} replies, ${cands.length} may play`);

  /* 1. The searches: the accounts asked for, each by its share. */
  const alive = accounts.filter(isAsked);
  const weight = alive.reduce((s, a) => s + a[3], 0) || 1;
  const now = Math.floor(Date.now() / 1000);
  const plan = [];
  alive.forEach(a => {
    const n = Math.max(1, Math.round(CONF.searches * a[3] / weight));
    for (let i = 0; i < n; i++) plan.push({ a, start: now - CONF.window * 3600 - Math.floor(Math.random() * Math.max(1, CONF.back - CONF.window)) * 3600 });
  });
  let refusals = 0;
  let rests = 0;
  for (const p of CONF.noSearch ? [] : shuffle(plan).slice(0, CONF.searches)) {
    if (cands.length >= CONF.enough) { console.log(`  ${lang}: ${cands.length} replies may play, which is enough for one run: no more searches`); break; }
    if (late()) { console.log('  the run\'s time is up: no more searches'); break; }
    const handle = p.a[0];
    let list;
    try { list = await search(handle, lang, p.start); count.searches++; refusals = 0; }
    catch (e) {
      if (!(e instanceof Refused)) throw e;
      if (++refusals >= CONF.patience || ++rests > CONF.maxRests) { console.log(`  search ${e.message}: stopping with what was found`); break; }
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
  const todo = [...groups.entries()].filter(([id]) => !oldNews[id] && !news[id]).sort((x, y) => y[1].length - x[1].length || (x[0] < y[0] ? 1 : -1)).slice(0, CONF.parents);
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
  /* Only replies to the accounts asked for stay: an account taken off the list takes its replies with it. */
  const askedNews = x => asked.has(String(allNews[x.n].h).toLowerCase());
  const items = found.concat(oldItems.filter(x => fresh(x) && stillOk(x) && askedNews(x))).slice(0, CONF.keep);
  const usedNews = {};
  items.forEach(x => { usedNews[x.n] = allNews[x.n]; });
  const genres = {};
  const sources = {};
  items.forEach(x => { const a = usedNews[x.n]; genres[a.g || 'other'] = (genres[a.g || 'other'] || 0) + 1; sources[a.n] = (sources[a.n] || 0) + 1; });
  console.log(`  ${lang}: ${count.searches} searches gave ${count.replies} replies and ${count.conversations} conversations gave ${count.convReplies}; ${count.candidates} may play; ${count.read} news posts read (${failed.size} could not be read), ${count.news} may play; ${count.items} new replies. The file holds ${items.length} replies to ${Object.keys(usedNews).length} pieces of news.`);
  console.log('  by genre: ' + JSON.stringify(genres));
  console.log('  by source: ' + JSON.stringify(sources));
  /* The headlines: this run's and the earlier ones that are still young, newest first, no line twice. */
  const headFresh = x => Date.now() - Date.parse(x.found || 0) < CONF.headHours * 3600e3;
  const headSeen = new Set();
  const rcNow = new Map(posts.map(p => [p.id, p.replies]));
  const heads = newHeads.concat(oldHeads.filter(x => headFresh(x) && headOk(x.t, x.t)).map(x => ({ ...x, g: headGenre(anyHandle.get(String(x.h).toLowerCase()), x.t, lang), rc: rcNow.has(x.id) ? rcNow.get(x.id) : (Number(x.rc) || 0) })))
    .sort((x, y) => (Date.parse(y.at || y.found || 0) || 0) - (Date.parse(x.at || x.found || 0) || 0))
    .filter(x => { const k = squash(x.t).slice(0, 24); if (headSeen.has(k)) return false; headSeen.add(k); return true; })
    .slice(0, CONF.headKeep);
  /* The headlines in English too, for the card (the newest first; those done in earlier runs keep theirs). */
  if (!flag('no-translate')) {
    const todo = heads.filter(x => !x.e).slice(0, CONF.translate);
    const en = todo.length ? await intoEnglish(todo.map(x => x.t.replace(/【[^】]*】/g, ' ').trim() || x.t)) : [];
    todo.forEach((x, i) => { if (en[i]) x.e = en[i]; });
    count.translated = en.filter(Boolean).length;
    console.log(`  headlines in English: ${heads.filter(x => x.e).length} of ${heads.length} (${count.translated} in this run${translatedOdd ? ', ' + translatedOdd + ' answers could not be split' : ''})`);
  }
  const headGenres = {};
  heads.forEach(x => { headGenres[x.g || 'other'] = (headGenres[x.g || 'other'] || 0) + 1; });
  console.log(`  headlines: ${count.headSearches} searches gave ${count.heads} new; the file holds ${heads.length} ${JSON.stringify(headGenres)}`);
  const askedOut = askedList.map(h => { const a = byHandle.get(h.toLowerCase()); return { h: a ? a[0] : h, n: a ? a[1] : '@' + h, news: newsAccount.has(h.toLowerCase()) }; });
  return { version: 3, lang, updated: stamp(), run: CONF.noSearch ? (before.run || null) : { at: stamp(), ...count }, genres, headGenres, accounts: tally, asked: askedOut, conv, play: newsPlay(items, usedNews, heads), news: usedNews, items, heads };
}

async function main() {
  if (!CONF.on) { console.log('Replies to the news are turned off (config.json, "news": { "on": false }).'); return; }
  for (const lang of CONF.langs.length ? CONF.langs : ['ja']) {
    console.log(`Replies to the news, ${lang}`);
    const out = await build(lang);
    console.log(`Asked api.fxtwitter.com for ${asked} searches, ${timelineAsked} account timelines (${timelineGave} answered) and ${convCount} conversations. News posts read: ${readCount} (vxTwitter ${via.vxtwitter}, FixupX ${via.fixupx}, X's embed service ${via.x}, FxTwitter ${via.fxtwitter}).`);
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
