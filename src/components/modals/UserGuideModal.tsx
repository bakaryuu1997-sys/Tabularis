import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import clsx from "clsx";
import {
  X,
  BookOpen,
  Search,
  ExternalLink,
  Layout,
  Database,
  Terminal,
  Table,
  ShieldCheck,
  Zap,
  Activity,
  GitCompare,
  Network,
  GitBranch,
  Bot,
  Keyboard,
  HelpCircle,
  Copy,
  Check,
  ChevronRight,
  Rocket,
  ArrowRight,
  FolderOpen,
  BarChart3,
} from "lucide-react";
import { Modal } from "../ui/Modal";

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GuideSection {
  id: string;
  number: number;
  title: string;
  icon: typeof BookOpen;
  summary: string;
  keywords: string[];
  render: () => React.ReactNode;
}

type MainTab = "quickstart" | "protips" | "shortcuts" | "detailed";

export const UserGuideModal = ({ isOpen, onClose }: UserGuideModalProps) => {
  const { t } = useTranslation();
  const [activeMainTab, setActiveMainTab] = useState<MainTab>("quickstart");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("gui-ui-map");
  const [searchQuery, setSearchQuery] = useState("");
  const [hasCopiedLink, setHasCopiedLink] = useState(false);

  const sections: GuideSection[] = useMemo(
    () => [
      {
        id: "gui-ui-map",
        number: 1,
        title: "Làm quen với giao diện & Bản đồ điều hướng",
        icon: Layout,
        summary: "Bản đồ các khu vực làm việc chính và phím tắt điều hướng nhanh.",
        keywords: ["giao diện", "ui map", "khu vực", "quick navigator", "ctrl+p", "ctrl+b", "thanh bên"],
        render: () => (
          <div className="space-y-4 text-xs text-secondary leading-relaxed">
            <p>
              Tabularis được thiết kế tối giản, tập trung vào hiệu suất với các phân vùng làm việc rõ ràng:
            </p>
            <div className="bg-base border border-default rounded-xl p-3 font-mono text-[11px] text-primary whitespace-pre overflow-x-auto leading-normal">
{`┌──────────┬────────────────────────────────────────────────────────────────┐
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
└──────────┴────────────────────────────────────────────────────────────────┘`}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
              <div className="p-2.5 rounded-lg bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-primary block mb-1">Thanh bên (Sidebar)</span>
                Quản lý các kết nối, máy chủ MCP tích hợp cho AI và toàn bộ thiết lập hệ thống.
              </div>
              <div className="p-2.5 rounded-lg bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-primary block mb-1">Trình khám phá (Explorer)</span>
                Cây phân cấp bảng, view, hàm, trigger. Chuột phải để mở menu thao tác phong phú.
              </div>
              <div className="p-2.5 rounded-lg bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-primary block mb-1">Trình soạn thảo SQL</span>
                Tô màu cú pháp, gợi ý tên bảng/cột và phát hiện lỗi cú pháp tức thì.
              </div>
              <div className="p-2.5 rounded-lg bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-primary block mb-1">Lưới dữ liệu ảo hóa (DataGrid)</span>
                Xem, sắp xếp, lọc, sửa ô, che mờ PII và xuất dữ liệu hàng trăm ngàn dòng siêu tốc.
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "connect-db",
        number: 2,
        title: "Kết nối cơ sở dữ liệu (4 cách nhanh)",
        icon: Database,
        summary: "Dán chuỗi kết nối, mở từ thư mục dự án, nhập từ DBeaver / TablePlus hoặc quét localhost.",
        keywords: ["kết nối", "postgres", "mysql", "sqlite", "ssh", "import", "dbeaver", "tableplus", "project"],
        render: () => (
          <div className="space-y-3 text-xs text-secondary leading-relaxed">
            <div className="p-3 rounded-lg bg-surface-secondary/40 border border-default space-y-1">
              <span className="font-semibold text-primary block">1. Mở từ thư mục dự án (Khuyên dùng cho lập trình viên)</span>
              <p>
                Bấm nút <span className="font-semibold text-amber-400">📁 Mở từ thư mục dự án</span> trên thanh công cụ và trỏ tới thư mục code. Tabularis tự quét các file cấu hình như <code className="text-amber-300">.env</code>, <code className="text-amber-300">docker-compose.yml</code>, <code className="text-amber-300">prisma/schema.prisma</code> để tạo kết nối ngay lập tức.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-surface-secondary/40 border border-default space-y-1">
              <span className="font-semibold text-primary block">2. Nhập kết nối từ DBeaver / TablePlus</span>
              <p>
                Bấm nút <span className="font-semibold text-blue-400">Nhập kết nối</span> để import toàn bộ danh sách kết nối đã lưu từ DBeaver hoặc TablePlus sang Tabularis.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-surface-secondary/40 border border-default space-y-1">
              <span className="font-semibold text-primary block">3. Dán chuỗi kết nối (Connection String)</span>
              <p>
                Dán URL dạng <code className="text-emerald-300">postgres://user:pass@localhost:5432/db</code> hoặc <code className="text-emerald-300">mysql://...</code> vào ô nhập để hệ thống tự điền form.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-surface-secondary/40 border border-default space-y-1">
              <span className="font-semibold text-primary block">4. Tùy chọn nâng cao</span>
              <p>
                Hỗ trợ đầy đủ: SSH Bastion Tunnel (vượt tường lửa qua máy trung gian), SSL/TLS (5 chế độ bảo mật), và kết nối SQLite cục bộ.
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "sql-editor",
        number: 3,
        title: "Viết và chạy truy vấn SQL",
        icon: Terminal,
        summary: "Monaco Editor offline, phím tắt thực thi, phân tách nhiều câu lệnh và tham số hóa.",
        keywords: ["sql", "editor", "monaco", "ctrl+enter", "chạy truy vấn", "params", "transaction"],
        render: () => (
          <div className="space-y-3 text-xs text-secondary leading-relaxed">
            <p>
              Trình soạn thảo Monaco hoạt động 100% offline, hỗ trợ gợi ý bảng, cột, hàm và lịch sử truy vấn:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div className="p-2.5 rounded-lg bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-primary block mb-1">Chạy câu lệnh</span>
                Bấm <kbd className="px-1.5 py-0.5 rounded bg-surface border border-default text-primary font-mono text-[10px]">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 rounded bg-surface border border-default text-primary font-mono text-[10px]">Enter</kbd> để chạy câu lệnh tại vị trí con trỏ (hoặc khối văn bản đang bôi đen).
              </div>
              <div className="p-2.5 rounded-lg bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-primary block mb-1">Định dạng SQL (Format)</span>
                Bấm <kbd className="px-1.5 py-0.5 rounded bg-surface border border-default text-primary font-mono text-[10px]">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 rounded bg-surface border border-default text-primary font-mono text-[10px]">Shift</kbd> + <kbd className="px-1.5 py-0.5 rounded bg-surface border border-default text-primary font-mono text-[10px]">F</kbd> để căn lề SQL tự động.
              </div>
              <div className="p-2.5 rounded-lg bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-primary block mb-1">Mẫu SQL thông minh</span>
                Bấm nút <span className="text-blue-400 font-semibold">Mẫu SQL</span> để chèn nhanh các khung truy vấn mẫu: JOIN, GROUP BY, Transaction an toàn, Tạo Index.
              </div>
              <div className="p-2.5 rounded-lg bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-emerald-400 font-semibold">Xuất dữ liệu siêu tốc</span>
                Bấm <span className="text-emerald-400 font-semibold">Xuất dữ liệu</span> để tải kết quả về máy dạng Excel (.xlsx), CSV, hoặc JSON chỉ với 1 click.
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "datagrid-edit",
        number: 4,
        title: "Xem, phân tích và sửa dữ liệu trong bảng",
        icon: Table,
        summary: "Chỉnh sửa ô, che mờ PII, phân bố giá trị Data Bars, thống kê cột và xuất file.",
        keywords: ["datagrid", "sửa ô", "excel", "pii", "che mờ", "data bar", "thống kê", "xuất file"],
        render: () => (
          <div className="space-y-3 text-xs text-secondary leading-relaxed">
            <p>
              Lưới dữ liệu được ảo hóa hiệu năng cao, cho phép thao tác mượt mà với lượng dữ liệu lớn:
            </p>
            <div className="space-y-2">
              <div className="p-2.5 rounded-lg bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-primary block mb-1">Sửa dữ liệu trực tiếp (Inline Editing)</span>
                Nhấp đúp chuột vào bất kỳ ô nào (hoặc ấn <kbd className="px-1 py-0.5 rounded bg-surface border border-default text-primary font-mono text-[10px]">Enter</kbd>) để sửa giá trị. Ô đã sửa sẽ hiển thị viền vàng. Bấm nút <strong>Lưu thay đổi</strong> hoặc <kbd className="px-1 py-0.5 rounded bg-surface border border-default text-primary font-mono text-[10px]">Ctrl+S</kbd> để ghi vào CSDL.
              </div>
              <div className="p-2.5 rounded-lg bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-primary block mb-1">Che mờ dữ liệu nhạy cảm (PII Masking)</span>
                Bấm nút khiên trên thanh công cụ để bảo vệ dữ liệu khi chụp màn hình hoặc demo:
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-muted">
                  <li><strong>Thông minh:</strong> Giữ nguyên ký tự đầu/đuôi (vd: <code className="text-emerald-300">n***@domain.com</code>).</li>
                  <li><strong>Che toàn bộ:</strong> Thay toàn bộ thành dấu hoa thị (vd: <code className="text-emerald-300">••••••••</code>).</li>
                  <li><strong>Xóa hẳn:</strong> Thay bằng nhãn <code className="text-rose-400">[ĐÃ CHE GIẤU]</code>.</li>
                </ul>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-primary block mb-1">Thống kê nhanh cột dữ liệu (Quick Stats)</span>
                Click vào thẻ kiểu dữ liệu ở tiêu đề mỗi cột để xem popup thống kê: % NULL, số giá trị duy nhất (Distinct count), Min, Max, Avg.
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "safe-mode",
        number: 5,
        title: "Chế độ an toàn (Safe Mode & Production Guard)",
        icon: ShieldCheck,
        summary: "Ngăn chặn nhầm lẫn dữ liệu trên môi trường thật (Production / Staging).",
        keywords: ["safe mode", "production", "bảo vệ", "cảnh báo", "delete", "update", "bảo mật"],
        render: () => (
          <div className="space-y-3 text-xs text-secondary leading-relaxed">
            <p>
              Tabularis phân loại môi trường làm việc (Production, Staging, Development, Local) để ngăn ngừa thao tác nhầm lẫn tai hại:
            </p>
            <div className="space-y-2">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <span className="font-semibold text-emerald-400 block mb-0.5">Mức 1: Nhắc nhở (Gentle)</span>
                Hiển thị viền cảnh báo màu đỏ xung quanh cửa sổ khi đang thao tác trên database Production.
              </div>
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <span className="font-semibold text-amber-400 block mb-0.5">Mức 2: Xác nhận an toàn (Strict)</span>
                Yêu cầu bấm nút xác nhận khi chạy các câu lệnh thay đổi dữ liệu (<code className="text-amber-300">UPDATE</code>, <code className="text-amber-300">DELETE</code>, <code className="text-amber-300">DROP</code>).
              </div>
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <span className="font-semibold text-rose-400 block mb-0.5">Mức 3: Khóa chặt chẽ (Paranoid)</span>
                Bắt buộc người dùng phải gõ chính xác tên cơ sở dữ liệu trước khi thực thi lệnh nguy hiểm.
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "visual-explain",
        number: 6,
        title: "Tối ưu truy vấn chậm: Explain & Index Advisor",
        icon: Zap,
        summary: "Phân tích cây chi phí thực thi truy vấn trực quan và tự động đề xuất tạo chỉ mục.",
        keywords: ["explain", "analyze", "index advisor", "tối ưu", "seq scan", "truy vấn chậm"],
        render: () => (
          <div className="space-y-3 text-xs text-secondary leading-relaxed">
            <p>
              Không còn phải đọc các khối JSON Explain phức tạp. Tabularis trực quan hóa sơ đồ thực thi rõ ràng:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-muted">
              <li>
                <strong className="text-primary">Nút nghẽn hiệu năng (Bottlenecks):</strong> Tự động đánh dấu màu đỏ các node quét toàn bảng (Seq Scan) tốn nhiều thời gian nhất.
              </li>
              <li>
                <strong className="text-primary">Gợi ý chỉ mục thông minh (Index Advisor):</strong> Phân tích điều kiện WHERE/JOIN và tạo sẵn câu lệnh <code className="text-blue-300">CREATE INDEX</code> tối ưu chỉ cần 1 click để áp dụng.
              </li>
              <li>
                <strong className="text-primary">So sánh trước & sau (Diff):</strong> Lưu lại snapshot trước khi tạo Index để đối chiếu tỷ lệ tăng tốc.
              </li>
            </ul>
          </div>
        ),
      },
      {
        id: "live-tail",
        number: 7,
        title: "Theo dõi dòng mới thời gian thực: Live Tail",
        icon: Activity,
        summary: "Tự động cập nhật bảng khi có dữ liệu mới phát sinh (tương tự tail -f cho database).",
        keywords: ["live tail", "realtime", "theo dõi", "log", "dòng mới", "auto refresh"],
        render: () => (
          <div className="space-y-3 text-xs text-secondary leading-relaxed">
            <p>
              Rất thích hợp khi theo dõi đơn hàng mới, bảng nhật ký (audit log), hoặc tiến trình xử lý ngầm:
            </p>
            <div className="p-3 rounded-lg bg-surface-secondary/40 border border-default space-y-1.5">
              <span className="font-semibold text-primary block">Cách sử dụng:</span>
              <p>1. Mở bất kỳ bảng nào trong DataGrid.</p>
              <p>2. Bấm nút <span className="font-semibold text-purple-400">Live Tail</span> trên thanh công cụ.</p>
              <p>3. Chọn cột mốc (vd: <code className="text-purple-300">created_at</code> hoặc <code className="text-purple-300">id</code>) và tần suất quét (1s, 2s, 5s).</p>
              <p>4. Các dòng mới sinh sẽ tự động chèn vào đầu bảng với hiệu ứng sáng nổi bật.</p>
            </div>
          </div>
        ),
      },
      {
        id: "data-compare",
        number: 8,
        title: "So sánh dữ liệu giữa hai bảng (Data Compare & Sync)",
        icon: GitCompare,
        summary: "Đối soát sự khác biệt giữa hai bảng và tự động sinh mã SQL đồng bộ an toàn.",
        keywords: ["so sánh", "data compare", "sync", "đồng bộ", "đối soát", "lệch dữ liệu"],
        render: () => (
          <div className="space-y-3 text-xs text-secondary leading-relaxed">
            <p>
              Giải pháp hoàn hảo khi đối soát dữ liệu giữa môi trường Local và Staging:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-muted">
              <li>
                <strong className="text-primary">Đối soát 4 trạng thái:</strong> Hiển thị rõ dòng giống nhau, dòng chỉ có ở bảng nguồn, dòng chỉ có ở bảng đích, và dòng có giá trị bị thay đổi.
              </li>
              <li>
                <strong className="text-primary">Sinh kịch bản đồng bộ:</strong> Tự sinh khối lệnh <code className="text-blue-300">INSERT</code>, <code className="text-blue-300">UPDATE</code>, <code className="text-blue-300">DELETE</code> nằm gọn trong một Transaction an toàn (<code className="text-blue-300">BEGIN ... COMMIT</code>).
              </li>
            </ul>
          </div>
        ),
      },
      {
        id: "schema-diff",
        number: 9,
        title: "So sánh cấu trúc (Schema Diff) & Sơ đồ quan hệ ERD",
        icon: Network,
        summary: "So khớp cấu trúc bảng/cột giữa 2 database và trực quan hóa quan hệ khóa ngoại.",
        keywords: ["schema diff", "erd", "sơ đồ", "quan hệ", "foreign key", "cấu trúc"],
        render: () => (
          <div className="space-y-3 text-xs text-secondary leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div className="p-2.5 rounded-lg bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-primary block mb-1">So sánh cấu trúc (Schema Diff)</span>
                Phát hiện ngay cột bị thiếu, kiểu dữ liệu bị lệch, index chưa đồng bộ giữa hai database và sinh lệnh <code className="text-amber-300">ALTER TABLE</code> để bù đắp.
              </div>
              <div className="p-2.5 rounded-lg bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-primary block mb-1">Sơ đồ ERD tương tác</span>
                Xem trực quan toàn bộ sơ đồ bảng và các đường liên kết khóa ngoại. Hỗ trợ xuất ảnh PNG chất lượng cao để đính kèm tài liệu kỹ thuật.
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "team-sync",
        number: 10,
        title: "Chia sẻ cấu hình nhóm qua Git (Team Sync)",
        icon: GitBranch,
        summary: "Đồng bộ danh sách kết nối CSDL và các câu truy vấn mẫu an toàn qua Git repository.",
        keywords: ["team sync", "git", "đồng bộ nhóm", "chia sẻ", "bảo mật", "mật khẩu"],
        render: () => (
          <div className="space-y-3 text-xs text-secondary leading-relaxed">
            <p>
              Giúp cả đội ngũ phát triển dùng chung danh mục kết nối và kho truy vấn SQL chuẩn mực:
            </p>
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 space-y-1">
              <span className="font-semibold block">Tuyệt đối an toàn mật khẩu:</span>
              Mọi mật khẩu và khóa bí mật cá nhân đều được lọc sạch trước khi đẩy lên Git repo chung của nhóm. Mỗi thành viên sẽ nhập mật khẩu cục bộ của riêng mình.
            </div>
          </div>
        ),
      },
      {
        id: "mcp-server",
        number: 11,
        title: "Kết nối trợ lý AI và Máy chủ MCP",
        icon: Bot,
        summary: "Tích hợp giao thức Model Context Protocol để trợ lý AI (Claude, Antigravity) phân tích dữ liệu.",
        keywords: ["mcp", "ai", "claude code", "antigravity", "cursor", "trợ lý"],
        render: () => (
          <div className="space-y-3 text-xs text-secondary leading-relaxed">
            <p>
              Tabularis tích hợp sẵn máy chủ MCP chuẩn, cho phép các AI Agent kết nối an toàn để đọc cấu trúc và hỗ trợ viết SQL:
            </p>
            <div className="p-3 rounded-lg bg-surface-secondary/40 border border-default space-y-2">
              <span className="font-semibold text-primary block">Hàng rào an toàn 2 lớp:</span>
              <p>• Mặc định chế độ Chỉ đọc (Read-only): Trợ lý AI chỉ có quyền thực thi lệnh <code className="text-blue-300">SELECT</code>.</p>
              <p>• Phê duyệt từng thao tác ghi: Mọi truy vấn thay đổi dữ liệu phải được người dùng bấm "Đồng ý" trên app trước khi gửi tới database.</p>
            </div>
          </div>
        ),
      },
      {
        id: "shortcuts",
        number: 12,
        title: "Bảng phím tắt toàn tập",
        icon: Keyboard,
        summary: "Danh sách phím tắt hữu ích nhất để thao tác thần tốc không cần dùng chuột.",
        keywords: ["phím tắt", "shortcut", "hotkey", "ctrl", "alt", "enter"],
        render: () => (
          <div className="space-y-3 text-xs text-secondary leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="p-2 rounded bg-surface-secondary/40 border border-default flex justify-between items-center">
                <span>Chạy câu lệnh SQL</span>
                <kbd className="px-1.5 py-0.5 rounded bg-surface border border-default text-primary font-mono text-[10px]">Ctrl + Enter</kbd>
              </div>
              <div className="p-2 rounded bg-surface-secondary/40 border border-default flex justify-between items-center">
                <span>Mở tab SQL mới</span>
                <kbd className="px-1.5 py-0.5 rounded bg-surface border border-default text-primary font-mono text-[10px]">Ctrl + T</kbd>
              </div>
              <div className="p-2 rounded bg-surface-secondary/40 border border-default flex justify-between items-center">
                <span>Bộ tìm kiếm nhanh</span>
                <kbd className="px-1.5 py-0.5 rounded bg-surface border border-default text-primary font-mono text-[10px]">Ctrl + P</kbd>
              </div>
              <div className="p-2 rounded bg-surface-secondary/40 border border-default flex justify-between items-center">
                <span>Ẩn/Hiện thanh bên</span>
                <kbd className="px-1.5 py-0.5 rounded bg-surface border border-default text-primary font-mono text-[10px]">Ctrl + B</kbd>
              </div>
              <div className="p-2 rounded bg-surface-secondary/40 border border-default flex justify-between items-center">
                <span>Làm mới dữ liệu (Reload)</span>
                <kbd className="px-1.5 py-0.5 rounded bg-surface border border-default text-primary font-mono text-[10px]">F5</kbd>
              </div>
              <div className="p-2 rounded bg-surface-secondary/40 border border-default flex justify-between items-center">
                <span>Lưu ô dữ liệu vừa sửa</span>
                <kbd className="px-1.5 py-0.5 rounded bg-surface border border-default text-primary font-mono text-[10px]">Ctrl + S</kbd>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "troubleshoot",
        number: 13,
        title: "Xử lý sự cố thường gặp (Troubleshooting)",
        icon: HelpCircle,
        summary: "Các lỗi thường gặp khi kết nối CSDL và cách khắc phục nhanh.",
        keywords: ["lỗi", "sự cố", "troubleshooting", "không kết nối được", "password", "port"],
        render: () => (
          <div className="space-y-3 text-xs text-secondary leading-relaxed">
            <div className="space-y-2">
              <div className="p-2.5 rounded-lg bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-rose-400 block mb-0.5">Không kết nối được localhost</span>
                Kiểm tra service database (Postgres/MySQL) hoặc Docker container đã chạy chưa. Đảm bảo cổng (Port) không bị chặn bởi tường lửa.
              </div>
              <div className="p-2.5 rounded-lg bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-rose-400 block mb-0.5">Lỗi xác thực (Authentication Failed)</span>
                Kiểm tra lại tên đăng nhập, mật khẩu và quyền hạn của user trên database mục tiêu.
              </div>
              <div className="p-2.5 rounded-lg bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-rose-400 block mb-0.5">Lỗi SSH Tunnel</span>
                Đảm bảo máy chủ trung gian (Bastion host) cho phép port forwarding và file SSH Key chính xác.
              </div>
            </div>
          </div>
        ),
      },
    ],
    [],
  );

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    const q = searchQuery.toLowerCase();
    return sections.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.keywords.some((k) => k.toLowerCase().includes(q)),
    );
  }, [sections, searchQuery]);

  const activeSection = useMemo(() => {
    return sections.find((s) => s.id === selectedSectionId) || sections[0];
  }, [sections, selectedSectionId]);

  const handleCopyDocLink = async () => {
    try {
      await navigator.clipboard.writeText("https://github.com/bakaryuu1997-sys/Tabularis/blob/main/HUONG_DAN_SU_DUNG.md");
      setHasCopiedLink(true);
      setTimeout(() => setHasCopiedLink(false), 2500);
    } catch (e) {
      console.error("Failed to copy link:", e);
    }
  };

  const handleOpenGitHubDoc = async () => {
    try {
      await openUrl("https://github.com/bakaryuu1997-sys/Tabularis/blob/main/HUONG_DAN_SU_DUNG.md");
    } catch (e) {
      console.error("Failed to open external url:", e);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="w-[94vw] max-w-5xl h-[84vh] max-h-[820px] flex flex-col bg-surface border border-default rounded-2xl overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="px-6 py-3.5 bg-surface-secondary/80 border-b border-default flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-xs">
              <BookOpen size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-primary tracking-tight">
                  {t("userGuide.title", "Sổ tay Hướng dẫn Sử dụng Tabularis")}
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  v0.13.28+
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                {t("userGuide.subtitle", "Hướng dẫn nhanh các tính năng, phím tắt và thao tác chuẩn")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyDocLink}
              title="Sao chép liên kết tài liệu"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-secondary/70 hover:bg-surface-secondary text-secondary hover:text-primary border border-default transition-all"
            >
              {hasCopiedLink ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{hasCopiedLink ? "Đã chép link" : "Chép link"}</span>
            </button>

            <button
              onClick={handleOpenGitHubDoc}
              title="Xem trên GitHub (trình duyệt)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 border border-blue-500/30 transition-all"
            >
              <ExternalLink size={13} />
              <span>GitHub</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-muted hover:text-primary hover:bg-surface-secondary rounded-lg transition-colors ml-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-1.5 px-6 py-2.5 bg-base/50 border-b border-default shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveMainTab("quickstart")}
            className={clsx(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-semibold text-xs transition-all",
              activeMainTab === "quickstart"
                ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                : "text-secondary hover:text-primary hover:bg-surface-secondary/60",
            )}
          >
            <Rocket size={14} className={activeMainTab === "quickstart" ? "text-white" : "text-amber-400"} />
            <span>🚀 Bắt đầu nhanh (30s)</span>
          </button>

          <button
            onClick={() => setActiveMainTab("protips")}
            className={clsx(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-semibold text-xs transition-all",
              activeMainTab === "protips"
                ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                : "text-secondary hover:text-primary hover:bg-surface-secondary/60",
            )}
          >
            <Zap size={14} className={activeMainTab === "protips" ? "text-white" : "text-yellow-400"} />
            <span>⚡ 5 Mẹo hay nhất</span>
          </button>

          <button
            onClick={() => setActiveMainTab("shortcuts")}
            className={clsx(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-semibold text-xs transition-all",
              activeMainTab === "shortcuts"
                ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                : "text-secondary hover:text-primary hover:bg-surface-secondary/60",
            )}
          >
            <Keyboard size={14} className={activeMainTab === "shortcuts" ? "text-white" : "text-indigo-400"} />
            <span>⌨️ Bảng phím tắt</span>
          </button>

          <button
            onClick={() => setActiveMainTab("detailed")}
            className={clsx(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-semibold text-xs transition-all ml-auto",
              activeMainTab === "detailed"
                ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                : "text-secondary hover:text-primary hover:bg-surface-secondary/60",
            )}
          >
            <BookOpen size={14} className={activeMainTab === "detailed" ? "text-white" : "text-emerald-400"} />
            <span>📚 Tra cứu chi tiết (13 mục)</span>
          </button>
        </div>

        {/* Tab 1: Quickstart 30s */}
        {activeMainTab === "quickstart" && (
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 bg-elevated/20">
            {/* Hero Welcome */}
            <div className="text-center max-w-2xl mx-auto space-y-1.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Rocket size={13} />
                Bắt đầu siêu nhanh
              </span>
              <h3 className="text-xl font-bold text-primary tracking-tight">
                Làm chủ Tabularis chỉ trong 3 bước đơn giản
              </h3>
              <p className="text-xs text-muted">
                Bạn không cần đọc tài liệu dài dòng. Chỉ cần thực hiện 3 bước dưới đây để bắt đầu làm việc ngay:
              </p>
            </div>

            {/* 3 Step Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
              {/* Step 1 */}
              <div className="flex flex-col p-5 rounded-2xl bg-surface-secondary/60 border border-default hover:border-blue-500/40 transition-all shadow-sm group">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                    <FolderOpen size={20} />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    BƯỚC 1
                  </span>
                </div>
                <h4 className="text-sm font-bold text-primary mb-1.5">Kết nối CSDL (1 click)</h4>
                <p className="text-xs text-muted leading-relaxed mb-3">
                  Khởi tạo kết nối tới cơ sở dữ liệu của bạn bằng cách tiện nhất:
                </p>
                <div className="space-y-2 mt-auto text-xs text-secondary">
                  <div className="p-2.5 rounded-lg bg-base/60 border border-default">
                    <span className="font-semibold text-amber-300 block mb-0.5">📁 Mở từ thư mục code</span>
                    Bấm nút trên cùng, chọn folder dự án (.env, docker-compose). App tự quét và nạp kết nối ngay.
                  </div>
                  <div className="p-2.5 rounded-lg bg-base/60 border border-default">
                    <span className="font-semibold text-blue-300 block mb-0.5">➕ Dán URL kết nối</span>
                    Bấm "+ Thêm kết nối" và dán chuỗi URL dạng <code className="text-[11px] text-emerald-400 font-mono">postgres://...</code>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col p-5 rounded-2xl bg-surface-secondary/60 border border-default hover:border-emerald-500/40 transition-all shadow-sm group">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                    <Table size={20} />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    BƯỚC 2
                  </span>
                </div>
                <h4 className="text-sm font-bold text-primary mb-1.5">Xem & Sửa dữ liệu</h4>
                <p className="text-xs text-muted leading-relaxed mb-3">
                  Xem và chỉnh sửa trực tiếp các dòng dữ liệu không cần gõ SQL:
                </p>
                <div className="space-y-2 mt-auto text-xs text-secondary">
                  <div className="p-2.5 rounded-lg bg-base/60 border border-default">
                    <span className="font-semibold text-emerald-300 block mb-0.5">🖱️ Mở bảng dữ liệu</span>
                    Nhấp đúp vào bất kỳ bảng nào ở thanh bên trái để mở lưới dữ liệu siêu tốc.
                  </div>
                  <div className="p-2.5 rounded-lg bg-base/60 border border-default">
                    <span className="font-semibold text-teal-300 block mb-0.5">✏️ Sửa trực tiếp như Excel</span>
                    Nhấp đúp chuột vào ô để sửa giá trị, sau đó bấm <kbd className="px-1.5 py-0.5 rounded bg-surface border border-default text-primary font-mono text-[10px]">Ctrl + S</kbd> để lưu.
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col p-5 rounded-2xl bg-surface-secondary/60 border border-default hover:border-purple-500/40 transition-all shadow-sm group">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-105 transition-transform">
                    <Terminal size={20} />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    BƯỚC 3
                  </span>
                </div>
                <h4 className="text-sm font-bold text-primary mb-1.5">Viết & Chạy SQL</h4>
                <p className="text-xs text-muted leading-relaxed mb-3">
                  Trình soạn thảo code Monaco thông minh với gợi ý tự động:
                </p>
                <div className="space-y-2 mt-auto text-xs text-secondary">
                  <div className="p-2.5 rounded-lg bg-base/60 border border-default">
                    <span className="font-semibold text-purple-300 block mb-0.5">⌨️ Mở tab SQL mới</span>
                    Bấm phím <kbd className="px-1.5 py-0.5 rounded bg-surface border border-default text-primary font-mono text-[10px]">Ctrl + T</kbd> để mở màn hình viết truy vấn.
                  </div>
                  <div className="p-2.5 rounded-lg bg-base/60 border border-default">
                    <span className="font-semibold text-indigo-300 block mb-0.5">▶️ Chạy câu lệnh</span>
                    Gõ truy vấn và ấn <kbd className="px-1.5 py-0.5 rounded bg-surface border border-default text-primary font-mono text-[10px]">Ctrl + Enter</kbd>. Xuất kết quả ra Excel/CSV chỉ 1 click.
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Navigation Links */}
            <div className="max-w-5xl mx-auto pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl bg-base/40 border border-default text-xs">
              <span className="text-secondary font-medium">Bạn muốn khám phá thêm các tính năng nâng cao?</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveMainTab("protips")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold bg-surface-secondary hover:bg-surface-secondary/80 text-primary border border-default transition-all"
                >
                  <Zap size={13} className="text-yellow-400" />
                  <span>5 Mẹo hay nhất</span>
                  <ArrowRight size={12} className="text-muted" />
                </button>
                <button
                  onClick={() => setActiveMainTab("shortcuts")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold bg-surface-secondary hover:bg-surface-secondary/80 text-primary border border-default transition-all"
                >
                  <Keyboard size={13} className="text-indigo-400" />
                  <span>Bảng phím tắt</span>
                  <ArrowRight size={12} className="text-muted" />
                </button>
                <button
                  onClick={() => setActiveMainTab("detailed")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold bg-surface-secondary hover:bg-surface-secondary/80 text-primary border border-default transition-all"
                >
                  <BookOpen size={13} className="text-emerald-400" />
                  <span>Tra cứu 13 mục chi tiết</span>
                  <ArrowRight size={12} className="text-muted" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Pro Tips */}
        {activeMainTab === "protips" && (
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4 bg-elevated/20 max-w-4xl mx-auto w-full">
            <div className="border-b border-default pb-3">
              <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                <Zap size={18} className="text-yellow-400" />
                5 Mẹo hữu ích nâng cao hiệu suất làm việc
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Các tính năng độc đáo giúp bạn thao tác nhanh và an toàn hơn hẳn các công cụ CSDL truyền thống:
              </p>
            </div>

            <div className="space-y-3">
              {/* Tip 1 */}
              <div className="p-4 rounded-xl bg-surface-secondary/50 border border-default flex gap-3.5 items-start">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <ShieldCheck size={18} />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-primary">1. Che mờ dữ liệu nhạy cảm (PII Masking)</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Bảo mật khi Demo
                    </span>
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">
                    Bấm vào nút <strong className="text-emerald-400">🛡️ Che mờ PII</strong> trên thanh công cụ của bảng dữ liệu để tự động ẩn email, số điện thoại, thẻ ngân hàng khi demo màn hình hoặc chụp ảnh gửi cho khách hàng.
                  </p>
                </div>
              </div>

              {/* Tip 2 */}
              <div className="p-4 rounded-xl bg-surface-secondary/50 border border-default flex gap-3.5 items-start">
                <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                  <Zap size={18} />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-primary">2. Tối ưu câu SQL chậm với Index Advisor</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Tăng tốc truy vấn
                    </span>
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">
                    Khi viết câu lệnh trong SQL Editor, bấm nút mũi tên cạnh nút Chạy → chọn <strong className="text-amber-400">Explain & Tối ưu</strong>. Tabularis sẽ chỉ rõ node nào gây thắt cổ chai và sinh sẵn câu lệnh <code className="text-blue-300">CREATE INDEX</code> tối ưu.
                  </p>
                </div>
              </div>

              {/* Tip 3 */}
              <div className="p-4 rounded-xl bg-surface-secondary/50 border border-default flex gap-3.5 items-start">
                <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
                  <GitCompare size={18} />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-primary">3. Đối soát & Đồng bộ 2 bảng (Data Compare)</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      So sánh dữ liệu
                    </span>
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">
                    Chuột phải vào bất kỳ bảng nào trong cây bên trái → chọn <strong className="text-blue-400">So sánh dữ liệu</strong> để kiểm tra sự chênh lệch giữa hai môi trường (Local và Staging), tự sinh script INSERT/UPDATE/DELETE đồng bộ.
                  </p>
                </div>
              </div>

              {/* Tip 4 */}
              <div className="p-4 rounded-xl bg-surface-secondary/50 border border-default flex gap-3.5 items-start">
                <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0 mt-0.5">
                  <BarChart3 size={18} />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-primary">4. Thống kê nhanh dữ liệu cột (Column Quick Stats)</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      Xem phân bổ
                    </span>
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">
                    Click chuột vào huy hiệu kiểu dữ liệu (Badge) ở tiêu đề mỗi cột để xem ngay tỉ lệ % NULL, số giá trị phân biệt (Distinct count), giá trị Min/Max mà không cần viết câu lệnh COUNT(*) phức tạp.
                  </p>
                </div>
              </div>

              {/* Tip 5 */}
              <div className="p-4 rounded-xl bg-surface-secondary/50 border border-default flex gap-3.5 items-start">
                <div className="w-9 h-9 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0 mt-0.5">
                  <Activity size={18} />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-primary">5. Theo dõi dòng mới tức thời (Live Tail)</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      Thời gian thực
                    </span>
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">
                    Bật nút <strong className="text-rose-400">Live Tail</strong> trên bảng dữ liệu để xem các đơn hàng hoặc dòng log mới nhất tự động chèn vào đầu bảng theo thời gian thực (tương tự lệnh <code className="text-rose-300">tail -f</code>).
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Shortcuts */}
        {activeMainTab === "shortcuts" && (
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 bg-elevated/20 max-w-4xl mx-auto w-full">
            <div className="border-b border-default pb-3">
              <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                <Keyboard size={18} className="text-indigo-400" />
                Bảng phím tắt toàn năng
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Các tổ hợp phím thông dụng giúp bạn thao tác với cơ sở dữ liệu nhanh gấp 3 lần:
              </p>
            </div>

            {/* Shortcuts Sections */}
            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold text-primary uppercase tracking-wider block mb-2">
                  Soạn thảo & Chạy câu lệnh SQL
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-surface-secondary/50 border border-default flex items-center justify-between">
                    <span className="text-xs text-secondary">Chạy câu lệnh tại con trỏ</span>
                    <kbd className="px-2 py-1 rounded bg-base border border-default text-primary font-mono text-xs font-semibold shadow-xs">
                      Ctrl + Enter
                    </kbd>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-secondary/50 border border-default flex items-center justify-between">
                    <span className="text-xs text-secondary">Mở tab SQL mới</span>
                    <kbd className="px-2 py-1 rounded bg-base border border-default text-primary font-mono text-xs font-semibold shadow-xs">
                      Ctrl + T
                    </kbd>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-secondary/50 border border-default flex items-center justify-between">
                    <span className="text-xs text-secondary">Tìm kiếm văn bản trong editor</span>
                    <kbd className="px-2 py-1 rounded bg-base border border-default text-primary font-mono text-xs font-semibold shadow-xs">
                      Ctrl + F
                    </kbd>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-secondary/50 border border-default flex items-center justify-between">
                    <span className="text-xs text-secondary">Căn lề chuẩn SQL (Format)</span>
                    <kbd className="px-2 py-1 rounded bg-base border border-default text-primary font-mono text-xs font-semibold shadow-xs">
                      Ctrl + Shift + F
                    </kbd>
                  </div>
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-primary uppercase tracking-wider block mb-2">
                  Thao tác trên Bảng dữ liệu (DataGrid)
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-surface-secondary/50 border border-default flex items-center justify-between">
                    <span className="text-xs text-secondary">Lưu các ô vừa sửa vào CSDL</span>
                    <kbd className="px-2 py-1 rounded bg-base border border-default text-primary font-mono text-xs font-semibold shadow-xs">
                      Ctrl + S
                    </kbd>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-secondary/50 border border-default flex items-center justify-between">
                    <span className="text-xs text-secondary">Làm mới dữ liệu (Reload)</span>
                    <kbd className="px-2 py-1 rounded bg-base border border-default text-primary font-mono text-xs font-semibold shadow-xs">
                      F5
                    </kbd>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-secondary/50 border border-default flex items-center justify-between">
                    <span className="text-xs text-secondary">Bắt đầu sửa ô đang chọn</span>
                    <kbd className="px-2 py-1 rounded bg-base border border-default text-primary font-mono text-xs font-semibold shadow-xs">
                      Enter / Space
                    </kbd>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-secondary/50 border border-default flex items-center justify-between">
                    <span className="text-xs text-secondary">Đặt ô về giá trị NULL</span>
                    <kbd className="px-2 py-1 rounded bg-base border border-default text-primary font-mono text-xs font-semibold shadow-xs">
                      Delete
                    </kbd>
                  </div>
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-primary uppercase tracking-wider block mb-2">
                  Điều hướng chung trong ứng dụng
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-surface-secondary/50 border border-default flex items-center justify-between">
                    <span className="text-xs text-secondary">Mở bộ tìm nhanh bảng / kết nối</span>
                    <kbd className="px-2 py-1 rounded bg-base border border-default text-primary font-mono text-xs font-semibold shadow-xs">
                      Ctrl + P
                    </kbd>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-secondary/50 border border-default flex items-center justify-between">
                    <span className="text-xs text-secondary">Ẩn / Hiện thanh bên trái</span>
                    <kbd className="px-2 py-1 rounded bg-base border border-default text-primary font-mono text-xs font-semibold shadow-xs">
                      Ctrl + B
                    </kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Detailed (13 topics) */}
        {activeMainTab === "detailed" && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Navigation Bar */}
            <div className="w-72 bg-base/60 border-r border-default flex flex-col shrink-0">
              {/* Search Box */}
              <div className="p-3 border-b border-default">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    placeholder="Tìm chủ đề, phím tắt..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-input text-primary placeholder:text-muted pl-8 pr-3 py-1.5 text-xs rounded-lg border border-default focus:border-blue-500 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Section List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredSections.map((sec) => {
                  const IconComponent = sec.icon;
                  const isSelected = sec.id === selectedSectionId;
                  return (
                    <button
                      key={sec.id}
                      onClick={() => setSelectedSectionId(sec.id)}
                      className={clsx(
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all",
                        isSelected
                          ? "bg-blue-600 text-white font-semibold shadow-md shadow-blue-500/20"
                          : "text-secondary hover:text-primary hover:bg-surface-secondary/70",
                      )}
                    >
                      <IconComponent size={15} className={isSelected ? "text-white" : "text-muted shrink-0"} />
                      <span className="text-xs truncate flex-1">{sec.title}</span>
                      {isSelected && <ChevronRight size={13} className="shrink-0 text-white/80" />}
                    </button>
                  );
                })}
                {filteredSections.length === 0 && (
                  <div className="p-4 text-center text-xs text-muted">
                    Không tìm thấy mục nào khớp với "{searchQuery}"
                  </div>
                )}
              </div>
            </div>

            {/* Right Content Area */}
            <div className="flex-1 overflow-y-auto p-6 bg-elevated/40">
              {activeSection && (
                <div className="max-w-3xl space-y-4">
                  <div className="border-b border-default pb-3">
                    <div className="flex items-center gap-2 text-xs text-muted mb-1 font-mono">
                      <span>Mục {activeSection.number}</span>
                    </div>
                    <h3 className="text-lg font-bold text-primary tracking-tight flex items-center gap-2">
                      <activeSection.icon size={20} className="text-blue-400" />
                      {activeSection.title}
                    </h3>
                    <p className="text-xs text-muted mt-1">{activeSection.summary}</p>
                  </div>

                  <div className="pt-2">{activeSection.render()}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
