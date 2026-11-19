// Offline tests for the gen~ engine (m4l/loopshifter.genexpr).
// Translates the GenExpr into JavaScript and checks the playback order.
//   node m4l/test/gen_test.js
"use strict";
const { makeEngine } = require("./gen_translate");

let failures = 0;
function check(cond, msg) { if (!cond) { failures++; console.log("FAIL: " + msg); } else { console.log("ok   " + msg); } }

const SR = 1000, P = 500, BAR = 4 * P;   // 120 BPM at a 1 kHz test rate: a beat is 500 samples

class Run {
  constructor(opts) {
    this.e = makeEngine(SR);
    this.G = this.e.G;
    Object.assign(this.G, { tempo: 120, running: 1, fadems: 0 }, opts || {});
    this.n = 0;
    this.out = [0, 0, 0];
  }
  step() {
    const n = this.n, s = (n + 1) * 1e-6;          // the input says which sample it is
    this.out = this.e.perform(s, s, (n % P) / P, (n % BAR) / BAR);
    this.n++;
  }
  stepTo(m) { while (this.n < m) this.step(); }
  inSample() { return Math.round(this.out[0] * 1e6) - 1; }
  capture() { this.G.capseq += 1; }
}

// Records 16 beats starting on the bar at 2000, then returns the buffer position
// (in samples) heard at each output sample from the end of the recording on.
function play(opts, samples) {
  const r = new Run(opts);
  r.stepTo(100);
  r.capture();
  r.stepTo(2000);
  const recStart = 2000, recEnd = recStart + (opts.bufbeats || 16) * P;
  r.stepTo(recEnd);
  const heard = [];
  for (let i = 0; i < samples; i++) {
    r.step();
    heard.push(r.out[2] && r.G.h_gain >= 1 ? r.inSample() - recStart : null);   // skip the 2 ms fade-in
  }
  return { heard, r };
}

// pass starts: where each new window begins (a jump in the heard positions)
function passes(heard) {
  const f = heard.findIndex(h => h !== null);
  heard = heard.filter(h => h !== null);
  const s = [heard[0] - f];          // the first sample or two are the fade-in
  for (let i = 1; i < heard.length; i++) if (heard[i] !== heard[i - 1] + 1) s.push(heard[i]);
  return s;
}

// on the beat: the heard position minus the time since playback began is always a whole beat
function onBeat(heard) {
  let bad = 0;
  heard.forEach((h, t) => { if (h !== null && ((h - t) % P + P) % P !== 0) bad++; });
  return bad;
}

// 1. the example: loop 4, shift 1 beat -> ABCDE BCDEF CDEFG ...
{
  const { heard } = play({ bufbeats: 16, loopbeats: 4, shiftmode: 1, shiftdiv: 5, dir: 0 }, 5 * 5 * P);
  const p = passes(heard).map(x => x / P);
  check(JSON.stringify(p) === JSON.stringify([0, 1, 2, 3, 4]), "forward passes start A B C D E: " + p.join(" "));
  check(heard[5 * P - 1] === 5 * P - 1 && heard[5 * P] === P, "first pass plays 5 beats (ABCDE) then jumps to B");
  check(onBeat(heard) === 0, "forward stays on the beat");
}

// 2. a shift in ms that is not a beat division still stays on the beat
{
  const { heard } = play({ bufbeats: 16, loopbeats: 4, shiftmode: 0, shiftms: 137, dir: 0 }, 20 * P);
  const p = passes(heard);
  check(p[1] === 137 && p[2] === 274, "ms shift: windows start 0, 137, 274 ms");
  check(onBeat(heard) === 0, "ms shift stays on the beat");
}

// 3. backwards: start on the last loop of the buffer, play LOOP - SHIFT -> MNO LMN KLM
{
  const { heard } = play({ bufbeats: 16, loopbeats: 4, shiftmode: 1, shiftdiv: 5, dir: 1 }, 3 * 3 * P);
  const p = passes(heard).map(x => x / P);
  check(JSON.stringify(p) === JSON.stringify([12, 11, 10]), "backward passes start M L K: " + p.join(" "));
  check(onBeat(heard) === 0, "backward stays on the beat");
}

// 4. wrap: after the window passes the end it reads round to the start, still on the beat
{
  const { heard } = play({ bufbeats: 8, loopbeats: 4, shiftmode: 1, shiftdiv: 5, dir: 0, endmode: 0 }, 60 * P);
  check(heard.slice(2).every(h => h !== null), "wrap keeps playing");
  check(onBeat(heard) === 0, "wrap stays on the beat");
  check(heard.every(h => h >= 0 && h < 8 * P), "wrap reads inside the buffer");
}

// 5. stop: once the next window would run past the end, the loop stops and the dry signal returns
{
  const { heard, r } = play({ bufbeats: 8, loopbeats: 4, shiftmode: 1, shiftdiv: 5, dir: 0, endmode: 1 }, 30 * P);
  const p = passes(heard).map(x => x / P);
  check(JSON.stringify(p) === JSON.stringify([0, 1, 2, 3]), "stop: windows 0..3 then stop: " + p.join(" "));
  check(heard[heard.length - 1] === null && r.G.h_state === 5, "stopped at the end");
  check(Math.round(r.out[0] * 1e6) - 1 === r.n - 1, "dry signal after stopping");
}

// 6. backwards with stop
{
  const { heard } = play({ bufbeats: 8, loopbeats: 4, shiftmode: 1, shiftdiv: 5, dir: 1, endmode: 1 }, 30 * P);
  const p = passes(heard).map(x => x / P);
  check(JSON.stringify(p) === JSON.stringify([4, 3, 2, 1, 0]), "back + stop: windows 4..0: " + p.join(" "));
}

// 7. restart waits for the next bar and goes back to the first window
{
  const r = new Run({ bufbeats: 16, loopbeats: 4, shiftmode: 1, shiftdiv: 5 });
  r.stepTo(100); r.capture(); r.stepTo(2000 + 16 * P + 7 * P + 100);
  r.G.rstseq += 1;
  r.stepTo(2000 + 16 * P + 8 * P);       // next bar line
  r.step();
  check(r.inSample() - 2000 === 0, "restart: back to A on the next bar");
}

// 8. Live stops: dry; Live starts again: the loop begins from the top on the bar
{
  const r = new Run({ bufbeats: 8, loopbeats: 4, shiftmode: 1, shiftdiv: 5 });
  r.stepTo(100); r.capture(); r.stepTo(2000 + 8 * P + 3 * P);
  r.G.running = 0;
  r.stepTo(2000 + 8 * P + 4 * P);
  check(r.G.h_state === 3, "transport stop -> ready");
  r.G.running = 1;                       // Live starts again right on a bar line
  r.stepTo(r.n + 10);
  check(r.out[2] && r.inSample() - 2000 === 9, "plays again from A on the bar");
}

// 9. with a fade, the output never jumps more than a small step on a smooth input
{
  const r = new Run({ bufbeats: 16, loopbeats: 4, shiftmode: 0, shiftms: 137, fadems: 20 });
  // a slow sine as input so jumps would show as big steps without the fade
  r.e.G; const orig = r.step.bind(r);
  r.step = function () { const n = this.n, s = Math.sin(2 * Math.PI * n / 731); this.out = this.e.perform(s, s, (n % P) / P, (n % BAR) / BAR); this.n++; };
  r.stepTo(100); r.capture(); r.stepTo(2000 + 16 * P);
  let prev = r.out[0], worst = 0;
  for (let i = 0; i < 30 * P; i++) { r.step(); worst = Math.max(worst, Math.abs(r.out[0] - prev)); prev = r.out[0]; }
  check(worst < 0.2, "20 ms fade: no clicks (largest step " + worst.toFixed(4) + ")");
}

console.log(failures ? failures + " FAILED" : "all passed");
process.exit(failures ? 1 : 0);
