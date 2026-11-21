/* english.mjs: English news headlines already collected, kept only when the account is in the private
   memo's news-famous.json (XAPI_MEMO_DIR or --memo). There is no built-in list of papers or people,
   and this program does not go and read one. When the file is missing, no English headline is kept.
   New English posts are read by people.mjs, from that same file, and stock.mjs makes the cards.
   Names are not printed.

     v1/news-en.json   { version, lang, updated, heads: [{ id, h, n, t, g, at, found }] }

     node english.mjs --out public [--memo <folder>] */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cruel, personal, adultNews } from './filters.mjs';
import { newsAccounts } from './news-accounts.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const CONF = { out: path.resolve(opt('out', 'public')), hours: 72 };
const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const readJson = async (file, d) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { return d; } };

async function main() {
  await mkdir(path.join(CONF.out, 'v1'), { recursive: true });
  const memoDir = opt('memo', process.env.XAPI_MEMO_DIR || '');
  const memo = await newsAccounts(memoDir);
  const allow = new Set(memo.en.map(e => e.h.toLowerCase()));
  const file = path.join(CONF.out, 'v1', 'news-en.json');
  const before = await readJson(file, { heads: [] });
  const fresh = x => Date.now() - Date.parse(x.found || x.at || 0) < CONF.hours * 3600e3;
  const ok = (t, raw) => t.length >= 25 && t.length <= 170 && (t.match(/[A-Za-z]/g) || []).length >= t.length * 0.6 && !/[ぁ-ヿ一-鿿]/.test(t)
    && !cruel(raw) && !personal(raw) && !adultNews(raw);
  const prior = Array.isArray(before.heads) ? before.heads : [];
  /* No built-in list. A headline stays only when its account is in the memo. Otherwise it is dropped,
     so the pages stop playing it and it is not refilled. */
  const heads = memo.missing ? [] : prior.filter(x => x && x.id && x.h && x.t && allow.has(String(x.h).toLowerCase()) && fresh(x) && ok(x.t, x.t));
  heads.sort((a, b) => (Date.parse(b.at || b.found) || 0) - (Date.parse(a.at || a.found) || 0));
  const out = { version: 1, lang: 'en', updated: stamp(), heads };
  const same = JSON.stringify({ ...before, updated: '' }) === JSON.stringify({ ...out, updated: '' });
  if (!same) {
    await writeFile(file, JSON.stringify(out) + '\n');
    await writeFile(path.join(CONF.out, '.changed'), stamp() + '\n');
  }
  const dropped = prior.length - heads.length;
  console.log(memo.missing
    ? 'English news: no news-famous.json, so no news account is kept.'
    : `English news: ${heads.length} headlines from the private memo kept; ${dropped} from other accounts dropped.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message || e); process.exit(1); });
