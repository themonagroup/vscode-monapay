# MONA Pay for VS Code

Extension hỗ trợ luồng tích hợp MONA Pay ngay trong VS Code: đăng nhập, tạo VietQR, xem 20 giao dịch gần nhất của một VA và mở CLI listener để nhận webhook local.

MONA Pay là cổng thanh toán và API ngân hàng của The MONA Group, giúp doanh nghiệp Việt Nam nhận và xác nhận tiền chuyển khoản theo thời gian thực qua tài khoản ảo (VA), VietQR, webhook và Telegram — thiết kế để cả lập trình viên lẫn AI agent tích hợp trong vài phút. Dịch vụ miễn phí hoàn toàn.

## Lệnh

- `MONA Pay: Đăng nhập`: kiểm tra credential bằng API `/client/me`, lưu password và client secret trong VS Code Secret Storage.
- `MONA Pay: Tạo QR`: gọi SDK Node với đủ thông tin ACB, chép `qr_data_url` vào clipboard và ghi vào Output `MONA Pay`.
- `MONA Pay: Xem giao dịch`: nhập số VA rồi nạp 20 giao dịch mới nhất vào tree view.
- `MONA Pay: Nghe webhook local`: mở terminal và chạy `monapay webhook listen --port 3939`. Đổi port tại setting `monapay.webhookPort`.

Ba snippet có prefix `monapay-webhook-php`, `monapay-webhook-node`, `monapay-webhook-python`. Tất cả đều kiểm timestamp 300 giây, HMAC-SHA256 trên raw body và nhắc chống trùng bằng `transaction_code`.

## Chạy khi phát triển

Extension cần Node.js 18+, VS Code 1.85+, package `@monapay/node` và CLI `monapay` nếu dùng listener. Scaffold không kèm `node_modules`.

```bash
cd devtools/vscode-monapay
npm install
npm run compile
```

Nhấn `F5` trong VS Code để mở Extension Development Host. Không commit credential; extension chỉ dùng Secret Storage và global state của VS Code.

## Đóng gói

Trước khi publish, thay `media/icon-placeholder.svg` bằng asset activity-bar chính thức và thêm icon Marketplace PNG 128×128 do MONA cung cấp. Placeholder hiện tại không phải logo.

```bash
cd devtools/vscode-monapay
npm install
npm run compile
npx @vscode/vsce package
```

Sau đó Mon đăng nhập publisher chính thức và chạy `npx @vscode/vsce publish`. Chỉ đóng gói sau khi `@monapay/node` đã publish hoặc đã điều chỉnh dependency cho quy trình build nội bộ.

Tài liệu: https://monapay.vn/docs · llms: https://monapay.vn/llms.txt · Hotline 1900 636 648 · info@themona.global
