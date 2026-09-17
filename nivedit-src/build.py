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
             '24_compat.js', '25_gif.js', '26_effect_catalog.js', '27_effect_library.js', '28_music_catalog.js', '29_music_library.js', '30_render.js', '40_ui.js', '45_decode.js', '46_example_catalog.js', '46_example.js', '47_project.js',
             '48_s2t.js', '49_asr.js', '50_export.js']:
    parts.extend(['<script>\n', read('src/' + name), '\n</script>\n'])
parts.append('</body></html>\n')
OUT.parent.mkdir(parents=True, exist_ok=True)
for source_name, output_name in [('effect-assets', 'animation-effects'),
                                 ('music-assets', 'background-music'),
                                 ('example-assets', 'example-project'), ('compat-assets', 'video-compat')]:
    assets = ROOT / source_name
    if not assets.is_dir():
        raise SystemExit('Missing ' + source_name + ': restore the complete source archive.')
    shutil.copytree(assets, OUT.parent / output_name, dirs_exist_ok=True)

shutil.copyfile(ROOT / 'manual.html', OUT.parent / 'manual.html')

tmp = OUT.with_suffix(OUT.suffix + '.tmp')
tmp.write_bytes(''.join(parts).encode('utf-8'))
tmp.replace(OUT)
print('built:', OUT, OUT.stat().st_size, 'bytes')
