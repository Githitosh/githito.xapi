/* english.mjs: English news, for News in English. The latest posts of English-language news accounts on X
   (their timelines, read through FxTwitter as news.mjs reads the Japanese ones), each post's first line as
   its headline, in English as the paper wrote it: nothing is translated (no unofficial translator is used).
   compose.mjs writes the cards from these (newsCardEn) and stock.mjs makes the English videos.

   Left out as in Japanese: cruel news, news about one person before the law or in private life (the English
   lists of filters.mjs), alcohol and smoking unless it is a company's news, advertisements.

     v1/news-en.json   { version, lang, updated, heads: [{ id, h (account), n (name), t (headline), g, at, found }] }

     node english.mjs --out public [--minutes 3] */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { cruel, personal, adultNews } from './filters.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const CONF = { out: path.resolve(opt('out', 'public')), minutes: Number(opt('minutes', 3)) || 3, hours: 72, keep: 800 };
const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = async (file, d) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { return d; } };

/* The accounts: [handle, name, genre ('' : by the headline's words)]. */
const ACCOUNTS = [
  ['Reuters', 'Reuters', ''], ['AP', 'AP', ''], ['BBCWorld', 'BBC World', ''], ['BBCBreaking', 'BBC Breaking', ''], ['CNN', 'CNN', ''],
  ['nytimes', 'The New York Times', ''], ['guardian', 'The Guardian', ''], ['AJEnglish', 'Al Jazeera', ''], ['NHKWORLD_News', 'NHK World', ''],
  ['kyodo_english', 'Kyodo News', ''], ['FT', 'Financial Times', ''], ['TheEconomist', 'The Economist', ''], ['washingtonpost', 'The Washington Post', ''],
  ['ABC', 'ABC News', ''], ['axios', 'Axios', ''], ['espn', 'ESPN', 'sports'], ['Variety', 'Variety', 'entertainment'], ['NASA', 'NASA', 'space'],
];
const GENRE_WORDS = [
  ['sports', /\b(?:match|game|season|league|cup|coach|striker|goal|win|wins|beat|beats|champion\w*|title|olympic\w*|tournament|sumo|yokozuna|baseball|football|soccer|nba|nfl|mlb|tennis|golf|f1|marathon)\b/i],
  ['space', /\b(?:nasa|rocket|launch(?:es|ed)?|orbit|moon|mars|asteroid|spacecraft|astronaut\w*|satellite|space station|jaxa)\b/i],
  ['science', /\b(?:scientists?|study|research\w*|ai|artificial intelligence|climate|species|fossil|vaccine|robot\w*|chip\w*|tech|software|nvidia|apple|google|microsoft|openai)\b/i],
  ['entertainment', /\b(?:film|movie|series|star(?:s|ring)?|actor|actress|singer|album|song|box office|netflix|oscar\w*|grammy|broadway|game|play)\b/i],
  ['food', /\b(?:food|restaurant|chef|recipe|coffee|chocolate|rice|bread)\b/i],
  ['politics', /\b(?:president|prime minister|pm|minister|government|parliament|congress|senate|election\w*|vote\w*|party|summit|talks|treaty|sanction\w*|eu|un|nato)\b/i],
];
const genreOf = (t, own) => own || (GENRE_WORDS.find(([, re]) => re.test(t)) || ['other'])[0];
/* No advertisement and no invitation to watch, listen or subscribe. */
const AD = /\b(?:sponsored|subscribe|subscription|sign up|newsletter|podcast|listen (?:now|here)|watch (?:live|now|here)|live updates?|live:|read more|opinion|op-ed|quiz|crossword|puzzle|deal(?:s)? of the day|promo|gift guide|shop for|got you covered|here's a primer|how to watch|where to watch)\b/i;
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu;
/* The headline: the post's first line, without links, tags, mentions turned into names, emoji and labels. */
export function headlineEn(raw) {
  const first = String(raw || '').split(/\n+/).map(l => l.trim()).find(l => l.replace(/https?:\/\/\S+/g, '').trim()) || '';
  return first.replace(/https?:\/\/\S+/g, ' ').replace(/[#＃]([A-Za-z]\w*)/g, '$1').replace(/@(\w+)/g, '$1').replace(EMOJI, ' ')
    .replace(/^(?:breaking(?: news)?|just in|update|exclusive|watch|analysis|live)\s*[:—–-]\s*/i, '').replace(/\s+/g, ' ').trim();
}
async function timeline(handle) {
  const res = await fetch('https://api.fxtwitter.com/2/profile/' + handle + '/statuses?count=40', { headers: { 'user-agent': 'githito.xapi collector' }, signal: AbortSignal.timeout(25000) });
  const d = await res.json().catch(() => null);
  if (res.status !== 200 || !d || (d.code && d.code !== 200)) throw new Error('refused (' + res.status + ')');
  return (Array.isArray(d.results) ? d.results : []).filter(st => !st.reposted_by && !(st.replying_to && (st.replying_to.status || st.replying_to.screen_name)));
}

async function main() {
  await mkdir(path.join(CONF.out, 'v1'), { recursive: true });
  const file = path.join(CONF.out, 'v1', 'news-en.json');
  const before = await readJson(file, { heads: [] });
  const fresh = x => Date.now() - Date.parse(x.found || x.at || 0) < CONF.hours * 3600e3;
  const ok = (t, raw) => t.length >= 25 && t.length <= 170 && (t.match(/[A-Za-z]/g) || []).length >= t.length * 0.6 && !/[ぁ-ヿ一-鿿]/.test(t)
    && !AD.test(raw) && !cruel(raw) && !personal(raw) && !adultNews(raw);
  const heads = (Array.isArray(before.heads) ? before.heads : []).filter(x => x && x.id && x.t && fresh(x) && ok(x.t, x.t));
  const have = new Set(heads.map(x => x.id));
  const deadline = Date.now() + CONF.minutes * 60e3;
  let read = 0, refused = 0, got = 0;
  for (const [h, n, g] of ACCOUNTS) {
    if (Date.now() > deadline || refused >= 10) break;
    let list;
    try { list = await timeline(h); read++; } catch (e) { refused++; console.log(`  English: ${h}: the timeline ${e.message}`); await sleep(2000); continue; }
    for (const st of list) {
      const id = String(st.id || '');
      const t = headlineEn(st.text);
      if (!id || have.has(id) || !ok(t, String(st.text || ''))) continue;
      have.add(id);
      heads.push({ id, h, n, t, g: genreOf(t, g), at: st.created_at ? new Date(st.created_at).toISOString().replace(/\.\d+Z$/, 'Z') : '', found: stamp() });
      got++;
    }
    await sleep(1200);
  }
  heads.sort((a, b) => (Date.parse(b.at || b.found) || 0) - (Date.parse(a.at || a.found) || 0));
  const out = { version: 1, lang: 'en', updated: stamp(), heads: heads.slice(0, CONF.keep) };
  await writeFile(file, JSON.stringify(out) + '\n');
  if (got) await writeFile(path.join(CONF.out, '.changed'), stamp() + '\n');
  console.log(`English news: ${read} accounts read (${refused} refused), ${got} new headlines; the file holds ${out.heads.length}.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) main().catch(e => { console.error(e.message || e); process.exit(1); });
