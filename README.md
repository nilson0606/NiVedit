# NiVedit V13.2

## V13.2：WebM 音檔匯入修正（2026-09-23）

- 「＋音軌 → 匯入電腦音檔」明確接受 .webm 與既有音訊副檔名。左側選檔／拖曳會讀 WebM 的 EBML Tracks：純音訊加入音軌，含影片軌保留為影片；不以系統常誤標的 video/webm 作唯一依據。
- 只讀前 2 MiB 標頭；標頭不完整、超出範圍或無法判定時沿用既有型別及相容處理，不把不能解碼的影片猜成音訊。缺少總時長的錄音型 WebM 以實際音訊解碼取得秒數，並重用解碼結果。
- WebM 專項 24/24，含 Opus／Vorbis、四種 MIME、未知 Segment 長度、無時長、左側選檔／拖曳／音軌入口、復原重做、nvproj 重開、MP4 輸出音訊解碼。V13.1 基線重現 4 個失敗。既有雙軌 45/45、音量曲線 25/25、i18n 41/41；共 135 項相關檢查通過，未重跑完整編輯器回歸。
- 手冊同步。證據 qa-webm-audio-V13.2/；完整来源 archive/NiVedit_原始碼_V13.2.tar.gz。V13 重要還原點保持原樣。

## V13.1：YT → MP4（2026-09-23）

- 在 YT → MP3 右側新增 YT → MP4，獨立新分頁。共用本機 Windows 下載器，支援 720p／1080p／4K 上限、影片預覽、跳轉、另存及瀏覽器下載；完成後用「＋影片」匯入。
- 下載影音後轉成 H.264／AAC MP4，不放大原片畫質。下載與轉檔可取消，一次只處理一項；MP3 舊 API 與音質選項保留。
- 舊安裝需關閉工具、用新版 ZIP 的程式檔覆蓋，再啟動；保留 config、runtime、deps 和 downloads。公開 ZIP 僅 7 個工具原始檔，不含私人設定或下載媒體。
- 26 項隔離後端檢查（真實 FFmpeg、合成下載輸入）、23 項 Edge 操作、41 項既有 i18n 通過；公開 19 秒 YouTube 短片實際下載及 MP4 轉檔成功。另存以串流 adapter 及真實瀏覽器下載驗證，未自動操作 Windows 原生儲存視窗；未重跑整套剪輯測試或新電腦初始化。
- 重要還原點維持 V13。證據 qa-yt-mp4-V13.1/；來源 archive/NiVedit_原始碼_V13.1.tar.gz。部署核對紀錄保存於本機 QA 資料夾。

## V13 重要大版（2026-09-20）

圖片、動畫效果、標題可各自同軌重疊，片頭時間越晚越在前；透明處露出後方素材，跨軌仍按 L 層級。圖片可拖曳或延長至其他圖片時間，軌內分列方便操作。V13 承接已驗證的 v12.13 功能，依使用者指定升為重要大版。

驗證：同軌重疊專項 31 項通過，包含專案重開及 MP4 匯出解碼。此前 17 支既有回歸中 15 支通過；layers 標題像素容差差異及 clip-options 取幀逾時已有舊版對照，未放寬門檻。

## v12.12：保留一般辨識，短分段改為選用（2026-09-19）

- 使用者指出先前影片在平衡模型正常，不能把單一影片測出的參數當成通用最佳解。辨識預設恢復原本 30 秒／重疊 5 秒。
- AI 字幕新增「辨識方式」：一般（預設）／短分段重試。手動選擇後者才使用 20 秒／重疊 2 秒。設定保留於目前頁面，不存入專案，重新載入預設回一般；不依檔名或台詞特判。
- 保留 v12.11 的 Turbo FP16 載入、取消與錯誤处理、進度計數修正。
- Edge 實測同一影片：一般模式重現前 5 秒輸出；手動短分段可到 24.42 秒。這是補救選项而非全面提升準確度的承諾。已驗證切換回一般、頁面重載預設、日夜、英文及模型重用計數。
- 操作手冊同步說明。公開音樂仍 41 首／認可清單 43 首；私有影片、專案、SRT 和歷史還原點不修改。

## v12.11：AI 字幕修正（2026-09-19）

- Whisper 使用 20 秒、2 秒重疊分段，修正實測影片遇停頓後只輸出前 5 秒的情況。單段長度不是影片長度上限。
- large-v3-turbo 在支援 FP16 的 WebGPU 上優先載入 FP16（約 1.6GB），不再優先選需要 2.55GB 外部權重的 FP32 encoder。
- 修正取消後重試的 watchdog、重用模型的分段計數與錯誤回報。紀錄包含模型、音訊長度、載入方式及最後階段。
- 驗證：Edge 原生解碼的 24.47 秒影片，small 辨識至 24.42 秒，turbo FP16 至 24.46 秒；完整介面及取消／重試測試通過。仍需人工校對，非完整編輯器回歸測試。


## v12.10 · YouTube to MP3 companion

The header now has a **YT → MP3** link that opens an independent page, next to User manual. Download the Windows tool, run setup.cmd once (Python 3.10+, Windows x64), then launch the VBS file. The local companion downloads and converts audio, offers playback and Save As; import the resulting MP3 using **+ Audio → Import audio from computer**. GitHub Pages hosts the entry and tool package; it cannot run the downloader itself. Each computer must start its own local helper. [Open tool and setup guide](https://nilson0606.github.io/NiVedit/yt-mp3.html).

The public ZIP contains source and setup instructions only. No user audio, session tokens or local configuration is included. The original 41 built-in tracks and existing editing behavior are retained.

Validation: 15 targeted integration checks plus 41 existing i18n checks; fresh local venv setup with existing Node/FFmpeg passed. Earlier standalone downloader tests verified a public short video through MP3 conversion, playback, seek and save. Not a full editor regression or a clean second-PC setup test.

A browser-based video editor with English and Traditional Chinese interfaces.

**Open the editor:** https://nilson0606.github.io/NiVedit/

**操作手冊 / User guide（繁體中文）：** [HTML 操作手冊](https://nilson0606.github.io/NiVedit/manual.html)

The guide has 16 chapters with a home index, direct chapter links, search, dark/light modes and print styling.

Use Chrome or Microsoft Edge on a desktop computer. HEVC support depends on the browser and hardware; v12.5 includes an optional local software converter. Import your own videos, images, GIF overlays, audio and subtitles. Media processing happens in your browser; the editor does not upload your media to a server. AI subtitles download their runtime and model files when needed.

## Previous music library update

**v12.9 restores the original 40 + 1 music library**, at the user's request. The current selection contains the original 40 background tracks and the authorized example music: **41 tracks**, about **40 seconds** each. The recent 60-track additions are no longer listed.

Open **+ Music track** to search, audition and add music, or import an audio file from your computer. Four categories contain 11 / 10 / 10 / 10 tracks. Existing saved projects retain their embedded audio.

[Download the original 41 MP3 tracks (approximately 40 MB)](https://nilson0606.github.io/NiVedit/background-music/NiVedit_Music_41_40s_v2.zip). The original audio files, catalog IDs and ZIP are unchanged. The package includes an offline listening page and instrument-source notices.

Validation: 68 music/example checks, including all 41 stereo files decoded with matching hashes, and 41 interface-language checks. Current editing features and the v12.5 important restore snapshot remain intact. This is not a full-suite rerun.

### Previous crop update

**v12.6 crop keep area:** rectangular and circular crops can keep the inside (default) or outside. Outside cuts a transparent hole so lower layers show through. Animated crop size/center and size, position, opacity and rotation still combine. The selection survives project saves, undo/redo and splitting; old projects keep the inside by default. A zero-diameter outside circle keeps the complete image.

Validation: 148 targeted Edge checks (crop 62, dual-track 45, i18n 41), including four actual MP4 exports decoded and compared with preview. The manual is updated. Earlier v12.5 restore files remain unchanged.

### Previous video compatibility update

**v12.5 video compatibility:** detects video elements without a decoded picture (including audio-only HEVC playback), identifies affected clips, preserves their project data, and stops export instead of silently rendering missing frames. **Convert to compatible format** converts a chosen clip or local file to H.264/AAC MP4 inside a disposable browser Worker. Keep original size, including 4K, or choose up to 1080p. Cancel, retry, download a copy, or apply it to one clip with undo/redo and editing settings retained. Conversion is explicit, not automatic.

The initial converter asset is approximately 43 MB. Files remain local. Input limit: 512 MiB and 4096×4096 pixels; 4K software conversion can take minutes. HDR is mapped to SDR and only the first audio stream is retained. Re-encoding is not lossless. See [engine licenses and corresponding sources](https://nilson0606.github.io/NiVedit/video-compat/README.html).

**User manual** opens a new tab from the editor header. The HTML guide has a left chapter menu, one-chapter view, search, light/dark modes and full-document print support.

Validation: 70 new compatibility/manual checks under Chrome 153 with GPU disabled, plus 225 targeted Edge regression checks (dual-track, rotation/save/export, music/example, i18n). A real 25-second 4K HEVC clip converted and displayed under CPU-only Chrome. Unrelated full-suite checks were not rerun; the previously documented v12.2 title-pixel baseline remains unchanged.

### Previous music and example update

**Background music pack v2:** **41 tracks**: 40 newly arranged instrumental cues, plus the user-authorized original example music. Each is about **40 seconds**, replacing the original 25-second selection. Four mood categories, 10 each: Cheerful everyday, Easygoing, Groove & energy, and Warm stories. Themes, answering phrases, changing grooves and endings use sampled instruments rather than the original simple waveform voices. Search by title or style, audition, then Add music track. **Import audio from computer** is still available.

[Download all 41 MP3 tracks (v2)](https://nilson0606.github.io/NiVedit/background-music/NiVedit_Music_41_40s_v2.zip) includes four folders, an offline listening page, composition events and instrument-source notices. Existing saved projects keep their embedded original music. The built-in example's music is unchanged; that same original audio is also available in the library as Cheerful example music.

**Open example:** the project panel offers a complete editable sample with video, title, subtitles, animation and music. Its video is 720p for faster loading; your own projects can be configured up to 4K. The reminder appears before loading; the example then opens paused at 00:00. No new project is needed first: the first Save or Save As asks for your own file, later saves update that file, and the built-in example stays unchanged. Loading another example warns when current work has unsaved changes.

The **Animation effects** library still includes 240 GIFs and imports your own GIFs/images. Video, audio, and project processing remain local to your browser.

Validation for music v2: 68 music/example checks, real MP4/AAC export, and 41 interface-language checks. All 41 unique stereo files decode at 40 seconds. The prior v12.4 full editor regression remains documented in RELEASE.json; unrelated suites were not rerun for this asset refresh.

## Features

- Two video tracks and two subtitle tracks, with independent placement, styling and on-screen position.
- 30 system typefaces for titles and subtitles, with unavailable ones marked.
- Two-point keyframes for size, position, opacity and rotation.
- Rectangle and circle cropping, including animated crop settings.
- Per-clip transitions, fades and original-audio controls.
- Titles, animated GIF overlays, music tracks and audio volume curves.
- Dark mode by default, with a light-mode toggle.
- Local project saving and video export using browser codecs.

## Build

Python 3 rebuilds the editor and copies the bundled assets:

```sh
python nivedit-src/build.py docs/index.html
```

The checked-in HTML is the verified V13.2 build. GitHub Pages serves the `docs` directory on `main`. After pushing a rebuilt `docs/index.html`, Pages updates automatically. Include docs/manual.html and docs/animation-effects/, docs/background-music/, docs/example-project/, docs/video-compat/, docs/yt-mp3-tools/ and docs/yt-mp3.html and docs/yt-mp4.html in every deployment. For local use, keep the manual, YT entry and all five asset folders beside the HTML. The source includes generated payloads, so a normal build needs only Python 3. Regenerating GIF assets needs Pillow; composing music v2/v3/v4 needs NumPy, tinysoundfont, GeneralUser GS and ffmpeg; re-encoding the sample needs ffmpeg and the original project.

## Projects and storage

Projects saved in a browser are tied to that website address. To transfer work from the local editor, save a `.nvproj` file there and open it in this website. Keep your own project backups.

## Source and third-party notices

This repository publishes the current source for reference. No open-source license has been granted for the original NiVedit code at this time. Third-party components retain their respective licenses; see [THIRD-PARTY.md](THIRD-PARTY.md).

## 繁體中文

這是 NiVedit v12.6 的網站與原始碼。矩形／圓形裁切可選「保留框內」（預設）或「保留框外」，框外模式會挖空框內並露出下方軌道。建議使用桌面版 Microsoft Edge；可切換繁體中文與日／夜模式，預設夜間模式。

影片、圖片及音訊在瀏覽器內處理。AI 字幕首次使用時需要下載程式與模型。從本機版本搬移專案時，請先儲存 `.nvproj`，再由網頁版本開啟。

「＋ 動畫效果」可選內建 240 組素材，或匯入使用者自己製作的 GIF／圖片。本機版搬移時，請一起帶走 HTML 旁的 animation-effects 資料夾。加入的素材會隨 .nvproj 保存。
