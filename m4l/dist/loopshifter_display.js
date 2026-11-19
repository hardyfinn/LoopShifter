// loopshifter_display.js: the display for the Loopshifter Max for Live device ([jsui]).
// Shows the captured buffer, beat and bar lines, the window being played
// (dark orange = the loop, bright orange = the extra shift), the play head
// and a status line.
// The gen~ engine writes its state into two buffer~s; "bufs <peaks> <state>"
// tells this script their names, and each "bang" redraws.

mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

var pk = null, st = null;
var PKN = 512;

function bufs(a, b) {
	pk = new Buffer(a);
	st = new Buffer(b);
}

function bang() {
	mgraphics.redraw();
}

function rgb(c) { mgraphics.set_source_rgba(c[0], c[1], c[2], c.length > 3 ? c[3] : 1); }
var C_BG = [0.07, 0.07, 0.08], C_STRIP = [0.11, 0.11, 0.13], C_INK = [0.93, 0.91, 0.85];
var C_SOFT = [0.55, 0.53, 0.5], C_ORANGE = [0.94, 0.63, 0.13], C_LOOP = [0.48, 0.29, 0.1];
var C_WAVE = [0.72, 0.77, 0.8], C_REC = [0.94, 0.25, 0.25];

function text(s, x, y, size, c, align) {
	mgraphics.select_font_face("Arial Bold");
	mgraphics.set_font_size(size);
	rgb(c);
	var w = mgraphics.text_measure(s)[0];
	if (align == "right") x -= w;
	mgraphics.move_to(x, y);
	mgraphics.show_text(s);
}

function vline(x, y0, y1, c, w) {
	rgb(c);
	mgraphics.set_line_width(w);
	mgraphics.move_to(x, y0);
	mgraphics.line_to(x, y1);
	mgraphics.stroke();
}

function beats(n) {
	var r = Math.round(n * 1000) / 1000;
	return (r == Math.floor(r)) ? String(r) : r.toFixed(2);
}

function fracName(x) {
	var d = [32, 16, 8, 4, 2];
	for (var i = 0; i < d.length; i++) if (Math.abs(x * d[i] - 1) < 0.02) return "1/" + d[i];
	return beats(x);
}

// a span of the buffer that may run past the end (it wraps round to the start)
function span(a, b, len, X, y, h, c) {
	rgb(c);
	var s = ((a % len) + len) % len, e = s + (b - a);
	if (e <= len) {
		mgraphics.rectangle(X(s), y, X(e) - X(s), h);
	} else {
		mgraphics.rectangle(X(s), y, X(len) - X(s), h);
		mgraphics.rectangle(X(0), y, X(e - len) - X(0), h);
	}
	mgraphics.fill();
}

function paint() {
	var W = mgraphics.size[0], H = mgraphics.size[1];
	rgb(C_BG);
	mgraphics.rectangle(0, 0, W, H);
	mgraphics.fill();
	var s = null;
	if (st) s = st.peek(1, 0, 18);
	if (!s || !s.length || s[6] <= 0) {
		text("LOOPSHIFTER", 8, H / 2, 15, C_ORANGE);
		text("press ARM, then Play", 8, H / 2 + 18, 11, C_SOFT);
		return;
	}
	var state = s[0], len = s[1], start = s[2], win = s[3], pos = s[4], pass = s[5], sr = s[6];
	var cper = Math.max(1, s[7]), wpos = s[8], wdir = s[9], wl = s[10], wsh = s[11];
	var period = Math.max(1, s[12]), endmode = s[13], rstpend = s[14];

	// ---- status line ----
	var left = "", lc = C_ORANGE;
	if (state == 0) { left = "EMPTY: press ARM"; lc = C_SOFT; }
	else if (state == 1) { left = s[17] > 0.5 ? "ARMED: starts with Play" : "ARMED: next bar"; lc = C_REC; }
	else if (state == 2) { left = "RECORDING " + Math.floor(wpos / cper + 1) + " / " + Math.round(len / cper); lc = C_REC; }
	else if (state == 3) { left = s[17] > 0.5 ? "COMPLETE: press Play" : "READY: next bar"; lc = C_INK; }
	else if (state == 5) { left = "END: stopped"; lc = C_SOFT; }
	else {
		var a = start / cper, b = (start + win) / cper, n = len / cper;
		if (b > n) b -= n;
		var whole = Math.abs(a - Math.round(a)) < 0.001 && Math.abs(b - Math.round(b)) < 0.001;
		left = "PASS " + pass + " · " + (whole ? "beats " + Math.round(a + 1) + "–" + Math.round(b == 0 ? n : b)
			: "from beat " + beats(a + 1));
		if (rstpend > 0.5) left = "RESTART: next bar";
	}
	text(left, 6, 17, 14, lc);
	var bpm = 60 * sr / (state >= 2 ? cper : period);
	text(bpm.toFixed(1) + " BPM", W - 6, 17, 11, C_SOFT, "right");

	// ---- the buffer ----
	var sx = 6, sw = W - 12, sy = 26, sh = H - 26 - 20;
	rgb(C_STRIP);
	mgraphics.rectangle(sx, sy, sw, sh);
	mgraphics.fill();
	if (len <= 0) return;
	function X(p) { return sx + p / len * sw; }

	// the window: loop part dark, the extra shift bright (backwards the window is LOOP - SHIFT)
	if (state == 4 || state == 5) {
		if (wdir < 0.5) {
			span(start, start + wl, len, X, sy, sh, [C_LOOP[0], C_LOOP[1], C_LOOP[2], 0.85]);
			span(start + wl, start + win, len, X, sy, sh, [C_ORANGE[0], C_ORANGE[1], C_ORANGE[2], 0.45]);
		} else {
			span(start, start + win, len, X, sy, sh, [C_LOOP[0], C_LOOP[1], C_LOOP[2], 0.85]);
		}
	}

	// waveform
	if (pk) {
		var peaks = pk.peek(1, 0, PKN);
		var filled = state == 2 ? wpos / len * PKN : PKN;
		rgb(C_WAVE);
		for (var i = 0; i < sw; i++) {
			var b0 = Math.floor(i / sw * PKN), b1 = Math.max(b0, Math.floor((i + 1) / sw * PKN) - 1);
			if (b0 >= filled) break;
			var m = 0;
			for (var k = b0; k <= b1; k++) if (peaks[k] > m) m = peaks[k];
			var hh = Math.min(1, m) * sh * 0.45;
			mgraphics.rectangle(sx + i, sy + sh / 2 - hh, 1, Math.max(0.6, 2 * hh));
		}
		mgraphics.fill();
	}

	// beat and bar lines
	var nb = Math.round(len / cper);
	for (var j = 1; j < nb; j++) {
		var bar = j % 4 == 0;
		vline(X(j * cper), sy, sy + sh, bar ? [1, 1, 1, 0.4] : [1, 1, 1, 0.13], bar ? 1.2 : 1);
	}

	// heads
	if (state == 2) vline(X(wpos), sy - 2, sy + sh + 2, C_REC, 1.6);
	if (state == 4) vline(X(pos), sy - 2, sy + sh + 2, C_ORANGE, 2);

	// ---- legend ----
	var shTxt = s[16] < 0.5 ? Math.round(wsh / sr * 1000) + " ms"
		: fracName(wsh / cper) + " beat";
	if (state >= 4) {
		text("loop " + beats(wl / cper) + (wdir < 0.5 ? " + " : " − ") + shTxt, 6, H - 5, 11, C_INK);
	}
	text(nb + "-beat buffer · " + (endmode > 0.5 ? "stop" : "wrap"), W - 6, H - 5, 11, C_SOFT, "right");
}
