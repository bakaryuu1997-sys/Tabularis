# Hướng dẫn sử dụng Tabularis

> Tài liệu dành cho người dùng bản **0.13.28** (giao diện tiếng Việt, tiếng Anh và tiếng Nhật).
> Tabularis là ứng dụng desktop để xem, truy vấn và quản lý cơ sở dữ liệu: PostgreSQL, MySQL/MariaDB, SQLite
> và nhiều loại khác thông qua plugin.

## Mục lục

1. [Cài đặt và mở app lần đầu](#1-cài-đặt-và-mở-app-lần-đầu)
2. [Làm quen với giao diện](#2-làm-quen-với-giao-diện)
3. [Kết nối tới cơ sở dữ liệu](#3-kết-nối-tới-cơ-sở-dữ-liệu)
4. [Viết và chạy truy vấn SQL](#4-viết-và-chạy-truy-vấn-sql)
5. [Xem và sửa dữ liệu trong bảng](#5-xem-và-sửa-dữ-liệu-trong-bảng)
6. [Chế độ an toàn (Safe Mode) cho môi trường thật](#6-chế-độ-an-toàn-safe-mode-cho-môi-trường-thật)
7. [Tối ưu truy vấn chậm: Explain và gợi ý chỉ mục](#7-tối-ưu-truy-vấn-chậm-explain-và-gợi-ý-chỉ-mục)
8. [Theo dõi dòng mới: Live Tail](#8-theo-dõi-dòng-mới-live-tail)
9. [So sánh dữ liệu giữa hai bảng](#9-so-sánh-dữ-liệu-giữa-hai-bảng)
10. [So sánh cấu trúc hai cơ sở dữ liệu](#10-so-sánh-cấu-trúc-hai-cơ-sở-dữ-liệu)
11. [Chia sẻ cấu hình với nhóm qua Git](#11-chia-sẻ-cấu-hình-với-nhóm-qua-git)
12. [Các công cụ khác](#12-các-công-cụ-khác)
13. [Kết nối trợ lý AI (MCP)](#13-kết-nối-trợ-lý-ai-mcp)
14. [Cài đặt, ngôn ngữ và phím tắt](#14-cài-đặt-ngôn-ngữ-và-phím-tắt)
15. [Xử lý sự cố thường gặp](#15-xử-lý-sự-cố-thường-gặp)

---

## 1. Cài đặt và mở app lần đầu

**Windows**

1. Chạy file `tabularis_<phiên bản>_x64-setup.exe` (hoặc `setup.exe`) và làm theo trình cài đặt.
2. Mở **Tabularis** từ Start Menu.
3. Lần đầu, app mở màn hình **Kết nối** (danh sách trống).

**macOS / Linux** (nếu bạn dùng): xem mục *Installation* trong [README.md](README.md) (Homebrew, Snap, Flatpak, AppImage, AUR).

Dữ liệu của app (danh sách kết nối, truy vấn đã lưu, cài đặt) được lưu trong thư mục cấu hình của bạn
(`%APPDATA%\tabularis` trên Windows, `~/.config/tabularis` trên Linux). Mật khẩu kết nối có thể được lưu trong
kho khóa của hệ điều hành nếu bạn chọn như vậy khi tạo kết nối.

```mermaid
flowchart LR
  A[Cài đặt app] --> B[Mở Tabularis]
  B --> C[Thêm kết nối]
  C --> D[Duyệt bảng ở thanh bên]
  D --> E[Mở bảng để xem dữ liệu<br/>hoặc mở Console để viết SQL]
```

---

## 2. Làm quen với giao diện

Sơ đồ dưới đây là **bản đồ minh họa** (không phải ảnh chụp màn hình) để bạn biết mỗi khu vực nằm ở đâu.

```text
┌──────────┬────────────────────────────────────────────────────────────────┐
│ THANH    │  [Tab 1: Console] [Tab 2: customers] [Tab 3: Notebook]  [ + ]  │  ← thanh tab
│ BÊN      ├────────────────────────────────────────────────────────────────┤
│          │  Trình soạn thảo SQL                                           │
│ Kết nối  │  SELECT * FROM customers WHERE status = 'active';              │
│ ───────  │                                              [▶ Chạy] [Xuất ▾] │
│ ▸ Kết nối├────────────────────────────────────────────────────────────────┤
│   Máy chủ│  Kết quả / Lưới dữ liệu                                        │
│   MCP    │  ┌────┬───────────┬──────────┐  Che mờ PII · Live Tail · Tô màu│
│   Cài đặt│  │ id │ name      │ email    │  (thanh công cụ của lưới)       │
│          │  ├────┼───────────┼──────────┤                                 │
│ Trình    │  │ 1  │ Ann       │ a***@x   │                                 │
│ khám phá │  │ 2  │ Bob       │ b***@y   │            ◂ Trang 1 ▸          │
│ ▾ Bảng   │  └────┴───────────┴──────────┘                                 │
│ ▾ View   │                                                                │
└──────────┴────────────────────────────────────────────────────────────────┘
```

| Khu vực | Dùng để làm gì |
|---|---|
| **Thanh bên – Kết nối / Máy chủ MCP / Cài đặt** | Chuyển giữa danh sách kết nối, tích hợp AI và cài đặt. |
| **Thanh bên – Trình khám phá** | Cây bảng, view, hàm, trigger của kết nối đang mở. Chuột phải vào mục để xem các thao tác. |
| **Thanh tab** | Mỗi tab là một Console SQL, một bảng, một sơ đồ truy vấn trực quan hoặc một Notebook. |
| **Trình soạn thảo** | Viết SQL có tô màu cú pháp, gợi ý tên bảng/cột và báo lỗi tên bảng/cột không tồn tại. |
| **Lưới kết quả** | Xem, sắp xếp, lọc, sửa dữ liệu, che mờ dữ liệu nhạy cảm, xuất file. |

**Mẹo:** `Ctrl+P` mở **Điều hướng nhanh** để nhảy tới bảng, tab hoặc lệnh bằng cách gõ tên.
`Ctrl+B` ẩn/hiện thanh bên.

---

## 3. Kết nối tới cơ sở dữ liệu

### 3.1 Tạo kết nối mới

1. Vào **Kết nối** ở thanh bên, nhấn **Thêm kết nối** (hoặc `Ctrl+Shift+N`).
2. Chọn loại cơ sở dữ liệu (driver), nhập **máy chủ, cổng, tên đăng nhập, mật khẩu, database**.
3. Tùy chọn nâng cao (các tab trong hộp thoại):
   - **SSL/TLS**: chế độ *Tắt / Ưu tiên / Bắt buộc / Xác minh CA / Xác minh danh tính* và đường dẫn chứng chỉ (không bắt buộc).
   - **SSH**: đi qua máy trung gian (bastion) nếu database không mở ra ngoài.
   - **Kubernetes**: kết nối vào database trong cluster.
   - **Giao diện**: đặt màu, biểu tượng, **Môi trường** và **Cấp độ an toàn** (xem [mục 6](#6-chế-độ-an-toàn-safe-mode-cho-môi-trường-thật)).
4. Nhấn kiểm tra kết nối (nếu có) rồi **Lưu**.

### 3.2 Các cách nhanh hơn

- **Chuỗi kết nối**: dán thẳng `postgres://user:pass@host:5432/db` hoặc `mysql://...` vào ô *Chuỗi kết nối*.
- **Mở từ thư mục dự án**: chọn thư mục code của bạn; app tự dò cấu hình trong `.env`, `docker-compose.yml`
  hoặc `prisma/schema.prisma` và đề xuất các kết nối để thêm.
- **Nhập kết nối**: lấy kết nối từ Tabularis (file sao lưu), **DBeaver** hoặc **TablePlus**.
- **Quét localhost**: tìm MySQL/PostgreSQL đang chạy trên máy.

```mermaid
flowchart TD
  S[Thêm kết nối] --> T{Bạn có gì sẵn?}
  T -->|Thông tin từng ô| M[Điền thủ công]
  T -->|Chuỗi kết nối| C[Dán chuỗi kết nối]
  T -->|Thư mục dự án| P[Mở từ thư mục dự án]
  T -->|DBeaver / TablePlus| I[Nhập kết nối]
  M --> OK[Lưu kết nối]
  C --> OK
  P --> OK
  I --> OK
  OK --> U[Mở kết nối ở thanh bên]
```

### 3.3 Loại cơ sở dữ liệu hỗ trợ

PostgreSQL, MySQL/MariaDB và SQLite có sẵn. Các loại khác cài qua **Cài đặt → Plugin** (ví dụ DuckDB,
ClickHouse, Redis, MongoDB, Google Sheets, thư mục CSV…).

---

## 4. Viết và chạy truy vấn SQL

1. Mở một **Console mới** (`Ctrl+T`) khi đã chọn kết nối.
2. Gõ SQL. Trình soạn thảo gợi ý tên bảng/cột; gõ tắt như `sel`, `fullquery` rồi `Tab` để chèn mẫu.
3. Chạy:
   - `Ctrl+Enter`: chạy câu lệnh tại con trỏ (hoặc phần bạn bôi đen).
   - `Ctrl+F5`: chạy toàn bộ nội dung.
   - Có nhiều câu lệnh cách nhau bằng `;` thì mỗi câu cho ra một tab kết quả.
4. Xem lịch sử các câu đã chạy: nút **Lịch sử** hoặc `Ctrl+H`. Bạn có thể tìm kiếm, chép lại, chèn vào editor hoặc chạy lại ngay.

**Mẫu SQL dựng sẵn:** nhấn `Ctrl+J` để mở thư viện mẫu (SELECT, JOIN, INSERT, CTE, window function,
CREATE TABLE, giao dịch an toàn…). Chọn **Điền tham số** để thay tên bảng/cột rồi **Chèn vào code**.

**Truy vấn có tham số:** viết tham số dạng `:ten_tham_so` (ví dụ `WHERE id = :id`); app hỏi giá trị trước khi chạy.

**Lưu truy vấn:** dùng **Lưu truy vấn**; các truy vấn đã lưu xuất hiện ở thanh bên (*Truy vấn đã lưu*).

**Notebook:** tab Notebook trộn ô SQL và ô Markdown, truyền biến giữa các ô, vẽ biểu đồ và chạy tất cả bằng
`Ctrl+Shift+Enter`.

**Visual Query Builder:** kéo bảng vào khung thiết kế để nối JOIN và lọc bằng chuột, app sinh SQL cho bạn.

**Giao dịch thủ công:** thanh công cụ có chế độ **Auto / Manual**. Ở Manual, nhấn *Bắt đầu* (BEGIN), rồi
*Commit* hoặc *Rollback* khi xong.

---

## 5. Xem và sửa dữ liệu trong bảng

- **Mở bảng:** nhấp đúp vào bảng ở thanh bên. Lưới hiển thị dữ liệu theo trang (`Ctrl+→` / `Ctrl+←` để đổi trang).
- **Sắp xếp / lọc:** nhấn tiêu đề cột để sắp xếp; dùng thanh bộ lọc để lọc theo điều kiện.
- **Xem nhanh một cột:** nhấp vào tiêu đề để xem thống kê (số dòng hợp lệ, NULL, giá trị duy nhất, giá trị phổ biến nhất).
- **Xem nội dung dài / JSON:** mở trình kiểm tra ô để xem dạng văn bản, cây JSON hoặc hex, giải mã Base64/URL.
- **Nhảy theo khóa ngoại:** nhấp vào giá trị khóa ngoại để mở bản ghi liên quan.

### Sửa dữ liệu

```mermaid
flowchart LR
  A[Sửa ô / thêm dòng / đánh dấu xóa] --> B[Thay đổi nằm ở trạng thái CHỜ<br/>chưa ghi vào database]
  B --> C{Xem lại}
  C -->|Hủy| D[Hoàn tác thay đổi]
  C -->|Đồng ý| E[Lưu: Ctrl+S]
  E --> F[Gửi UPDATE / INSERT / DELETE]
```

- Bảng cần có **khóa chính** để sửa an toàn. Kết quả của câu `SELECT` phải chứa cột khóa chính thì mới sửa được.
- Mọi thay đổi chỉ được ghi khi bạn lưu (`Ctrl+S`). Bạn có thể nhân đôi dòng, đánh dấu xóa rồi hoàn tác.

### Che mờ dữ liệu nhạy cảm (PII)

Bật nút **Che mờ PII** trên thanh công cụ khi chia sẻ màn hình. App che email, số điện thoại, mật khẩu, token…
theo **tên cột** (có ba chế độ: Smart, Full, Redacted). Việc che chỉ áp dụng khi hiển thị; dữ liệu trong database
không đổi.

### Tô màu theo điều kiện

Nút **Tô màu** cho phép tạo quy tắc như "đơn hàng lỗi → nền đỏ" hoặc "số dư âm → ô đỏ".

### Xuất dữ liệu

Nút **Xuất** cho phép xuất kết quả ra **CSV**, **JSON** hoặc **Excel (.xlsx)**. CSV và JSON chạy lại câu truy vấn
và ghi trực tiếp ra file (phù hợp kết quả lớn, có thanh tiến trình và nút hủy).

---

## 6. Chế độ an toàn (Safe Mode) cho môi trường thật

Mỗi kết nối có hai thiết lập trong tab **Giao diện** của hộp thoại kết nối:

- **Môi trường (Production Guard):** Production, Staging, Development hoặc Local.
- **Cấp độ an toàn (Safe Mode):** quyết định app làm gì trước khi chạy lệnh ghi.

| Cấp độ | Hành vi |
|---|---|
| **Silent** | Không kiểm tra gì. |
| **Alert** | Hỏi xác nhận với lệnh nguy hiểm: `DROP`, `TRUNCATE`, `DELETE`/`UPDATE` không có `WHERE`. |
| **Strict Guard** | Hỏi xác nhận với **mọi** lệnh ghi hoặc thay đổi cấu trúc. |
| **Read-Only** | Chặn hoàn toàn lệnh ghi. |

Nếu bạn **không chọn** cấp độ, app dùng mặc định theo môi trường: **Production → Strict Guard**,
**Staging → Alert**, các môi trường còn lại → Silent. Với lệnh nguy hiểm trên production, hộp thoại cảnh báo có
đếm ngược vài giây trước khi cho phép xác nhận.

```mermaid
flowchart TD
  Q[Bạn chạy một câu SQL] --> L{Cấp độ của kết nối}
  L -->|Silent| R[Chạy ngay]
  L -->|Alert| D{Lệnh nguy hiểm?}
  D -->|Không| R
  D -->|Có| X[Hỏi xác nhận]
  L -->|Strict| W{Lệnh ghi?}
  W -->|Không| R
  W -->|Có| X
  L -->|Read-Only| B{Lệnh ghi?}
  B -->|Không| R
  B -->|Có| N[Bị chặn]
  X -->|Đồng ý| R
  X -->|Hủy| S[Không chạy]
```

**Khuyến nghị:** đặt mọi kết nối production ở mức **Strict Guard** hoặc **Read-Only**.

---

## 7. Tối ưu truy vấn chậm: Explain và gợi ý chỉ mục

- **Visual Explain:** chạy `EXPLAIN` và hiển thị kế hoạch thực thi dạng cây/bảng. Bật *Analyze* để đo thời gian thật
  (lưu ý: *Analyze* **thực sự chạy** câu lệnh).
- Khi một truy vấn chạy quá 500 ms, thanh công cụ hiện nút **Tối ưu**. Mở nó (hoặc tab **Plan Diff & Tư vấn chỉ mục**
  trong Visual Explain) để xem **Index Advisor**.

### Index Advisor hoạt động thế nào

1. App tìm các bước **quét toàn bộ bảng** có điều kiện lọc và đề xuất một chỉ mục (cột bằng đứng trước cột khoảng, tối đa 3 cột).
2. App hỏi **planner** của database "nếu có chỉ mục này thì kế hoạch ra sao?" bằng chỉ mục giả định.
   Không có chỉ mục nào được tạo và câu truy vấn không bị chạy.
3. Bạn thấy **chi phí trước/sau do planner tính**, và liệu planner có thật sự dùng chỉ mục đó hay không.
4. Câu `CREATE INDEX` được sinh ra để **mở trong tab editor** cho bạn xem lại. App **không tự chạy** nó.

```mermaid
flowchart LR
  A[Truy vấn chậm] --> B[Tìm bước quét toàn bảng]
  B --> C[Đề xuất chỉ mục]
  C --> D{Server có hypopg?}
  D -->|Có| E[Planner tính chi phí với chỉ mục giả định]
  D -->|Không| F[Hiện đề xuất, báo chưa kiểm chứng]
  E --> G[So sánh trước / sau]
  G --> H[Mở CREATE INDEX trong editor để xem lại]
  F --> H
```

**Yêu cầu để có con số kiểm chứng:** PostgreSQL có extension **`hypopg`**. Cài bằng `CREATE EXTENSION hypopg;`
(cần quyền phù hợp). Với driver khác hoặc khi chưa cài `hypopg`, app nói rõ là chưa kiểm chứng và **không hiện số**.
Trên bảng production lớn, hãy tạo chỉ mục bằng tùy chọn online/đồng thời của database (ví dụ `CREATE INDEX CONCURRENTLY` trên PostgreSQL) để tránh chặn ghi.

---

## 8. Theo dõi dòng mới: Live Tail

Nút **Live Tail** trên thanh công cụ của lưới cho phép theo dõi bảng đang được ghi dữ liệu, chu kỳ 2, 5, 10 hoặc 30 giây.

| Trường hợp | Cách hoạt động |
|---|---|
| **Tab bảng có đúng một khóa chính kiểu số nguyên** | Nhẹ: mỗi nhịp chỉ hỏi "có khóa nào lớn hơn khóa cuối cùng không?". Chỉ khi có dòng mới thì lưới mới tải lại. |
| **Các trường hợp còn lại** (Console, khóa kép, khóa không phải số) | Chạy lại truy vấn mỗi nhịp và so sánh kết quả. Nặng hơn với truy vấn lớn. |

- Số dòng mới hiện thành huy hiệu `+N` cạnh nút.
- **Chỉ phát hiện dòng thêm mới** ở chế độ nhẹ; sửa hoặc xóa dòng không được phát hiện.
- Biểu tượng đổi màu: xanh (đang chạy), vàng (tạm dừng, ví dụ cửa sổ bị ẩn hoặc tab đang tải), đỏ (đã dừng sau nhiều lỗi liên tiếp).
- Khi lỗi, app tăng dần khoảng chờ và tự dừng sau 5 lỗi liên tiếp.

---

## 9. So sánh dữ liệu giữa hai bảng

Dùng để biết hai bảng (cùng hoặc khác database, kể cả khác loại database) khác nhau ở những dòng nào, rồi tạo
script đưa bảng **đích** về giống bảng **nguồn**.

**Cách mở:** chuột phải vào một bảng ở thanh bên → **So sánh dữ liệu…**

```mermaid
flowchart TD
  A[Chọn Nguồn: kết nối + bảng] --> B[Chọn Đích: kết nối + bảng]
  B --> C[Kiểm tra cột khóa<br/>khóa chính được chọn sẵn]
  C --> D[Nhấn So sánh]
  D --> E[Xem kết quả:<br/>giống / chỉ ở nguồn / thay đổi / chỉ ở đích]
  E --> F[Tab Script đồng bộ]
  F --> G[Tùy chọn: bật xóa dòng chỉ có ở đích]
  G --> H[Chép SQL hoặc mở trong editor]
  H --> I[Bạn xem lại và tự chạy]
```

Quy tắc cần nhớ:

- **Cột khóa** quyết định hai dòng "là cùng một dòng". Có thể chọn nhiều cột (khóa kép).
- Kết quả có bốn nhóm: *Dòng giống nhau*, *Chỉ có ở nguồn* (sẽ INSERT), *Dòng thay đổi* (sẽ UPDATE, hiện từng cột cũ → mới), *Chỉ có ở đích* (có thể DELETE).
- **DELETE mặc định tắt.** Chỉ có khi bạn tích "Xóa cả các dòng chỉ có ở đích".
- App đọc tối đa **20.000 dòng mỗi bảng**. Nếu bảng lớn hơn, kết quả chỉ để xem và **không tạo script** vì dòng "thiếu" có thể chỉ là chưa đọc tới.
- Cột chỉ có ở một phía bị bỏ qua và được liệt kê. Khóa trùng được báo cho bạn.
- Script **không bao giờ tự chạy**. Hãy sao lưu bảng đích và chạy trong một giao dịch.

---

## 10. So sánh cấu trúc hai cơ sở dữ liệu

Chuột phải vào một database ở thanh bên → **So sánh cấu trúc CSDL (Schema Compare)**.
Chọn hai kết nối (và schema nếu cần), nhấn So sánh. Bạn thấy bảng giống nhau, chỉ có ở nguồn, chỉ có ở đích và
cột chênh lệch (thiếu, thừa, khác kiểu). Tab **Script Migration SQL** có sẵn câu lệnh để đồng bộ cấu trúc; bạn có thể
chép hoặc mở trong editor.

---

## 11. Chia sẻ cấu hình với nhóm qua Git

Cho phép cả nhóm dùng chung danh sách kết nối và truy vấn đã lưu thông qua một repo Git. Mở từ menu chuột phải →
**Đồng bộ Workspace nhóm (Git)**. Có ba tab: **Xuất**, **Nhập & hợp nhất** và **Git**.

### Quy trình đề xuất

```mermaid
sequenceDiagram
  participant A as Bạn (người chia sẻ)
  participant R as Repo Git của nhóm
  participant B as Đồng nghiệp
  A->>A: Tab Git: chọn thư mục repo (bản clone cục bộ)
  A->>A: Đặt master passphrase, bấm "Commit và push"
  A->>R: tabularis-workspace.json (đã mã hóa)
  B->>R: Bấm "Pull và xem trước" (chỉ fast-forward)
  R-->>B: tabularis-workspace.json
  B->>B: Tab Nhập: xem trước, chọn giữ bản hiện có hoặc ghi đè
  B->>B: Áp dụng đồng bộ
```

Điểm cần biết:

- App **chỉ đọc/ghi một file** `tabularis-workspace.json` trong repo bạn chọn và chạy `git` bằng tài khoản/cấu hình git của chính bạn.
  App không lưu hay hỏi mật khẩu Git.
- **Pull chỉ là fast-forward**: không tự merge, không viết lại lịch sử. Nếu nhánh bị phân kỳ, xử lý bằng git bên ngoài.
- **Mật khẩu kết nối chỉ được đưa vào file khi bạn đặt passphrase *và* tích "Kèm mật khẩu kết nối"**; khi đó file được mã hóa
  (AES-256-GCM, khóa dẫn xuất PBKDF2 600.000 vòng). Không có passphrase thì file là JSON thuần và **không có mật khẩu**.
- Tệp xuất có thứ tự ổn định (sắp xếp khóa) nên `git diff` chỉ hiện thay đổi thật. Hãy giữ passphrase ở nơi an toàn: mất passphrase thì không giải mã được.
- Khi nhập, bạn chọn **Bỏ qua các mục đã tồn tại** hoặc **Ghi đè bằng dữ liệu trong bundle**, và luôn có bước xem trước.

---

## 12. Các công cụ khác

| Công cụ | Cách mở | Dùng để |
|---|---|---|
| **Sinh dữ liệu mẫu (Mock Data)** | Chuột phải vào bảng | Tạo dòng dữ liệu giả theo tên và kiểu cột để thử nghiệm. |
| **Sơ đồ ER** | Menu chuột phải của database: **Xem sơ đồ ER** | Xem quan hệ giữa các bảng; xuất ảnh PNG hoặc SVG. |
| **Dump cơ sở dữ liệu / Chạy file SQL** | Chuột phải vào database | Xuất database ra file SQL (có tùy chọn kèm dữ liệu), hoặc chạy một file SQL vào database. |
| **Nhập từ Clipboard** | `Ctrl+Shift+V` | Dán bảng từ Excel/CSV để tạo bảng và nhập dữ liệu. |
| **Nhập từ file** | Nhập dữ liệu vào bảng | CSV, TSV, JSON, Markdown. |
| **Tab tách rời** | Nút *Cửa sổ riêng* | Đưa Console và kết quả ra một cửa sổ riêng, đặt sang màn hình thứ hai. |
| **Chia đôi màn hình** | Chuột phải vào bảng → *Mở bên phải* | Xem hai bảng/kết quả cạnh nhau. |
| **Quản lý tác vụ** | **Cài đặt → Thông tin → Mở Quản lý tác vụ** | Theo dõi tiến trình của app và các tiến trình plugin. |

---

## 13. Kết nối trợ lý AI (MCP)

**Máy chủ MCP** cho phép trợ lý AI như Claude Desktop hay Cursor đọc cấu trúc và chạy truy vấn **trên chính các kết nối trong Tabularis**.

1. Vào **Máy chủ MCP** ở thanh bên.
2. Chọn ứng dụng AI bạn dùng và nhấn **Cài cấu hình** (hoặc dùng *cấu hình thủ công* / *lệnh thủ công* nếu cài tự động không được).
3. Khởi động lại ứng dụng AI đó.
4. Theo dõi mọi thao tác của AI ở **Cài đặt → Hoạt động AI**. Các thao tác ghi có thể yêu cầu bạn **phê duyệt** trước khi chạy.

**Trò chuyện AI trong app:** vào **Cài đặt → AI**, chọn nhà cung cấp (dịch vụ trên mạng hoặc model chạy cục bộ như Ollama),
nhập khóa/địa chỉ, nhấn **Thử model** để kiểm tra. Sau đó dùng khung chat AI để hỏi, nhờ viết/tối ưu SQL, và dùng
nút **Hỏi AI sửa lỗi này** khi câu SQL báo lỗi.

> Nên dùng kết nối ở chế độ **Read-Only** khi cho AI truy cập dữ liệu thật.

---

## 14. Cài đặt, ngôn ngữ và phím tắt

Vào **Cài đặt** ở thanh bên. Các tab: **Chung**, **Plugin**, **Giao diện**, **Bản địa hóa**, **AI**, **Hoạt động AI**,
**Nhật ký**, **Phím tắt**, **Thông tin**.

- **Ngôn ngữ:** *Bản địa hóa* → chọn **English**, **日本語** hoặc **Tiếng Việt** (hoặc để tự nhận theo hệ thống).
- **Giao diện:** chọn chủ đề màu, phông chữ, cỡ chữ, màu theo kiểu dữ liệu.
- **Phím tắt:** xem và đổi phím ở tab *Phím tắt*.

### Phím tắt mặc định (Windows/Linux; trên macOS thay `Ctrl` bằng `⌘`)

| Phím | Chức năng |
|---|---|
| `Ctrl+Enter` | Chạy câu lệnh tại con trỏ / vùng chọn |
| `Ctrl+F5` | Chạy truy vấn |
| `Ctrl+T` | Tab mới |
| `Ctrl+W` | Đóng tab |
| `Ctrl+Shift+T` | Mở lại tab vừa đóng |
| `Ctrl+Tab` | Chuyển tab |
| `Ctrl+J` | Hiện mẫu SQL / snippets |
| `Ctrl+S` | Lưu thay đổi đang chờ trong lưới |
| `Ctrl+→` / `Ctrl+←` | Trang sau / trang trước |
| `Ctrl+C` | Sao chép vùng chọn |
| `Ctrl+B` | Bật/tắt thanh bên |
| `Ctrl+P` | Điều hướng nhanh |
| `Ctrl+Shift+C` | Mở danh sách kết nối |
| `Ctrl+Shift+N` | Kết nối mới |
| `Ctrl+Shift+1` … `9` | Chuyển tới kết nối thứ 1…9 |
| `Ctrl+Shift+V` | Nhập từ Clipboard |
| `Ctrl+Shift+Enter` | Chạy tất cả ô trong Notebook |

---

## 15. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân thường gặp và cách xử lý |
|---|---|
| Không kết nối được | Kiểm tra máy chủ/cổng/tường lửa; thử chế độ SSL khác; nếu database ở sau máy trung gian, bật tab **SSH**. |
| Mật khẩu không được lưu | Chọn lưu trong kho khóa của hệ điều hành ở hộp thoại kết nối; một số môi trường không có kho khóa. |
| Không sửa được ô trong lưới | Bảng không có khóa chính, hoặc kết quả `SELECT` thiếu cột khóa chính, hoặc kết nối đang ở **Read-Only**. |
| Lệnh bị chặn / hỏi xác nhận | Đó là **Safe Mode** của kết nối. Đổi ở tab *Giao diện* của kết nối nếu thật sự cần. |
| Gợi ý chỉ mục không có số liệu | Server chưa cài `hypopg` (chỉ PostgreSQL hỗ trợ). Xem [mục 7](#7-tối-ưu-truy-vấn-chậm-explain-và-gợi-ý-chỉ-mục). |
| Live Tail chạy nặng | Đang ở chế độ chạy lại truy vấn. Dùng tab bảng có một khóa chính kiểu số nguyên để dùng chế độ nhẹ. |
| So sánh dữ liệu không cho tạo script | Một trong hai bảng lớn hơn 20.000 dòng, nên chỉ đọc một phần. |
| Git Sync báo lỗi pull | Nhánh đã phân kỳ hoặc chưa có upstream; xử lý bằng `git` bên ngoài rồi thử lại. |
| Chữ tiếng Việt bị lệch dấu (ví dụ "kết nối" bị tách dấu) | Đã khắc phục từ bản 0.13.28 bằng cách ưu tiên phông có đủ tiếng Việt. Nếu còn gặp, đặt phông ở **Cài đặt → Giao diện** thành một phông có đủ tiếng Việt như Segoe UI hoặc Arial. |
| App chạy chậm khi bảng rất lớn | Dùng phân trang/bộ lọc; với kết quả lớn hãy **Xuất** ra file thay vì xem hết trên lưới. |

**Cần thêm trợ giúp?** Xem [README.md](README.md) và [CONTRIBUTING.md](CONTRIBUTING.md), hoặc mở issue trên
GitHub của dự án.
