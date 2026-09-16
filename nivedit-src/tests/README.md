# NiVedit 回歸測試

測試以 Playwright 開啟單檔 HTML，使用本機 HTTP 或 file://。
十六支計數式測試共 669 項（含終點對位 90 項、motion 67 項、字幕 56 項、圖層 51 項、旋轉／儲存 68 項、雙軌 45 項）；另有 GIF 斷言式專項，以及兩支 i18n 診斷腳本。

## 跑之前

```bash
npm i playwright                 # 只要函式庫，瀏覽器用系統現成的
bash tests/make-fixtures.sh      # 產生測試素材（要 ffmpeg）
```

三個環境變數可以覆寫路徑，預設值是 Anthropic 容器裡的位置：

| 變數 | 預設 | 說明 |
|------|------|------|
| `NIVEDIT_HTML` | `/home/claude/NiVedit.html` | 要測的單檔 HTML |
| `NIVEDIT_CHROME` | `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` | 瀏覽器執行檔 |
| `NIVEDIT_FIX` | `/tmp/tv` | 測試素材資料夾 |

```bash
python3 build.py /tmp/NiVedit.html
NIVEDIT_HTML=/tmp/NiVedit.html node tests/i18n.e2e.cjs
```

**版本斷言**：十六支測試都有 `$('#verTag').textContent === 'vX.Y'`，改版號時都要跟著改，
不然第一項就會紅。這是刻意的——它同時在確認「你測到的真的是剛建置出來的那份」。

斷言的**標籤**固定是「版本」／「version」，不要把版號寫進標籤
（v9.8 以前有的標籤還停在「版本 v9.1」，跟實際斷言值早就不一致）。
版號只出現在比較值那一邊，一次 sed 就能改完：

```bash
sed -i "s/v11\.6/v11.7/g" tests/*.cjs   # 改版號時（把舊版號換成新的）
```

日期顯示在 `#verDate`，是另一個元素，不影響這些斷言 —— 但**改版號時記得一起更新
`20_core.js` 的 `VER_DATE`**。v9.9 就漏過一次，發布當天日期還停在前一天。

## 有哪些

| 檔案 | 測什麼 | 項數 |
|------|--------|------|
| `layers.e2e.cjs` | 圖層 L 編號與堆疊：標籤位置、字幕與影片軌連動（雙軌像素）、疊圖／標題跨類型調整、邊界提示、復原重做、新項目落在最上層、舊專案遷移逐像素比對、存讀、分割、匯出與預覽一致 | 39 |
| `subtitle-scope.e2e.cjs` | 空白上軌新增、上下軌列表及批次隔離、原生／備援 SRT、清空與復原、移軌、時間軸選取跟隨、存讀與翻譯 | 26 |
| `subtitle-edit.e2e.cjs` | 新增聚焦與選取、關閉同步、點選不誤拖、重開定位、時間／換軌重疊提示、存讀、排序不改原資料、合併、空白建立與翻譯 | 20 |
| `rotation-save.e2e.cjs` | 五類素材 ±360°、動畫像素、專案重開、原生 picker adapter／真實 OPFS 寫入、失敗復原、改名、儲存 MP4 解碼、下載備援 | 46 |
| `end-align.e2e.cjs` | 五類素材終點九宮格、起點及動畫資料保持、復原重做、鍵盤、日夜／翻譯、實際像素與暫停重繪、存讀；需從工作目錄執行，使用 assets/boy_smile_sway.gif | 90 |
| `i18n.e2e.cjs` | 預設英文、EN／繁中切換、日夜模式四種組合、tooltip、夾變數的訊息、檔名不被翻、影片構圖介面、重新整理記憶 | 41 |
| `i18n-scan.cjs` | 掃所有面板與對話框有沒有殘留中文（**不是斷言式**，會把找到的印出來） | — |
| `i18n-roundtrip.cjs` | 語言切 10 次來回文字要一致 + 整頁掃描效能 | — |
| `tracks.e2e.cjs` | 軌道拖曳換順序、即時讓位、▲▼ 仍可用、不影響片段選取、拖放區只收影片與聲音 | 23 |
| `volume-curve.e2e.cjs` | 配樂音量曲線：插值、**預覽與匯出一致**、分割、UI、真的匯出一次 | 20 |
| `motion.e2e.cjs` | 影片／疊圖／標題動態：插值與緩動、時間視窗、**畫面真的有動**、動畫不衝突、九宮格、分割、專案資料、匯出 | 67 |
| `crop.e2e.cjs` | 矩形／圓形、尺寸與中心、組合變形、圖片／轉場、復原／專案重開、MP4 解碼像素比對 | 36 |
| `dual-track.e2e.cjs` | 雙軌合成、透明轉場、音訊、拖曳分割、MP4 | 45 |
| `track-modes.e2e.cjs` | 四種內扣／外加組合、首尾定格、原片動態、留白、MP4 及聲音時間 | 29 |
| `subtitles.e2e.cjs` | 交錯四列、雙字幕獨立樣式、自由 X／Y、拖曳、同軌合併、跟著影片換軌、時間軸高度自動貼合、存讀、MP4 | 56 |
| `clip-options.e2e.cjs` | 每段內扣／外加、獨立淡化、即時更新、換軌／復原／分割、遷移／存讀、MP4 及原聲／配樂頻率分量、雙軌字幕連動亮度 | 37 |
| `title-rotation.e2e.cjs` | 標題大小同組、五項底色、旋轉像素及動畫合成、MP4 角度、存讀分割與復原、**字體清單 30 種／未安裝標記／群組翻譯** | 20 |
| `gif.e2e.cjs` | 現行版 GIF 動畫疊圖；NIVEDIT_HTML 指定成品，輸出至成品旁 gif-qa | — |

`i18n-scan.cjs` 固定會印出兩條中文，**那是對的，不用修**：
標題的預設內容「在這裡輸入標題」（那是資料不是介面，在 textarea 裡），
以及 AI 字幕那句「轉成台灣正體（軟體／影片／滑鼠）」的括號舉例。

## 這些測試的寫法值得沿用

**不要只比數字，要比畫面與聲音。** 這個專案吃過太多次「數值對、實際不對」的虧
（旋轉、畫布汙染、預覽與匯出不一致），所以：

- **畫面**：`renderFrame` 出兩組（有素材／沒素材）相減，量差異區域的重心。
  這樣影片底色不會干擾，位置與大小是不是真的變了一目了然
  （見 `motion.e2e.cjs` 的疊圖與影片畫面量測）。
- **聲音**：直接跑 `buildAudio()`（匯出真正走的那條路），量輸出音訊的 RMS 包絡，
  跟公式對照（見 `volume-curve.e2e.cjs`，容差 0.06）。
- **UI**：用 `p.mouse` 真的按下去拖，不要只呼叫函式——這個專案有好幾個 bug
  是「函式對、事件到不了」（元素被重畫換掉、被別的元素蓋住）。
- **真實拖曳要等它落地，斷言不要在 `find(...)` 的結果上直接取值。**
  整套連續跑時機器較忙，`mouse.down()` 之後馬上高速移動偶爾會漏事件，
  拖曳沒生效；下一行 `A.subs.find(...).track` 就是 undefined，
  TypeError 會**中斷整支**——一條紅變成整支沒數字，看起來像功能全壞。
  正確寫法：`mouse.down()` 後短暫等待、步數給多一點、用 `waitForFunction`
  等狀態到位，再把 `find()` 的結果接成 null 才判斷
  （見 `subtitles.e2e.cjs` 的頂層拖到底層）。

## 容器裡的坑

### 專利編碼：H.264 可以補，AAC 補不了

Playwright 附的是**開源 Chromium**，沒付 MPEG-LA 授權，所以 H.264 與 AAC 都沒有。
官方 Chrome／Edge 有。這會影響匯出的容器格式，但**不該影響測試結果**——
下一節說明為什麼，以及斷言要怎麼寫才能兩種環境都全綠。

`50_export.js` 的 `probe()` 要 **H.264 「而且」AAC** 才會輸出 MP4，否則退 VP9＋Opus／WebM：

```js
if (out.video && aacOk){ out.container = 'mp4'; }   // 兩個都要
```

所以只補 H.264 沒有用，容器仍然匯出 WebM。（2026-09-12 實測過，補完 H.264 那三條照樣紅。）

**H.264 可以補**（Cisco OpenH264 免權利金），從 npm 拿一份夾帶 binary 的 Chromium：

```bash
mkdir -p /tmp/spc && cd /tmp/spc
curl -sS -o c.tgz https://registry.npmjs.org/@sparticuz/chromium/-/chromium-153.0.0.tgz
tar xzf c.tgz
pip install brotli --break-system-packages -q
python3 - <<'PY'
import brotli, io, tarfile
open('/tmp/spc/chromium','wb').write(brotli.decompress(open('/tmp/spc/package/bin/chromium.br','rb').read()))
for f in ('al2023','swiftshader','fonts'):
    d = brotli.decompress(open(f'/tmp/spc/package/bin/{f}.tar.br','rb').read())
    tarfile.open(fileobj=io.BytesIO(d)).extractall(f'/tmp/spc/{f}')
PY
chmod +x /tmp/spc/chromium

export LD_LIBRARY_PATH=/tmp/spc/al2023/lib:/tmp/spc/swiftshader
export NIVEDIT_CHROME=/tmp/spc/chromium
```

好處是**能載入真實的 H.264 `.mov`／`.mp4` 素材**（以前只能用 VP9 假素材）。
壞處是 AAC 依舊沒有——AAC 沒有 OpenH264 那種免權利金方案，任何不付授權的
Chromium 都不會有 AAC 編碼器；`dl.google.com`／`packages.microsoft.com` 又被
容器 proxy 擋住，所以在容器裡拿不到官方 Chrome／Edge。

### 匯出格式的斷言一律走 `_fmt.cjs`，不要寫死 `.mp4`

**任何環境都應該 625 / 625。** 沒有「預期會紅」這種東西 —— 那種清單是有毒的，
久了沒人分得出哪個紅是真的壞掉。

輸出容器是**瀏覽器的能力**，不是 NiVedit 的能力：NiVedit 自己沒有編碼器，
只是問瀏覽器會什麼再挑一個可用組合。所以測試要跟著環境走：

```js
const {expectedFormat} = require('./_fmt.cjs');
const FMT = await expectedFormat(p);          // 'mp4' | 'webm'
chk('export container is '+FMT, dl.suggestedFilename().endsWith('.'+FMT));
```

`expectedFormat()` 直接問 WebCodecs 有沒有 H.264＋AAC，**刻意不呼叫 App 自己的
`probe()`** —— 它是獨立的判斷來源，所以「App 把格式選錯」照樣會被抓到。

有 AAC → 斷言 MP4（含 `ftyp`）；沒有 → 斷言「正確退成 WebM」（含 EBML
`1A 45 DF A3`）。兩邊都是真斷言。

已照此改寫的三支（v9.8，2026-09-12）：

| 檔案 | 原本 | 現在 |
|------|------|------|
| `crop.e2e.cjs` | `exports MP4` 寫死 | 34/36 → **36/36** |
| `dual-track.e2e.cjs` | `MP4 exported` 寫死 | 44/45 → **45/45** |
| `rotation-save.e2e.cjs` | `accept['video/mp4'][0]` → TypeError 整支中斷 | 中斷 → **46/46** |

`FMT==='mp4'` 分支跟改寫前一字不差，所以 **Edge 上的行為與檢查強度完全沒變**。

其餘測試裡名字有「MP4」的 11 條本來就是寬容式斷言（查解碼後的像素／音量／長度），
WebM 一樣過，不需要動。

### 其他

- **Bash 工具有 2 分鐘 timeout**，用 heredoc 建大檔會被砍掉。
  建檔用 Write 工具，長時間跑的東西用 `setsid nohup … &` 再 sleep 撈結果。
- 匯出測試要 `acceptDownloads: true`，一次匯出大約 10～15 秒。
- **素材一定要先跑 `make-fixtures.sh`，而且要確認它真的重做了。**
  舊版每段都是 `[ -f xxx ] || ffmpeg …`，容器留著同名舊檔時會整支靜悄悄跳過，
  測試照跑照紅、紅得像功能退步（2026-09-12 就這樣誤判過一次）。
  現在加了 `.fixtures-version` 戳記，改 ffmpeg 參數時把 `STAMP_WANT` +1。

## Windows / Codex 本機測試

可使用 Codex 內建 Node 與 Playwright，並把 `NIVEDIT_CHROME` 指到 Edge。`i18n-roundtrip.cjs` 已使用 `NIVEDIT_HTML`，不再寫死 Claude 容器路徑。

`gif.e2e.cjs` 原本寫死 `channel:'msedge'`，沒裝 Edge 的機器第一行就爆（跟功能無關）。
現在它也吃 `NIVEDIT_CHROME`：有設就用設的，沒設才退回 msedge。
它另外需要 `NIVEDIT_WORKSPACE` 底下的 `logo/NiVedit_icon.png` 與 `assets/boy_smile_sway.gif`。

雙軌測試另用 upper-motion.webm（前紅後綠），由 make-fixtures.sh 產生，抓出只解碼下軌或停在舊幀的錯誤。留白測試將實際 MP4 交給 Edge 解碼影像與 AAC，確認中間空白及靜音保留。


v9.5：既有下載／匯出回歸腳本停用 showSaveFilePicker，測試下載備援；原生另存分支由 rotation-save 專項覆蓋。原生 OS 視窗本身不由 Playwright 操控。

## v10.6 新增的兩條（時間軸高度）

`subtitles.e2e.cjs` 多了：

- `timeline auto-fits its content (no scrolling needed)` —— `#tlinner.scrollHeight`
  不可以超過 `#tlwrap.clientHeight`，而且整塊高度不得超過手動拖曳的上限
  （`innerHeight - 260`）。這是「L1~L5 加音軌不用捲就看得完」的實測。
- `timeline can still scroll when it has to` —— `#tlwrap` 的 `overflow-y` 仍是 `auto`。
  收薄軌道不等於把捲軸拿掉；字幕分很多列時照樣要捲得到。

**改軌道高度時會連帶咬到的地方**：`dual-track.e2e.cjs` 的滑鼠座標。
v10.6 之前那支有兩處寫死的像素（`dest.y+35`、`box.y+22`），方塊一變薄就落到框外，
看起來像「拖曳功能壞了」其實是測試自己指錯位置。已經改成用 `boundingBox()` 的
`height*.5`。以後再調高度不必再改這支。

## v10.7 新增的五項（字體清單）

都在 `title-rotation.e2e.cjs`：

- `30 typefaces in two groups` —— `FONTS` 有 30 筆，下拉分成「中文字體／英文字體」兩個 optgroup。
- `missing typefaces are labelled and greyed` —— 至少有一個被標成未安裝，
  而且「有 `.miss` class」跟「名稱結尾是（未安裝）」必須完全對得起來。
  容器裡幾乎沒裝任何字，所以這條一定有東西可以驗。
- `typeface groups translated` —— 英文介面下群組名要變成 `Chinese／Latin`。
  這條在釘 `05_i18n.js` 的 `_ATTRS` 有沒有收 `label`；v10.7 以前沒收，
  所有 optgroup 的群組名在英文下都是中文。
- `missing note translated and no Chinese left in the list` —— 「（未安裝）」要翻成
  `(not installed)`，而且整個清單不准殘留中文。
- `quoted family survives the select and keeps sane size correction` ——
  字體字串本身含雙引號（`"Noto Sans TC",...`），選進去要存得住
  （沒跳脫的話 value 會變空，`ctx.font` 整行失效退回 10px，這是 v2.1 的老 bug），
  而且 `sizeCorrection()` 要落在 0.8～1.25。

**加字體時要注意的一條**：花俏字體的備援鏈**不要**接 Impact／Arial 這種「一定有」的字。
`fontAvailable()` 是「這串裡面有沒有任何一個存在」，接了就永遠回 true，未安裝標記直接失效。

## v10.8 新增的七項（存檔不再一壞就永遠壞）

都在 `rotation-save.e2e.cjs`，用 OPFS 的真實 `FileSystemFileHandle`：

- `same project saves three times in a row` —— 同一個專案連存三次都要成功。
- `every save rebinds media to the file just written` —— 每存一次，素材的 `File`
  物件都必須換成新的。這是「重接真的有發生」的證據，不是看有沒有報錯。
- `media still readable after each save` —— 每次存完素材都還讀得到。
- `save still succeeds after the project file was touched from outside` ——
  把 .nvproj 用一模一樣的內容重寫一次（只動到修改時間），存檔仍然要成功。
  v10.7 在這一步就卡死了。
- `touched project file forces a full reslice` —— 而且要整批重切，不是只重切驗不過的那幾個。
- `both stale-snapshot wordings are recognised` —— `isStaleErr()` 要同時認得
  舊版 `NotReadableError`（The requested file could not be read…）與
  新版 `InvalidStateError`（An operation that depends on state cached in an
  interface object…），而且不能把 quota 之類的其他錯誤誤判成失效。

**為什麼要測 File 物件的身分而不是「有沒有噴錯」**：這個 bug 的本質是
「rebind 靜靜失敗，之後每次存都爆」。只驗第一次存有沒有成功是抓不到的 ——
使用者的原話就是「好幾次儲存後偶爾發生，一發生就一直發生」。

## v11.0 再補四項（存檔一定要讀一個檔、寫另一個檔）

v10.8 以為病根是「上一次重接沒接乾淨」，錯了。使用者回報修完還是失敗，
而且**「太快出現」** —— 是 `createWritable()` 當下就爆，不是寫到一半。
也就是「一邊讀這個檔、一邊蓋掉它」本身就不合法，存檔前重切幾次都沒用。

再加上他後來補的線索：**「時好時壞」「多等了幾分鐘又可存」**、
專案放在同時有 Resolve 備份的資料夾裡 —— 外面有東西（Windows 索引、防毒）
在掃剛寫出去的大檔，掃的期間快照一直失效。

v11.0 兩件事一起做：

- **蓋回同一個檔時先落地到 OPFS 暫存檔**，再從那裡搬進目標檔。
  來源與目標永遠不是同一個檔。
- **失敗就重切、隔 1.5／3／4.5 秒再試**，最多四次。把使用者要等的幾分鐘變成幾秒。

新增的四項：

- `overwrite save succeeds with the scratch route`
- `scratch file is cleaned up afterwards` —— 暫存檔不能留在 OPFS 裡養肥。
- `target file is written, and only after the content left the source` ——
  包住 `createWritable` 記下呼叫順序，目標檔必須是**最後**被寫的那個。
- `save as a new file still works` —— 另存新檔不必繞暫存，不能被這個改動拖累。

**這一串的教訓**：使用者說「太快出現」「等幾分鐘就好」這種話是**時序證據**，
比任何猜測都準。v10.8 沒問清楚就改，白做一版。

## v11.1 再補六項（同資料夾改名，以及 file:// 沒有 OPFS）

v11.0 的暫存路徑**在使用者的環境從來沒被執行過** —— 他用 `file://` 開，
`navigator.storage.getDirectory()` 直接丟例外，程式把它當成「OPFS 不能用」
安靜退回舊路。**而測試在 http 下跑，OPFS 有，所以全綠。**

所以現在有一項測試專門把 OPFS 拔掉再跑一次：

- `save works without OPFS (file:// falls back to IndexedDB)`
- `IndexedDB scratch record is cleaned up`

以及走「同資料夾暫存檔＋改名」那條（把 `_dir` 指到 OPFS 根目錄，
它本身就是一個 `FileSystemDirectoryHandle`）：

- `sibling temp file plus rename is used when the folder is known`
- `no .nvtmp left behind`
- `renamed file is a real project file` —— 改名後的檔案要有 `NVPROJ1` 磁頭，
  不是半截或空的。
- `handle is re-acquired after the rename` —— 改名之後舊的 handle 指向的項目
  已經被換掉，`_fh` 必須換成新的，否則下一次存又會踩到。

**這一串留下的規矩**：測試環境與使用者環境的**能力差異本身就要有一項測試**。
只要程式碼裡出現「某個 API 不在就退回舊路」，就要有一支測試把那個 API 拔掉跑一次。

## v11.2 再補九項（使用者人工全檢抓到的）

這一批全部來自使用者拿 295 項檢查表實測前 80 項的回報，**不是我自己想到的**。
每一條都值得記下來，因為它們共同的形狀是「**程式沒壞，但行為不合理**」——
自動測試驗「函式做了該做的事」，驗不到「使用者按下去會不會嚇一跳」。

| 來源 | 現象 | 補在哪 |
|------|------|--------|
| E05 | 播放頭不在片段上時按「現在」，片段被砍到剩 0.1 秒 | `clip-options` ×3 |
| D23 | 拖縮放滑桿畫面抖動，往左拖尤其嚴重 | `tracks` ×1 |
| B05 | 「換資料夾」按了毫無反應 | `rotation-save` ×2 |
| B14 | 關分頁沒有任何「還沒存」提醒 | `rotation-save` ×2 |
| B11 | 清理素材永遠回「沒有可以清的」，看不出是不是壞了 | `rotation-save` ×1 |

幾個值得記住的成因：

- **E05**：`cInNow` 不管播放頭在哪都硬算 `inP + (playhead - start)`，
  播放頭在片段之外時算出來的值被 `trimClip` 夾到 `outP - 0.1`。
  程式「正確地」執行了一個沒有意義的指令。
- **D23**：`$('#zoom').oninput` 每次都 `followPlayhead(true)`，
  等於每個 input 事件都強制把捲軸拉到播放頭前面 35%。
  Ctrl＋滾輪那條本來就是錨點式的所以順 —— **同一個功能兩條路，只修好一條**。
- **B05**：`ensureDir(ask)` 只要現有資料夾還有權限就直接回傳它，
  於是所有「換資料夾」按鈕都是啞的。`pChangeDir` 之所以能用，
  是因為它先 `_dir = null` —— 等於有人踩過這個坑但只在一個地方繞過去。

## v11.3 再補兩項（「現在」要讓畫面留在原地）

v11.2 只擋住「播放頭不在片段上」，使用者回報**還是不對**，並附了截圖：
按下去片段左端不動、右端縮回來，**播放頭底下那一格整個換掉**。

他按「起點 → 現在」的意思是「把我正在看的這一格設成起點」。
拖左邊緣（`startClipTrim` 的 `'L'`）本來就會同步把 `c.at` 往右移，
讓剩下的內容留在原位；按鈕沒做這件事 —— **同一個功能兩條路，只有一條是對的**。

- `起點「現在」：片段左端移到播放頭`
- `起點「現在」：右端不動（播放頭那一格留在原地）`

裁尾（`cOutNow`）不必動 `at`，前面的內容本來就不會位移。

### 兩支偶發性的測試

`crop.e2e.cjs` 的 `rect export crop matches preview pixels` 與
`keyframe-ui.e2e.cjs` 的 `MP4 shrinking circle matches preview`
會偶爾各紅一次（都是實際匯出之後逐像素比對，重跑就過）。
**這不是可接受的狀態** —— 容差或取樣點需要收斂，列為待辦。
看到它們紅先重跑一次確認是不是偶發。

## v11.4 補五項（「＋ 標題」不能復原）

從使用者回報「關分頁沒有未存提醒」追下去發現的：`addTitle()` 少了 `pushUndo()`。
後果有兩層 —— **加了標題 Ctrl+Z 移不掉**（復原鈕還是灰的），
以及它不算「未存的改動」。影片、圖片、疊圖、音軌、字幕全都有，**只有標題漏掉**。

在 `title-rotation.e2e.cjs`：加一個 → 真的多一個 → 算成未存 → 復原鈕可按 →
復原移得掉 → 重做加得回來。

**這一條的意義**：使用者從 A 症狀（沒有未存提醒）回報，真正的 bug 在 B（不能復原）。
照著症狀修會修錯地方。

## v11.5：縮放卡頓，以及一支「用錯理由通過」的測試

使用者第二次回報 D23：**「問題在縮放這個拉伸 bar 自己都在跳動，用左右鍵不會」**、
後來補「左右鍵也會，只是不明顯」。

v11.2 修的是**錨點**（捲軸位置），那確實是一個問題；但他真正難受的是**卡頓**。
每一個 `input` 事件都做一整套：重畫時間軸上所有方塊、`markDirty` 逼預覽畫布重繪、
再加上高度自動貼合那段**強制同步重排兩次**（拿掉 `min-height`、讀 `scrollHeight`、放回去）。
拖曳一秒會發幾十個事件，大專案一次幾十毫秒 —— 拉桿就卡成一格一格。
方向鍵事件少，所以「不明顯」。

修法：`requestAnimationFrame` 節流（一個畫格最多重畫一次）＋拖曳期間打開 `_tlBusy`
（縮放本來就不該改高度，省掉那兩次強制重排），放開時再貼合一次。
實測 **75 個事件 → 重畫 1 次，同步耗時 0.7ms**。

### 順手抓到：加了節流之後，舊測試變成「用錯理由通過」

`tracks.e2e.cjs` 的錨點測試是同步發 `input`、**立刻**讀 `A.pps` 與 `scrollLeft`。
加了 rAF 之後值根本還沒變，於是「播放頭沒移動」自動成立 —— **測試還是綠的，
但它已經什麼都沒在驗**。

改成每改一次值就等兩個畫格再讀，並且多一條 `縮放真的有生效（pps 跟著滑桿走）`
釘住「值真的有跟上」。另外兩條驗節流本身：70 次事件只能重畫 ≤3 次、同步耗時 < 50ms。

**規矩**：把同步行為改成非同步（rAF／debounce／await）時，**一定要回頭看原本的測試**。
它們不會變紅，只會安靜地不再驗任何東西。

## v11.6：「應該只要軌道縮放」，以及一次不該發生的不信任

使用者連續三次回報縮放有問題，最後附了兩張截圖說「預覽被影響了」。
我看到兩張圖的視窗寬度不同，就用「不能直接比」把它推開了 —— **拿使用者的實證去解釋掉，
而不是去找機制**。這是這個專案明文禁止的做法（見交接說明「不要猜、要拿資料」）。

他是對的，機制是這個：

`renderTimeline()` 每次都會呼叫 `autoFitTimeline()`，而它量的是 `#tlinner.scrollHeight`。
**橫向捲軸的有無會改變這個量測值** —— 放大時內容寬過視窗、有橫捲軸；
縮到塞得下就沒有。捲軸一出現一消失，量到的高度就差一截，`#tl` 被調高調矮，
**上面的預覽區跟著被擠壓、畫布重新配置**。

**為什麼容器測不出來**：測試專案只有 55 秒，從頭到尾都不會出現橫捲軸，
量到的高度永遠一樣。這不是「使用者看錯」，是**測試環境不夠像使用者的環境**。

修法：`renderTimeline(zoomOnly)`。換倍率時不 `markDirty`（畫面內容跟 pps 無關）、
不 `applyTrackOrder`、不 `autoFitTimeline`（分列依時間算，高度本來就不會變）。

新增一條把整件事釘死：

- `縮放只動軌道：預覽與時間軸高度、播放頭都不動` ——
  量預覽的寬高與位置、`#tl` 高度、`A.playhead`，整個縮放範圍拖完必須一個都沒變。

**規矩**：使用者附了截圖說「就是這裡」，那是證據。找不到機制就是還沒找到，
不是他看錯。測不出來時要先問「我的測試資料跟他的差在哪」。

## v11.7：縮放把右側屬性欄擠窄（D23 第四次才修對）

使用者附了兩張截圖：右側「解析度 1080p（1920×1080）」在縮放後變成「1080p（1」，
整個右欄變窄。他的話是「**你右側藍會跳**」「**上左右都不要變才對，時間軸左右縮放就好**」，
以及「**Ctrl+scroll 沒問題，沒道理用拉的不行**」。

量出來（2000px 視窗、70 秒專案）：

```
pps    左欄  中欄  右欄   時間軸內容寬
  4    257  1446  298     1444
 30    257  1503  241     1980
400    257  1533  210    24430    ← 右欄被壓到下限
```

病根在 CSS 一個字：`#center{flex:1 1 auto}`。**`flex-basis:auto` 代表基準寬度＝內容寬度**，
而時間軸內容寬度是 `totalDur × pps`，pps=400 時兩萬多像素。整列 flex 一算，
中欄基準大得離譜，右欄就被壓到 `min-width:210px`。改成 `flex:1 1 0` ——
中欄只吃剩下的空間，內容多寬都與版面無關（`#tlwrap` 本來就在捲）。

**為什麼 Ctrl＋滾輪「感覺沒事」**：它一次跳 1.18 倍，使用者通常不會滾到最大倍率；
拉滑桿是連續掃過整個範圍，擠壓的過程全程可見。**同一個病根、兩條路，
其中一條剛好比較不容易踩到 —— 不代表那條是對的。**

測試把整段釘死：

- `縮放只動軌道：三欄寬度、預覽、時間軸高度、播放頭都不動` ——
  量 `#left/#center/#right` 三欄寬、預覽寬高位置、`#tl` 高、`A.playhead`，
  倍率從 400 掃到 4，八個數字必須一個都沒變。
- `縮放真的把內容撐得比視窗寬（不然上一條驗不到東西）` ——
  **沒有這一條，上一條可能因為「內容根本沒撐開」而白過**。
  這是 v11.6 那次容器測不出來的直接教訓：測試資料要撐到會出事的那個區間。
