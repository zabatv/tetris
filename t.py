#!/usr/bin/env python3
import re, sys

src = open('/tmp/tetris/engine.js').read()

def rep(old, new, count=1):
    global src
    assert src.count(old) == count, "PATTERN FAIL (%d): %s" % (src.count(old), old[:90])
    src = src.replace(old, new)

# 1) DOM consts -> setupDom()
rep("""const canvas = document.getElementById('board-canvas');
const ctx = canvas.getContext('2d');
const ctx2 = document.createElement('canvas').getContext('2d');
ctx2.canvas.width = canvas.width;
ctx2.canvas.height = canvas.height;
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const stage = document.getElementById('stage');
const wrapper = document.getElementById('game-wrapper');
const flashEl = document.getElementById('flash');
const textEl = document.getElementById('textfx');""",
"""let canvas, ctx, ctx2, nextCanvas, nextCtx, stage, wrapper, flashEl, textEl, floatsEl, bgCanvas, bgCtx;
let __hud = null;
const hudc = {
  score: v => { if (__hud && __hud.score) __hud.score(v); },
  level: v => { if (__hud && __hud.level) __hud.level(v); },
  lines: v => { if (__hud && __hud.lines) __hud.lines(v); },
  combo: v => { if (__hud && __hud.combo) __hud.combo(v); },
  comboGold: b => { if (__hud && __hud.comboGold) __hud.comboGold(b); },
  levelPulse: () => { if (__hud && __hud.levelPulse) __hud.levelPulse(); },
  menu: b => { if (__hud && __hud.menu) __hud.menu(b); },
  gameOver: (s, m) => { if (__hud && __hud.gameOver) __hud.gameOver(s, m); }
};
function setupDom(refs) {
  canvas = refs.board;
  ctx = canvas.getContext('2d');
  ctx2 = document.createElement('canvas').getContext('2d');
  ctx2.canvas.width = canvas.width;
  ctx2.canvas.height = canvas.height;
  nextCanvas = refs.nextCanvas;
  nextCtx = nextCanvas.getContext('2d');
  stage = refs.stage;
  wrapper = refs.wrapper;
  flashEl = document.getElementById('flash');
  textEl = document.getElementById('textfx');
  floatsEl = document.getElementById('floats');
  bgCanvas = refs.bg;
  bgCtx = bgCanvas.getContext('2d');
}
function setupHud(h) { __hud = h; }""")

# 2) floatsEl const
rep("const floatsEl = document.getElementById('floats');\n", "")

# 3) startGame overlay/visible
rep("""  document.getElementById('overlay').classList.add('hidden');
  const go = document.getElementById('go-overlay');
  go.classList.add('hidden');
  go.style.display = 'none';""",
"""  __goShown = false;
  hudc.menu(false);""")
rep("let __goShown = false;\n", "let __goShown = false;\n", count=0)  # ensure var declared later

# 4) gameOver block in update
rep("""    document.getElementById('final-score').textContent = 'Очки: ' + score;
    document.getElementById('max-combo').textContent = 'Макс. комбо: x' + maxCombo;
    const go = document.getElementById('go-overlay');
    go.classList.remove('hidden');
    go.style.display = 'flex';""",
"""    if (!__goShown) { __goShown = true; hudc.gameOver(score, maxCombo); }""")

# 5) HUD writes in draw()
rep("""  document.getElementById('score').textContent = score;
  document.getElementById('level').textContent = level;
  document.getElementById('lines').textContent = lines;
  if (!document.getElementById('score').classList.contains('pulse-ref')) {
    document.getElementById('score').classList.add('pulse-ref');
  }
}""",
"""  hudc.score(score);
  hudc.level(level);
  hudc.lines(lines);
}""")

# 6) remove per-frame score pulse toggle
rep("    document.getElementById('score').classList.toggle('pulse', false);\n", "")

# 7) combo hud
rep("  document.getElementById('combo').textContent = combo;", "  hudc.combo(combo);")
rep("""    document.getElementById('combo').classList.add('gold');
    textFx('КОМБО x' + combo);""",
"""    hudc.comboGold(true);
    textFx('КОМБО x' + combo);""")
rep("""    document.getElementById('combo').classList.remove('gold');""",
"""    hudc.comboGold(false);""")
rep("document.getElementById('level').style.animation = 'pulse 0.6s';", "hudc.levelPulse();")

# 8) add ng_goShown declaration before startGame
rep("function startGame() {", "let __goShown = false;\n\nfunction startGame() {")

# 9) remove button listeners
rep("""document.getElementById('start-btn').addEventListener('click', () => {
  initAudio();
  startMusic();
  startGame();
});
document.getElementById('restart-btn').addEventListener('click', () => {
  initAudio();
  startMusic();
  startGame();
});

""", "function startNewGame() { initAudio(); startMusic(); startGame(); }\n\n")

# 10) replace whole Net block (marker start .. marker end)
start_marker = "// ===== МУЛЬТИПЛЕЕР: WebSocket, комнаты, ники, чат, соперники ====="
end_marker = "// ===== ФОН: звезды, небо, радуга ====="
i0 = src.index(start_marker)
i1 = src.index(end_marker)
new_net = open('/tmp/tetris/net_r.js').read() + "\n\n"
src = src[:i0] + new_net + src[i1:]

# 11) remove drawOpps call from update (net_r provides drawOpp only)
rep("  drawOpps();\n", "")

# 12) bg canvas setup consts
rep("""const bg = document.getElementById('bg');
const bgCtx = bg.getContext('2d');
""", "")

# 13) bg.width/bg.height -> bgCanvas.* (all occurrences)
src = src.replace('bg.width', 'bgCanvas.width')
src = src.replace('bg.height', 'bgCanvas.height')

# 14) keyboard guard before game start
rep("""  if (gameOver) return;
  initAudio();
""", """  if (gameOver) return;
  if (!piece) return;
  initAudio();
""")

# 15) remove auto bgLoop start + auto draw at load
rep("""  requestAnimationFrame(bgLoop);
}
requestAnimationFrame(bgLoop);

draw();

""", """  requestAnimationFrame(bgLoop);
}

""")

# 15b) remove module-level resize() auto-call (bgCanvas only set in setupDom) + explicit window.
rep("""addEventListener('resize', resize);
resize();
""", """window.addEventListener('resize', resize);
""")

# 16) expose hooks + wrap module
src = "(function () {\n" + src
src = src + "\nfunction __mountBg() { if (bgCtx) resize(); }\n" \
    "window.TetrisEngine = {\n" \
    "  setup: function (refs, hud) { setupDom(refs); setupHud(hud); resize(); requestAnimationFrame(bgLoop); },\n" \
    "  start: function () { startNewGame(); },\n" \
    "  drawOpp: drawOpp\n" \
    "};\n" \
    "})();\n"

open('/tmp/tetris/engine_r.js', 'w').write(src)
print("engine_r.js written:", len(src), "bytes")