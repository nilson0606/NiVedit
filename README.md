# NiVedit v10.2

A browser-based video editor with English and Traditional Chinese interfaces.

**Open the editor:** https://nilson0606.github.io/NiVedit/

**操作手冊 / User guide（繁體中文）：** [HTML 操作手冊](https://nilson0606.github.io/NiVedit/manual.html)

The guide has 15 chapters with a home index, direct chapter links, search, dark/light modes and print styling.

Use Microsoft Edge on a desktop computer. Import your own videos, images, GIF overlays, audio and subtitles. Media processing happens in your browser; the editor does not upload your media to a server. AI subtitles download their runtime and model files when needed.

## Latest update

Timeline layer numbers are now fixed. Each track has one number instead of each object having its own, so adding a second overlay no longer pushes the numbers up — every overlay stays on the same layer. Video and its subtitles share a layer (L1 lower, L2 upper); images, overlays and titles take L3, L4 and L5 and are reordered with the ▲▼ beside the track name, never below L3. Within one layer, whichever starts later on the timeline is drawn in front.

Images now have their own track, drawn above the video, and keep everything a video clip has: transitions, cropping, colour grading, keyframes and fades. Projects saved before this change move their images onto the new track when opened, which also means an image now covers subtitles.

## Features

- Two video tracks and two subtitle tracks, with independent placement, styling and on-screen position.
- Two-point keyframes for size, position, opacity and rotation.
- Rectangle and circle cropping, including animated crop settings.
- Per-clip transitions, fades and original-audio controls.
- Titles, animated GIF overlays, music tracks and audio volume curves.
- Dark mode by default, with a light-mode toggle.
- Local project saving and video export using browser codecs.

## Build

Python 3 is required only to rebuild the single-file editor:

```sh
python nivedit-src/build.py docs/index.html
```

The checked-in HTML is the verified v10.2 build. GitHub Pages serves the `docs` directory on `main`. After pushing a rebuilt `docs/index.html`, Pages updates automatically.

## Projects and storage

Projects saved in a browser are tied to that website address. To transfer work from the local editor, save a `.nvproj` file there and open it in this website. Keep your own project backups.

## Source and third-party notices

This repository publishes the current source for reference. No open-source license has been granted for the original NiVedit code at this time. Third-party components retain their respective licenses; see [THIRD-PARTY.md](THIRD-PARTY.md).

## 繁體中文

這是 NiVedit v10.2 的網站與原始碼。建議使用桌面版 Microsoft Edge；可切換繁體中文與日／夜模式，預設夜間模式。

影片、圖片及音訊在瀏覽器內處理。AI 字幕首次使用時需要下載程式與模型。從本機版本搬移專案時，請先儲存 `.nvproj`，再由網頁版本開啟。
