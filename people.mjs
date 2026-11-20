/* people.mjs: what people say, for News: News is made of people's own words now (no paper, no broadcaster
   on the cards), in Japanese and in English. After news.mjs: the most answered news posts of the last day are read as conversations
   (FxTwitter's conversation: the post and the replies under it; X's search is refused at present), and the
   replies that have their own reach are kept: a person (not a paper, a company or a bot) with followers,
   whose reply was liked by many.

   Politics and public safety are left out (what people reply there is mostly one side against another),
   and so is anything the other filters leave out: cruel, personal, slander, alcohol and smoking (filters.mjs),
   a link, an advertisement, a profile that speaks of being under age.

     v1/people-ja.json   { version, lang, updated, read: { news id: time }, people: [{ id, h (handle), n (name),
                           f (followers), l (likes), t (the words), on (the news post), g, at, found }] }
     v1/people-en.json   the same in English (the conversations of English news, english.mjs)

     node people.mjs --out public [--minutes 4] [--posts 100] [--followers 300] [--likes 5] */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { cruel, personal, slander, alcohol, tobacco } from './filters.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const CONF = {
  out: path.resolve(opt('out', 'public')),
  minutes: Number(opt('minutes', 4)) || 4,          // Japanese; English takes a third of it more
  posts: Number(opt('posts', 100)) || 100,      // news posts read as conversations in one run (English: a third)
  followers: Number(opt('followers', 300)) || 300,   // a person with some following
  likes: Number(opt('likes', 5)) || 5,               // and a reply that people liked
  hours: 72,                                    // a post leaves the file after this many hours
  keep: 1000,
};
const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const len = t => [...String(t || '')].length;
const readJson = async (file, d) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { return d; } };

/* Not a person: a paper, a broadcaster, a company, a shop, an official account, a bot. */
const NOT_A_PERSON = /公式|official|ニュース|新聞|news|放送|テレビ|編集部|広報|株式会社|会社|企業|\bbot\b|ボット|情報局|まとめ|速報|運営|事務局|shop|store|ストア|店舗|通販|募集|求人|案内/i;
const MINOR_BIO = /(?:^|[^0-9])1[0-7]\s*(?:歳|才)|高[1-3１-３一二三](?:$|[^0-9０-９])|中[1-3１-３一二三](?:$|[^0-9０-９])|高校生|中学生|小学生|JK|JC|ＪＫ|ＪＣ|学生/;
/* The news whose replies are read: not politics or public safety, and not one of their words. */
const NO_GENRE = new Set(['politics', 'safety']);
const POLITICS = /女性性|男性性|男らしさ|女らしさ|フェミ|ジェンダー|弱者男性|リベラル|保守|左派|右派|議会|予算|補正|行政|政策|規制|役所|官僚|政府|首相|総理|大臣|政権|内閣|与党|野党|自民|立憲|立民|維新|公明|共産|国民民主|参政|れいわ|社民|選挙|投票|議員|国会|知事|市長|政治|外交|外国人|移民|難民|中国人|韓国人|在日|売国|反日|左翼|右翼|パヨク|ネトウヨ|マスコミ|マスゴミ|外人|国民|圧力|陰謀|洗脳|中国|韓国|北朝鮮|ロシア|アメリカ|米国|税金|増税|減税|憲法|戦争|軍|ミサイル|核/;
/* English: the same kinds of words. */
const POLITICS_EN = /\b(?:trump|biden|harris|obama|maga|president|prime minister|minister|government|congress|senate|democrats?|republicans?|liberals?|conservatives?|left|right[- ]wing|woke|election|vote|voters?|party|politic\w*|israel|gaza|palestin\w*|ukraine|russia|china|iran|immigra\w*|migrants?|border|tax(?:es)?|war|military|army|nato|un|eu)\b/i;
const QUARREL_EN = /\b(?:blow(?:ing|s)? up|destroy\w*|attack\w*|parole|court|trial|verdict|judge|lawyer|idiot\w*|stupid|dumb|moron\w*|shut up|fuck\w*|shit\w*|damn|hell|crap|pathetic|disgusting|liar|clown|loser|hate|sucks?|garbage|trash|wtf|lmao|lmfao)\b/i;
const AD_EN = /\b(?:follow me|check out my|dm me|link in bio|giveaway|promo|discount|subscribe|crypto|bitcoin|nft|invest\w*|earn \$|onlyfans)\b/i;
const NOT_A_PERSON_EN = /\b(?:official|news|media|magazine|tv|radio|station|company|inc|ltd|llc|brand|shop|store|bot|account for|updates)\b/i;
const MINOR_BIO_EN = /\b(?:1[0-7] ?(?:y\/?o|years? old)|high school|middle school|student|teen)\b/i;
/* What a reply may not be: a link, an advertisement, a quarrel, a run of marks. */
const AD = /PR|プロモーション|広告|宣伝|案件|フォローして|RTして|リポストして|プレゼント|当選|キャンペーン|DM|ＤＭ|副業|稼げ|儲か|投資/;
const QUARREL = /お前|てめ|こいつ|あいつ|バカ|ばか|馬鹿|アホ|あほ|ふざけ|許さない|許せない|ゆるさない|頭おかしい|キモ|きも|うざ|ウザ|黙れ|〇ね|しね|最悪|クソ|くそ|ケツ|自業自得|ざまあ|ざまぁ|異常だ|晒/;
/* Thanks to the paper for its article: no words of one's own. */
const THANKS = /記事[をの]?ありがと|取材[をの]?ありがと|インタビュー記事|ありがとうございます/;
/* The words themselves: no advertisement, quarrel or politics, nothing the other filters leave out. */
const wordsOkEn = t => !(AD_EN.test(t) || QUARREL_EN.test(t) || POLITICS_EN.test(t) || cruel(t) || personal(t) || slander(t) || alcohol(t) || tobacco(t) || /[!?]{3,}|(?:ha){3,}|(?:lo){2,}l/i.test(t));
const wordsOk = t => !(AD.test(t) || QUARREL.test(t) || THANKS.test(t) || POLITICS.test(t) || cruel(t) || personal(t) || slander(t) || alcohol(t) || tobacco(t) || /[！!？?]{3,}|ｗ{3,}|w{4,}|草{3,}/.test(t));
const tidy = t => String(t || '').replace(/^(?:\s*[@＠][A-Za-z0-9_]+)+/, '').replace(/https?:\/\/\S+/g, ' ').replace(/[#＃][^\s#＃]+/g, ' ').replace(/[─-▟]+/g, ' ').replace(/\s+/g, ' ').trim();

async function conversation(id) {
  const res = await fetch('https://api.fxtwitter.com/2/conversation/' + id, { headers: { 'user-agent': 'githito.xapi collector' }, signal: AbortSignal.timeout(25000) });
  const d = await res.json().catch(() => null);
  if (res.status !== 200 || !d || (d.code && d.code !== 200)) throw new Error('refused (' + res.status + ')');
  return d;
}
function said(st, news, lang) {
  const a = (st && st.author) || {};
  const h = String(a.screen_name || '').replace(/^@+/, '');
  const t = tidy(st && st.text);
  const followers = Number(a.followers ?? a.followers_count) || 0;
  const likes = Number(st.likes ?? st.favorite_count) || 0;
  const bio = String(a.description || '') + ' ' + String(a.name || '');
  if (!h || h.toLowerCase() === String(news.h).toLowerCase() || a.protected || st.possibly_sensitive) return null;
  if (followers < CONF.followers || likes < CONF.likes) return null;
  if (lang === 'en') {
    if (NOT_A_PERSON_EN.test(bio) || MINOR_BIO_EN.test(bio) || NOT_A_PERSON.test(bio)) return null;
    if (/https?:\/\//.test(String(st.text || '')) || t.length < 20 || t.length > 160 || (t.match(/[A-Za-z]/g) || []).length < t.length * 0.6 || /[ぁ-ヿ一-鿿]/.test(t)) return null;
    if (!wordsOkEn(t)) return null;
  } else {
    if (NOT_A_PERSON.test(bio) || MINOR_BIO.test(bio)) return null;
    if (/https?:\/\//.test(String(st.text || '')) || len(t) < 10 || len(t) > 90 || (t.match(/[ぁ-ヿ一-鿿]/g) || []).length < 6) return null;
    if (!wordsOk(t)) return null;
  }
  return { id: String(st.id), h, n: String(a.name || h).slice(0, 40), f: followers, l: likes, t, on: String(news.id), g: news.g || '', at: st.created_at ? new Date(st.created_at).toISOString().replace(/\.\d+Z$/, 'Z') : '', found: stamp() };
}

async function gather(lang, posts, minutes) {
  const news = await readJson(path.join(CONF.out, 'v1', `news-${lang}.json`), {});
  const file = path.join(CONF.out, 'v1', `people-${lang}.json`);
  const before = await readJson(file, { people: [], read: {} });
  const fresh = at => Date.now() - Date.parse(at || 0) < CONF.hours * 3600e3;
  const read = Object.fromEntries(Object.entries(before.read || {}).filter(([, at]) => fresh(at)));
  /* What the file holds is held to today's rules too. */
  const ok = lang === 'en' ? wordsOkEn : wordsOk;
  const people = (Array.isArray(before.people) ? before.people : []).filter(p => p && p.id && p.t && fresh(p.found) && ok(p.t));
  const have = new Set(people.map(p => p.id));
  const politics = lang === 'en' ? POLITICS_EN : POLITICS;
  /* The most answered news of the last day, not read in the last two days, politics and safety left out. */
  const heads = (Array.isArray(news.heads) ? news.heads : [])
    .filter(x => x && x.id && !read[x.id] && Date.now() - Date.parse(x.found || x.at || 0) < 24 * 3600e3 && (Number(x.rc) || 0) >= 1 && !NO_GENRE.has(x.g) && !politics.test(x.t + ' ' + (x.d || '')) && !cruel(x.t) && !personal(x.t))
    .sort((a, b) => (Number(b.rc) || 0) - (Number(a.rc) || 0)).slice(0, posts);
  const deadline = Date.now() + minutes * 60e3;
  let asked = 0, refused = 0, got = 0;
  for (const x of heads) {
    if (Date.now() > deadline || refused >= 3) break;
    let d;
    try { d = await conversation(x.id); asked++; } catch (e) { refused++; console.log(`  people (${lang}): the conversation ${e.message}`); await sleep(3000); continue; }
    read[x.id] = stamp();
    /* Two for a piece of news at most, the most liked first; one for a person in the file. */
    const found = (Array.isArray(d.replies) ? d.replies : []).map(st => said(st, x, lang)).filter(Boolean)
      .filter(p => !have.has(p.id) && !people.some(q => q.h.toLowerCase() === p.h.toLowerCase())).sort((a, b) => b.l - a.l).slice(0, 2);
    found.forEach(p => { people.push(p); have.add(p.id); got++; });
    await sleep(1200);
  }
  people.sort((a, b) => (Date.parse(b.found) || 0) - (Date.parse(a.found) || 0));
  const out = { version: 1, lang, updated: stamp(), read, people: people.slice(0, CONF.keep) };
  await writeFile(file, JSON.stringify(out) + '\n');
  if (got) await writeFile(path.join(CONF.out, '.changed'), stamp() + '\n');
  console.log(`People (${lang}): ${asked} news posts read as conversations (${refused} refused), ${got} new posts kept; the file holds ${out.people.length}.`);
}
async function main() {
  await mkdir(path.join(CONF.out, 'v1'), { recursive: true });
  await gather('ja', CONF.posts, CONF.minutes);
  await gather('en', Math.ceil(CONF.posts / 3), CONF.minutes / 3);
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
