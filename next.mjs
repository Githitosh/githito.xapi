#!/usr/bin/env node
/* githito.xapi: the end of a run starts the next one, so the collection goes on every hour by itself.

   GitHub's own schedule starts runs hours late or not at all, so a run does not count on it:
   - "loop": false in config.json ends the chain here;
   - when another run is already waiting (somebody started one by hand), nothing is started: that run
     comes next and carries the chain on;
   - a run of the chain waits until an hour has passed since it began, then starts the next (while it
     waits it gives way at once to a run started by hand);
   - a run started by hand starts the next one at once, since the chain gave way to it.
   Run by the workflow as its last step; it needs GITHUB_TOKEN, GITHUB_REPOSITORY and GITHUB_RUN_ID. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: runId } = process.env;
const chain = process.env.CHAIN === '1';
const started = Number(process.env.STARTED) || Math.floor(Date.now() / 1000);
const HOUR = Number(process.env.XAPI_CYCLE_MINUTES || 58) * 60;
const api = (url, init) => fetch('https://api.github.com/repos/' + repo + url, { ...init, headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'user-agent': 'githito.xapi collector', ...(init && init.headers) } });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waiting() {
  const res = await api('/actions/workflows/collect.yml/runs?per_page=20');
  if (!res.ok) throw new Error('the list of runs: HTTP ' + res.status);
  const runs = (await res.json()).workflow_runs || [];
  return runs.filter(r => String(r.id) !== String(runId) && ['pending', 'queued', 'requested', 'waiting'].includes(r.status)).length;
}
async function main() {
  let config = {};
  try { config = JSON.parse(await readFile(path.join(HERE, 'config.json'), 'utf8')); } catch (e) {}
  if (config.loop === false) { console.log('config.json says "loop": false: the chain ends here.'); return; }
  if (!token || !repo) { console.log('Not on GitHub: nothing to start.'); return; }
  if (await waiting().catch(e => { console.log(String(e.message || e)); return 0; })) { console.log('Another run is waiting: it comes next and carries on.'); return; }
  if (chain) {
    const until = (started + HOUR) * 1000;
    if (until > Date.now()) console.log(`Waiting ${Math.round((until - Date.now()) / 1000)} seconds for the hour to be over.`);
    /* While waiting it looks every half minute whether somebody has started a run by hand, and gives way at once. */
    while (Date.now() < until) {
      await sleep(Math.min(30000, until - Date.now()));
      if (await waiting().catch(() => 0)) { console.log('Another run is waiting: it comes next and carries on.'); return; }
    }
  }
  const res = await api('/actions/workflows/collect.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { chain: 'true' } }) });
  console.log('The next run: HTTP ' + res.status + (res.ok ? '' : ' ' + (await res.text()).slice(0, 200)));
}
main().catch(e => { console.error(e.message || e); process.exit(0); });
