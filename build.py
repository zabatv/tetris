#!/usr/bin/env python3
old_css = open('/tmp/tetris/old_css.txt').read()
css_add = open('/tmp/tetris/css_add.txt').read()
engine = open('/tmp/tetris/engine_r.js').read()
app = open('/tmp/tetris/app.js').read()

html = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ТЕТРИС · React Bits</title>
<style>
""" + old_css + "\n" + css_add + "</style>\n</head>\n<body>\n"

html += """<div id="root"></div>
<script>window.addEventListener('error', function (e) {
  var el = document.getElementById('js-error');
  if (!el) { el = document.createElement('div'); el.id = 'js-error';
    el.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;z-index:9999;background:#2a0000;color:#fca;border:1px solid #f44;padding:8px 12px;font:12px/1.4 monospace;white-space:pre-wrap;border-radius:8px;';
    document.body.appendChild(el); }
  el.textContent = 'JS: ' + (e.message || e.type) + ' @ ' + (e.filename || '') + ':' + (e.lineno || '');
});</script>
<script src="/react.production.min.js"></script>
<script src="/react-dom.production.min.js"></script>
<script>
""" + engine + "\n</script>\n<script>\n" + app + "\n</script>\n</body>\n</html>\n"

open('/tmp/tetris/react.html', 'w').write(html)
print("react.html written:", len(html), "bytes")

# balance check on inline scripts
for name, s in [('engine', engine), ('app', app)]:
    for a, b in [('{', '}'), ('(', ')'), ('[', ']')]:
        assert s.count(a) == s.count(b), f"{name} bracket {a}{b} mismatch"
print("inline script brackets OK")