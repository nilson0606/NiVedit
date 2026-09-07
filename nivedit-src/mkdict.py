#!/usr/bin/env python3
# dict_en.tsv -> src/06_dict.js（把對照表包成一個 JS 字串）
import os
d = os.path.dirname(os.path.abspath(__file__))
tsv = open(os.path.join(d, 'src', 'dict_en.tsv'), encoding='utf-8').read()
rows = [r for r in tsv.split('\n') if '\t' in r]
body = '\n'.join(rows)
esc = body.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
out = ('/* 介面英文對照表 —— 由 src/dict_en.tsv 產生，不要直接改這個檔 */\n'
       'const I18N_EN = `' + esc + '`;\n')
open(os.path.join(d, 'src', '06_dict.js'), 'w', encoding='utf-8').write(out)
print('dict entries:', len(rows))
