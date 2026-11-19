// Draws device-preview.png: the real display script (loopshifter_display.js) fed with
// the engine's real state (tools/preview_state.js), next to a drawing of the controls.
//   node m4l/tools/render_preview.js state.json out.png
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const state = fs.readFileSync(process.argv[2], "utf8");
const disp = fs.readFileSync(path.join(__dirname, "..", "loopshifter_display.js"), "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#3a3a3a;font-family:Arial,Helvetica,sans-serif}
.dev{position:relative;width:552px;height:169px;background:#3e3e3e}
.a{position:absolute;box-sizing:border-box}
.lbl{color:#bfbfbf;font-size:12px;text-align:center;font-weight:bold}
.sm{color:#9a9a9a;font-size:10px;text-align:center}
.tab{display:flex;flex-wrap:wrap;gap:1px}
.tab div{flex:1 0 30%;background:#595959;color:#ddd;font-size:12px;font-weight:bold;display:flex;align-items:center;justify-content:center}
.tab div.on{background:#f0a020;color:#1e1e1e}
.btn{background:#595959;color:#ddd;font-weight:bold;font-size:12px;display:flex;align-items:center;justify-content:center}
</style></head><body><div class="dev">
<canvas id="c" class="a" style="left:4px;top:4px;width:262px;height:161px" width="524" height="322"></canvas>
<div class="a btn" style="left:272px;top:4px;width:78px;height:34px;background:#338c4d;color:#fff;font-size:13px">COMPLETE</div>
<div class="a lbl" style="left:272px;top:42px;width:78px">Buffer</div>
<div class="a tab" style="left:272px;top:58px;width:78px;height:20px"><div>8</div><div class="on">16</div><div>32</div></div>
<div class="a lbl" style="left:272px;top:82px;width:78px">Loop</div>
<div class="a btn" style="left:272px;top:98px;width:78px;height:24px;background:#2a2a2a;color:#f0a020;font-size:13px">4 beats</div>
<div class="a btn" style="left:272px;top:130px;width:78px;height:20px;background:#f0a020;color:#1e1e1e;font-size:11px">auto stop</div>
<div class="a lbl" style="left:356px;top:4px;width:104px">Shift</div>
<div class="a tab" style="left:356px;top:20px;width:104px;height:20px"><div>ms</div><div class="on">beat</div></div>
<div class="a tab" style="left:356px;top:44px;width:104px;height:44px"><div>1/32</div><div>1/16</div><div>1/8</div><div>1/4</div><div>1/2</div><div class="on">1</div></div>
<div class="a tab" style="left:356px;top:92px;width:104px;height:22px"><div class="on">&#9654; fwd</div><div>&#9664; back</div></div>
<div class="a sm" style="left:356px;top:119px;width:104px">beat: 1 = one beat</div>
<div class="a lbl" style="left:466px;top:2px;width:82px;font-size:11px">Fade</div>
<svg class="a" style="left:489px;top:16px" width="36" height="28" viewBox="0 0 36 28"><path d="M6 25 A14 14 0 1 1 30 25" fill="none" stroke="#2a2a2a" stroke-width="3"/><path d="M6 25 A14 14 0 0 1 18 4" fill="none" stroke="#f0a020" stroke-width="3"/><line x1="18" y1="18" x2="18" y2="6" stroke="#ddd" stroke-width="2"/></svg>
<div class="a lbl" style="left:466px;top:44px;width:82px;font-size:11px;color:#ddd">20.0 ms</div>
<div class="a lbl" style="left:466px;top:58px;width:82px">At end</div>
<div class="a tab" style="left:466px;top:74px;width:82px;height:22px"><div class="on">wrap</div><div>stop</div></div>
<div class="a btn" style="left:466px;top:102px;width:82px;height:26px">&#10226; restart</div>
<div class="a btn" style="left:466px;top:132px;width:82px;height:22px">clear</div>
</div><script>
const S = ${state};
const cv = document.getElementById("c"), cx = cv.getContext("2d"); cx.scale(2, 2);
let font = "Arial", fsz = 10;
const mgraphics = { size: [262, 161], init(){}, redraw(){ paint(); },
  set_source_rgba(r,g,b,a){ const c = "rgba(" + [r*255|0, g*255|0, b*255|0, a].join(",") + ")"; cx.fillStyle = c; cx.strokeStyle = c; },
  rectangle(x,y,w,h){ cx.beginPath === undefined; if (!this.p) { cx.beginPath(); this.p = 1; } cx.rect(x,y,w,h); },
  fill(){ cx.fill(); this.p = 0; cx.beginPath(); }, stroke(){ cx.stroke(); this.p = 0; cx.beginPath(); },
  set_line_width(w){ cx.lineWidth = w; }, move_to(x,y){ if (!this.p) { cx.beginPath(); this.p = 1; } cx.moveTo(x,y); this.tx = x; this.ty = y; },
  line_to(x,y){ cx.lineTo(x,y); }, select_font_face(f){ }, set_font_size(s){ fsz = s; cx.font = "bold " + s + "px Arial"; },
  text_measure(s){ return [cx.measureText(s).width, fsz]; }, show_text(s){ cx.fillText(s, this.tx, this.ty); this.p = 0; cx.beginPath(); } };
function Buffer(name){ this.d = name.indexOf("pk") >= 0 ? S.pk : S.st; }
Buffer.prototype.peek = function(ch, s, n){ return this.d.slice(s, s + n); };
${disp}
bufs("---lspk", "---lsst"); paint();
</script></body></html>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 552, height: 169 }, deviceScaleFactor: 2 });
  await p.setContent(html);
  await p.screenshot({ path: process.argv[3] });
  await b.close();
})();
