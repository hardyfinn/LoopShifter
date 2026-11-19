#!/usr/bin/env python3
"""Turns README.md into Loopshifter-Guide.pdf (needs: pip install markdown, and playwright).
    python3 m4l/tools/make_guide.py out.pdf"""
import base64, os, subprocess, sys, markdown
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
md = open(os.path.join(ROOT, "README.md")).read()
img = base64.b64encode(open(os.path.join(ROOT, "m4l", "device-preview.png"), "rb").read()).decode()
md = md.replace("(m4l/device-preview.png)", "(data:image/png;base64,%s)" % img)
body = markdown.markdown(md, extensions=["tables", "fenced_code"])
html = """<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Helvetica,Arial,sans-serif;font-size:11.5pt;line-height:1.45;color:#222;margin:0}
h1{color:#c07810;font-size:24pt;margin:0 0 8pt} h2{color:#c07810;font-size:15pt;margin:18pt 0 6pt;border-bottom:1px solid #eee}
img{width:100%%;border-radius:4px} em{color:#777;font-size:10pt}
pre{background:#f4f1ea;padding:8pt 10pt;font-size:13pt;letter-spacing:1px;border-radius:4px}
code{font-family:Menlo,monospace;font-size:10pt;background:#f4f1ea;padding:0 2px}
table{border-collapse:collapse;width:100%%;font-size:10.5pt} td,th{border:1px solid #ddd;padding:4pt 6pt;vertical-align:top;text-align:left}
th{background:#f7f2e8} td:first-child{white-space:nowrap}
</style></head><body>%s</body></html>""" % body
tmp = os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])), "_guide.html")
open(tmp, "w").write(html)
js = """const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto('file://'+process.argv[1]);await p.pdf({path:process.argv[2],format:'A4',margin:{top:'16mm',bottom:'16mm',left:'16mm',right:'16mm'}});await b.close()})()"""
subprocess.check_call(["node", "-e", js, tmp, os.path.abspath(sys.argv[1])])
os.remove(tmp)
