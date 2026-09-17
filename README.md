# NiVedit v12.0

A browser-based video editor with English and Traditional Chinese interfaces.

**Open the editor:** https://nilson0606.github.io/NiVedit/

**操作手冊 / User guide（繁體中文）：** [HTML 操作手冊](https://nilson0606.github.io/NiVedit/manual.html)

The guide has 15 chapters with a home index, direct chapter links, search, dark/light modes and print styling.

Use Microsoft Edge on a desktop computer. Import your own videos, images, GIF overlays, audio and subtitles. Media processing happens in your browser; the editor does not upload your media to a server. AI subtitles download their runtime and model files when needed.

## Latest update

AI subtitles can now transcribe an audio track. The "Scope" dropdown lists your audio tracks alongside the video clips, so a narration you recorded separately and dropped onto the timeline can become subtitles. Only the part you can actually hear is transcribed — a looping track is transcribed once, not once per repeat — and the result goes on the bottom subtitle track.

The release before this one changed the "+ Subtitle" button to ask what you want: type one subtitle yourself, or import an SRT file. Typing one puts a block on the subtitle track at the playhead and selects it, ready to type into.

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

Python 3 is required only to rebuild the single-file editor:

```sh
python nivedit-src/build.py docs/index.html
```

The checked-in HTML is the verified v12.0 build. GitHub Pages serves the `docs` directory on `main`. After pushing a rebuilt `docs/index.html`, Pages updates automatically.

## Projects and storage

Projects saved in a browser are tied to that website address. To transfer work from the local editor, save a `.nvproj` file there and open it in this website. Keep your own project backups.

## Source and third-party notices

This repository publishes the current source for reference. No open-source license has been granted for the original NiVedit code at this time. Third-party components retain their respective licenses; see [THIRD-PARTY.md](THIRD-PARTY.md).

## 繁體中文

這是 NiVedit v12.0 的網站與原始碼。建議使用桌面版 Microsoft Edge；可切換繁體中文與日／夜模式，預設夜間模式。

影片、圖片及音訊在瀏覽器內處理。AI 字幕首次使用時需要下載程式與模型。從本機版本搬移專案時，請先儲存 `.nvproj`，再由網頁版本開啟。
