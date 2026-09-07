/* ══ 介面語言（English / 繁體中文）══════════════════════════════
   做法：程式碼裡的字串一律維持中文（那也是這個專案的文件），
   畫完之後再掃一次 DOM 把文字換掉。這樣有幾個好處：

   1. 呼叫端一行都不用改，1600 多處字串不會變成 T('some.key')。
   2. 查不到的字自動留中文，永遠不會出現空白或 key。
   3. 只動 DOM，不動資料 —— 檔名、字幕內容、專案名都不會被翻到。

   兩層比對：
     第一層 整個文字節點完全吻合（面板、按鈕、選單、說明幾乎都是這種）
     第二層 沒吻合就用「長的優先」把片語換掉，
            拿來處理 `已匯入 ${n} 句字幕` 這種夾了變數的訊息。
            「」" " 裡面的東西（多半是使用者的檔名）不碰。

   使用者自己的文字（片段名稱、時間軸上的字幕）掛 data-nt，整段跳過。 */

let LANG = 'en';
try { const s = localStorage.getItem('nv.lang'); if (s === 'zh' || s === 'en') LANG = s; } catch (e) {}

const _TRMAP = new Map();     // 正規化後的中文 → 英文
const _TRRAW = new Map();     // 原樣中文 → 英文（第二層用）
let   _TRRE  = null;          // 第二層的比對式（長的排前面）

const _HAN = /[㐀-鿿豈-﫿\uD840-\uD87F]/;
const _norm = s => s.replace(/\s+/g, ' ').trim();

(function buildDict(){
  const rows = (typeof I18N_EN === 'string' ? I18N_EN : '').split('\n');
  const keys = [];
  for (const row of rows){
    if (!row) continue;
    const i = row.indexOf('\t');
    if (i < 0) continue;
    const zh = row.slice(0, i), en = row.slice(i + 1);
    if (!zh) continue;
    _TRMAP.set(_norm(zh), en);
    _TRRAW.set(zh, en);
    keys.push(zh);
  }
  keys.sort((a, b) => b.length - a.length);       // 長的先比，短的才不會先咬掉
  if (keys.length){
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    _TRRE = new RegExp(keys.map(esc).join('|'), 'g');
  }
})();

/** 一段文字 → 英文。查不到就原樣回去。 */
function L(s){
  if (LANG !== 'en' || !s) return s;
  const hit = _TRMAP.get(_norm(s));
  if (hit !== undefined) return _keepPad(s, hit);
  if (!_HAN.test(s) || !_TRRE) return s;
  return _frag(s);
}

/** 原字串前後的空白留著，換掉的只有中間那塊 */
function _keepPad(s, out){
  const a = s.match(/^\s*/)[0], b = s.match(/\s*$/)[0];
  return (a && !/^\s/.test(out) ? a : '') + out + (b && !/\s$/.test(out) ? b : '');
}

/** 第二層：片語替換。「」『』“” 裡面是使用者的東西（多半是檔名），不碰；
    引號本身留在可翻譯的那一段，「」載入失敗：」這種以引號開頭的片語才比對得到。 */
const _QUOTED = /((?<=「)[^」]*(?=」)|(?<=『)[^』]*(?=』)|(?<=“)[^”]*(?=”))/;
function _frag(s){
  const parts = s.split(_QUOTED);
  for (let i = 0; i < parts.length; i += 2)
    parts[i] = parts[i].replace(_TRRE, m => _TRRAW.get(m));
  // 中文本來就沒有詞間空白，換成英文之後常常會多出一格
  return parts.join('').replace(/ {2,}/g, ' ');
}

/* ── DOM 掃描 ────────────────────────────────────────────────
   每個節點記著 { src 原文, out 我們寫出去的字 }。
   下次再掃時如果現在的字就是 out，代表沒人動過，用 src 重翻；
   不一樣就表示程式自己改過（例如時間碼），把新的當成新原文。
   —— 少了這一段，每秒重寫的時間碼會被舊字蓋回去。 */
const _oT = new WeakMap();    // 文字節點
const _oA = new WeakMap();    // 元素的 title / placeholder / aria-label
const _ATTRS = ['title', 'placeholder', 'aria-label'];
const _SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CANVAS: 1, NOSCRIPT: 1 };

function _skip(el){
  for (let n = el; n && n !== document.documentElement; n = n.parentElement)
    if (n.nodeType === 1 && n.hasAttribute('data-nt')) return true;
  return false;
}

function _doText(n){
  const rec = _oT.get(n);
  let src = n.nodeValue;
  if (rec && rec.out === src) src = rec.src;
  else if (!rec && !_HAN.test(src)) return;          // 沒中文又沒翻過，跳過
  const out = LANG === 'en' ? L(src) : src;
  if (out !== n.nodeValue) n.nodeValue = out;
  _oT.set(n, { src, out });
}

function _doAttrs(el){
  let rec = _oA.get(el);
  for (const a of _ATTRS){
    if (!el.hasAttribute(a)) continue;
    const cur = el.getAttribute(a);
    const r = rec && rec[a];
    let src = cur;
    if (r && r.out === cur) src = r.src;
    else if (!r && !_HAN.test(cur)) continue;
    const out = LANG === 'en' ? L(src) : src;
    if (out !== cur) el.setAttribute(a, out);
    if (!rec){ rec = {}; _oA.set(el, rec); }
    rec[a] = { src, out };
  }
}

function i18nSweep(root){
  if (!root) return;
  if (root.nodeType === 3){ if (!_skip(root.parentElement)) _doText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  if (root.nodeType === 1 && (_SKIP[root.tagName] || _skip(root))) return;
  if (root.nodeType === 1) _doAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(n){
      if (n.nodeType === 1)
        return (_SKIP[n.tagName] || n.hasAttribute('data-nt'))
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let n;
  while ((n = w.nextNode())) n.nodeType === 1 ? _doAttrs(n) : _doText(n);
}

/* 任何新畫出來的東西都掃一次。只掃「這次多出來的」，所以很便宜。 */
let _mo = null;
function i18nWatch(){
  if (_mo || typeof MutationObserver === 'undefined') return;
  _mo = new MutationObserver(recs => {
    for (const r of recs){
      if (r.type === 'characterData') { if (!_skip(r.target.parentElement)) _doText(r.target); }
      else if (r.type === 'attributes'){ if (!_skip(r.target)) _doAttrs(r.target); }
      else for (const n of r.addedNodes) i18nSweep(n);
    }
    _mo.takeRecords();          // 丟掉剛剛自己改出來的那些，免得無限繞
  });
  _mo.observe(document.body, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: _ATTRS
  });
}

function _setTitle(){
  const v = (typeof VER === 'string' && VER) ? ' ' + VER : '';
  document.title = LANG === 'en'
    ? `NiVedit${v} — Web Video Editor`
    : `NiVedit${v} — 網頁版影音編輯器`;
}

function setLang(l){
  if (l !== 'en' && l !== 'zh') return;
  LANG = l;
  try { localStorage.setItem('nv.lang', l); } catch (e) {}
  document.documentElement.lang = l === 'en' ? 'en' : 'zh-Hant-TW';
  _setTitle();
  const b = document.getElementById('langBtn');
  if (b) b.textContent = l === 'en' ? 'EN' : '繁中';
  if (typeof updateThemeButton === 'function') updateThemeButton();
  i18nSweep(document.body);
  try { if (typeof render === 'function') render(); } catch (e) {}
}

function i18nInit(){
  const b = document.getElementById('langBtn');
  if (b){
    b.textContent = LANG === 'en' ? 'EN' : '繁中';
    b.onclick = () => setLang(LANG === 'en' ? 'zh' : 'en');
  }
  document.documentElement.lang = LANG === 'en' ? 'en' : 'zh-Hant-TW';
  _setTitle();
  i18nSweep(document.body);
  i18nWatch();
}
