/* githito.xapi: too many requests from one place stop that place for a while.

   A request is an issue (an account list, a talk) sent to this repository. Requests are counted for each
   sender, the GitHub account that opened the issue. More than LIMIT.hour within an hour, or more than
   LIMIT.day within a day, and that sender's requests are not taken for LIMIT.restHours hours: each is
   closed with a note, and what was set before stays as it was. After the rest they are taken again.
   The counts are kept in v1/requests.json (ingest.mjs reads and writes it). */
export const LIMIT = { hour: 5, day: 20, restHours: 6 };

/* Counts one request of `sender` in `state` ({ senders: { name: { times, until } } }) at the time `now`
   (milliseconds) and says whether it is taken: { ok: true }, or { ok: false, until } with the time the
   rest ends. A request that arrives during the rest is not counted. */
export function countRequest(state, sender, now = Date.now(), limit = LIMIT) {
  if (!state.senders || typeof state.senders !== 'object') state.senders = {};
  const key = String(sender || 'unknown').toLowerCase();
  const rec = state.senders[key] && typeof state.senders[key] === 'object' ? state.senders[key] : {};
  state.senders[key] = rec;
  rec.times = (Array.isArray(rec.times) ? rec.times : []).filter(t => now - Date.parse(t) < 24 * 3600e3);
  if (rec.until && Date.parse(rec.until) > now) return { ok: false, until: rec.until };
  rec.until = '';
  rec.times.push(new Date(now).toISOString());
  const inHour = rec.times.filter(t => now - Date.parse(t) < 3600e3).length;
  if (inHour > limit.hour || rec.times.length > limit.day) {
    rec.until = new Date(now + limit.restHours * 3600e3).toISOString();
    return { ok: false, until: rec.until };
  }
  return { ok: true };
}
/* Senders with nothing left to remember are dropped, so the file stays small. */
export function tidy(state, now = Date.now()) {
  Object.keys(state.senders || {}).forEach(k => {
    const r = state.senders[k] || {};
    const times = (Array.isArray(r.times) ? r.times : []).filter(t => now - Date.parse(t) < 24 * 3600e3);
    if (!times.length && !(r.until && Date.parse(r.until) > now)) delete state.senders[k];
    else r.times = times;
  });
  return state;
}
