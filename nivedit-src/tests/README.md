# NiVedit 回歸測試

測試以 Playwright 開啟單檔 HTML，使用本機 HTTP 或 file://。
十六支計數式測試共 638 項（含終點對位 90 項、motion 67 項、字幕 56 項、圖層 51 項、旋轉／儲存 53 項、雙軌 45 項）；另有 GIF 斷言式專項，以及兩支 i18n 診斷腳本。

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
sed -i "s/v10\.7/v10.8/g" tests/*.cjs   # 改版號時（把舊版號換成新的）
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
