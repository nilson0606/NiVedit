# NiVedit YT → MP3／MP4 本機工具（V13.1）

Windows 10/11 x64；Python 3.10 以上。
1. 解壓縮到可寫入的資料夾，先安裝 Python（https://www.python.org/downloads/windows/）。
2. 雙擊 setup.cmd。下載 yt-dlp、Node（LTS）與 FFmpeg 到本資料夾，需要網路，無須管理員。
3. 雙擊「啟動下載器.vbs」，在 Edge 操作。
4. NiVedit 主頁「YT → MP3」或「YT → MP4」開啟獨立說明頁；啟動後可按「開啟本機下載器」。
5. MP3／MP4 在 downloads/，也可另存。MP3 回 NiVedit「＋音軌 → 匯入電腦音檔」；MP4 回「＋影片」。
6. MP4 可選 720p、1080p、4K 上限，實際依原片可用畫質下載，不會放大。輸出 H.264／AAC，支援預覽與跳轉；轉檔時仍可取消。

舊工具升級：先用「關閉本機工具」，將新版 ZIP 內的檔案覆蓋到原工具資料夾再啟動。原本的 config.json、runtime、deps、downloads 不須刪除；重新執行 setup.cmd 只更新依賴，不會更新本工具介面／server.py。兩種模式共用同一個服務，一次一項下載。

固定本機位址 http://127.0.0.1:19627/。只監聽 loopback，無 CORS、API 有權杖與來源檢查。
若連線失敗，先啟動工具。若 19627 埠被其他程式使用，關閉衝突程式後重試。
重複啟動會共用既有服務。關閉分頁不停止服務；用「關閉本機工具」。
取消可能保留部分檔案。每次下載在獨立資料夾，不覆寫既有下載。
工具只支援單支 YouTube 影片，不讀 cookies、不繞過 DRM。影片限制及 YouTube 更新可能導致失敗。
更新引擎：關閉工具，重新執行 setup.cmd。

公開套件不含使用者下載的音樂、帳號、session.json 或本機路徑設定。
GitHub Pages 只提供入口；每台電腦都需要啟動本機工具。
請使用你有權下載的內容。

依賴來源與授權（初始化直接向供應者下載，並保留原包中的授權檔）：
- yt-dlp：https://github.com/yt-dlp/yt-dlp （Unlicense；pip 依賴保留各自授權）
- Node：https://nodejs.org/ （MIT 與第三方授權；比對 SHA256）
- FFmpeg：https://github.com/yt-dlp/FFmpeg-Builds （GPL 組建；對應來源及建置腳本見供應者 repo/release）

本工具程式提供於 NiVedit 原始碼；不隨包配送第三方二進位檔。
