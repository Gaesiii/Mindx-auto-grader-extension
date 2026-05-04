# MindX Auto Grader Extension

Chrome extension hỗ trợ giáo viên và team vận hành MindX chấm điểm, viết nhận xét, quản lý học viên trial và chèn báo cáo Zalo nhanh hơn trên các trang LMS nội bộ.

## Giá trị chính

- Giảm thao tác lặp khi chấm bài bằng bộ nút tick điểm nhanh theo mức Giỏi, Khá, Trung bình.
- Tạo nhận xét bằng AI dựa trên từ khóa, nội dung buổi học và prompt do giáo viên cấu hình.
- Xử lý nhiều học sinh theo batch, tự động tạo nhận xét và điền vào form.
- Chèn mẫu báo cáo Zalo từ ngân hàng cloud theo môn, khóa và buổi học.
- Đồng bộ trial task, đánh dấu vắng, lưu draft và submit kết quả về API.
- Kiểm tra update từ GitHub và hiển thị badge khi có phiên bản mới.

## Tính năng

### 1. Auto grading trên LMS

Extension tự phát hiện bảng điểm trong dialog chấm bài, hiển thị panel nổi trên trang và cung cấp các nút:

- `Giỏi`: ưu tiên điểm 4-5.
- `Khá`: ưu tiên điểm 3-4.
- `TB`: ưu tiên điểm 3-4 với tỷ lệ thấp hơn.
- `Nhờ AI viết nhận xét`: tạo nhận xét dựa trên điểm hiện tại và prompt đã cấu hình.

### 2. AI comment và batch comment

Trong trang danh sách học sinh, extension có thể:

- Đọc tên học sinh từ UI.
- Nhận từ khóa riêng cho từng học sinh.
- Lấy nội dung buổi học từ API theo môn, khóa, buổi.
- Gọi AI theo batch để tạo nhận xét JSON.
- Điền nhận xét vào dialog từng học sinh và lưu.

Google Gemini được hỗ trợ mặc định, có fallback model:

```text
gemini-2.5-flash -> gemini-2.5-flash-lite
```

Bạn cũng có thể cấu hình provider khác nếu có API key và model riêng.

### 3. Ngân hàng báo cáo Zalo

Trang Settings cho phép quản lý cây nội dung báo cáo theo:

- Scratch: SB, SA, SI
- Game: GB, GA, GI
- PRE: PREB, PREA, PREI
- ARM: ARMB, ARMA, ARMI
- WEB: JSB, JSA, JSI
- SEMI: SEMIB, SEMIA, SEMII
- Python: PTB, PTA, PTI

Mỗi khóa gồm 14 buổi. Giáo viên có thể chọn đúng buổi học, copy nội dung hoặc chèn trực tiếp vào ô soạn thảo/Zalo.

### 4. Trial Task Manager

Popup extension gồm:

- Danh sách học viên trial được giao.
- Form đánh giá học viên.
- Trạng thái `Pending`, `Pass`, `Fail`.
- Checkbox `Absent`.
- Lưu draft, submit từng học viên hoặc submit tất cả.
- Thêm học viên phát sinh ngoài lịch.
- Kết nối user identity bằng Google Login hoặc Manual UID/Token.

API mặc định:

```text
GET  https://lms-performance-tracker.vercel.app/api/trial-tasks
POST https://lms-performance-tracker.vercel.app/api/trial-tasks/submit
```

### 5. Khay copy/paste và phím tắt

Extension theo dõi văn bản đang chọn, lưu vào clipboard và hỗ trợ phím tắt:

- Dán macro Zalo.
- Mở bảng cây báo cáo.
- Bật/tắt nhanh extension.

Phím tắt được cấu hình trong trang Settings.

## Cài đặt local

Repo này là Chrome extension thuần, không cần build step.

1. Clone repo:

```bash
git clone https://github.com/Gaesiii/Mindx-auto-grader-extension.git
```

2. Mở Chrome và vào:

```text
chrome://extensions
```

3. Bật `Developer mode`.
4. Chọn `Load unpacked`.
5. Chọn thư mục repo vừa clone.
6. Ghim extension lên thanh công cụ để mở popup nhanh.

## Cấu hình lần đầu

1. Mở popup extension.
2. Bấm `Settings`.
3. Cấu hình user identity:
   - Google Login nếu dùng Chrome profile có tài khoản Google.
   - Manual UID/Token nếu cần map với server-side task API.
4. Thêm API key AI trong mục `AI Provider & Prompt`.
5. Kiểm tra prompt nhận xét và chọn template phù hợp.
6. Lưu phím tắt theo thói quen thao tác.
7. Mở LMS/Zalo và thử workflow với một học sinh test trước khi dùng hàng loạt.

## Cấu trúc file

```text
.
|-- manifest.json      # Manifest V3, permission và entrypoints
|-- background.js      # Kiểm tra update GitHub, badge extension
|-- content.js         # Inject UI, auto grading, AI comment, Zalo report
|-- popup.html         # Giao diện Trial Task Manager
|-- popup.js           # Logic popup, draft/submit task
|-- task-api.js        # API wrapper cho trial tasks
|-- options.html       # Trang Settings
|-- options.js         # AI provider, prompt, identity, cloud report bank
|-- quill.js/css       # Rich text editor cho nội dung báo cáo
`-- popup.css          # Style popup
```

## Quyền Chrome

Extension sử dụng các permission sau:

- `storage`: lưu cấu hình, identity, prompt, task draft.
- `clipboardRead`, `clipboardWrite`: copy/paste nội dung báo cáo.
- `alarms`: kiểm tra update định kỳ.
- `identity`, `identity.email`: lấy thông tin Google profile khi người dùng chọn Google Login.
- `https://api.github.com/*`: kiểm tra commit/tag mới trên GitHub.

## Lưu ý an toàn

- Không commit API key AI vào repo.
- Chỉ load extension từ source tin cậy.
- Kiểm tra nội dung AI tạo ra trước khi gửi cho học viên/phụ huynh.
- Nên test trên tài khoản staging/LMS test trước khi chạy batch trên dữ liệu thật.

## Phát triển

Sau khi sửa code:

1. Vào `chrome://extensions`.
2. Bấm `Reload` tại extension.
3. Mở DevTools của popup/content script để xem log.
4. Test lại các flow chính:
   - Settings lưu provider/prompt.
   - Popup load task và submit.
   - Auto tick điểm.
   - AI comment đơn lẻ.
   - Batch comment.
   - Chèn báo cáo Zalo.

## Repository

GitHub: https://github.com/Gaesiii/Mindx-auto-grader-extension
