#!/usr/bin/env python3
"""Builds Loopshifter.amxd, a Max for Live audio effect.

    python3 m4l/build_device.py            writes m4l/dist/Loopshifter.amxd (+ .maxpat)

Patch overview:

  plugin~ -> gen~ (m4l/loopshifter.genexpr in a codebox) -> plugout~
  phasor~ 4n / 1n @lock 1 -> gen~ inlets 3, 4 (bar lines from Live's transport)
  transport -> tempo and running -> gen~
  CAPTURE / RESTART buttons -> counter -> "capseq n" / "rstseq n" -> gen~
  tabs, number box and dials -> "<param> <value>" -> gen~
  the Shift ms/beat tab shows either the note-value tab or the ms dial (thispatcher)
  gen~ writes peaks and state into buffer~ ---lspk / ---lsst
  jsui (loopshifter_display.js) reads those buffers 25 times a second
"""
import json, os, struct
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "dist")


class Patch:
    def __init__(self):
        self.boxes, self.lines, self.n = [], [], 0

    def add(self, box):
        self.n += 1
        box["id"] = "obj-%d" % self.n
        self.boxes.append({"box": box})
        return box["id"]

    def obj(self, text, x, y, ins=1, outs=1, types=None, w=None, **extra):
        b = {"maxclass": "newobj", "text": text, "numinlets": ins, "numoutlets": outs,
             "outlettype": types if types is not None else [""] * outs,
             "patching_rect": [x, y, w or max(30, 7 * len(text) + 12), 22.0]}
        b.update(extra)
        return self.add(b)

    def msg(self, text, x, y):
        return self.add({"maxclass": "message", "text": text, "numinlets": 2, "numoutlets": 1,
                         "outlettype": [""], "patching_rect": [x, y, max(30, 7 * len(text) + 14), 22.0]})

    def comment(self, text, x, y, w=300, pres=None, size=None, color=None):
        b = {"maxclass": "comment", "text": text, "numinlets": 1, "numoutlets": 0,
             "patching_rect": [x, y, w, 20.0]}
        if pres:
            b.update({"presentation": 1, "presentation_rect": pres,
                      "textcolor": color or [0.75, 0.75, 0.75, 1.0]})
        if size:
            b["fontsize"] = size
        return self.add(b)

    def connect(self, a, ao, b, bi=0):
        self.lines.append({"patchline": {"source": [a, ao], "destination": [b, bi]}})


def valueof(longname, short, ptype, extra):
    v = {"parameter_longname": longname, "parameter_shortname": short, "parameter_type": ptype}
    v.update(extra)
    return {"valueof": v}


def patcher_dict(boxes, lines, rect, classnamespace="box", extra=None):
    d = {"fileversion": 1,
         "appversion": {"major": 9, "minor": 0, "revision": 0, "architecture": "x64", "modernui": 1},
         "classnamespace": classnamespace, "rect": rect, "bglocked": 0, "openinpresentation": 1,
         "default_fontsize": 10.0, "default_fontface": 0, "default_fontname": "Arial Bold",
         "gridonopen": 1, "gridsize": [15.0, 15.0], "gridsnaponopen": 1, "objectsnaponopen": 1,
         "statusbarvisible": 2, "toolbarvisible": 1, "lefttoolbarpinned": 0, "toptoolbarpinned": 0,
         "righttoolbarpinned": 0, "bottomtoolbarpinned": 0, "toolbars_unpinned_last_save": 0,
         "tallnewobj": 0, "boxanimatetime": 200, "enablehscroll": 1, "enablevscroll": 1,
         "devicewidth": 0.0, "description": "", "digest": "", "tags": "", "style": "",
         "subpatcher_template": "", "assistshowspatchername": 0,
         "boxes": boxes, "lines": lines}
    if extra:
        d.update(extra)
    return d


def gen_box(P, code, x, y):
    """A gen~ object with the engine in a codebox, 4 inlets and 3 outlets."""
    G = Patch()
    cb = G.add({"maxclass": "codebox", "code": code, "fontface": 0, "fontname": "<Monospaced>",
                "fontsize": 12.0, "numinlets": 4, "numoutlets": 3, "outlettype": ["", "", ""],
                "patching_rect": [50.0, 100.0, 700.0, 600.0]})
    for i in range(4):
        iid = G.add({"maxclass": "newobj", "text": "in %d" % (i + 1), "numinlets": 0, "numoutlets": 1,
                     "outlettype": [""], "patching_rect": [50.0 + 180 * i, 40.0, 40.0, 22.0]})
        G.connect(iid, 0, cb, i)
    for i in range(3):
        oid = G.add({"maxclass": "newobj", "text": "out %d" % (i + 1), "numinlets": 1, "numoutlets": 0,
                     "patching_rect": [50.0 + 250 * i, 730.0, 45.0, 22.0]})
        G.connect(cb, i, oid, 0)
    gp = patcher_dict(G.boxes, G.lines, [100.0, 100.0, 820.0, 800.0], classnamespace="dsp.gen",
                      extra={"openinpresentation": 0})
    return P.obj("gen~", x, y, 4, 3, ["signal", "signal", "signal"], w=120, patcher=gp)


def dial(P, long, short, lo, hi, dflt, unitstyle, x, y, pres, units=None, exponent=None):
    extra = {"parameter_mmin": lo, "parameter_mmax": hi, "parameter_initial_enable": 1,
             "parameter_initial": [dflt], "parameter_unitstyle": unitstyle}
    if units:
        extra["parameter_units"] = units
    return P.add({"maxclass": "live.dial", "varname": long, "numinlets": 1, "numoutlets": 2,
                  "outlettype": ["", "float"], "patching_rect": [x, y, 44, 48],
                  "presentation": 1, "presentation_rect": pres, "parameter_enable": 1,
                  "saved_attribute_attributes": valueof(long, short, 0, extra)})


def toggle(P, long, short, text, x, y, pres, dflt=0):
    extra = {"parameter_enum": ["off", "on"], "parameter_mmax": 1, "parameter_initial_enable": 1,
             "parameter_initial": [dflt]}
    return P.add({"maxclass": "live.text", "varname": long, "text": text, "texton": text, "mode": 1,
                  "numinlets": 1, "numoutlets": 2, "outlettype": ["", ""], "patching_rect": [x, y, 44, 15],
                  "presentation": 1, "presentation_rect": pres, "parameter_enable": 1,
                  "saved_attribute_attributes": valueof(long, short, 2, extra)})


def button(P, long, short, text, x, y, pres, fontsize=None):
    b = {"maxclass": "live.text", "varname": long, "text": text, "texton": text, "mode": 0,
         "numinlets": 1, "numoutlets": 2, "outlettype": ["", ""], "patching_rect": [x, y, 44, 15],
         "presentation": 1, "presentation_rect": pres, "parameter_enable": 1,
         "saved_attribute_attributes": valueof(long, short, 2, {"parameter_enum": ["off", "on"],
                                                                "parameter_mmax": 1})}
    if fontsize:
        b["fontsize"] = fontsize
    return P.add(b)


GREY = [0.75, 0.75, 0.75, 1.0]


def label(P, text, pres, size=12.0):
    b = P.comment(text, 0, 0, 10, pres=pres, size=size, color=GREY)
    P.boxes[-1]["box"]["textjustification"] = 1
    return b


def tab(P, long, short, items, dflt, x, y, pres, lines=1, varname=None, fontsize=11.0):
    extra = {"parameter_enum": items, "parameter_mmax": len(items) - 1,
             "parameter_initial_enable": 1, "parameter_initial": [dflt]}
    return P.add({"maxclass": "live.tab", "varname": varname or long, "numinlets": 1, "numoutlets": 3,
                  "outlettype": ["", "", "float"], "patching_rect": [x, y, 100, 20],
                  "presentation": 1, "presentation_rect": pres, "parameter_enable": 1,
                  "num_lines_patching": lines, "num_lines_presentation": lines, "fontsize": fontsize,
                  "saved_attribute_attributes": valueof(long, short, 2, extra)})


def send(P, src, name, x, y, gen, outlet=0):
    pr = P.obj("prepend " + name, x, y)
    P.connect(src, outlet, pr, 0)
    P.connect(pr, 0, gen, 0)
    return pr


def build():
    code = open(os.path.join(HERE, "loopshifter.genexpr")).read()
    P = Patch()

    # ---- audio ----
    P.comment("Loopshifter: a window moves through a captured buffer, staying on the beat. "
              "Engine: the gen~ codebox (m4l/loopshifter.genexpr).", 20, 10, 700)
    pin = P.obj("plugin~", 20, 50, 1, 2, ["signal", "signal"])
    beat = P.obj("phasor~ 4n @lock 1", 160, 50, 2, 1, ["signal"])
    bar = P.obj("phasor~ 1n @lock 1", 320, 50, 2, 1, ["signal"])
    gen = gen_box(P, code, 20, 330)
    P.connect(pin, 0, gen, 0)
    P.connect(pin, 1, gen, 1)
    P.connect(beat, 0, gen, 2)
    P.connect(bar, 0, gen, 3)
    pout = P.obj("plugout~", 20, 380, 2, 2, ["signal", "signal"])
    P.connect(gen, 0, pout, 0)
    P.connect(gen, 1, pout, 1)

    # ---- tempo and transport state from Live ----
    tm = P.obj("qmetro 20 @active 1", 480, 50, 2, 1, ["bang"])
    tr = P.obj("transport", 480, 85, 2, 9, ["int", "int", "float", "float", "float", "", "int", "float", ""])
    P.connect(tm, 0, tr, 0)
    tch = P.obj("change 0.", 480, 120, 1, 3, ["", "int", "int"])
    P.connect(tr, 4, tch, 0)
    send(P, tch, "tempo", 480, 155, gen)
    rch = P.obj("change", 600, 120, 1, 3, ["", "int", "int"])
    P.connect(tr, 6, rch, 0)
    send(P, rch, "running", 600, 155, gen)

    # ---- buffers for the display ----
    dev = P.obj("live.thisdevice", 680, 50, 1, 3, ["bang", "int", "int"])
    tb = P.obj("t b b b b", 680, 85, 1, 4, ["bang", "bang", "bang", "bang"])
    P.connect(dev, 0, tb, 0)
    bpk = P.obj("buffer~ ---lspk", 680, 190, 1, 2, ["float", "bang"], w=130)
    bst = P.obj("buffer~ ---lsst", 840, 190, 1, 2, ["float", "bang"], w=130)
    m1 = P.msg("sizeinsamps 512 1", 680, 120)
    m2 = P.msg("sizeinsamps 32 1", 840, 120)
    P.connect(tb, 3, m1, 0)
    P.connect(tb, 3, m2, 0)
    P.connect(m1, 0, bpk, 0)
    P.connect(m2, 0, bst, 0)
    mbind = P.msg("pk ---lspk, st ---lsst", 680, 240)
    P.connect(tb, 2, mbind, 0)
    P.connect(mbind, 0, gen, 0)

    # ---- display ----
    disp = P.add({"maxclass": "jsui", "filename": "loopshifter_display.js", "numinlets": 1, "numoutlets": 1,
                  "outlettype": [""], "parameter_enable": 0, "border": 0,
                  "patching_rect": [680, 330, 262, 161], "presentation": 1, "presentation_rect": [4, 4, 262, 161]})
    mbufs = P.msg("bufs ---lspk ---lsst", 680, 280)
    P.connect(tb, 1, mbufs, 0)
    P.connect(mbufs, 0, disp, 0)
    dm = P.obj("qmetro 40 @active 1", 1000, 280, 2, 1, ["bang"])
    P.connect(dm, 0, disp, 0)

    # ---- column 1: CAPTURE, Buffer, Loop ----
    cap = P.add({"maxclass": "live.text", "varname": "Capture", "text": "● CAPTURE", "texton": "● CAPTURE",
                 "mode": 0, "numinlets": 1, "numoutlets": 2, "outlettype": ["", ""],
                 "patching_rect": [20, 440, 80, 30], "presentation": 1, "presentation_rect": [272, 4, 78, 34],
                 "fontsize": 13.0, "activebgcolor": [0.82, 0.23, 0.23, 1.0],
                 "activebgoncolor": [1.0, 0.45, 0.45, 1.0], "activetextcolor": [1.0, 1.0, 1.0, 1.0],
                 "activetextoncolor": [1.0, 1.0, 1.0, 1.0], "parameter_enable": 1,
                 "saved_attribute_attributes": valueof("Capture", "Capture", 2, {
                     "parameter_enum": ["off", "on"], "parameter_mmax": 1})})
    seqs = []
    for (bid, x, name) in [(cap, 20, "capseq")]:
        seqs.append((bid, x, name))
    label(P, "Buffer", [272, 42, 78, 16])
    buf = tab(P, "Buffer Beats", "Buffer", ["8", "16", "32"], 1, 120, 440, [272, 58, 78, 20], fontsize=12.0)
    bsel = P.obj("sel 0 1 2", 120, 480, 1, 4)
    P.connect(buf, 0, bsel, 0)
    bmsg = [P.msg("bufbeats %d" % n, 120 + 70 * i, 510) for i, n in enumerate([8, 16, 32])]
    for i, m in enumerate(bmsg):
        P.connect(bsel, i, m, 0)
        P.connect(m, 0, gen, 0)
    label(P, "Loop", [272, 82, 78, 16])
    loop = P.add({"maxclass": "live.numbox", "varname": "Loop Beats", "numinlets": 1, "numoutlets": 2,
                  "outlettype": ["", "float"], "patching_rect": [340, 440, 60, 18], "fontsize": 13.0,
                  "presentation": 1, "presentation_rect": [272, 98, 78, 24], "parameter_enable": 1,
                  "saved_attribute_attributes": valueof("Loop Beats", "Loop", 1, {
                      "parameter_mmin": 1, "parameter_mmax": 16, "parameter_initial_enable": 1,
                      "parameter_initial": [4], "parameter_unitstyle": 9, "parameter_units": "%d beats"})})
    send(P, loop, "loopbeats", 340, 510, gen)
    label(P, "drag or type", [272, 124, 78, 14], size=10.0)

    # ---- column 2: Shift ----
    label(P, "Shift", [356, 4, 104, 16])
    smode = tab(P, "Shift Mode", "Mode", ["ms", "beat"], 1, 440, 440, [356, 20, 104, 20], fontsize=12.0)
    send(P, smode, "shiftmode", 440, 510, gen)
    sdiv = tab(P, "Shift Beat", "Shift", ["1/32", "1/16", "1/8", "1/4", "1/2", "1"], 5, 560, 440,
               [356, 44, 104, 44], lines=2, varname="shiftdiv", fontsize=12.0)
    send(P, sdiv, "shiftdiv", 560, 510, gen)
    sms = P.add({"maxclass": "live.dial", "varname": "shiftms", "numinlets": 1, "numoutlets": 2,
                 "outlettype": ["", "float"], "patching_rect": [680, 440, 44, 48],
                 "presentation": 1, "presentation_rect": [383, 42, 50, 48], "parameter_enable": 1,
                 "hidden": 1,
                 "saved_attribute_attributes": valueof("Shift ms", "Shift ms", 0, {
                     "parameter_mmin": 1.0, "parameter_mmax": 2000.0, "parameter_initial_enable": 1,
                     "parameter_initial": [100.0], "parameter_unitstyle": 2, "parameter_exponent": 3.0})})
    send(P, sms, "shiftms", 680, 510, gen)
    # ms <-> beat: show the dial or the note-value tab
    msel = P.obj("sel 0 1", 440, 560, 1, 3)
    P.connect(smode, 0, msel, 0)
    mms = P.msg("script sendbox shiftms hidden 0, script sendbox shiftdiv hidden 1", 440, 590)
    mbt = P.msg("script sendbox shiftms hidden 1, script sendbox shiftdiv hidden 0", 440, 620)
    P.connect(msel, 0, mms, 0)
    P.connect(msel, 1, mbt, 0)
    tp = P.obj("thispatcher", 440, 660, 1, 2, ["", ""])
    P.connect(mms, 0, tp, 0)
    P.connect(mbt, 0, tp, 0)
    sdir = tab(P, "Direction", "Dir", ["▶ fwd", "◀ back"], 0, 800, 440, [356, 92, 104, 22], fontsize=12.0)
    send(P, sdir, "dir", 800, 510, gen)
    label(P, "beat: 1 = one beat", [356, 118, 104, 14], size=10.0)

    # ---- column 3: Fade, At end, Restart ----
    fade = P.add({"maxclass": "live.dial", "varname": "Fade", "numinlets": 1, "numoutlets": 2,
                  "outlettype": ["", "float"], "patching_rect": [920, 440, 44, 48],
                  "presentation": 1, "presentation_rect": [480, 2, 50, 52], "parameter_enable": 1,
                  "saved_attribute_attributes": valueof("Fade", "Fade", 0, {
                      "parameter_mmin": 0.0, "parameter_mmax": 40.0, "parameter_initial_enable": 1,
                      "parameter_initial": [20.0], "parameter_unitstyle": 2})})
    send(P, fade, "fadems", 920, 510, gen)
    label(P, "At end", [466, 58, 82, 16])
    endt = tab(P, "At End", "End", ["wrap", "stop"], 0, 1020, 440, [466, 74, 82, 22], fontsize=12.0)
    send(P, endt, "endmode", 1020, 510, gen)
    rst = P.add({"maxclass": "live.text", "varname": "Restart", "text": "⟲ restart", "texton": "⟲ restart",
                 "mode": 0, "numinlets": 1, "numoutlets": 2, "outlettype": ["", ""],
                 "patching_rect": [1120, 440, 80, 20], "presentation": 1, "presentation_rect": [466, 102, 82, 26],
                 "fontsize": 12.0, "parameter_enable": 1,
                 "saved_attribute_attributes": valueof("Restart", "Restart", 2, {
                     "parameter_enum": ["off", "on"], "parameter_mmax": 1})})
    label(P, "on the next bar", [466, 130, 82, 14], size=10.0)
    seqs.append((rst, 1120, "rstseq"))

    # buttons -> counter -> "<name> n" (gen~ sees a new number each press)
    for (bid, x, name) in seqs:
        rt = P.obj("route bang 1", x, 700, 1, 3)
        P.connect(bid, 0, rt, 0)
        cnt = P.obj("counter 0 1 1000000", x, 730, 3, 4, ["int", "", "", "int"])
        P.connect(rt, 0, cnt, 0)
        P.connect(rt, 1, cnt, 0)
        pre = P.obj("prepend " + name, x, 760)
        P.connect(cnt, 0, pre, 0)
        P.connect(pre, 0, gen, 0)

    # on load: every control sends its value again (and sets ms/beat visibility)
    for c in [buf, loop, smode, sdiv, sms, sdir, fade, endt]:
        P.connect(tb, 0, c, 0)

    longs_all = [b["box"]["saved_attribute_attributes"]["valueof"]["parameter_longname"]
                 for b in P.boxes if "saved_attribute_attributes" in b["box"]]
    assert len(set(longs_all)) == len(longs_all), "duplicate parameter names"

    return patcher_dict(P.boxes, P.lines, [60.0, 80.0, 1300.0, 820.0],
                        extra={"devicewidth": 552.0,
                               "dependency_cache": [{"name": "loopshifter_display.js", "bootpath": ".",
                                                     "patcherrelativepath": ".", "type": "TEXT", "implicit": 1}],
                               "project": {
                                   "version": 1, "creationdate": 3814000000, "modificationdate": 3814000000,
                                   "viewrect": [0.0, 0.0, 300.0, 500.0], "autoorganize": 1, "hideprojectwindow": 1,
                                   "showdependencies": 1, "autolocalize": 0,
                                   "contents": {"patchers": {},
                                                "code": {"loopshifter_display.js": {"kind": "javascript", "local": 1}}},
                                   "layout": {}, "searchpath": {}, "detailsvisible": 0,
                                   "amxdtype": 1633771873,          # 'aaaa': an audio effect
                                   "readonly": 0, "devpathtype": 0, "devpath": ".", "sortmode": 0,
                                   "viewmode": 0, "includepackages": 0},
                               "latency": 0, "is_mpe": 0, "minimum_live_version": "",
                               "minimum_max_version": "", "platform_compatibility": 0, "autosave": 0})


def amxd_bytes(patcher):
    body = json.dumps({"patcher": patcher}, indent=1, ensure_ascii=False).encode("utf-8") + b"\n\x00"
    out = b"ampf" + struct.pack("<I", 4) + b"aaaa"   # aaaa = audio effect
    out += b"meta" + struct.pack("<I", 4) + b"\x00\x00\x00\x00"
    out += b"ptch" + struct.pack("<I", len(body)) + body
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    patcher = build()
    with open(os.path.join(OUT, "Loopshifter.amxd"), "wb") as f:
        f.write(amxd_bytes(patcher))
    with open(os.path.join(OUT, "Loopshifter.maxpat"), "w") as f:
        json.dump({"patcher": patcher}, f, indent=1, ensure_ascii=False)
    with open(os.path.join(OUT, "loopshifter_display.js"), "w") as f:
        f.write(open(os.path.join(HERE, "loopshifter_display.js")).read())
    print("built m4l/dist/Loopshifter.amxd")


if __name__ == "__main__":
    main()
