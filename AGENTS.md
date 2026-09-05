# WebCAD Agent Instructions

## FrameLens：UI／圖片／影片檢查優先

凡涉及 UI 截圖、畫面布局、視覺回歸、圖片或影片分析，必須先使用
FrameLens；只有 FrameLens 無法提供足夠證據時，才補充其他檢查方式。

- 本機 CLI：`C:\tmp\framelens-0.1.0\FrameLens\.venv\Scripts\framelens.exe`
- 先跑 `framelens doctor` 確認後端；圖片用 `framelens image <path>`，影片用
  `framelens video <path-or-url>`。
- FrameLens 的 JSON 輸出應用於快速找出文字、溢位、重疊、錯誤提示及畫面差異；
  必要時再以瀏覽器／畫布實機互動確認。
- 目前 OCR、ffmpeg、yt-dlp 可用；未有 Ollama vision model 時，不能聲稱已做 VLM
  語義判讀。
