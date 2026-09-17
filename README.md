# NiVedit v12.3

A browser-based video editor with English and Traditional Chinese interfaces.

**Open the editor:** https://nilson0606.github.io/NiVedit/

**操作手冊 / User guide（繁體中文）：** [HTML 操作手冊](https://nilson0606.github.io/NiVedit/manual.html)

The guide has 15 chapters with a home index, direct chapter links, search, dark/light modes and print styling.

Use Microsoft Edge on a desktop computer. Import your own videos, images, GIF overlays, audio and subtitles. Media processing happens in your browser; the editor does not upload your media to a server. AI subtitles download their runtime and model files when needed.

## Latest update

The new **Animation effects** library includes 240 GIFs: reactions and celebration (40), everyday effects (50), short-video effects (100), and bold effects (50). Search or filter, preview one effect, then add it to the timeline. **Import your GIF / image** still lets you choose your own local creations.

Effects load on demand from this site; no separate pack download is needed. Once added, their GIF bytes are saved inside the project. The former Overlay controls now say Animation effects, including the split action. Two original GIFs had duplicate headers before their last frames; the bundled copies preserve the pixels and timing while correcting those headers for Edge.

Validation: 65 library checks, including file and website paths, plus integrity and frame/timing checks for all 240 assets. Existing regression: 729/730 on Edge 154, plus the GIF suite. The one title-pixel export tolerance failure is identical on the unchanged v12.2 baseline (84 preview pixels / 67 decoded pixels); the threshold was not relaxed.

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

The checked-in HTML is the verified v12.3 build. GitHub Pages serves the `docs` directory on `main`. After pushing a rebuilt `docs/index.html`, Pages updates automatically. Include the docs/animation-effects/ folder in every deployment. For local use, keep the HTML and its adjacent animation-effects folder together. The source already contains generated assets; Pillow is only needed to regenerate them from the original packs.

## Projects and storage

Projects saved in a browser are tied to that website address. To transfer work from the local editor, save a `.nvproj` file there and open it in this website. Keep your own project backups.

## Source and third-party notices

This repository publishes the current source for reference. No open-source license has been granted for the original NiVedit code at this time. Third-party components retain their respective licenses; see [THIRD-PARTY.md](THIRD-PARTY.md).

## 繁體中文

這是 NiVedit v12.3 的網站與原始碼。建議使用桌面版 Microsoft Edge；可切換繁體中文與日／夜模式，預設夜間模式。

影片、圖片及音訊在瀏覽器內處理。AI 字幕首次使用時需要下載程式與模型。從本機版本搬移專案時，請先儲存 `.nvproj`，再由網頁版本開啟。

「＋ 動畫效果」可選內建 240 組素材，或匯入使用者自己製作的 GIF／圖片。本機版搬移時，請一起帶走 HTML 旁的 animation-effects 資料夾。加入的素材會隨 .nvproj 保存。
