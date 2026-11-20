#!/usr/bin/env node
/* githito.xapi: talks sent by hand, and the accounts whose replies the News page may play.

   An issue titled "account" lists X accounts, one on each line (@name, name or a link to the account).
   It replaces the list in accounts.json in the private memo (--memo or XAPI_MEMO_DIR): the same folder
   as humor-memo-<lang>.json, never a public file. news.mjs reads that list and collects those accounts'
   posts and the replies under them from its next run. The News page plays them for a reader who added
   the account in Settings. An issue titled "account" whose body is empty or "none" clears the list.
   Names are not printed. A public v1/accounts.json left by an older run is taken away.

   The owner finds a post and its replies on X, and sends their links here as an issue titled "talk":
   the first link is the post, the links after it are replies. This program reads each link through X's
   official embed API (publish.x.com/oembed: no key, no charge, no login), keeps what may play, and adds
   the talk to the API's files. X is never searched or logged in to from here.

     node ingest.mjs                              the open issues of this repository (in the workflow)
     node ingest.mjs --urls <post> <reply> ...    one talk from links, for trying it by hand
     node ingest.mjs --accounts @name @name ...   the account list, by hand (--accounts none clears it)
     node ingest.mjs --dry ...                    print what would be added, write nothing */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CJK, plain, talkPost, pickReplies, stamp, readJson, writeApi, writeIndex, young, readEmbed, genreOf } from './rules.mjs';
import { countRequest, tidy, LIMIT } from './limit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = name => args.includes('--' + name);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
let FILE = {};
try { FILE = JSON.parse(await readFile(path.join(HERE, 'config.json'), 'utf8')); } catch (e) {}
const OUT = path.resolve(opt('out', path.join(HERE, 'public')));
/* The private folder the account list is kept in, beside the humor memo. Empty: the list is not saved. */
const MEMO = opt('memo', process.env.XAPI_MEMO_DIR || '') ? path.resolve(opt('memo', process.env.XAPI_MEMO_DIR || '')) : '';
const KEEP = FILE.keep || 500;
const DRY = flag('dry');
const LINK = /https?:\/\/(?:mobile\.|www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d+)/gi;

/* A link read through X's official embed API, as the plain record the rules read.
   What the embed API does not say is left empty. */
async function readLink(handle, id) {
  const e = await readEmbed(handle, id);
  if (!e) return null;
  return {
    id: e.id, raw: e.raw,
    user: { username: e.handle, name: e.name, description: '', protected: false, org: false, followers: 0 },
    replyTo: '', isReply: false, quote: false, repost: false, replies: 1, likes: 0, sensitive: false, media: false, at: '',
  };
}

/* ---------- one talk from its links ---------- */
async function talkFrom(body, genres) {
  const links = [];
  for (const m of String(body || '').matchAll(LINK)) if (!links.some(l => l.id === m[2])) links.push({ handle: m[1], id: m[2] });
  if (links.length < 2) return { error: 'It needs two links at least: the post, then a reply.' };
  const records = await Promise.all(links.slice(0, 21).map(l => readLink(l.handle, l.id)));
  if (!records[0]) return { error: 'The post could not be read from its link (deleted, private, or not a post).' };
  const lang = CJK.test(plain(records[0].raw)) ? 'ja' : 'en';
  const post = talkPost(records[0], lang, true);
  if (!post) return { error: 'The post may not play: it is too long or too short, or it has words that never play.' };
  const answers = records.slice(1).filter(Boolean).map(r => ({ ...r, replyTo: post.id }));
  if (!answers.length) return { error: 'No reply could be read from its link.' };
  const replies = pickReplies(post, answers, lang, true);
  if (!replies.length) return { error: 'No reply may play: too long, the same writer as the post, or words that never play.' };
  /* A genre written in the issue ("genre: food") wins; else the genre whose word the post says. */
  const named = (String(body).match(/^\s*genre\s*[:：]\s*([a-z]+)\s*$/im) || [])[1];
  const g = named && genres.some(x => x.id === named) ? { genre: named, word: '' } : genreOf(post.text + ' ' + replies.map(r => r.text).join(' '), lang, genres);
  return { lang, talk: { id: post.id, genre: g.genre, word: g.word, found: stamp(), manual: true, post, replies } };
}

/* ---------- the issues ---------- */
const REPO = process.env.GITHUB_REPOSITORY || '';
const OWNER = process.env.GITHUB_REPOSITORY_OWNER || '';
async function gh(method, pathname, body) {
  const res = await fetch('https://api.github.com' + pathname, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { authorization: 'Bearer ' + process.env.GITHUB_TOKEN, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'githito.xapi' },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${method} ${pathname}`);
  return res.status === 204 ? null : res.json();
}
/* Only the owner's own issues titled "talk" or "account" are read; anyone else's are left alone. */
async function openIssues() {
  const list = await gh('GET', `/repos/${REPO}/issues?state=open&creator=${encodeURIComponent(OWNER)}&per_page=50`);
  return list.filter(i => !i.pull_request && i.user && i.user.login === OWNER && /^\s*(?:talk|account)\b/i.test(i.title || '')).reverse();
}

/* ---------- too many requests from one place ---------- */
/* See limit.mjs: more than a few requests from one sender in an hour (or many in a day) and that sender's
   requests are not taken for some hours. The counts live in v1/requests.json. */
let REQUESTS = null;
async function requestTaken(sender) {
  if (!REQUESTS) REQUESTS = await readJson(path.join(OUT, 'v1', 'requests.json'), { version: 1, senders: {} });
  return countRequest(REQUESTS, sender);
}
async function saveRequests() {
  if (!REQUESTS || DRY) return;
  const file = path.join(OUT, 'v1', 'requests.json');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ version: 1, updated: stamp(), limit: LIMIT, senders: tidy(REQUESTS).senders }, null, 1) + '\n');
  await writeFile(path.join(OUT, '.changed'), stamp() + '\n');
}

/* ---------- the accounts whose replies may play ---------- */
const MAX_ACCOUNTS = 8;
const NAME = /^[A-Za-z0-9_]{1,15}$/;
function accountsFrom(body) {
  const out = [];
  String(body || '').split(/\r?\n/).forEach(line => {
    const t = line.trim();
    if (!t || /^(?:none|なし)$/i.test(t)) return;
    const link = t.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:[\/?#]|$)/i);
    const name = (link ? link[1] : t.replace(/^[-*・\s]+/, '').replace(/^@+/, '').split(/[\s,、]/)[0]) || '';
    if (!NAME.test(name) || ['home', 'search', 'i', 'intent', 'share'].includes(name.toLowerCase())) return;
    if (!out.some(n => n.toLowerCase() === name.toLowerCase())) out.push(name);
  });
  return out.slice(0, MAX_ACCOUNTS);
}
/* Writes the list into the private memo. The count is printed; the names are not. */
async function writeAccountList(names, since) {
  if (!MEMO) { console.log('No private folder for the account list: it is not saved.'); return false; }
  const kept = (since instanceof Map) ? since : new Map();
  const accounts = names.map(h => ({ h, since: kept.get(h.toLowerCase()) || stamp() }));
  if (DRY) { console.log('Account list kept privately (' + accounts.length + ').'); return true; }
  const file = path.join(MEMO, 'accounts.json');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ version: 1, updated: stamp(), accounts }, null, 1) + '\n');
  console.log('Account list saved privately (' + accounts.length + ').');
  return true;
}
async function setAccounts(names) {
  const file = MEMO ? path.join(MEMO, 'accounts.json') : '';
  const before = file ? await readJson(file, { accounts: [] }) : { accounts: [] };
  const since = new Map((Array.isArray(before.accounts) ? before.accounts : []).filter(a => a && a.h).map(a => [String(a.h).toLowerCase(), a.since]));
  return writeAccountList(names, since);
}
/* A public copy (v1/accounts.json) is never part of the API. Removing one marks the tree changed so the
   next publish of the api branch leaves it out. */
async function dropPublicAccounts() {
  const file = path.join(OUT, 'v1', 'accounts.json');
  try { await readFile(file); }
  catch { return; }
  if (DRY) { console.log('The public account list would be removed.'); return; }
  await rm(file, { force: true });
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, '.changed'), stamp() + '\n');
  console.log('The public account list is removed.');
}
/* The latest closed issue titled "account" from the owner, when the private list does not exist yet
   (an issue already closed before this list moved into the memo). */
async function latestAccountIssue() {
  if (!REPO || !OWNER || !process.env.GITHUB_TOKEN) return null;
  const list = await gh('GET', `/repos/${REPO}/issues?state=closed&creator=${encodeURIComponent(OWNER)}&per_page=30`);
  const found = list.filter(i => !i.pull_request && i.user && i.user.login === OWNER && /^\s*account\b/i.test(i.title || ''));
  found.sort((a, b) => Date.parse(b.closed_at || b.updated_at || 0) - Date.parse(a.closed_at || a.updated_at || 0));
  return found[0] || null;
}
/* Makes sure the private list exists, without printing a name. An older public file is moved across and
   then removed. If there is neither, the owner's latest closed account issue is used. */
async function ensureAccountList() {
  let have = false;
  if (MEMO) {
    try { await readFile(path.join(MEMO, 'accounts.json')); have = true; }
    catch { /* not saved yet */ }
  }
  if (MEMO && !have) {
    const pub = await readJson(path.join(OUT, 'v1', 'accounts.json'), null);
    const fromPub = [];
    const since = new Map();
    (pub && Array.isArray(pub.accounts) ? pub.accounts : []).forEach(a => {
      const h = String((a && a.h) || '');
      if (!NAME.test(h) || fromPub.some(n => n.toLowerCase() === h.toLowerCase())) return;
      fromPub.push(h);
      if (a.since) since.set(h.toLowerCase(), a.since);
    });
    if (fromPub.length) {
      await writeAccountList(fromPub.slice(0, MAX_ACCOUNTS), since);
      console.log('The account list was moved out of the public files.');
    } else {
      try {
        const issue = await latestAccountIssue();
        if (issue) {
          await writeAccountList(accountsFrom(issue.body), new Map());
          console.log('The account list was taken from a past account issue and saved privately.');
        }
      } catch (e) {
        console.log('A past account issue could not be read. The account list was not changed.');
      }
    }
  }
  await dropPublicAccounts();
}

async function main() {
  const { genres } = JSON.parse(await readFile(path.join(HERE, 'words.json'), 'utf8'));
  /* Values of --out and --memo are not part of a list given by hand. */
  const tail = from => {
    const out = [];
    for (let i = from; i < args.length; i++) {
      if (args[i].startsWith('--')) { if (args[i] === '--out' || args[i] === '--memo') i++; continue; }
      out.push(args[i]);
    }
    return out.join('\n');
  };
  const byHand = args.indexOf('--urls');
  let jobs;
  const byHandAccounts = args.indexOf('--accounts');
  if (byHandAccounts >= 0) jobs = [{ number: 0, title: 'account', body: tail(byHandAccounts + 1) }];
  else if (byHand >= 0) jobs = [{ number: 0, body: tail(byHand + 1) }];
  else if (!REPO || !OWNER || !process.env.GITHUB_TOKEN) {
    console.log('Not in the workflow and no --urls given: nothing to add.');
    jobs = [];
  } else jobs = await openIssues();
  const added = {};
  for (const job of jobs) {
    /* A request that came as an issue is counted for its sender; too many, and none is taken for a while. */
    if (job.number) {
      const sender = (job.user && job.user.login) || OWNER;
      const v = await requestTaken(sender);
      if (!v.ok) {
        const note = `Too many requests in a short time: none is taken from @${sender} until ${v.until} (UTC). What was set before stays as it was.\n\n短い時間に多くの依頼が届いたため、${v.until}（UTC）まで @${sender} からの受け付けを止めています。設定はそのままです。`;
        console.log('#' + job.number + ' ' + note.split('\n')[0]);
        if (!DRY) {
          await gh('POST', `/repos/${REPO}/issues/${job.number}/comments`, { body: note });
          await gh('PATCH', `/repos/${REPO}/issues/${job.number}`, { state: 'closed' });
        }
        continue;
      }
    }
    if (/^\s*account\b/i.test(job.title || '')) {
      const names = accountsFrom(job.body);
      const saved = await setAccounts(names);
      const note = !saved
        ? 'The account list was not saved: the private memo is not available. Nothing was published.'
        : names.length
        ? `The News page may play the replies to ${names.length} account${names.length === 1 ? '' : 's'} from this issue. Their posts and the replies under them are read from the next run (every half hour), through the same filters as everything else (nothing cruel, nothing against a person, no slander; for an account that is not a paper also nothing of politics or of groups of people), and one account gives a few posts, not its whole timeline. The names are kept privately and are not written here.`
        : 'No account: the News page plays no replies.';
      console.log('#' + job.number + ' account list updated (' + names.length + ')');
      if (job.number && !DRY) {
        await gh('POST', `/repos/${REPO}/issues/${job.number}/comments`, { body: note });
        await gh('PATCH', `/repos/${REPO}/issues/${job.number}`, { state: 'closed' });
      }
      continue;
    }
    const r = await talkFrom(job.body, genres);
    const note = r.error ? 'Not added. ' + r.error
      : `Added: @${r.talk.post.handle} "${r.talk.post.text.slice(0, 40)}" with ${r.talk.replies.length} repl${r.talk.replies.length === 1 ? 'y' : 'ies'} (genre: ${r.talk.genre}).`;
    console.log((job.number ? '#' + job.number + ' ' : '') + note);
    if (!r.error) (added[r.lang] = added[r.lang] || []).push(r.talk);
    if (DRY && !r.error) console.log(JSON.stringify(r.talk, null, 1));
    if (job.number && !DRY) {
      await gh('POST', `/repos/${REPO}/issues/${job.number}/comments`, { body: note });
      await gh('PATCH', `/repos/${REPO}/issues/${job.number}`, { state: 'closed' });
    }
  }
  await ensureAccountList();
  await saveRequests();
  if (DRY || !Object.keys(added).length) return;
  const outs = [];
  for (const lang of Object.keys(added)) {
    const before = await readJson(path.join(OUT, 'v1', `talks-${lang}.json`), { talks: [] });
    const fresh = added[lang].reverse();
    const ids = new Set(fresh.map(t => t.id));
    const old = (Array.isArray(before.talks) ? before.talks : []).filter(t => t && t.id && !ids.has(t.id) && young(t, FILE.hours || 48));
    const talks = fresh.concat(old).slice(0, KEEP);
    const out = { version: 1, lang, updated: stamp(), source: before.source && before.source !== 'off' ? before.source : 'manual', count: talks.length, talks };
    await writeApi(OUT, out, genres);
    outs.push(out);
  }
  await writeIndex(OUT, 'manual', outs);
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
