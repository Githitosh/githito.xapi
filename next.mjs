#!/usr/bin/env node
/* githito.xapi: half-hour Collect self-chain helper.

   Chaining is DISABLED. The workflow no longer calls this file. If it is run anyway,
   it does not dispatch another Collect (no workflow_dispatch). config.json "loop" is
   false as a second guard. Do not add repository_dispatch or other alternate triggers. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  let config = {};
  try { config = JSON.parse(await readFile(path.join(HERE, 'config.json'), 'utf8')); } catch (e) {}
  if (config.loop === false) {
    console.log('config.json says "loop": false: Collect chaining is off; not starting another run.');
    return;
  }
  console.log('Collect chaining is disabled in the workflow; not starting another run.');
}

main().catch(e => { console.error(e.message || e); process.exit(0); });
