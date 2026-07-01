# ThaoTerminal

**Terminal thông minh cho lập trình viên** — tích hợp AI, điều khiển từ xa, và đầy đủ tính năng cho công việc hằng ngày.

---

## ThaoTerminal là gì?

ThaoTerminal là một terminal hiện đại chạy trên Windows, macOS và Linux, được xây dựng dành riêng cho lập trình viên làm việc với AI. Thay vì mở nhiều cửa sổ rời rạc, bạn có thể quản lý tất cả terminal, agent AI và workspace trong một giao diện duy nhất — kể cả điều khiển từ điện thoại.

---

## Tính năng nổi bật

### Quản lý Workspace & Terminal
- Thêm nhiều **thư mục workspace** vào sidebar, mỗi thư mục quản lý các terminal riêng
- **Nhiều tab** trong mỗi workspace, kéo thả để sắp xếp lại
- Hiển thị **nhánh Git** hiện tại ngay trên thanh công cụ
- **Tự khôi phục session** khi mở lại app — terminal và các phiên AI được nối tiếp đúng chỗ

### Tích hợp AI Agent
Tạo phiên làm việc với các AI trực tiếp trong terminal:
- **Claude Code** — lập trình cùng AI của Anthropic
- **Codex** — agent AI của OpenAI
- **PI** — trợ lý AI đàm thoại

Mỗi agent chạy trong tab riêng, có thể mở nhiều phiên song song.

### Theo dõi Chi phí AI
Sidebar hiển thị **tổng token và chi phí USD trong ngày** cho từng AI (Claude, Codex, PI) — cập nhật tự động mỗi 20 giây.

### Điều khiển từ Điện thoại
Mở **Remote Access** (biểu tượng 📱), quét QR bằng điện thoại để xem và điều khiển mọi terminal đang chạy:
- **Wi-Fi only** — điện thoại cùng mạng với máy tính
- **Từ bất kỳ đâu** — qua đường hầm `cloudflared`, không cần tài khoản

### Phím tắt
| Phím | Chức năng |
|------|-----------|
| `Ctrl+Shift+T` | Mở terminal mới |
| `Ctrl+Shift+C` | Mở phiên Claude Code mới |
| `Ctrl+Shift+X` | Mở phiên Codex mới |
| `Ctrl+W` | Đóng terminal hiện tại |
| `Ctrl+B` | Ẩn/hiện sidebar |
| `Ctrl+Shift+N` | Thêm workspace folder |
| `Ctrl+1` đến `Ctrl+9` | Chuyển nhanh đến terminal thứ N |
| `Ctrl+V` | Dán văn bản vào terminal |
| `Ctrl+C` | Sao chép văn bản đang bôi đen |

Tất cả phím tắt có thể **tùy chỉnh** trong Settings (⚙).

### Tiện ích khác
- **Dán ảnh** vào terminal — ảnh được hiển thị trực tiếp (hữu ích để share screenshot với AI)
- **Đính kèm file** bằng nút 📎 trên toolbar — mở file picker, đường dẫn file được gõ thẳng vào terminal
- **Ghi chú dính** (📝) cho mỗi terminal — ghi chú riêng cho từng task đang làm
- **Đổi theme** bằng nút ◐ góc trên phải
- **Liên kết có thể click** trực tiếp trong terminal

---

## Hướng dẫn bắt đầu

### 1. Thêm Workspace
Nhấn **Ctrl+Shift+N** hoặc nút **+ Add workspace folder** trong sidebar để chọn thư mục dự án. Một terminal sẽ tự mở trong thư mục đó.

### 2. Mở AI Agent
Trong sidebar, mỗi folder có các nút nhỏ để mở Claude, Codex hoặc PI. Hoặc dùng phím tắt `Ctrl+Shift+C` / `Ctrl+Shift+X`.

### 3. Bật Remote Access từ điện thoại
- Nhấn **📱 Remote** ở thanh bên trái
- Chọn "Use from anywhere" nếu muốn dùng ngoài mạng nội bộ
- Nhấn **Start**, quét QR bằng điện thoại
- Gõ lệnh trực tiếp từ điện thoại vào terminal trên máy tính

### 4. Tùy chỉnh Settings
Nhấn **⚙ Settings** để:
- Thay đổi phím tắt theo ý muốn
- Bật/tắt từng loại AI agent hiển thị trong UI

---

## Yêu cầu hệ thống
- Windows 10/11, macOS 12+, hoặc Linux
- Kết nối internet (để dùng AI agents)
- `cloudflared` (tùy chọn, chỉ cần nếu dùng Remote Access từ xa)

---

*ThaoTerminal v0.2.4*
