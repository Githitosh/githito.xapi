#!/usr/bin/env node
/* githito.xapi: how much is taken in, hour by hour, as a graph.

   After the collection steps of a run this reads what they wrote (v1/humor-ja.json, v1/news-ja.json),
   counts what was found in each hour (every story and headline carries the time it was found), keeps
   the counts in v1/stats.json for seven days, and shows them in three places:
   - v1/intake.svg: a graph of the last 48 hours, shown at the top of the README;
   - the run's own page in the Actions tab (the job summary): the same graph, this run's numbers, a
     table with a bar for each of the last 24 hours, and the totals of the last days;
   - the name of the next run in the list of runs: a small graph of the last 12 hours made of
     characters (next.mjs passes it on), so the list itself shows whether the collection is going well.

     node stats.mjs --out public     (run by the workflow before the last publishing)

   An hour's count never goes down: a story dropped later by the rules or by its age was still taken
   in. Hours are Japan time everywhere a person reads them. Node 20 or newer; no packages. */
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const OUT = path.resolve(opt('out', path.join(HERE, 'public')));
const KEEP_DAYS = 7;
const HOUR = 3600e3;
const readJson = async (file, empty) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { return empty; } };
const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/* An hour is named by its beginning in UTC ("2026-11-19T22"); Japan is nine whole hours ahead, so the
   hours are the same hours there. */
const hourKey = ms => new Date(ms).toISOString().slice(0, 13);
const keyMs = key => Date.parse(key + ':00:00Z');
const japan = ms => { const d = new Date(ms + 9 * HOUR); return { hour: d.getUTCHours(), minute: d.getUTCMinutes(), day: (d.getUTCMonth() + 1) + '/' + d.getUTCDate() }; };
const clock = ms => { const j = japan(ms); return `${j.day} ${j.hour}:${String(j.minute).padStart(2, '0')}`; };

/* ---------- the counts ---------- */
async function record() {
  const humor = await readJson(path.join(OUT, 'v1', 'humor-ja.json'), {});
  const news = await readJson(path.join(OUT, 'v1', 'news-ja.json'), {});
  const people = await readJson(path.join(OUT, 'v1', 'people-ja.json'), {});
  const file = path.join(OUT, 'v1', 'stats.json');
  const before = await readJson(file, {});
  const now = Date.now();
  const hours = {};
  for (const [k, v] of Object.entries(before.hours || {})) {
    if (v && now - keyMs(k) < KEEP_DAYS * 24 * HOUR) hours[k] = { humor: Number(v.humor) || 0, news: Number(v.news) || 0, replies: Number(v.replies) || 0 };
  }
  const tally = (list, part) => {
    const seen = {};
    for (const x of list || []) {
      const t = Date.parse(x && x.found);
      if (!t || now - t >= KEEP_DAYS * 24 * HOUR || t > now + HOUR) continue;
      seen[hourKey(t)] = (seen[hourKey(t)] || 0) + 1;
    }
    for (const [k, n] of Object.entries(seen)) {
      const h = hours[k] || (hours[k] = { humor: 0, news: 0, replies: 0 });
      if (n > h[part]) h[part] = n;
    }
  };
  tally(humor.stories, 'humor');
  /* News intake is the memo accounts' own posts (people.mjs), plus any headline still kept. */
  tally([...(Array.isArray(news.heads) ? news.heads : []), ...((Array.isArray(people.people) ? people.people : []).filter(p => p && p.own))], 'news');
  tally(news.items, 'replies');
  /* What this very run did: a part ran in it when its file was written after the run began. */
  const started = Number(process.env.STARTED) * 1000 || 0;
  const inRun = at => !!at && (!started || Date.parse(at) >= started - 60000);
  const sum = o => Object.values(o || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const hr = humor.run || {};
  const nr = news.run || {};
  const run = {
    at: stamp(),
    humor: inRun(hr.at) ? { new: Number(hr.stories) || 0, searches: Number(hr.searches) || 0, timelines: Number(hr.timelines) || 0, exchanges: Number(hr.conversations) || 0, refused: sum(hr.refused), memo: Number(hr.memo) || 0, memoTotal: Number(hr.memoTotal) || 0 } : null,
    news: inRun(nr.at) ? { new: Number(nr.heads) || 0, accounts: Number(nr.headSearches) || 0, replies: Number(nr.items) || 0, refused: sum(nr.headRefused) } : null,
  };
  const total = { humor: (humor.stories || []).length, news: (news.heads || []).length, replies: (news.items || []).length };
  const sorted = Object.fromEntries(Object.keys(hours).sort().map(k => [k, hours[k]]));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ version: 1, updated: stamp(), total, run, hours: sorted }) + '\n');
  return { hours: sorted, run, total, now };
}
/* The last n hours, the current one last; an hour nothing was found in is there with zeros. */
function lastHours(hours, n, now) {
  const end = keyMs(hourKey(now));
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const ms = end - i * HOUR;
    const v = hours[hourKey(ms)] || {};
    out.push({ ms, humor: v.humor || 0, news: v.news || 0, replies: v.replies || 0, current: i === 0 });
  }
  return out;
}
const total = (list, part) => list.reduce((a, x) => a + x[part], 0);

/* ---------- the picture ---------- */
/* Two bar graphs, one above the other, with one scale each (the two counts differ too much to share
   one): new Reply News stories and new headlines, a bar for each of the last 48 hours. It carries its own
   ground, light or dark after the reader's setting. */
function niceTop(max) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(10, max))));
  for (const m of [1, 2, 3, 4, 5, 6, 8, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}
function svg(hours, sums, now) {
  const list = lastHours(hours, 48, now);
  const W = 920, left = 52, right = 24, plotW = W - left - right, plotH = 140;
  const band = plotW / list.length;
  const bw = Math.min(24, band - 4);
  const bar = (x, y, w, h) => { const r = Math.min(4, h, w / 2); return `M${x.toFixed(1)},${(y + h).toFixed(1)}V${(y + r).toFixed(1)}Q${x.toFixed(1)},${y.toFixed(1)} ${(x + r).toFixed(1)},${y.toFixed(1)}H${(x + w - r).toFixed(1)}Q${(x + w).toFixed(1)},${y.toFixed(1)} ${(x + w).toFixed(1)},${(y + r).toFixed(1)}V${(y + h).toFixed(1)}Z`; };
  const day = list.slice(-24);
  const panel = (title, part, cls, top, unit, held) => {
    const vals = list.map(x => x[part]);
    const top1 = niceTop(Math.max(...vals));
    const peak = vals.indexOf(Math.max(...vals));
    let s = `<text class="t1" x="${left}" y="${top - 18}" font-size="15" font-weight="700">${esc(title)}</text>`;
    s += `<text class="t2" x="${W - right}" y="${top - 18}" font-size="13" text-anchor="end">直近24時間 +${total(day, part)} ${unit} ・ 保存中 ${held} ${unit}</text>`;
    [0, 0.5, 1].forEach(f => {
      const y = top + plotH - plotH * f;
      s += `<line class="${f ? 'grid' : 'base'}" x1="${left}" y1="${y}" x2="${W - right}" y2="${y}"/>`;
      s += `<text class="t3" x="${left - 8}" y="${y + 4}" font-size="11" text-anchor="end">${Math.round(top1 * f)}</text>`;
    });
    list.forEach((x, i) => {
      const v = vals[i];
      const cx = left + i * band + band / 2;
      const h = v > 0 ? Math.max(2, plotH * v / top1) : 0;
      const j = japan(x.ms);
      if (h) s += `<path class="${cls}${x.current ? ' now' : ''}" d="${bar(cx - bw / 2, top + plotH - h, bw, h)}"><title>${j.day} ${j.hour}時台  ${v} ${unit}</title></path>`;
      /* The number is written on the tallest bar and on the current hour only. */
      if (v > 0 && (i === peak || (x.current && Math.abs(i - peak) > 2))) s += `<text class="t1" x="${cx.toFixed(1)}" y="${(top + plotH - h - 5).toFixed(1)}" font-size="11" text-anchor="middle">${v}</text>`;
      if (j.hour % 6 === 0) {
        s += `<text class="t3" x="${cx.toFixed(1)}" y="${top + plotH + 16}" font-size="11" text-anchor="middle">${j.hour}時</text>`;
        if (j.hour === 0) s += `<text class="t2" x="${cx.toFixed(1)}" y="${top + plotH + 31}" font-size="11" font-weight="700" text-anchor="middle">${j.day}</text>`;
      }
    });
    return s;
  };
  const H = 520;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="githito.xapi の取り込み量（1時間ごと）" font-family="'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP','Yu Gothic',Meiryo,system-ui,sans-serif">`;
  s += '<style>'
    + '.bg{fill:#fcfcfb}.t1{fill:#0b0b0b}.t2{fill:#52514e}.t3{fill:#6f6e69}.grid{stroke:#e6e5e0;stroke-width:1}.base{stroke:#b9b8b0;stroke-width:1}'
    + '.s1{fill:#2a78d6}.s2{fill:#eb6834}.now{fill:#fcfcfb;stroke-width:1.5}.s1.now{stroke:#2a78d6}.s2.now{stroke:#eb6834}'
    + '@media (prefers-color-scheme:dark){.bg{fill:#1a1a19}.t1{fill:#f0efec}.t2{fill:#c3c2b7}.t3{fill:#a09f95}.grid{stroke:#32322f}.base{stroke:#5c5b55}'
    + '.s1{fill:#3987e5}.s2{fill:#d95926}.now{fill:#1a1a19}.s1.now{stroke:#3987e5}.s2.now{stroke:#d95926}}'
    + '</style>';
  s += `<rect class="bg" width="${W}" height="${H}" rx="8"/>`;
  s += `<text class="t1" x="${left}" y="34" font-size="18" font-weight="700">取り込み量（1時間ごと・直近48時間・日本時間）</text>`;
  s += `<text class="t2" x="${W - right}" y="34" font-size="12" text-anchor="end">${clock(now)} 更新</text>`;
  s += panel('リプライニュース：新しく取り込んだ会話', 'humor', 's2', 96, '組', sums.humor);
  s += panel('ニュース：新しく取り込んだ見出し', 'news', 's1', 312, '件', sums.news);
  s += `<text class="t3" x="${left}" y="${H - 14}" font-size="11">白抜きの棒＝今の時間（まだ途中）。棒がない時間は取り込みなし。</text>`;
  return s + '</svg>\n';
}

/* ---------- a graph made of characters, for the name of the next run ---------- */
function spark(list, part) {
  const max = Math.max(1, ...list.map(x => x[part]));
  return list.map(x => (x[part] ? '▂▃▄▅▆▇█'[Math.min(6, Math.floor(7 * x[part] / (max + 1)))] : '▁')).join('');
}
function note(hours, now) {
  const list = lastHours(hours, 12, now);
  return `会話 ${spark(list, 'humor')} ${total(list, 'humor')}組 ・ 見出し ${spark(list, 'news')} ${total(list, 'news')}件（直近12時間）`;
}

/* ---------- the run's page ---------- */
function summary(hours, run, sums, now) {
  const list = lastHours(hours, 24, now);
  const maxH = Math.max(1, ...list.map(x => x.humor));
  const maxN = Math.max(1, ...list.map(x => x.news));
  const bar = (v, max) => (v ? '█'.repeat(Math.max(1, Math.round(12 * v / max))) + ' ' + v : '·');
  const out = [];
  out.push('## 取り込み量');
  out.push('');
  if (process.env.GITHUB_REPOSITORY) {
    out.push(`![取り込み量のグラフ（1時間ごと）](https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY}/api/v1/intake.svg?run=${process.env.GITHUB_RUN_ID || ''})`);
    out.push('');
  }
  out.push(`### この実行（${clock(now)}）`);
  out.push('');
  out.push('| | この実行で増えた数 | 直近24時間 | 保存中の合計 |');
  out.push('|---|---:|---:|---:|');
  out.push(`| リプライニュース（会話） | ${run.humor ? '**+' + run.humor.new + ' 組**' : '実行なし'} | +${total(list, 'humor')} 組 | ${sums.humor} 組 |`);
  out.push(`| ニュース（見出し） | ${run.news ? '**+' + run.news.new + ' 件**' : '実行なし'} | +${total(list, 'news')} 件 | ${sums.news} 件 |`);
  if (sums.replies || total(list, 'replies')) out.push(`| ニュース（頼んだアカウントへの返信） | ${run.news ? '+' + run.news.replies + ' 件' : '実行なし'} | +${total(list, 'replies')} 件 | ${sums.replies} 件 |`);
  out.push('');
  if (run.humor) out.push(`- リプライニュース：検索 ${run.humor.searches} 回、タイムライン ${run.humor.timelines} 件、会話の読み出し ${run.humor.exchanges} 件、断られた回数 ${run.humor.refused}`);
  if (run.humor && run.humor.memoTotal) out.push(`- リプライニュース：おもしろい恋愛リプライのアカウントを ${run.humor.memo} 件記録（記録の合計 ${run.humor.memoTotal} 件）`);
  if (run.news) out.push(`- ニュース：読んだアカウント ${run.news.accounts}、断られた回数 ${run.news.refused}`);
  out.push('');
  out.push('### 1時間ごと（直近24時間・日本時間）');
  out.push('');
  out.push('| 時刻 | リプライニュース（会話） | ニュース（見出し） |');
  out.push('|---|:---|:---|');
  list.slice().reverse().forEach(x => {
    const j = japan(x.ms);
    out.push(`| ${j.day} ${j.hour}時${x.current ? '（途中）' : ''} | ${bar(x.humor, maxH)} | ${bar(x.news, maxN)} |`);
  });
  out.push('');
  /* The days, in Japan time, as far back as the counts go. */
  const days = new Map();
  for (const [k, v] of Object.entries(hours)) {
    const d = japan(keyMs(k)).day;
    const e = days.get(d) || { humor: 0, news: 0 };
    e.humor += v.humor || 0; e.news += v.news || 0;
    days.set(d, e);
  }
  const dl = [...days.entries()].slice(-KEEP_DAYS);
  const dH = Math.max(1, ...dl.map(d => d[1].humor));
  const dN = Math.max(1, ...dl.map(d => d[1].news));
  out.push('### 日ごと（日本時間）');
  out.push('');
  out.push('| 日 | リプライニュース（会話） | ニュース（見出し） |');
  out.push('|---|:---|:---|');
  dl.slice().reverse().forEach(([d, v], i) => out.push(`| ${d}${i === 0 ? '（途中）' : ''} | ${bar(v.humor, dH)} | ${bar(v.news, dN)} |`));
  out.push('');
  return out.join('\n');
}

/* ---------- stock videos / cards and account counts (names never shown) ---------- */
async function inventory() {
  const stockNewsJa = await readJson(path.join(OUT, 'v1', 'stock-news-ja.json'), {});
  const stockNewsEn = await readJson(path.join(OUT, 'v1', 'stock-news-en.json'), {});
  const stockHumor = await readJson(path.join(OUT, 'v1', 'stock-humor-ja.json'), {});
  const peopleJa = await readJson(path.join(OUT, 'v1', 'people-ja.json'), {});
  const peopleEn = await readJson(path.join(OUT, 'v1', 'people-en.json'), {});
  const stock = {
    newsJa: { videos: (stockNewsJa.videos || []).length, cards: (stockNewsJa.cards || []).length },
    newsEn: { videos: (stockNewsEn.videos || []).length, cards: (stockNewsEn.cards || []).length },
    humor: { videos: (stockHumor.videos || []).length, talks: (stockHumor.talks || []).length, frames: (stockHumor.talks || []).reduce((n, t) => n + ((t && t.m) || []).length, 0) },
    people: { ja: (peopleJa.people || []).length, en: (peopleEn.people || []).length },
  };
  const memo = process.env.XAPI_MEMO_DIR ? path.resolve(process.env.XAPI_MEMO_DIR) : '';
  const ha = memo ? await readJson(path.join(memo, 'humor-accounts.json'), {}) : {};
  const req = memo ? await readJson(path.join(memo, 'accounts.json'), {}) : {};
  const famous = await readJson(path.join(HERE, 'docs', 'memo', 'news-famous.json'), {});
  const accounts = {
    newsRegistered: (famous.ja || []).length + (famous.en || []).length,
    humorRegistered: (Array.isArray(ha.ja) ? ha.ja.length : 0) + (Array.isArray(ha.en) ? ha.en.length : 0),
    newsRequests: Array.isArray(req.accounts) ? req.accounts.length : 0,
  };
  const file = path.join(OUT, 'v1', 'stats.json');
  const before = await readJson(file, {});
  const hist = Array.isArray(before.inventory) ? before.inventory : [];
  const point = { at: stamp(), stock, accounts };
  const next = hist.filter(p => p && Date.now() - Date.parse(p.at || 0) < KEEP_DAYS * 24 * HOUR).concat(point).slice(-200);
  await writeFile(file, JSON.stringify({ ...before, inventory: next, stock, accounts, updated: stamp() }) + '\n');
  return { stock, accounts, hist: next, now: Date.now() };
}
function barRow(label, value, max, y, cls) {
  const left = 200, W = 920, plotW = W - left - 40;
  const w = max > 0 ? Math.max(value ? 2 : 0, plotW * value / max) : 0;
  let s = `<text class="t1" x="24" y="${y + 14}" font-size="14">${esc(label)}</text>`;
  s += `<text class="t2" x="${W - 24}" y="${y + 14}" font-size="13" text-anchor="end">${value}</text>`;
  if (w) s += `<rect class="${cls}" x="${left}" y="${y}" width="${w.toFixed(1)}" height="18" rx="4"/>`;
  return s;
}
function stockSvg(stock, accounts, now) {
  const rows = [
    ['ニュース動画（日本語）', stock.newsJa.videos, 's1'],
    ['ニュースカード（日本語）', stock.newsJa.cards, 's1'],
    ['ニュース動画（英語）', stock.newsEn.videos, 's1'],
    ['ニュースカード（英語）', stock.newsEn.cards, 's1'],
    ['ユーモア動画', stock.humor.videos, 's2'],
    ['ユーモアコマ（メッセージ）', stock.humor.frames, 's2'],
    ['登録ニュースアカウント数', accounts.newsRegistered, 's3'],
    ['登録ユーモアアカウント数', accounts.humorRegistered, 's3'],
    ['ニュースリクエスト数', accounts.newsRequests, 's3'],
  ];
  const max = Math.max(10, ...rows.map(r => r[1]));
  const H = 80 + rows.length * 36;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 ${H}" width="920" height="${H}" role="img" aria-label="動画ストックと記録アカウント数" font-family="'Hiragino Sans','Noto Sans JP',Meiryo,system-ui,sans-serif">`;
  s += '<style>.bg{fill:#fcfcfb}.t1{fill:#0b0b0b}.t2{fill:#52514e}.s1{fill:#2a78d6}.s2{fill:#eb6834}.s3{fill:#2f9e6b}'
    + '@media (prefers-color-scheme:dark){.bg{fill:#1a1a19}.t1{fill:#f0efec}.t2{fill:#c3c2b7}.s1{fill:#3987e5}.s2{fill:#d95926}.s3{fill:#3cb879}}</style>';
  s += `<rect class="bg" width="920" height="${H}" rx="8"/>`;
  s += `<text class="t1" x="24" y="32" font-size="18" font-weight="700">動画ストックと記録アカウント（件数のみ・名前なし）</text>`;
  s += `<text class="t2" x="896" y="32" font-size="12" text-anchor="end">${clock(now)} 更新</text>`;
  rows.forEach((r, i) => { s += barRow(r[0], r[1], max, 52 + i * 36, r[2]); });
  return s + '</svg>\n';
}
function chartsPage(repo) {
  const base = repo ? `https://raw.githubusercontent.com/${repo}/api/v1` : '../public/v1';
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>githito.xapi グラフ</title>
<style>
  body { margin: 0; font: 15px/1.5 "Noto Sans JP", "Hiragino Sans", Meiryo, sans-serif; background: #f6f5f2; color: #1a1a19; }
  main { max-width: 960px; margin: 0 auto; padding: 28px 16px 48px; }
  h1 { font-size: 1.4rem; margin: 0 0 8px; }
  p { color: #52514e; margin: 0 0 20px; }
  figure { margin: 0 0 28px; background: #fff; border-radius: 12px; padding: 12px; box-shadow: 0 1px 0 rgba(0,0,0,.06); }
  img { display: block; width: 100%; height: auto; }
  a { color: #2a78d6; }
</style>
</head>
<body>
<main>
  <h1>githito.xapi グラフ</h1>
  <p>取り込み量・動画ストック数・記録アカウント数です。本文やアカウント名は出しません。</p>
  <figure>
    <figcaption>取り込み量（1時間ごと）</figcaption>
    <img src="${base}/intake.svg" alt="取り込み量">
  </figure>
  <figure>
    <figcaption>動画ストックと記録アカウント（件数）</figcaption>
    <img src="${base}/stock.svg" alt="動画ストックとアカウント数">
  </figure>
  <p><a href="https://github.com/${repo || 'Githitosh/githito.xapi'}">リポジトリ</a> · データは <code>api</code> ブランチの <code>v1/</code></p>
</main>
</body>
</html>
`;
}

async function main() {
  const { hours, run, total: sums, now } = await record();
  await writeFile(path.join(OUT, 'v1', 'intake.svg'), svg(hours, sums, now));
  const inv = await inventory();
  await writeFile(path.join(OUT, 'v1', 'stock.svg'), stockSvg(inv.stock, inv.accounts, inv.now));
  const repo = process.env.GITHUB_REPOSITORY || 'Githitosh/githito.xapi';
  await mkdir(path.join(OUT, 'charts'), { recursive: true });
  await writeFile(path.join(OUT, 'charts', 'index.html'), chartsPage(repo));
  await mkdir(path.join(HERE, 'charts'), { recursive: true });
  await writeFile(path.join(HERE, 'charts', 'index.html'), chartsPage(repo));
  await writeFile(path.join(OUT, '.changed'), stamp() + '\n');
  const text = summary(hours, run, sums, now)
    + `\n### ストック（名前なし）\n\n| | 件数 |\n|---|---:|\n| ニュース動画 JA / EN | ${inv.stock.newsJa.videos} / ${inv.stock.newsEn.videos} |\n| ニュースカード JA / EN | ${inv.stock.newsJa.cards} / ${inv.stock.newsEn.cards} |\n| ユーモア動画 / コマ | ${inv.stock.humor.videos} / ${inv.stock.humor.frames} |\n| 登録ニュース / ユーモア / リクエスト | ${inv.accounts.newsRegistered} / ${inv.accounts.humorRegistered} / ${inv.accounts.newsRequests} |\n\n`;
  const line = note(hours, now);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text + '\n');
  else console.log(text);
  if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, 'INTAKE_NOTE=' + line + '\n');
  console.log('Intake: ' + line);
  console.log(`Stock: news JA ${inv.stock.newsJa.videos}v/${inv.stock.newsJa.cards}c, EN ${inv.stock.newsEn.videos}v/${inv.stock.newsEn.cards}c; humor ${inv.stock.humor.videos}v/${inv.stock.humor.frames}f; accounts news ${inv.accounts.newsRegistered} humor ${inv.accounts.humorRegistered} req ${inv.accounts.newsRequests}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message || e); process.exit(0); });
