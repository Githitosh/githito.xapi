/* githito.xapi: the order things play in, chosen here at random.

   The pages do not choose what to play: after every collection this file lays the stories out in a
   random order, and a page plays them from the top (leaving out what its reader has already seen).
   The order is random, with a few rules a video needs:
   - newer things tend to come before older ones (chance decides, age only leans on it);
   - the same person, the same piece of news or the same paper do not come close to each other, so any
     stretch of a video's length has nobody twice. */
export const shuffle = list => list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
const hoursOld = at => { const h = (Date.now() - Date.parse(at || 0)) / 3600e3; return Number.isFinite(h) && h >= 0 ? h : 72; };
/* A random order that leans to the new: an item's place is its age in hours plus a draw from 0 to `lean`.
   With lean 24, something a day newer usually, not always, comes first. */
export const lean = (list, atOf, hours = 24) => list.map(x => [hoursOld(atOf(x)) + Math.random() * hours, x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
/* The same order with those that share a key kept apart: keysOf gives an item's keys (a person, a
   piece of news), gap how many places must lie between two items with a key in common. */
export function spread(list, keysOf, gap = 20) {
  const rest = list.slice();
  const out = [];
  const last = new Map();
  while (rest.length) {
    let at = rest.findIndex(x => keysOf(x).every(k => !last.has(k) || out.length - last.get(k) > gap));
    if (at < 0) at = 0;
    const [x] = rest.splice(at, 1);
    keysOf(x).forEach(k => last.set(k, out.length));
    out.push(x);
  }
  return out;
}
/* Two lists dealt into one: of every ten places, `share` go to the second list (0.3: three of ten), as
   long as it lasts; `first` is the place in ten the second list starts at (0: places 1, 4 and 8; 2:
   places 3, 6 and 9). With `whileMain`, the order ends where the first list ends, so that it never
   turns into the second list alone. */
export function deal(main, other, share = 0.3, first = 0, whileMain = false) {
  const out = [];
  let m = 0, o = 0;
  const n = Math.max(1, Math.round(10 * share));
  const places = new Set(Array.from({ length: n }, (_, i) => (Math.floor(i * 10 / n) + first) % 10));
  for (let i = 0; m < main.length || o < other.length; i++) {
    if (whileMain && m >= main.length) break;
    const second = places.has(i % 10);
    if (second && o < other.length) out.push(other[o++]);
    else if (m < main.length) out.push(main[m++]);
    else out.push(other[o++]);
  }
  return out;
}
