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
  tally(news.heads, 'news');
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

async function main() {
  const { hours, run, total: sums, now } = await record();
  await writeFile(path.join(OUT, 'v1', 'intake.svg'), svg(hours, sums, now));
  await writeFile(path.join(OUT, '.changed'), stamp() + '\n');
  const text = summary(hours, run, sums, now);
  const line = note(hours, now);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text + '\n');
  else console.log(text);
  /* For next.mjs: the next run is named with it. */
  if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, 'INTAKE_NOTE=' + line + '\n');
  console.log('Intake: ' + line);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message || e); process.exit(0); });
