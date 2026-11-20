/* stock.mjs: the video stock. After every collection (every half hour) the cards are written from what was
   collected (compose.mjs: the words checked, and mended where they could be), and the cards are dealt into
   videos of ten. A video is made only when ten new cards are there; the videos made before stay as they
   were while their cards are still in the files. About a hundred videos are kept, the newest first.

     v1/stock-news-ja.json   News: cards { id, h, n, g, at, kw, ja: [what, who], how, q? }
     v1/stock-news-en.json   News in English: cards written from English news (english.mjs; nothing translated)
     v1/stock-humor-ja.json  Reply News: talks { i, k, at, s, gl, m: [{ i, h, to, ja: [part, whole] }] }
                             (a talk is a conversation; a message is a card)
     both: videos [{ i, at, c: [card or talk ids], m? }], replies (to the accounts readers asked for), asked

   News is made of people's own words (people.mjs): no paper or broadcaster is on its cards. The news posts
   are read only to find what people say under them.

   The pages read these files and nothing else: they make no words of their own. A reader's page plays the
   newest video it has not played, or picks among the cards when the reader chose genres or words.

     node stock.mjs --out public [--videos 100] [--size 10] */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { newsCard, talkCards, replyCard, personCard, personCardEn } from './compose.mjs';

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
function deal(cards, before, { person, group, cap, tag, max = MAX, tail, version }) {
  const byId = new Map(cards.map(c => [c.id, c]));
  const known = new Set(byId.keys());
  if (tail) tail.pool.forEach(c => known.add(c.id));
  /* A video made by an older version of this program is made again. */
  const kept = (Array.isArray(before) ? before : []).filter(v => v && Array.isArray(v.c) && v.c.length && (v.v || 1) === (version || 1) && v.c.every(id => known.has(id))).slice(0, max);
  const used = new Set(kept.flatMap(v => v.c));
  /* With the stock full, only cards newer than its oldest video make new videos (older ones would be
     dealt, and dropped again, at every run). */
  const oldest = kept.length >= max ? Math.min(...kept.map(v => Date.parse(v.at || 0) || 0)) : -Infinity;
  let free = cards.filter(c => !used.has(c.id) && time(c) > oldest);
  /* tail: cards that close each video (what people said, three in ten), each used once. */
  const tails = tail ? tail.pool.filter(c => !used.has(c.id)) : [];
  const made = [];
  const stamp = Date.now().toString(36);
  for (;;) {
    const end = [];
    if (tail) for (const c of tails) { if (end.length >= tail.count) break; if (!end.some(e => person(e)[0] === person(c)[0])) end.push(c); }
    const size = SIZE - end.length;
    if (free.length < size) break;
    end.forEach(c => tails.splice(tails.indexOf(c), 1));
    const v = [];
    const people = new Set();
    const groups = {};
    /* Strict first; then a genre may come more often; then an account may come twice. */
    for (let pass = 0; pass < 3 && v.length < size; pass++) {
      for (const c of free) {
        if (v.length >= size) break;
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
    order.push(...end);
    made.push({ i: 'v' + stamp + made.length.toString(36), ...(version ? { v: version } : {}), at: order.reduce((m, c) => (time(c) > Date.parse(m || 0) ? c.at : m), ''), ...(tag ? tag(order) : {}), c: order.map(c => c.id) });
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
  /* News: what people said (people.mjs), a person a card, the newest first; videos of ten, nobody twice, a
     genre at most four times. A post of an account a reader asked for (q) plays for that reader only. */
  const pplFile = await readJson(path.join(OUT, 'v1', 'people-ja.json'), {});
  const headById = new Map(heads.map(x => [String(x.id), x]));
  /* Well-known people's own words first (the most liked first), then what people replied, the newest first. */
  const said = (Array.isArray(pplFile.people) ? pplFile.people : []).map(p => personCard(p, headById.get(String(p.on)))).filter(Boolean)
    .sort((x, y) => ((y.own || 0) - (x.own || 0)) || (x.own ? y.l - x.l : time(y) - time(x)));
  if (said.length) {
    const d = deal(said, oldNews.videos, { person: c => [String(c.h).toLowerCase()], group: c => c.g || 'other', cap: 4, version: 3 });
    const file = { version: 2, lang: 'ja', made, size: SIZE, cards: said.concat(cards.filter(c => c.q)), videos: d.videos, replies, asked };
    if (await save('stock-news-ja.json', file)) changed = true;
    const cuts = {}; said.forEach(c => { cuts[c.cut] = (cuts[c.cut] || 0) + 1; });
    console.log(`News: ${said.length} cards of what people said ${JSON.stringify(cuts)} (${how && Object.keys(how).length ? 'the papers\' headlines are not shown' : ''}); videos: ${d.videos.length} (${d.made} new, ${d.kept} kept), ${d.waiting} cards wait for the next video; ${replies.length} replies to asked accounts.`);
  } else console.log('News: nobody\'s words yet.');

  /* News in English: what people said under English news (people-en.json), in English as written. */
  const newsEn = await readJson(path.join(OUT, 'v1', 'news-en.json'), {});
  const oldEn = await readJson(path.join(OUT, 'v1', 'stock-news-en.json'), {});
  const pplEn = await readJson(path.join(OUT, 'v1', 'people-en.json'), {});
  const headEn = new Map((Array.isArray(newsEn.heads) ? newsEn.heads : []).map(x => [String(x.id), x]));
  const saidEn = (Array.isArray(pplEn.people) ? pplEn.people : []).map(p => personCardEn(p, headEn.get(String(p.on)))).filter(Boolean).sort((x, y) => ((y.own || 0) - (x.own || 0)) || (x.own ? y.l - x.l : time(y) - time(x)));
  if (saidEn.length) {
    const d = deal(saidEn, oldEn.videos, { person: c => [String(c.h).toLowerCase()], group: c => c.g || 'other', cap: 4, version: 3 });
    const file = { version: 2, lang: 'en', made, size: SIZE, cards: saidEn, videos: d.videos };
    if (await save('stock-news-en.json', file)) changed = true;
    console.log(`News in English: ${saidEn.length} cards of what people said; videos: ${d.videos.length} (${d.made} new, ${d.kept} kept).`);
  } else console.log('News in English: nobody\'s words yet.');

  /* Reply News: a video is conversations, whole, about ten messages: greetings said with love first, then
     the longest talks; nobody in two talks of one video; in each video the talks follow the day (good
     morning, take care and welcome home, loving talk, good night). A video of mostly morning greetings is
     marked m (the page plays those in the morning). */
  const stories = Array.isArray(humor.stories) ? humor.stories : [];
  if (stories.length) {
    const seenMsg = new Set();
    const talks = stories.map(talkCards).filter(t => t && !t.m.some(x => x.i && seenMsg.has(x.i)) && (t.m.forEach(x => x.i && seenMsg.add(x.i)), true));
    const rank = t => t.gl * 100 + Math.min(t.m.length, 8) * 6 + t.s;
    talks.sort((x, y) => (rank(y) - rank(x)) || (time(y) - time(x)));
    const byId = new Map(talks.map(t => [t.i, t]));
    const kept = (Array.isArray(oldHumor.videos) ? oldHumor.videos : []).filter(v => v && Array.isArray(v.c) && v.c.length && v.c.every(id => byId.has(id))).slice(0, MAX);
    const used = new Set(kept.flatMap(v => v.c));
    const oldest = kept.length >= MAX ? Math.min(...kept.map(v => Date.parse(v.at || 0) || 0)) : -Infinity;
    let free = talks.filter(t => !used.has(t.i) && time(t) > oldest);
    const DAY = { morning: 0, home: 1, love: 2, icha: 2, miss: 2, other: 2, night: 3 };
    const stamp = Date.now().toString(36);
    const made = [];
    while (free.reduce((n, t) => n + t.m.length, 0) >= SIZE - 2) {
      const v = [];
      const people = new Set();
      let n = 0;
      for (const strict of [true, false]) {
        for (const t of free) {
          if (n >= SIZE) break;
          if (v.includes(t) || (n && n + t.m.length > SIZE + 2)) continue;
          const who = [...new Set(t.m.map(x => String(x.h).toLowerCase()))];
          if (strict && who.some(h => people.has(h))) continue;
          v.push(t); who.forEach(h => people.add(h)); n += t.m.length;
        }
        if (n >= SIZE - 2) break;
      }
      if (n < SIZE - 2) break;
      free = free.filter(t => !v.includes(t));
      v.sort((x, y) => (DAY[x.k] ?? 2) - (DAY[y.k] ?? 2));
      const morningMsgs = v.filter(t => t.k === 'morning').reduce((c, t) => c + t.m.length, 0);
      /* g: how much of the video is greetings said with love (0 to 2). */
      const g = Math.round(v.reduce((c, t) => c + t.gl * t.m.length, 0) / n * 10) / 10;
      made.push({ i: 'v' + stamp + made.length.toString(36), at: v.reduce((m, t) => (time(t) > Date.parse(m || 0) ? t.at : m), ''), g, ...(morningMsgs * 2 > n ? { m: 1 } : {}), c: v.map(t => t.i) });
    }
    /* Greetings said with love first, then the newest. */
    const videos = kept.concat(made).sort((x, y) => (Math.round((y.g || 0) * 2) - Math.round((x.g || 0) * 2)) || ((Date.parse(y.at || 0) || 0) - (Date.parse(x.at || 0) || 0))).slice(0, MAX);
    const inVideos = new Set(videos.flatMap(v => v.c));
    const shown = talks.filter(t => inVideos.has(t.i)).concat(talks.filter(t => !inVideos.has(t.i)).slice(0, 100));
    const file = { version: 2, lang: 'ja', made, size: SIZE, talks: shown, videos, replies, asked };
    if (await save('stock-humor-ja.json', file)) changed = true;
    const msgs = {}; talks.forEach(t => { msgs[t.m.length] = (msgs[t.m.length] || 0) + 1; });
    const gl = [0, 1, 2].map(g => talks.filter(t => t.gl === g).length);
    console.log(`Reply News: ${talks.length} talks from ${stories.length} stories (messages per talk ${JSON.stringify(msgs)}; greeting with love ${gl[2]}, one of the two ${gl[1]}, neither ${gl[0]}); videos: ${videos.length} (${made.filter(v => videos.includes(v)).length} new, ${videos.filter(v => v.m).length} of the morning).`);
  } else console.log('Reply News: no stories yet.');

  if (changed) await writeFile(path.join(OUT, '.changed'), made + '\n');
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
