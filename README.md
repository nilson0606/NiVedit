# NiVedit v12.4

A browser-based video editor with English and Traditional Chinese interfaces.

**Open the editor:** https://nilson0606.github.io/NiVedit/

**操作手冊 / User guide（繁體中文）：** [HTML 操作手冊](https://nilson0606.github.io/NiVedit/manual.html)

The guide has 15 chapters with a home index, direct chapter links, search, dark/light modes and print styling.

Use Microsoft Edge on a desktop computer. Import your own videos, images, GIF overlays, audio and subtitles. Media processing happens in your browser; the editor does not upload your media to a server. AI subtitles download their runtime and model files when needed.

## Latest update

**Background music library:** choose from 40 original instrumental cues, 25 seconds each, in four equal categories: Calm & relaxing, Bright & everyday, Lo-fi & jazz, and Cinematic atmosphere. Each cue uses a different combination of synthesized instruments. Select a track and press Play to audition, then Add music track. **Import audio from computer** keeps your own audio available.

[Download all 40 MP3 tracks](https://nilson0606.github.io/NiVedit/background-music/NiVedit_Music_40_25s_v1.zip) includes four category folders and an offline listening page. Music loads on demand; selected tracks are embedded in saved projects.

**Open example:** the project panel offers a complete editable sample with video, title, subtitles, animation and music. Its video is 720p for faster loading; your own projects can be configured up to 4K. The reminder appears before loading. No new project is needed first: the first Save or Save As asks for your own file, later saves update that file, and the built-in example stays unchanged. Loading another example warns when current work has unsaved changes.

The **Animation effects** library still includes 240 GIFs and imports your own GIFs/images. Video, audio, and project processing remain local to your browser.

Validation: Windows Edge 154: 62 music/example checks, 40 distinct stereo tracks decoded at 25 seconds, real MP4/AAC export, and 65 GIF library checks (all 240 assets). Existing counted suites 729/730; GIF suite and two i18n diagnostics completed. One title-pixel tolerance failure remains identical to unchanged v12.2: 84 preview / 67 decoded pixels. No threshold change.

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

The checked-in HTML is the verified v12.4 build. GitHub Pages serves the `docs` directory on `main`. After pushing a rebuilt `docs/index.html`, Pages updates automatically. Include docs/animation-effects/, docs/background-music/, and docs/example-project/ in every deployment. For local use, keep all three asset folders beside the HTML. The source includes generated payloads, so a normal build needs only Python 3. Regenerating GIF assets needs Pillow; composing music needs NumPy and ffmpeg; re-encoding the sample needs ffmpeg and the original project.

## Projects and storage

Projects saved in a browser are tied to that website address. To transfer work from the local editor, save a `.nvproj` file there and open it in this website. Keep your own project backups.

## Source and third-party notices

This repository publishes the current source for reference. No open-source license has been granted for the original NiVedit code at this time. Third-party components retain their respective licenses; see [THIRD-PARTY.md](THIRD-PARTY.md).

## 繁體中文

這是 NiVedit v12.3 的網站與原始碼。建議使用桌面版 Microsoft Edge；可切換繁體中文與日／夜模式，預設夜間模式。

影片、圖片及音訊在瀏覽器內處理。AI 字幕首次使用時需要下載程式與模型。從本機版本搬移專案時，請先儲存 `.nvproj`，再由網頁版本開啟。

「＋ 動畫效果」可選內建 240 組素材，或匯入使用者自己製作的 GIF／圖片。本機版搬移時，請一起帶走 HTML 旁的 animation-effects 資料夾。加入的素材會隨 .nvproj 保存。
