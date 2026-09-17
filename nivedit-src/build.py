#!/usr/bin/env python3
"""離線建置單檔 HTML：python build.py [輸出路徑]。需要 Python 3。"""
from pathlib import Path
import runpy
import sys
import shutil
ROOT = Path(__file__).resolve().parent
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT.parent / 'NiVedit.html'
runpy.run_path(str(ROOT / 'mkdict.py'), run_name='__main__')
def read(path):
    return (ROOT / path).read_text(encoding='utf-8')
# 先讀齊來源，再寫暫存檔並替換，避免失敗留下半份 HTML。
parts = [read('src/00_head.html'), read('src/10_body.html')]
for name in ['mp4-muxer.js', 'webm-muxer.js', 'mp4box.js']:
    parts.extend(['<script>\n', read('vendor/' + name), '\n</script>\n'])
for name in ['06_dict.js', '05_i18n.js', '07_theme.js', '20_core.js',
             '25_gif.js', '26_effect_catalog.js', '27_effect_library.js', '30_render.js', '40_ui.js', '45_decode.js', '47_project.js',
             '48_s2t.js', '49_asr.js', '50_export.js']:
    parts.extend(['<script>\n', read('src/' + name), '\n</script>\n'])
parts.append('</body></html>\n')
assets = ROOT / 'effect-assets'
if not assets.is_dir():
    raise SystemExit('Missing effect-assets: restore the complete source archive.')
OUT.parent.mkdir(parents=True, exist_ok=True)
shutil.copytree(assets, OUT.parent / 'animation-effects', dirs_exist_ok=True)

tmp = OUT.with_suffix(OUT.suffix + '.tmp')
tmp.write_bytes(''.join(parts).encode('utf-8'))
tmp.replace(OUT)
print('built:', OUT, OUT.stat().st_size, 'bytes')
