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
import { cruel, personal, slander, alcohol, tobacco, politicalTarget, politicalAttack, safeWords } from './filters.mjs';

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
/* Politics, narrowly: parties, politicians and elections (国民的アイドル, 中国地方, 核心, 軍手 are no politics). */
/* The news whose replies are read: not politics or public safety (what people reply there is one side
   against another). Well-known people's own posts are held to the words only. */
const NO_GENRE = new Set(['politics', 'safety']);
/* In English, what people reply under world news is mostly a quarrel: only the replies under sports,
   entertainment, space and science are read. */
const LIGHT_EN = new Set(['sports', 'entertainment', 'space', 'science']);
const POLITICS = /国防|保守党|政党|党首|新党|議会|予算|税金|市長|知事|中国(?!地方|料理|語|茶|四国|山地)|韓国(?!料理|ドラマ|コスメ|語|旅行)|日中|日韓|米中|関係修復|防衛|帰化|国政|政府|政治|国会|安全保障|尖閣|竹島|外国籍|自民|立憲|立民|維新の会|公明|共産党|国民民主|参政党|れいわ|社民|選挙|投票|首相|総理|大臣|議員|政権|内閣|政党|与党|野党|移民|難民|安倍|石破|岸田|高市|トランプ|プーチン|習近平|バイデン/;
/* English: the same kinds of words. */
const POLITICS_EN = /\b(?:trump|biden|harris|obama|maga|democrats?|republicans?|gop|election|senator|congressman|congresswoman|white house|liberals?|conservatives?|immigra\w*|israel|gaza|palestin\w*|hamas|netanyahu|putin|zelensky)\b/i;
const AD_EN = /\b(?:follow me|check out my|dm me|link in bio|giveaway|promo|discount|subscribe|crypto|bitcoin|nft|invest\w*|earn \$|onlyfans)\b/i;
const NOT_A_PERSON_EN = /\b(?:official|news|media|magazine|tv|radio|station|company|inc|ltd|llc|brand|shop|store|bot|account for|updates)\b/i;
const MINOR_BIO_EN = /\b(?:1[0-7] ?(?:y\/?o|years? old)|high school|middle school|student|teen)\b/i;
/* What a reply may not be: a link, an advertisement, a quarrel, a run of marks. */
const AD = /PR|プロモーション|広告|宣伝|案件|フォローして|RTして|リポストして|プレゼント|当選|キャンペーン|DM|ＤＭ|副業|稼げ|儲か|投資/;
/* Thanks to the paper for its article: no words of one's own. */
const THANKS = /記事[をの]?ありがと|取材[をの]?ありがと|インタビュー記事|ありがとうございます/;
/* The words themselves: no advertisement, quarrel or politics, nothing the other filters leave out. */
/* (Quarrels are not left out: what people argue about is people's words too. Slander still is.) */
const wordsOkEn = t => safeWords(t, false) && !(politicalTarget(t) || AD_EN.test(t) || POLITICS_EN.test(t) || cruel(t) || personal(t) || slander(t) || alcohol(t) || tobacco(t) || /^[^A-Za-z]*$/.test(t));
/* (A reply about a politician, a party, the government, a paper or a broadcaster is left out: politicalTarget.) */
const wordsOk = t => safeWords(t, false) && !(politicalTarget(t) || AD.test(t) || THANKS.test(t) || POLITICS.test(t) || cruel(t) || personal(t) || slander(t) || alcohol(t) || tobacco(t) || /^[^ぁ-ヿ一-鿿]*$/.test(t));
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

/* Well-known people's own accounts are kept in the PRIVATE memo (news-famous.json in the folder XAPI_MEMO_DIR
   or --memo names), never in this public repository: { ja: [{ h, k, g }], en: [...] }. k: a part of the name
   the account must show (an account is used only when its name has it, so that a handle that is someone
   else's is not; without k the account must have 200,000 followers or more). g: the genre. News only:
   Reply News does not read it. Without the memo (the MEMO_TOKEN secret), nobody's own posts are read. */
const MEMO_DIR = opt('memo', process.env.XAPI_MEMO_DIR || '');
async function famousList() {
  if (!MEMO_DIR) return { ja: [], en: [] };
  const d = await readJson(path.join(path.resolve(MEMO_DIR), 'news-famous.json'), {});
  const list = l => (Array.isArray(d[l]) ? d[l] : []).filter(e => e && /^[A-Za-z0-9_]{1,15}$/.test(String(e.h || ''))).map(e => [String(e.h), String(e.k || ''), String(e.g || 'entertainment')]);
  return { ja: list('ja'), en: list('en') };
}
let FAMOUS = { ja: [], en: [] };
async function ownPosts(handle) {
  const res = await fetch('https://api.fxtwitter.com/2/profile/' + handle + '/statuses?count=40', { headers: { 'user-agent': 'githito.xapi collector' }, signal: AbortSignal.timeout(25000) });
  const d = await res.json().catch(() => null);
  if (res.status !== 200 || !d || (d.code && d.code !== 200)) throw new Error('did not answer (' + res.status + ')');
  return Array.isArray(d.results) ? d.results : [];
}
/* Their own posts of the last three days that many liked (one in twenty thousand followers, a hundred at
   least): the best two of each person a run. */
/* Well-known people's own words are not held to the topic filters (politics, advertisement): what they post
   is said in public under their own name. Only what is never shown is left out: cruel, personal, slander,
   and alcohol and smoking (the pages are read by the young too). */
const famousOk = t => !(cruel(t) || personal(t) || slander(t) || alcohol(t) || tobacco(t) || politicalAttack(t));
async function famous(lang, people, have, readAt, notThem, minutes) {
  const ok = famousOk;
  /* Those read longest ago first; an account found not to be the person waits a week. */
  const list = (FAMOUS[lang] || []).filter(([h]) => !notThem[h] || Date.now() - Date.parse(notThem[h]) > 7 * 24 * 3600e3)
    .sort((x, y) => (Date.parse(readAt[x[0]] || 0) || 0) - (Date.parse(readAt[y[0]] || 0) || 0));
  const deadline = Date.now() + minutes * 60e3;
  let asked = 0, answered = 0, got = 0;
  for (const [h, key, g] of list) {
    if (Date.now() > deadline) break;
    asked++;
    let posts;
    try { posts = await ownPosts(h); } catch (e) { await sleep(1500); continue; }
    readAt[h] = stamp();
    const own = posts.filter(st => st && st.author && String(st.author.screen_name).toLowerCase() === h.toLowerCase() && !st.reposted_by && !(st.replying_to && (st.replying_to.status || st.replying_to.screen_name)));
    const a = own[0] && own[0].author;
    if (!a) { await sleep(1000); continue; }
    /* The person: the expected name (with 50,000 followers), or 100,000 followers whatever the name. */
    const fl = Number(a.followers) || 0;
    const them = (key && String(a.name || '').toLowerCase().includes(key.toLowerCase()) && fl >= 50000) || fl >= 100000;
    if (!them || a.protected) { notThem[h] = stamp(); await sleep(1000); continue; }
    answered++;
    const least = Math.max(100, Math.round((Number(a.followers) || 0) / 20000));
    const found = own.map(st => {
      const t = tidy(st.text);
      const likes = Number(st.likes) || 0;
      const at = st.created_at ? new Date(st.created_at).toISOString().replace(/\.\d+Z$/, 'Z') : '';
      if (likes < least || Date.now() - Date.parse(at || 0) > 72 * 3600e3 || have.has(String(st.id)) || st.possibly_sensitive) return null;
      if (lang === 'en' ? (t.length < 20 || t.length > 200 || /[ぁ-ヿ一-鿿]/.test(t)) : (len(t) < 8 || len(t) > 100 || (t.match(/[ぁ-ヿ一-鿿]/g) || []).length < 4)) return null;
      if (!ok(t)) return null;
      return { id: String(st.id), h: a.screen_name, n: String(a.name).slice(0, 40), f: Number(a.followers) || 0, l: likes, t, on: '', own: 1, g, at, found: stamp() };
    }).filter(Boolean).sort((x, y) => y.l - x.l).slice(0, 2);
    found.forEach(p => { people.push(p); have.add(p.id); got++; });
    await sleep(1000);
  }
  console.log(`  famous (${lang}): ${asked} accounts asked, ${answered} answered as themselves, ${got} posts kept`);
  return got;
}
async function gather(lang, posts, minutes) {
  const news = await readJson(path.join(CONF.out, 'v1', `news-${lang}.json`), {});
  const file = path.join(CONF.out, 'v1', `people-${lang}.json`);
  const before = await readJson(file, { people: [], read: {} });
  const fresh = at => Date.now() - Date.parse(at || 0) < CONF.hours * 3600e3;
  const read = Object.fromEntries(Object.entries(before.read || {}).filter(([, at]) => fresh(at)));
  /* What the file holds is held to today's rules too. */
  const ok = lang === 'en' ? wordsOkEn : wordsOk;
  const politics = lang === 'en' ? POLITICS_EN : POLITICS;
  /* (A reply under news that is politics or public safety is left out too, whenever it was kept.) */
  const headOf = new Map((Array.isArray(news.heads) ? news.heads : []).map(x => [String(x.id), x]));
  const underOk = p => { const x = p.on && headOf.get(String(p.on)); return !x || (!NO_GENRE.has(x.g) && (lang !== 'en' || LIGHT_EN.has(x.g)) && !politics.test(x.t + ' ' + (x.d || ''))); };
  const people = (Array.isArray(before.people) ? before.people : []).filter(p => p && p.id && p.t && fresh(p.found) && (p.own ? famousOk(p.t) : ok(p.t) && underOk(p)));
  const have = new Set(people.map(p => p.id));
  /* The most answered news of the last day, not read in the last two days, politics and safety left out. */
  const heads = (Array.isArray(news.heads) ? news.heads : [])
    .filter(x => x && x.id && !read[x.id] && Date.now() - Date.parse(x.found || x.at || 0) < 24 * 3600e3 && (Number(x.rc) || 0) >= 1 && !NO_GENRE.has(x.g) && (lang !== 'en' || LIGHT_EN.has(x.g)) && !politics.test(x.t + ' ' + (x.d || '')) && !cruel(x.t) && !personal(x.t))
    .sort((a, b) => (Number(b.rc) || 0) - (Number(a.rc) || 0)).slice(0, posts);
  /* Well-known people's own words first, then what people replied under the news. */
  const famousRead = Object.fromEntries(Object.entries(before.famousRead || {}).filter(([, at]) => fresh(at)));
  const notThem = Object.fromEntries(Object.entries(before.notThem || {}).filter(([, at]) => Date.now() - Date.parse(at || 0) < 7 * 24 * 3600e3));
  let got = await famous(lang, people, have, famousRead, notThem, minutes / 2);
  const deadline = Date.now() + minutes * 60e3;
  let asked = 0, refused = 0;
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
  const out = { version: 1, lang, updated: stamp(), read, famousRead, notThem, people: people.slice(0, CONF.keep) };
  await writeFile(file, JSON.stringify(out) + '\n');
  if (got) await writeFile(path.join(CONF.out, '.changed'), stamp() + '\n');
  console.log(`People (${lang}): ${asked} news posts read as conversations (${refused} refused), ${got} new posts kept; the file holds ${out.people.length}.`);
}
async function main() {
  await mkdir(path.join(CONF.out, 'v1'), { recursive: true });
  FAMOUS = await famousList();
  console.log(MEMO_DIR ? `Well-known people (the private memo): ${FAMOUS.ja.length} Japanese, ${FAMOUS.en.length} English accounts.` : 'No private memo (XAPI_MEMO_DIR): no well-known person\'s own posts are read.');
  await gather('ja', CONF.posts, CONF.minutes);
  await gather('en', Math.ceil(CONF.posts / 3), CONF.minutes / 3);
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) main().catch(e => { console.error(e.message || e); process.exit(1); });
