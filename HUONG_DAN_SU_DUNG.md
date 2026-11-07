# Sổ tay Hướng dẫn Sử dụng Tabularis

> **Dành cho người dùng bản 0.13.28+ (Hỗ trợ tiếng Việt, English, 日本語).**
> Tabularis là ứng dụng desktop hiện đại, tốc độ cao để xem, truy vấn, tối ưu và quản lý các hệ cơ sở dữ liệu: **PostgreSQL, MySQL / MariaDB, SQLite**, cùng hơn 13 loại cơ sở dữ liệu khác (DuckDB, ClickHouse, Redis, MongoDB, Google Sheets...) thông qua hệ thống Plugin.

```mermaid
flowchart LR
  A["1. Kết nối DB<br/>Chuỗi kết nối / Dự án / DBeaver"] --> B["2. Duyệt Cấu trúc<br/>Bảng, View, Khóa ngoại"]
  B --> C["3. Truy vấn SQL<br/>Console / Snippets / Visual Builder"]
  B --> D["4. Thao tác Dữ liệu<br/>Lưới ảo / Sửa ô / Quick Stats / Live Tail"]
  C --> E["5. Tối ưu và So sánh<br/>Explain / Index Advisor / Data Compare"]
  D --> E
```

---

## 🚀 Bắt đầu nhanh trong 3 bước (30 giây)

Nếu bạn vừa cài đặt Tabularis, bạn chỉ cần nắm 3 bước này là dùng được ngay:

| Bước | Thao tác | Hướng dẫn chi tiết |
|---|---|---|
| **1. Kết nối CSDL** | **1 Cú click** | Bấm nút vàng **`📁 Mở từ thư mục dự án`** (chọn folder code có `.env`, `docker-compose`, `prisma`), hoặc bấm **`+ Thêm kết nối`** và dán URL (`postgres://...`, `mysql://...`). |
| **2. Xem & Sửa dữ liệu** | **Không cần SQL** | Click đúp vào tên bảng bất kỳ ở cột bên trái (Explorer). Nhấp đúp chuột vào ô bất kỳ để sửa trực tiếp như Excel, rồi bấm **`Lưu`** (`Ctrl + S`). |
| **3. Viết & Chạy SQL** | **Console thông minh** | Bấm **`Ctrl + T`** mở tab SQL, gõ câu truy vấn và bấm **`Ctrl + Enter`** để chạy. Bấm **`Xuất dữ liệu`** để tải về file Excel/CSV/JSON. |

> 💡 **5 Mẹo hay nên biết:**
> 1. 🛡️ **Che mờ dữ liệu (PII Masking):** Bấm nút khiên trên bảng dữ liệu để ẩn email, số điện thoại khi demo/chụp ảnh.
> 2. ⚡ **Tối ưu câu SQL (Index Advisor):** Bấm `Explain & Tối ưu` để phát hiện nghẽn hiệu năng và nhận gợi ý lệnh `CREATE INDEX`.
> 3. 🔄 **Đối soát 2 bảng (Data Compare):** Chuột phải vào bảng → `So sánh dữ liệu` để tìm chênh lệch giữa Local và Staging.
> 4. 📊 **Thống kê cột nhanh:** Click vào thẻ kiểu dữ liệu ở tiêu đề cột để xem % NULL, Distinct count, Min/Max.
> 5. 🔍 **Tìm nhanh toàn năng:** Bấm `Ctrl + P` để nhảy tới bất kỳ bảng hay kết nối nào trong 1 giây.

---

## Mục lục

1. [Làm quen với giao diện](#1-làm-quen-với-giao-diện)
2. [Kết nối tới cơ sở dữ liệu](#2-kết-nối-tới-cơ-sở-dữ-liệu)
3. [Viết và chạy truy vấn SQL](#3-viết-và-chạy-truy-vấn-sql)
4. [Xem, phân tích và sửa dữ liệu trong bảng](#4-xem-phân-tích-và-sửa-dữ-liệu-trong-bảng)
5. [Chế độ an toàn (Safe Mode & Production Guard)](#5-chế-độ-an-toàn-safe-mode--production-guard)
6. [Tối ưu truy vấn chậm: Explain và gợi ý chỉ mục](#6-tối-ưu-truy-vấn-chậm-explain-và-gợi-ý-chỉ-mục)
7. [Theo dõi dòng mới thời gian thực: Live Tail](#7-theo-dõi-dòng-mới-thời-gian-thực-live-tail)
8. [So sánh dữ liệu giữa hai bảng (Data Compare & Sync)](#8-so-sánh-dữ-liệu-giữa-hai-bảng-data-compare--sync)
9. [So sánh cấu trúc (Schema Diff) và Sơ đồ ER](#9-so-sánh-cấu-trúc-schema-diff-và-sơ-đồ-er)
10. [Chia sẻ cấu hình nhóm qua Git (Team Sync)](#10-chia-sẻ-cấu-hình-nhóm-qua-git-team-sync)
11. [Các công cụ mở rộng (Tách cửa sổ, Chia đôi màn hình)](#11-các-công-cụ-mở-rộng)
12. [Kết nối trợ lý AI và Máy chủ MCP (Claude Desktop, Cursor)](#12-kết-nối-trợ-lý-ai-và-máy-chủ-mcp)
13. [Bảng phím tắt toàn tập](#13-bảng-phím-tắt-toàn-tập)
14. [Xử lý sự cố thường gặp (Troubleshooting)](#14-xử-lý-sự-cố-thường-gặp)

---

## 1. Làm quen với giao diện

Sơ đồ trực quan giúp bạn nắm bắt ngay vị trí các khu vực thao tác:

```text
┌──────────┬────────────────────────────────────────────────────────────────┐
│ THANH    │  [Tab 1: Console] [Tab 2: customers] [Tab 3: Notebook]  [ + ]  │  ← Thanh Tab
│ BÊN      ├────────────────────────────────────────────────────────────────┤
│          │  Trình soạn thảo SQL (Monaco Editor offline)                   │
│ Kết nối  │  SELECT * FROM customers WHERE status = 'active';              │
│ ───────  │                                              [▶ Chạy] [Xuất ▾] │
│ ▸ Kết nối├────────────────────────────────────────────────────────────────┤
│   Máy chủ│  Kết quả / Lưới dữ liệu ảo hóa                                 │
│   MCP    │  ┌────┬───────────┬──────────┐  Che mờ PII · Live Tail · Tô màu│
│   Cài đặt│  │ id │ name      │ email    │  (Thanh công cụ của lưới)       │
│          │  ├────┼───────────┼──────────┤                                 │
│ Trình    │  │ 1  │ Nguyen A  │ a***@x   │                                 │
│ khám phá │  │ 2  │ Tran B    │ b***@y   │            ◂ Trang 1 ▸          │
│ ▾ Bảng   │  └────┴───────────┴──────────┘                                 │
│ ▾ View   │                                                                │
└──────────┴────────────────────────────────────────────────────────────────┘
```

| Khu vực | Chức năng chính |
|---|---|
| **Thanh bên (Sidebar)** | Chuyển đổi giữa danh sách **Kết nối**, tích hợp **Máy chủ MCP** và **Cài đặt**. |
| **Trình khám phá (Explorer)** | Cây phân cấp Bảng, View, Hàm, Trigger của cơ sở dữ liệu đang chọn. Chuột phải vào bất kỳ mục nào để thao tác nhanh. |
| **Thanh Tab (Tabs Rail)** | Mỗi tab là một Console SQL, một bảng dữ liệu, Visual Query Builder hoặc Notebook. Kéo thả để sắp xếp hoặc tách cửa sổ. |
| **Trình soạn thảo SQL** | Soạn thảo mã SQL với tô màu cú pháp, gợi ý tên bảng/cột tự động và phát hiện lỗi ngữ cảnh. |
| **Lưới dữ liệu (DataGrid)** | Hiển thị dữ liệu ảo hóa siêu mượt, hỗ trợ sửa ô, phân tích nhanh cột, lọc, sắp xếp, che mờ PII và xuất file. |

> [!TIP]
> **Phím tắt điều hướng nhanh:**
> - `Ctrl + P`: Mở **Điều hướng nhanh (Quick Navigator)** để nhảy ngay tới bảng, tab hoặc lệnh bằng cách gõ tên.
> - `Ctrl + B`: Bật/tắt thanh bên để mở rộng tối đa không gian làm việc.

---

## 2. Kết nối tới cơ sở dữ liệu

### 2.1 Các cách thêm kết nối nhanh nhất

```mermaid
flowchart TD
  S["Thêm kết nối"] --> T{"Bạn có dữ liệu gì?"}
  T -->|"Chuỗi URL"| C["Dán chuỗi kết nối"]
  T -->|"Thư mục code"| P["Mở từ thư mục dự án"]
  T -->|"App khác"| I["Nhập từ DBeaver / TablePlus"]
  T -->|"Nhập tay"| M["Điền form thông tin"]
  C --> OK["Lưu kết nối"]
  P --> OK
  I --> OK
  M --> OK
  OK --> U["Mở & duyệt ở thanh bên"]
```

1. **Dán chuỗi kết nối (Connection String):**
   - Dán thẳng chuỗi kết nối chuẩn như `postgres://user:pass@localhost:5432/my_db` hoặc `mysql://...` vào ô chuỗi kết nối, app sẽ tự động phân tích và điền toàn bộ thông tin.
2. **Mở từ thư mục dự án (Open Project Folder):**
   - Nhấn nút **Mở từ thư mục dự án** và chọn folder mã nguồn của bạn.
   - Tabularis tự động quét các file cấu hình quen thuộc: `.env`, `.env.local`, `docker-compose.yml`, `prisma/schema.prisma` và đề xuất cấu hình kết nối ngay lập tức.
3. **Nhập kết nối từ DBeaver hoặc TablePlus:**
   - Nhấn **Nhập kết nối** để import tự động danh sách các kết nối có sẵn từ DBeaver (`data-sources.json`) hoặc TablePlus.
4. **Quét Localhost:**
   - Tự động dò tìm các instance PostgreSQL / MySQL đang chạy ngầm trên máy cá nhân để kết nối 1-click.

### 2.2 Tùy chọn nâng cao khi tạo kết nối
- **SSL / TLS:** Hỗ trợ 5 chế độ: *Tắt / Ưu tiên / Bắt buộc / Xác minh CA / Xác minh danh tính* cùng tùy chọn chứng chỉ riêng.
- **SSH Bastion Tunnel:** Đi xuyên qua máy chủ trung gian an toàn nếu cơ sở dữ liệu nằm trong mạng riêng (VPC).
- **Kubernetes Port-Forward:** Kết nối trực tiếp vào pod database trong cụm K8s.
- **Giao diện & Cấp độ an toàn:** Đặt màu sắc, biểu tượng, gán **Môi trường** (*Production, Staging, Dev, Local*) và **Cấp độ Safe Mode** (*Strict, Alert, Silent, Read-Only*).

---

## 3. Viết và chạy truy vấn SQL

### 3.1 Thao tác soạn thảo & phím tắt
- **Mở Console mới:** Nhấn `Ctrl + T` khi đã chọn cơ sở dữ liệu.
- **Thực thi câu lệnh:**
  - `Ctrl + Enter`: Chạy câu lệnh SQL tại vị trí con trỏ (hoặc đoạn văn bản đang bôi đen).
  - `Ctrl + F5`: Chạy toàn bộ nội dung trong Console.
  - Khi có nhiều câu lệnh ngăn cách bởi dấu chấm phẩy `;`, mỗi câu lệnh sẽ xuất ra một tab kết quả riêng biệt.
- **Lịch sử truy vấn:** Nhấn `Ctrl + H` để tìm lại, chép lại hoặc chạy lại các câu lệnh trước đó.

### 3.2 Các tiện ích tăng tốc
- **Mẫu SQL dựng sẵn (Snippets):** Nhấn `Ctrl + J` để mở kho mẫu truy vấn (SELECT, JOIN, CTE, Window Function, CREATE TABLE...). Chọn *Điền tham số* để app hỗ trợ thay tên bảng/cột trước khi chèn vào code.
- **Truy vấn có tham số động:** Khai báo tham số dưới dạng `:ten_tham_so` (ví dụ `WHERE user_id = :id AND status = :status`). App sẽ tự động hiển thị popup nhập giá trị trước khi chạy.
- **Quản lý giao dịch (Transaction Control):** Trên thanh công cụ có nút gạt **Auto / Manual**:
  - Ở chế độ **Manual**: Nhấn *Bắt đầu* (BEGIN), kiểm tra kết quả, sau đó chủ động chọn *Commit* hoặc *Rollback*.
- **Visual Query Builder:** Kéo thả bảng vào khung canvas để tạo quan hệ JOIN và bộ lọc trực quan bằng chuột, app sẽ tự sinh mã SQL chuẩn xác.
- **Notebooks:** Trộn lẫn giữa các ô ghi chú Markdown và các ô truy vấn SQL, cho phép chia sẻ biến giữa các ô và vẽ biểu đồ phân tích.

---

## 4. Xem, phân tích và sửa dữ liệu trong bảng

Nhấp đúp chuột vào bất kỳ bảng nào ở thanh bên để mở giao diện lưới dữ liệu:

```mermaid
flowchart LR
  A["Sửa ô / Thêm dòng / Đánh dấu xóa"] --> B["Dữ liệu ở trạng thái CHỜ (Pending)<br/>Chưa ghi vào Database"]
  B --> C{"Xem lại thay đổi"}
  C -->|"Hủy"| D["Hoàn tác thay đổi"]
  C -->|"Đồng ý"| E["Nhấn Lưu: Ctrl + S"]
  E --> F["Gửi UPDATE / INSERT / DELETE an toàn"]
```

### 4.1 Tính năng phân tích dữ liệu trực quan (Mới)
- **Column Quick Statistics Popover:**
  - Nhấp chuột trái vào **Badge kiểu dữ liệu** (`INT`, `VARCHAR`, `TIMESTAMP`...) ở Header cột.
  - Hiển thị tức thì: Tổng dòng, % dữ liệu hợp lệ vs NULL, số giá trị độc nhất (**Distinct Count**), `Min / Max / Avg / Sum` (cho cột số), và **Top 3 giá trị phổ biến nhất** kèm thanh tỷ lệ % phân bổ.
  - Nút *Sao chép tóm tắt* 1-click dạng Markdown để gửi cho đồng đội.
- **Dải phân bổ Header (2.5px):** Một đường viền mỏng dưới chân Header biểu thị trực quan tỷ lệ dữ liệu hợp lệ (xanh) so với NULL (đỏ nhạt).
- **Thanh độ lớn ô số (Cell Data Bars):** Tự động vẽ thanh nền mờ biểu thị tỷ lệ `(value - min) / (max - min) * 100%`, giúp quét nhanh dữ liệu lớn/nhỏ mà không cần đọc từng con số.

### 4.2 Bảo vệ dữ liệu nhạy cảm (PII Masking Presets)
Bật nút **Che mờ PII** trên thanh công cụ khi cần chia sẻ màn hình hoặc quay video. Hỗ trợ **3 Profile** linh hoạt:
- **`Smart` (Khuyên dùng):** Che thông minh, giữ lại vài ký tự đầu và cuối để nhận diện định dạng (ví dụ `090****567`, `****-****-****-1234`). Áp dụng cho CCCD/CMND, Thẻ tín dụng, Tài khoản ngân hàng, Email, Số điện thoại, Lương, Secrets/API Keys.
- **`Full`:** Che phủ hoàn toàn chuỗi ký tự bằng `***`.
- **`Redacted`:** Hiển thị nhãn cố định `[REDACTED]`.
> *Lưu ý: Che mờ chỉ áp dụng trên tầng hiển thị, không làm thay đổi dữ liệu gốc trong database.*

### 4.3 Chỉnh sửa dữ liệu an toàn
- Nhấp đúp vào ô để sửa giá trị, nhấn nút *Thêm dòng*, hoặc chọn dòng rồi nhấn *Xóa*.
- Mọi thao tác đều nằm ở trạng thái **Chờ lưu (Pending Edits)** có viền màu đánh dấu. Bạn có thể tự do hoàn tác.
- Nhấn `Ctrl + S` để áp dụng các thay đổi xuống cơ sở dữ liệu.

### 4.4 Xuất dữ liệu (Export)
Nhấn nút **Xuất** để xuất kết quả ra **CSV**, **JSON** hoặc **Excel (.xlsx)**:
- Cơ chế stream trực tiếp ra file chống tràn RAM, có thanh tiến trình và nút hủy cho các bảng dữ liệu lớn hàng trăm ngàn dòng.

---

## 5. Chế độ an toàn (Safe Mode & Production Guard)

Tabularis cung cấp cơ chế bảo vệ nhiều lớp nhằm ngăn chặn rủi ro vô tình xóa nhầm hoặc cập nhật sai dữ liệu trên môi trường thật:

```mermaid
flowchart TD
  Q["Thực thi câu lệnh SQL"] --> L{"Cấp độ Safe Mode"}
  L -->|"Silent (Dev)"| R["Chạy ngay lập tức"]
  L -->|"Alert (Staging)"| D{"Lệnh nguy hiểm?<br/>DROP/TRUNCATE/UPDATE không WHERE"}
  D -->|"Không"| R
  D -->|"Có"| X["Hiển thị cảnh báo xác nhận"]
  L -->|"Strict Guard (Prod)"| W{"Lệnh ghi dữ liệu?<br/>INSERT/UPDATE/DELETE/DDL"}
  W -->|"Không (SELECT)"| R
  W -->|"Có"| X
  L -->|"Read-Only"| B{"Lệnh ghi dữ liệu?"}
  B -->|"Không"| R
  B -->|"Có"| N["Chặn hoàn toàn câu lệnh"]
  X -->|"Xác nhận"| R
  X -->|"Hủy bỏ"| S["Dừng câu lệnh"]
```

| Cấp độ | Hành vi chi tiết |
|---|---|
| **Silent** | Dành cho môi trường phát triển cục bộ (Local). Chạy mọi câu lệnh không cần hỏi. |
| **Alert** | Dành cho Staging. Tự động cảnh báo với các lệnh rủi ro cao: `DROP`, `TRUNCATE`, `DELETE` / `UPDATE` không có mệnh đề `WHERE`. |
| **Strict Guard** | Dành cho Production. Yêu cầu xác nhận trước **bất kỳ** lệnh ghi dữ liệu hoặc thay đổi cấu trúc nào. Hộp thoại có đếm ngược vài giây chống bấm nhầm. |
| **Read-Only** | Chặn đứng 100% mọi thao tác ghi dữ liệu. Lưới dữ liệu tự động khóa chức năng sửa. |

---

## 6. Tối ưu truy vấn chậm: Explain và gợi ý chỉ mục

- **Visual Explain:** Nhấn nút **Explain** trên thanh công cụ để xem kế hoạch thực thi dưới dạng cây trực quan. Bật tùy chọn *Analyze* để đo lường thời gian thực tế của từng node.
- **Index Advisor (Xác thực thực tế):**
  - Khi câu truy vấn chạy trên 500ms, hệ thống sẽ đề xuất tạo chỉ mục.
  - Sử dụng extension `hypopg` trên PostgreSQL để tạo **index giả định trong bộ nhớ**: Query planner thực tế của database sẽ tính toán lại chi phí trước và sau khi có index mà không cần ghi đĩa hay khóa bảng.
  - Sinh câu lệnh `CREATE INDEX` (kèm tùy chọn `CONCURRENTLY`) và mở sẵn trong Console để bạn duyệt lại trước khi quyết định chạy.

```mermaid
flowchart LR
  A["Truy vấn chạy chậm"] --> B["Dò tìm Seq Scan có bộ lọc"]
  B --> C["Đề xuất Index"]
  C --> D{"Có hypopg?"}
  D -->|"Có"| E["Planner tính chi phí với Index giả lập"]
  D -->|"Không"| F["Báo đề xuất chưa kiểm chứng"]
  E --> G["So sánh % chi phí trước/sau"]
  G --> H["Mở CREATE INDEX trong Editor để xem lại"]
  F --> H
```

---

## 7. Theo dõi dòng mới thời gian thực: Live Tail

Live Tail cho phép bạn theo dõi dữ liệu mới đang được ghi liên tục vào database (chu kỳ 2s, 5s, 10s hoặc 30s):

| Loại bảng | Cơ chế hoạt động |
|---|---|
| **Bảng có khóa chính kiểu số tăng dần** (`id`, `seq`...) | **Chế độ Keyset Probe siêu nhẹ:** Mỗi nhịp chỉ thăm dò `WHERE id > :last_id LIMIT 1`. Giảm **99% tải** cho database; chỉ khi có dòng mới lưới mới tải thêm. |
| **Bảng không có khóa số hoặc Console SQL** | Tự động fallback về chế độ so sánh kết quả định kỳ (Snapshot diff) kèm diff chính xác. |

- **Cơ chế Backoff thông minh:** Tự động giãn chu kỳ kiểm tra khi gặp lỗi và tự ngắt kết nối an toàn sau 5 lỗi liên tiếp. Tự động tạm dừng khi thu nhỏ cửa sổ.

---

## 8. So sánh dữ liệu giữa hai bảng (Data Compare & Sync)

Cho phép so sánh từng dòng dữ liệu giữa 2 bảng (ngay cả khi thuộc hai cơ sở dữ liệu khác nhau hoặc khác hệ quản trị) và tự động sinh mã đồng bộ:

```mermaid
flowchart TD
  A["Chuột phải vào bảng → So sánh dữ liệu..."] --> B["Chọn kết nối & bảng nguồn (Source)"]
  B --> C["Chọn kết nối & bảng đích (Target)"]
  C --> D["Xác nhận cột khóa (Khóa chính pre-selected)"]
  D --> E["Bấm So sánh"]
  E --> F["Phân loại: Giống nhau / Khác biệt / Chỉ có ở Nguồn / Chỉ có ở Đích"]
  F --> G["Sinh SQL Đồng bộ: INSERT, UPDATE, (DELETE tùy chọn)"]
  G --> H["Mở trong Editor để duyệt lại trước khi chạy"]
```

- **Quy tắc an toàn:**
  - Hỗ trợ so sánh cấu trúc JSON sâu, chuẩn hóa boolean `1/0`, `NULL = NULL`.
  - Lệnh `DELETE` (xóa dòng thừa ở đích) mặc định được tắt, chỉ bật khi bạn tích chọn.
  - Script SQL được mở trong Editor để bạn kiểm tra, app không bao giờ tự ý thực thi.

---

## 9. So sánh cấu trúc (Schema Diff) và Sơ đồ ER

- **Schema Diff:** Chuột phải vào cơ sở dữ liệu → chọn **So sánh cấu trúc cơ sở dữ liệu...** để phát hiện sự khác biệt về bảng, cột, kiểu dữ liệu, index, trigger giữa môi trường Dev và Production. Tự động xuất migration script.
- **Sơ đồ thực thể ER Diagram:** Nhấp vào nút **Sơ đồ ER** để xem biểu đồ quan hệ các bảng, tìm kiếm bảng nhanh và 1-click để nhảy tới dữ liệu của bảng tương ứng.

---

## 10. Chia sẻ cấu hình nhóm qua Git (Team Sync)

Thay vì gửi chuỗi kết nối hay file export qua chat thiếu an toàn, Tabularis hỗ trợ đồng bộ danh sách kết nối (không kèm mật khẩu trừ khi có passphrase) qua kho Git nội bộ của nhóm:

- **Git Engine an toàn:** Gọi lệnh Git với cờ `--ff-only`, không bao giờ tự ý merge hay ghi đè lịch sử của team.
- **Mã hóa chuẩn 2.0:** Sử dụng PBKDF2-SHA256 với **600.000 vòng lặp** và xác thực toàn vẹn `AES-GCM AAD`.
- **Thao tác đơn giản:** Chọn thư mục Git repo của dự án, xem trạng thái *Ahead / Behind*, nhấn *Pull & Preview* hoặc *Commit & Push*.

---

## 11. Các công cụ mở rộng

- **Tách cửa sổ (Detach Window):** Nhấp chuột phải vào Tab kết quả hoặc Tab Console → chọn *Tách thành cửa sổ riêng* để chuyển sang màn hình phụ thứ hai.
- **Chia đôi màn hình (Split View):** Chuột phải vào bảng → chọn *Mở bên phải* để xem và đối chiếu 2 bảng dữ liệu song song cạnh nhau.
- **Trình quản lý tác vụ (Task Manager):** Mở từ *Cài đặt → Thông tin → Quản lý tác vụ* để giám sát mức chiếm dụng bộ nhớ của app và các tiến trình plugin.

---

## 12. Kết nối trợ lý AI và Máy chủ MCP

Tabularis tích hợp sẵn giao thức **Model Context Protocol (MCP)**:

1. **Biến Tabularis thành MCP Server cho Claude Desktop / Cursor / Devin:**
   - Vào menu **Máy chủ MCP** ở thanh bên.
   - Chọn ứng dụng AI bạn dùng và nhấn **Cài cấu hình 1-click**.
   - Trợ lý AI của bạn giờ đây có thể đọc cấu trúc bảng và hỗ trợ viết query trực tiếp trên kết nối bạn đang mở trong Tabularis (có thể đặt chế độ Read-Only để bảo vệ an toàn).
2. **Khung Chat AI tích hợp:**
   - Cài đặt API key (OpenAI, Claude, Gemini hoặc Ollama local) tại *Cài đặt → AI*.
   - Khung chat bên cạnh Editor hỗ trợ giải thích câu truy vấn, chuyển đổi ngôn ngữ tự nhiên thành SQL và nút **"Hỏi AI sửa lỗi này"** khi câu lệnh gặp lỗi cú pháp.

---

## 13. Bảng phím tắt toàn tập

*(Phím tắt trên Windows / Linux. Trên macOS, thay thế phím `Ctrl` bằng `⌘ Cmd`)*

| Phím tắt | Tác vụ |
|---|---|
| `Ctrl + Enter` | Chạy câu lệnh SQL tại vị trí con trỏ (hoặc vùng bôi đen) |
| `Ctrl + F5` | Chạy toàn bộ mã trong Console |
| `Ctrl + T` | Mở Tab Console mới |
| `Ctrl + W` | Đóng tab hiện tại |
| `Ctrl + Shift + T` | Mở lại tab vừa đóng |
| `Ctrl + Tab` | Chuyển đổi giữa các tab đang mở |
| `Ctrl + J` | Mở thư viện mẫu SQL Snippets |
| `Ctrl + S` | Lưu các thay đổi dữ liệu đang chờ trong lưới |
| `Ctrl + →` / `Ctrl + ←` | Chuyển sang trang sau / trang trước |
| `Ctrl + P` | Mở thanh Điều hướng nhanh (Quick Navigator) |
| `Ctrl + B` | Ẩn / hiện thanh bên (Sidebar) |
| `Ctrl + H` | Xem lịch sử các câu lệnh SQL đã chạy |
| `Ctrl + Shift + N` | Mở hộp thoại Thêm kết nối mới |
| `Ctrl + Shift + C` | Mở danh sách quản lý Kết nối |
| `Ctrl + Shift + 1` ... `9` | Nhảy nhanh tới kết nối số 1 đến 9 |
| `Ctrl + Shift + Enter` | Chạy tất cả các ô trong Notebook |

---

## 14. Xử lý sự cố thường gặp (Troubleshooting)

| Hiện tượng | Nguyên nhân và cách xử lý nhanh |
|---|---|
| **Không kết nối được vào database** | Kiểm tra IP/Cổng/Tường lửa máy chủ. Thử đổi chế độ SSL sang *Ưu tiên* hoặc *Tắt*. Nếu database nằm trong mạng nội bộ, cấu hình tab **SSH**. |
| **Không sửa được ô dữ liệu trong bảng** | Bảng chưa có Khóa chính (Primary Key), hoặc kết quả `SELECT` không chứa cột khóa chính, hoặc kết nối đang bật chế độ **Read-Only**. |
| **Lệnh SQL bị chặn hoặc hiện cảnh báo** | Cơ chế **Safe Mode** đang bảo vệ môi trường Production/Staging. Điều chỉnh tại tab *Giao diện* của kết nối nếu bạn thực sự muốn chạy. |
| **Index Advisor không hiển thị số % giảm chi phí** | Database PostgreSQL của bạn chưa cài extension `hypopg`. Chạy `CREATE EXTENSION hypopg;` trên database để kích hoạt đo lường thực tế. |
| **Chữ tiếng Việt bị lỗi dấu trên Windows tiếng Nhật** | Phiên bản 0.13.28+ đã tự động ưu tiên phông chữ `Segoe UI` để khắc phục triệt để. Bạn cũng có thể chủ động chọn phông tại *Cài đặt → Giao diện*. |
| **So sánh dữ liệu không tạo được script** | Một trong hai bảng vượt quá giới hạn an toàn 20.000 dòng. Hãy dùng bộ lọc để thu hẹp phạm vi cần đồng bộ. |
