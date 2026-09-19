# NiVedit v12.11

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

## Latest update

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

The checked-in HTML is the verified v12.9 build. GitHub Pages serves the `docs` directory on `main`. After pushing a rebuilt `docs/index.html`, Pages updates automatically. Include docs/manual.html and docs/animation-effects/, docs/background-music/, docs/example-project/, and docs/video-compat/ in every deployment. For local use, keep the manual and all four asset folders beside the HTML. The source includes generated payloads, so a normal build needs only Python 3. Regenerating GIF assets needs Pillow; composing music v2/v3/v4 needs NumPy, tinysoundfont, GeneralUser GS and ffmpeg; re-encoding the sample needs ffmpeg and the original project.

## Projects and storage

Projects saved in a browser are tied to that website address. To transfer work from the local editor, save a `.nvproj` file there and open it in this website. Keep your own project backups.

## Source and third-party notices

This repository publishes the current source for reference. No open-source license has been granted for the original NiVedit code at this time. Third-party components retain their respective licenses; see [THIRD-PARTY.md](THIRD-PARTY.md).

## 繁體中文

這是 NiVedit v12.6 的網站與原始碼。矩形／圓形裁切可選「保留框內」（預設）或「保留框外」，框外模式會挖空框內並露出下方軌道。建議使用桌面版 Microsoft Edge；可切換繁體中文與日／夜模式，預設夜間模式。

影片、圖片及音訊在瀏覽器內處理。AI 字幕首次使用時需要下載程式與模型。從本機版本搬移專案時，請先儲存 `.nvproj`，再由網頁版本開啟。

「＋ 動畫效果」可選內建 240 組素材，或匯入使用者自己製作的 GIF／圖片。本機版搬移時，請一起帶走 HTML 旁的 animation-effects 資料夾。加入的素材會隨 .nvproj 保存。
