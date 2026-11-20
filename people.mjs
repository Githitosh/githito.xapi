/* people.mjs: what people say about the news, for News (about three cards in ten, in the second half of a
   video). After news.mjs: the most answered news posts of the last day are read as conversations
   (FxTwitter's conversation: the post and the replies under it; X's search is refused at present), and the
   replies that have their own reach are kept: a person (not a paper, a company or a bot) with followers,
   whose reply was liked by many.

   Politics and public safety are left out (what people reply there is mostly one side against another),
   and so is anything the other filters leave out: cruel, personal, slander, alcohol and smoking (filters.mjs),
   a link, an advertisement, a profile that speaks of being under age.

     v1/people-ja.json   { version, lang, updated, read: { news id: time }, people: [{ id, h (handle), n (name),
                           f (followers), l (likes), t (the words), on (the news post), g, at, found }] }

     node people.mjs --out public [--minutes 4] [--posts 50] [--followers 500] [--likes 8] */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { cruel, personal, slander, alcohol, tobacco } from './filters.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const CONF = {
  out: path.resolve(opt('out', 'public')),
  minutes: Number(opt('minutes', 4)) || 4,
  posts: Number(opt('posts', 50)) || 50,        // news posts read as conversations in one run
  followers: Number(opt('followers', 500)) || 500,   // a person with some following
  likes: Number(opt('likes', 8)) || 8,               // and a reply that people liked
  hours: 48,                                    // a post leaves the file after this many hours
  keep: 300,
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
const POLITICS = /政府|首相|総理|大臣|政権|内閣|与党|野党|自民|立憲|立民|維新|公明|共産|国民民主|参政|れいわ|社民|選挙|投票|議員|国会|知事|市長|政治|外交|外国人|移民|難民|中国人|韓国人|在日|売国|反日|左翼|右翼|パヨク|ネトウヨ|マスコミ|マスゴミ|外人|国民|圧力|陰謀|洗脳|中国|韓国|北朝鮮|ロシア|アメリカ|米国|税金|増税|減税|憲法|戦争|軍|ミサイル|核/;
/* What a reply may not be: a link, an advertisement, a quarrel, a run of marks. */
const AD = /PR|プロモーション|広告|宣伝|案件|フォローして|RTして|リポストして|プレゼント|当選|キャンペーン|DM|ＤＭ|副業|稼げ|儲か|投資/;
const QUARREL = /お前|てめ|こいつ|あいつ|バカ|ばか|馬鹿|アホ|あほ|ふざけ|許さない|許せない|ゆるさない|頭おかしい|キモ|きも|うざ|ウザ|黙れ|〇ね|しね|最悪|クソ|くそ|ケツ|自業自得|ざまあ|ざまぁ|異常だ|晒/;
/* Thanks to the paper for its article: no words of one's own. */
const THANKS = /記事[をの]?ありがと|取材[をの]?ありがと|インタビュー記事|ありがとうございます/;
/* The words themselves: no advertisement, quarrel or politics, nothing the other filters leave out. */
const wordsOk = t => !(AD.test(t) || QUARREL.test(t) || THANKS.test(t) || POLITICS.test(t) || cruel(t) || personal(t) || slander(t) || alcohol(t) || tobacco(t) || /[！!？?]{3,}|ｗ{3,}|w{4,}|草{3,}/.test(t));
const tidy = t => String(t || '').replace(/^(?:\s*[@＠][A-Za-z0-9_]+)+/, '').replace(/https?:\/\/\S+/g, ' ').replace(/[#＃][^\s#＃]+/g, ' ').replace(/[─-▟]+/g, ' ').replace(/\s+/g, ' ').trim();

async function conversation(id) {
  const res = await fetch('https://api.fxtwitter.com/2/conversation/' + id, { headers: { 'user-agent': 'githito.xapi collector' }, signal: AbortSignal.timeout(25000) });
  const d = await res.json().catch(() => null);
  if (res.status !== 200 || !d || (d.code && d.code !== 200)) throw new Error('refused (' + res.status + ')');
  return d;
}
function said(st, news) {
  const a = (st && st.author) || {};
  const h = String(a.screen_name || '').replace(/^@+/, '');
  const t = tidy(st && st.text);
  const followers = Number(a.followers ?? a.followers_count) || 0;
  const likes = Number(st.likes ?? st.favorite_count) || 0;
  const bio = String(a.description || '') + ' ' + String(a.name || '');
  if (!h || h.toLowerCase() === String(news.h).toLowerCase() || a.protected || st.possibly_sensitive) return null;
  if (followers < CONF.followers || likes < CONF.likes) return null;
  if (NOT_A_PERSON.test(bio) || MINOR_BIO.test(bio)) return null;
  if (/https?:\/\//.test(String(st.text || '')) || len(t) < 10 || len(t) > 90 || (t.match(/[ぁ-ヿ一-鿿]/g) || []).length < 6) return null;
  if (!wordsOk(t)) return null;
  return { id: String(st.id), h, n: String(a.name || h).slice(0, 40), f: followers, l: likes, t, on: String(news.id), g: news.g || '', at: st.created_at ? new Date(st.created_at).toISOString().replace(/\.\d+Z$/, 'Z') : '', found: stamp() };
}

async function main() {
  await mkdir(path.join(CONF.out, 'v1'), { recursive: true });
  const news = await readJson(path.join(CONF.out, 'v1', 'news-ja.json'), {});
  const file = path.join(CONF.out, 'v1', 'people-ja.json');
  const before = await readJson(file, { people: [], read: {} });
  const fresh = at => Date.now() - Date.parse(at || 0) < CONF.hours * 3600e3;
  const read = Object.fromEntries(Object.entries(before.read || {}).filter(([, at]) => fresh(at)));
  /* What the file holds is held to today's rules too. */
  const people = (Array.isArray(before.people) ? before.people : []).filter(p => p && p.id && p.t && fresh(p.found) && wordsOk(p.t));
  const have = new Set(people.map(p => p.id));
  /* The most answered news of the last day, not read in the last two days, politics and safety left out. */
  const heads = (Array.isArray(news.heads) ? news.heads : [])
    .filter(x => x && x.id && !read[x.id] && Date.now() - Date.parse(x.found || x.at || 0) < 24 * 3600e3 && (Number(x.rc) || 0) >= 3 && !NO_GENRE.has(x.g) && !POLITICS.test(x.t + ' ' + (x.d || '')) && !cruel(x.t) && !personal(x.t))
    .sort((a, b) => (Number(b.rc) || 0) - (Number(a.rc) || 0)).slice(0, CONF.posts);
  const deadline = Date.now() + CONF.minutes * 60e3;
  let asked = 0, refused = 0, got = 0;
  for (const x of heads) {
    if (Date.now() > deadline || refused >= 3) break;
    let d;
    try { d = await conversation(x.id); asked++; } catch (e) { refused++; console.log(`  people: the conversation ${e.message}`); await sleep(3000); continue; }
    read[x.id] = stamp();
    /* Two for a piece of news at most, the most liked first; one for a person in the file. */
    const found = (Array.isArray(d.replies) ? d.replies : []).map(st => said(st, x)).filter(Boolean)
      .filter(p => !have.has(p.id) && !people.some(q => q.h.toLowerCase() === p.h.toLowerCase())).sort((a, b) => b.l - a.l).slice(0, 2);
    found.forEach(p => { people.push(p); have.add(p.id); got++; });
    await sleep(1500);
  }
  people.sort((a, b) => (Date.parse(b.found) || 0) - (Date.parse(a.found) || 0));
  const out = { version: 1, lang: 'ja', updated: stamp(), read, people: people.slice(0, CONF.keep) };
  await writeFile(file, JSON.stringify(out) + '\n');
  if (got) await writeFile(path.join(CONF.out, '.changed'), stamp() + '\n');
  console.log(`People on the news: ${asked} news posts read as conversations (${refused} refused), ${got} new posts kept; the file holds ${out.people.length}.`);
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
