# NiVedit v12.5 HTML 操作手冊

16 章，左側目錄、單章顯示、搜尋、日夜模式與完整列印。編輯器上方入口在新分頁開啟 manual.html。

內容修訂：2026-09-18。已逐章對照實際程式；詳見 AUDIT_20260918.md。
主程式仍為 v12.5，手冊版號由生成器讀取主程式 VER，不另行硬編碼。
編輯 chapters.json；執行 python manual/build_manual.py 產生 NiVedit_操作手冊.html 與 nivedit-src/manual.html，再執行 python nivedit-src/build.py。
網站輸出 docs/manual.html；本機輸出 HTML 旁的 manual.html。
images/ 是以目前 v12.5 示範資料截取的字幕編輯器日夜畫面，未含私人專案素材。
