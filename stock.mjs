/* stock.mjs: the video stock. After every collection (every half hour) the cards are written from what was
   collected (compose.mjs: the words checked, and mended where they could be), and the cards are dealt into
   videos of ten. A video is made only when ten new cards are there; the videos made before stay as they
   were while their cards are still in the files. About a hundred videos are kept, the newest first.

     v1/stock-news-ja.json   News: cards { id, h, n, g, at, kw, ja: [what, who], how, q? }
     v1/stock-humor-ja.json  Reply News: cards { id, k, at, s, a, b, kw, ja: [post, reply] }
     both: videos [{ i, at, c: [card ids], m? }], replies (to the accounts readers asked for), asked

   The pages read these files and nothing else: they make no words of their own. A reader's page plays the
   newest video it has not played, or picks among the cards when the reader chose genres or words.

     node stock.mjs --out public [--videos 100] [--size 10] */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { newsCard, humorCard, replyCard } from './compose.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const OUT = path.resolve(opt('out', 'public'));
const MAX = Number(opt('videos', 100)) || 100;
const SIZE = Number(opt('size', 10)) || 10;
const readJson = async (file, d) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { return d; } };
const time = x => Date.parse(x && x.at) || 0;

/* Cards into videos. cards: in the order they should play (the first first). person(card): the accounts
   a card shows (nobody twice in a video); group(card): its genre or kind (at most cap of one in a video;
   the same one is not shown twice in a row). Videos whose cards are all still here are kept. */
function deal(cards, before, { person, group, cap, tag, max = MAX }) {
  const byId = new Map(cards.map(c => [c.id, c]));
  const kept = (Array.isArray(before) ? before : []).filter(v => v && Array.isArray(v.c) && v.c.length && v.c.every(id => byId.has(id))).slice(0, max);
  const used = new Set(kept.flatMap(v => v.c));
  /* With the stock full, only cards newer than its oldest video make new videos (older ones would be
     dealt, and dropped again, at every run). */
  const oldest = kept.length >= max ? Math.min(...kept.map(v => Date.parse(v.at || 0) || 0)) : -Infinity;
  let free = cards.filter(c => !used.has(c.id) && time(c) > oldest);
  const made = [];
  const stamp = Date.now().toString(36);
  while (free.length >= SIZE) {
    const v = [];
    const people = new Set();
    const groups = {};
    /* Strict first; then a genre may come more often; then an account may come twice. */
    for (let pass = 0; pass < 3 && v.length < SIZE; pass++) {
      for (const c of free) {
        if (v.length >= SIZE) break;
        if (v.includes(c)) continue;
        const ps = person(c);
        if (pass < 2 && ps.some(p => people.has(p))) continue;
        const g = group(c);
        if (pass < 1 && g && (groups[g] || 0) >= cap) continue;
        v.push(c);
        ps.forEach(p => people.add(p));
        groups[g] = (groups[g] || 0) + 1;
      }
    }
    free = free.filter(c => !v.includes(c));
    /* The same genre not twice in a row where that can be helped. */
    const order = [];
    const left = v.slice();
    while (left.length) {
      const last = order.length ? group(order[order.length - 1]) : null;
      const k = left.findIndex(c => group(c) !== last);
      order.push(left.splice(k < 0 ? 0 : k, 1)[0]);
    }
    made.push({ i: 'v' + stamp + made.length.toString(36), at: order.reduce((m, c) => (time(c) > Date.parse(m || 0) ? c.at : m), ''), ...(tag ? tag(order) : {}), c: order.map(c => c.id) });
  }
  const videos = kept.concat(made).sort((x, y) => (Date.parse(y.at || 0) || 0) - (Date.parse(x.at || 0) || 0)).slice(0, max);
  const now = new Set(videos.map(v => v.i));
  return { videos, made: made.filter(v => now.has(v.i)).length, kept: kept.filter(v => now.has(v.i)).length, waiting: free.length };
}
/* Write only what changed (the time it was made aside), so a run with nothing new publishes nothing. */
async function save(name, data) {
  const file = path.join(OUT, 'v1', name);
  const old = await readJson(file, null);
  const same = old && JSON.stringify({ ...old, made: '' }) === JSON.stringify({ ...data, made: '' });
  if (same) return false;
  await writeFile(file, JSON.stringify(data) + '\n');
  return true;
}

async function main() {
  await mkdir(path.join(OUT, 'v1'), { recursive: true });
  const news = await readJson(path.join(OUT, 'v1', 'news-ja.json'), {});
  const humor = await readJson(path.join(OUT, 'v1', 'humor-ja.json'), {});
  const oldNews = await readJson(path.join(OUT, 'v1', 'stock-news-ja.json'), {});
  const oldHumor = await readJson(path.join(OUT, 'v1', 'stock-humor-ja.json'), {});
  const made = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const asked = Array.isArray(news.asked) ? news.asked : [];
  let changed = false;

  /* The replies to the accounts readers asked for: a card each, the newest first. */
  const posts = news.news && typeof news.news === 'object' ? news.news : {};
  const replies = (Array.isArray(news.items) ? news.items : []).map(x => replyCard(x, posts[x.n])).filter(Boolean)
    .sort((x, y) => time(y) - time(x)).slice(0, 200);

  /* News: the headlines, the newest first. A card from an account one reader asked for (q) is not dealt
     into the videos: it plays only for that reader. */
  const heads = Array.isArray(news.heads) ? news.heads : [];
  const cards = [];
  const seen = new Set();
  const how = {};
  for (const x of heads) {
    const c = newsCard(x);
    if (!c || seen.has(c.id) || seen.has(c.ja.join('|'))) continue;
    seen.add(c.id); seen.add(c.ja.join('|'));
    how[c.how] = (how[c.how] || 0) + 1;
    cards.push(c);
  }
  cards.sort((x, y) => time(y) - time(x));
  if (heads.length) {
    const d = deal(cards.filter(c => !c.q), oldNews.videos, { person: c => [String(c.h).toLowerCase()], group: c => c.g || 'other', cap: 3 });
    const used = new Set(d.videos.flatMap(v => v.c));
    /* The file holds the cards of the videos, and the newest of the rest for readers who choose genres. */
    const shown = cards.filter(c => used.has(c.id) || c.q).concat(cards.filter(c => !used.has(c.id) && !c.q).slice(0, 400));
    const file = { version: 1, lang: 'ja', made, size: SIZE, cards: shown, videos: d.videos, replies, asked };
    if (await save('stock-news-ja.json', file)) changed = true;
    console.log(`News: ${cards.length} cards from ${heads.length} headlines ${JSON.stringify(how)}; videos: ${d.videos.length} (${d.made} new, ${d.kept} kept), ${d.waiting} cards wait for the next video; ${replies.length} replies to asked accounts.`);
  } else console.log('News: no headlines yet.');

  /* Reply News: the stories, the best first. Greetings of the morning make videos of their own (m). */
  const stories = Array.isArray(humor.stories) ? humor.stories : [];
  if (stories.length) {
    const hc = stories.map(humorCard).filter(Boolean).sort((x, y) => (y.s - x.s) || (time(y) - time(x)));
    const person = c => [String(c.a.h).toLowerCase(), String(c.b.h).toLowerCase()];
    const morning = deal(hc.filter(c => c.k === 'morning'), (oldHumor.videos || []).filter(v => v.m), { person, group: c => c.k, cap: SIZE, tag: () => ({ m: 1 }), max: Math.round(MAX * 0.3) });
    const day = deal(hc.filter(c => c.k !== 'morning'), (oldHumor.videos || []).filter(v => !v.m), { person, group: c => c.k, cap: 4, max: Math.round(MAX * 0.7) });
    const videos = day.videos.concat(morning.videos);
    const used = new Set(videos.flatMap(v => v.c));
    const shown = hc.filter(c => used.has(c.id)).concat(hc.filter(c => !used.has(c.id)).slice(0, 200));
    const file = { version: 1, lang: 'ja', made, size: SIZE, cards: shown, videos, replies, asked };
    if (await save('stock-humor-ja.json', file)) changed = true;
    console.log(`Reply News: ${hc.length} cards from ${stories.length} stories; videos: ${videos.length} (${day.made + morning.made} new, ${morning.videos.length} of the morning).`);
  } else console.log('Reply News: no stories yet.');

  if (changed) await writeFile(path.join(OUT, '.changed'), made + '\n');
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
