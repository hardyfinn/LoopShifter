// Runs the engine on a made-up drum loop and dumps the display buffers, for the preview picture.
//   node m4l/tools/preview_state.js > state.json
"use strict";
const { makeEngine } = require("../test/gen_translate");
const SR = 48000, BPM = 124, P = Math.round(SR * 60 / BPM), BAR = 4 * P;
const e = makeEngine(SR);
Object.assign(e.G, { tempo: BPM, running: 1, bufbeats: 16, loopbeats: 4, shiftmode: 1, shiftdiv: 5, fadems: 20 });
function drum(n) {
  const b = n % P, beat = Math.floor(n / P) % 16;
  let s = Math.exp(-b / 2500) * Math.sin(2 * Math.PI * 55 * b / SR) * (beat % 4 == 0 ? 1 : 0.6);
  const h = (n + P / 2) % P;
  s += 0.3 * Math.exp(-h / 400) * (Math.random() * 2 - 1);
  if (beat % 8 == 6) s += 0.5 * Math.exp(-((n % P) / 900)) * (Math.random() * 2 - 1);
  return s;
}
let n = 0;
const step = () => { const s = drum(n); e.perform(s, s, (n % P) / P, (n % BAR) / BAR); n++; };
while (n < 100) step();
e.G.capseq = 1;
const until = BAR + 16 * P + 2 * 5 * P + Math.round(2.6 * P);   // into pass 3
while (n < until) step();
e.G.h_tick = 0; step();
console.log(JSON.stringify({ pk: Array.from(e.G.pk.slice(0, 512)), st: Array.from(e.G.st.slice(0, 32)) }));
