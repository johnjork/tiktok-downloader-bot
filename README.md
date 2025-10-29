# TikTok/Douyin Telegram Bot — Render Deploy Pack
Hai biến thể:
- `polling/`: Background Worker (khuyên dùng).
- `webhook/`: Web Service (tuỳ chọn).

## Deploy nhanh (Polling Worker)
1) Push repo này lên GitHub.
2) Render → New → Blueprint → chọn repo.
3) Set env `BOT_TOKEN` trong Dashboard.
4) Deploy → bot chạy polling tự động.

Xem `render.yaml` để tham khảo cấu hình Blueprint.
