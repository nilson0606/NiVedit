#!/usr/bin/env python3
"""把原始碼裡「會出現在畫面上」的中文抓出來，跟 src/dict_en.tsv 比對，
   列出還沒翻譯的字串。改完 UI 之後跑這個，就知道漏了哪些。

   用法：python3 tools/extract_zh.py
   輸出：系統暫存目錄/nivedit-phrases.json（全部）、螢幕上印出「字典裡沒有的」

   原理：先把 // 與 /* */ 註解拿掉（註解一律保持中文，不翻），
   再用 ` ' " < > $ { } 換行 當邊界切出片語 —— 切出來的形狀
   剛好就是這段文字在 DOM 裡的文字節點長相。
"""
import re, os, json, sys, tempfile
SRC=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'src')
FILES=['00_head.html','10_body.html','20_core.js','27_effect_library.js','29_music_library.js','46_example.js','30_render.js','40_ui.js','45_decode.js','47_project.js','49_asr.js','50_export.js']
CJK=re.compile(r'[㐀-鿿豈-﫿\uD840-\uD87F　-〿＀-￯]')
HAN=re.compile(r'[㐀-鿿豈-﫿]')

def strip_comments(s, isjs):
    if not isjs:
        return re.sub(r'<!--.*?-->', '', s, flags=re.S)
    out=[];i=0;n=len(s)
    mode=None  # None, 'line','block','sq','dq','tpl','re'
    while i<n:
        c=s[i]; nx=s[i+1] if i+1<n else ''
        if mode is None:
            if c=='/' and nx=='/': mode='line'; i+=2; continue
            if c=='/' and nx=='*': mode='block'; i+=2; continue
            if c=="'": mode='sq'
            elif c=='"': mode='dq'
            elif c=='`': mode='tpl'
            out.append(c); i+=1; continue
        if mode=='line':
            if c=='\n': mode=None; out.append(c)
            i+=1; continue
        if mode=='block':
            if c=='*' and nx=='/': mode=None; i+=2; continue
            if c=='\n': out.append(c)
            i+=1; continue
        # inside string
        if mode in ('sq','dq') and c=='\n': mode=None; out.append(c); i+=1; continue
        if c=='\\': out.append(c); out.append(nx); i+=2; continue
        if (mode=='sq' and c=="'") or (mode=='dq' and c=='"') or (mode=='tpl' and c=='`'): mode=None
        out.append(c); i+=1; continue
    return ''.join(out)

BOUND=set("`'\"<>${}\n\r\\")
res={}
order=[]
for f in FILES:
    p=os.path.join(SRC,f)
    s=open(p,encoding='utf-8').read()
    s=strip_comments(s, f.endswith('.js'))
    i=0;n=len(s);cur=''
    def flush(cur,f):
        t=cur.strip()
        if t and HAN.search(t):
            if t not in res:
                res[t]=f; order.append(t)
    while i<n:
        c=s[i]
        if c in BOUND:
            flush(cur,f); cur=''
        else:
            cur+=c
        i+=1
    flush(cur,f)
json.dump({'order':order,'src':res}, open(os.path.join(tempfile.gettempdir(), 'nivedit-phrases.json'),'w',encoding='utf-8'), ensure_ascii=False, indent=0)

# 跟字典比對
BAD = re.compile(r'^\s*(/\*|//|\*)|\*/|^const |^let |^w\.|^x\.|^S\.|^\);|^;|^:|^/\[|^/字幕|^/明|^/\[点')
dic = os.path.join(SRC, 'dict_en.tsv')
have = set()
if os.path.exists(dic):
    for line in open(dic, encoding='utf-8'):
        if '\t' in line: have.add(line.split('\t')[0])
miss = [t for t in order if t not in have and not BAD.search(t) and t != 'mmmwwwii國字測試']
print('抓到片語 %d 條，字典 %d 條，沒翻到 %d 條' % (len(order), len(have), len(miss)))
for t in miss: print('  ' + t)
