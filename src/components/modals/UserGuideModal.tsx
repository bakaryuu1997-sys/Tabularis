import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
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
  Maximize2,
  Bot,
  Keyboard,
  HelpCircle,
  Copy,
  Check,
  ChevronRight,
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

export const UserGuideModal = ({ isOpen, onClose }: UserGuideModalProps) => {
  const { t } = useTranslation();
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
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-blue-300">
              <span className="font-semibold">Mẹo tăng tốc:</span> Nhấn <kbd className="px-1.5 py-0.5 rounded bg-blue-500/20 text-white font-mono">Ctrl + P</kbd> để mở thanh <strong>Điều hướng nhanh (Quick Navigator)</strong> nhảy ngay tới bảng hoặc lệnh; nhấn <kbd className="px-1.5 py-0.5 rounded bg-blue-500/20 text-white font-mono">Ctrl + B</kbd> để ẩn/hiện thanh bên.
            </div>
          </div>
        ),
      },
      {
        id: "gui-connection",
        number: 2,
        title: "Kết nối cơ sở dữ liệu (4 cách nhanh)",
        icon: Database,
        summary: "Dán chuỗi kết nối, mở từ thư mục dự án, nhập từ DBeaver / TablePlus hoặc quét localhost.",
        keywords: ["kết nối", "connection", "project folder", "dbeaver", "tableplus", "ssh", "ssl", "env", "docker"],
        render: () => (
          <div className="space-y-4 text-xs text-secondary leading-relaxed">
            <p>Tabularis hỗ trợ nhiều cách khởi tạo kết nối cực kỳ tiện lợi:</p>
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default">
                <h4 className="font-semibold text-primary text-sm mb-1 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs">1</span>
                  Mở từ thư mục dự án (Open Project Folder)
                </h4>
                <p>
                  Nhấn nút <strong>📁 Mở từ thư mục dự án</strong> trên thanh công cụ và trỏ tới thư mục code của bạn. Tabularis tự động quét các file cấu hình quen thuộc: <code className="text-amber-400">.env</code>, <code className="text-amber-400">docker-compose.yml</code>, <code className="text-amber-400">prisma/schema.prisma</code> để phát hiện và nạp kết nối chỉ với 1 cú nhấp chuột.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default">
                <h4 className="font-semibold text-primary text-sm mb-1 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs">2</span>
                  Nhập kết nối từ DBeaver / TablePlus
                </h4>
                <p>
                  Nhấn <strong>Nhập kết nối</strong> để import toàn bộ hồ sơ kết nối đã cấu hình từ DBeaver (<code className="text-blue-400">data-sources.json</code>) hoặc TablePlus mà không cần gõ lại máy chủ hay tài khoản.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default">
                <h4 className="font-semibold text-primary text-sm mb-1 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs">3</span>
                  Dán chuỗi kết nối (Connection String URL)
                </h4>
                <p>
                  Dán chuỗi dạng <code className="text-emerald-400">postgres://user:pass@localhost:5432/my_db</code> hoặc <code className="text-emerald-400">mysql://...</code> vào ô nhập chuỗi kết nối để hệ thống tự động điền các trường.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default">
                <h4 className="font-semibold text-primary text-sm mb-1 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs">4</span>
                  Điền form thủ công & Tùy chọn nâng cao
                </h4>
                <p>
                  Hỗ trợ đầy đủ: <strong>SSH Bastion Tunnel</strong> (vượt tường lửa qua máy trung gian), <strong>SSL/TLS</strong> (5 chế độ bảo mật), và <strong>Kubernetes Port-Forward</strong>.
                </p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "gui-sql-console",
        number: 3,
        title: "Viết và chạy truy vấn SQL",
        icon: Terminal,
        summary: "Gợi ý mã, phím tắt Ctrl+Enter, thư viện snippets Ctrl+J, tham số động và quản lý giao dịch.",
        keywords: ["sql", "console", "truy vấn", "ctrl+enter", "ctrl+j", "snippets", "transaction", "visual builder"],
        render: () => (
          <div className="space-y-4 text-xs text-secondary leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default space-y-1.5">
                <span className="font-semibold text-primary block">Thực thi truy vấn</span>
                <p>• <kbd className="px-1.5 py-0.5 rounded bg-surface-secondary text-primary font-mono">Ctrl + Enter</kbd>: Chạy câu lệnh tại vị trí con trỏ hoặc đoạn văn bản bôi đen.</p>
                <p>• <kbd className="px-1.5 py-0.5 rounded bg-surface-secondary text-primary font-mono">Ctrl + F5</kbd>: Chạy toàn bộ file trong Console.</p>
                <p>• Nhiều câu lệnh ngăn cách bởi dấu <code className="text-blue-400">;</code> sẽ sinh ra các tab kết quả độc lập.</p>
              </div>
              <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default space-y-1.5">
                <span className="font-semibold text-primary block">Kho mẫu SQL Snippets</span>
                <p>Nhấn <kbd className="px-1.5 py-0.5 rounded bg-surface-secondary text-primary font-mono">Ctrl + J</kbd> để mở kho mẫu câu lệnh phong phú (SELECT, JOIN, Window Function, CREATE TABLE...). Chọn <em>Điền tham số</em> để thay tên cột/bảng trước khi chèn.</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default space-y-2">
              <span className="font-semibold text-primary block">Truy vấn có tham số động</span>
              <p>
                Viết tham số dạng <code className="text-amber-400">:ten_bien</code> (ví dụ: <code className="text-primary font-mono">WHERE id = :user_id AND status = :status</code>). Trước khi thực thi, Tabularis sẽ hiển thị form trực quan để bạn điền giá trị an toàn.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default space-y-2">
              <span className="font-semibold text-primary block">Quản lý giao dịch (Transaction Control)</span>
              <p>
                Công tắc <strong>Auto / Manual</strong> trên thanh công cụ: Ở chế độ Manual, nhấn <em>Bắt đầu</em> (BEGIN) để mở giao dịch, kiểm tra kết quả rồi mới quyết định <em>Commit</em> hoặc <em>Rollback</em> an toàn.
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "gui-datagrid",
        number: 4,
        title: "Xem, phân tích và sửa dữ liệu trong bảng",
        icon: Table,
        summary: "Quick Stats khi click header badge, Cell Data Bars, che mờ PII 3 profile, sửa ô an toàn và xuất file.",
        keywords: ["datagrid", "lưới", "quick stats", "data bars", "pii", "sửa ô", "ctrl+s", "export", "excel", "csv"],
        render: () => (
          <div className="space-y-4 text-xs text-secondary leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default space-y-1.5">
                <span className="font-semibold text-primary block flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Column Quick Stats Popover
                </span>
                <p>
                  Nhấp chuột vào <strong>Badge kiểu dữ liệu</strong> (<code className="text-blue-400">INT</code>, <code className="text-amber-400">VARCHAR</code>...) ở Header cột để xem thống kê nhanh: Min, Max, Trung bình (Avg), Tổng (Sum), % NULL, Distinct count và Top 3 giá trị xuất hiện nhiều nhất.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default space-y-1.5">
                <span className="font-semibold text-primary block flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  Dải Header & Cell Data Bars
                </span>
                <p>
                  Dải viền 2.5px dưới chân Header biểu thị tỷ lệ dữ liệu hợp lệ (xanh) vs NULL (đỏ). Các cột số hiển thị thanh nền phân bổ mờ trực quan theo tỷ lệ độ lớn <code className="text-primary font-mono">(val - min) / (max - min)</code>.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default space-y-2">
              <span className="font-semibold text-primary block">Che mờ dữ liệu nhạy cảm (PII Masking Presets)</span>
              <p>
                Bật nút <strong>Che mờ PII</strong> khi chia sẻ màn hình. Hỗ trợ 3 Profile linh hoạt:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong className="text-primary">Smart:</strong> Che thông minh, giữ lại đầu/cuối để nhận diện (ví dụ: <code className="text-emerald-400">090****567</code>, <code className="text-emerald-400">****-****-****-1234</code>). Áp dụng cho CCCD, thẻ ngân hàng, email, số điện thoại, lương, API keys.</li>
                <li><strong className="text-primary">Full:</strong> Che phủ hoàn toàn chuỗi ký tự bằng <code className="text-muted">***</code>.</li>
                <li><strong className="text-primary">Redacted:</strong> Hiển thị nhãn cố định <code className="text-muted">[REDACTED]</code>.</li>
              </ul>
            </div>

            <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default space-y-2">
              <span className="font-semibold text-primary block">Quy trình chỉnh sửa dữ liệu</span>
              <p>
                Nhấp đúp vào ô để sửa giá trị hoặc thêm/xóa dòng. Mọi thay đổi đều nằm ở trạng thái <strong>Chờ lưu (Pending)</strong> có viền màu đánh dấu. Nhấn <kbd className="px-1.5 py-0.5 rounded bg-surface-secondary text-primary font-mono">Ctrl + S</kbd> để ghi xuống database hoặc hoàn tác bất cứ lúc nào.
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "gui-safemode",
        number: 5,
        title: "Chế độ an toàn (Safe Mode & Production Guard)",
        icon: ShieldCheck,
        summary: "Bảo vệ nhiều lớp chống rủi ro ghi đè hay xóa nhầm dữ liệu môi trường thật.",
        keywords: ["safe mode", "production guard", "bảo vệ", "read-only", "strict", "alert", "silent"],
        render: () => (
          <div className="space-y-4 text-xs text-secondary leading-relaxed">
            <p>
              Mỗi kết nối có thể gán nhãn môi trường (*Production, Staging, Dev, Local*) và cấp độ Safe Mode:
            </p>
            <div className="overflow-x-auto border border-default rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-secondary/60 text-primary border-b border-default font-semibold">
                    <th className="p-2.5">Cấp độ</th>
                    <th className="p-2.5">Hành vi bảo vệ</th>
                    <th className="p-2.5">Môi trường khuyến nghị</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default">
                  <tr>
                    <td className="p-2.5 font-semibold text-emerald-400">Silent</td>
                    <td className="p-2.5">Chạy ngay lập tức mọi câu lệnh, không cảnh báo.</td>
                    <td className="p-2.5">Development, Local</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold text-amber-400">Alert</td>
                    <td className="p-2.5">Cảnh báo với lệnh nguy hiểm: DROP, TRUNCATE, UPDATE/DELETE không WHERE.</td>
                    <td className="p-2.5">Staging, Test</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold text-orange-400">Strict Guard</td>
                    <td className="p-2.5">Bắt buộc xác nhận trước BẤT KỲ lệnh ghi nào. Hộp thoại có đếm ngược chống bấm nhầm.</td>
                    <td className="p-2.5">Production</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold text-red-400">Read-Only</td>
                    <td className="p-2.5">Khóa hoàn toàn 100% quyền ghi. Lưới dữ liệu tự động khóa sửa.</td>
                    <td className="p-2.5">Production kiểm toán, AI MCP</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ),
      },
      {
        id: "gui-explain",
        number: 6,
        title: "Tối ưu truy vấn chậm: Explain & Index Advisor",
        icon: Zap,
        summary: "Phân tích kế hoạch Visual Explain và đo lường chỉ mục giả lập trong bộ nhớ với hypopg.",
        keywords: ["explain", "analyze", "index advisor", "hypopg", "tối ưu", "chỉ mục", "truy vấn chậm"],
        render: () => (
          <div className="space-y-4 text-xs text-secondary leading-relaxed">
            <div className="space-y-2">
              <h4 className="font-semibold text-primary">Visual Explain</h4>
              <p>
                Nhấn nút <strong>Explain</strong> trên thanh công cụ để xem cây kế hoạch thực thi trực quan. Bật tùy chọn <em>Analyze</em> để đo lường thời gian thực của từng node (lưu ý: Analyze sẽ thực sự chạy câu lệnh).
              </p>
            </div>
            <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default space-y-2">
              <h4 className="font-semibold text-primary">Index Advisor (Đo lường kế hoạch thực tế)</h4>
              <p>
                Khi truy vấn chạy quá 500ms, hệ thống tự động dò tìm các bước quét toàn bảng (Seq Scan) và đề xuất chỉ mục phù hợp.
              </p>
              <p>
                Trên PostgreSQL, app sử dụng extension <code className="text-amber-400">hypopg</code> để tạo <strong>chỉ mục giả lập trong bộ nhớ</strong>. Query planner của database sẽ tính toán lại chi phí trước và sau khi có index mà không cần ghi đĩa hay khóa bảng vật lý. Câu lệnh <code className="text-emerald-400">CREATE INDEX CONCURRENTLY</code> được mở trong Console để dev duyệt.
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "gui-livetail",
        number: 7,
        title: "Theo dõi dòng mới thời gian thực: Live Tail",
        icon: Activity,
        summary: "Keyset probe siêu nhẹ giảm 99% tải cho database và tự động giãn chu kỳ Backoff.",
        keywords: ["live tail", "realtime", "theo dõi", "keyset", "stream", "log"],
        render: () => (
          <div className="space-y-4 text-xs text-secondary leading-relaxed">
            <p>
              Nhấn nút <strong>Live Tail</strong> trên thanh công cụ của lưới dữ liệu để bật chế độ theo dõi dữ liệu mới ghi vào bảng (chu kỳ 2s, 5s, 10s hoặc 30s):
            </p>
            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-primary block mb-1">Bảng có khóa chính kiểu số (id, seq...)</span>
                Áp dụng cơ chế <strong>Keyset Probe siêu nhẹ:</strong> Mỗi nhịp chỉ thăm dò <code className="text-blue-400">WHERE id &gt; :last_id LIMIT 1</code>, giảm 99% tài nguyên database. Chỉ khi có dòng mới lưới mới thực sự tải thêm.
              </div>
              <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-primary block mb-1">Cơ chế Backoff tự ngắt thông minh</span>
                Tự động giãn chu kỳ khi gặp lỗi, tự ngắt sau 5 lần lỗi liên tiếp để bảo vệ kết nối, và tự động tạm dừng khi thu nhỏ cửa sổ.
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "gui-datacompare",
        number: 8,
        title: "So sánh dữ liệu giữa hai bảng (Data Compare & Sync)",
        icon: GitCompare,
        summary: "So sánh dòng-từng-dòng giữa 2 bảng (ngay cả khác kết nối) và sinh script đồng bộ SQL.",
        keywords: ["so sánh", "data compare", "đồng bộ", "sync script", "insert", "update", "delete"],
        render: () => (
          <div className="space-y-4 text-xs text-secondary leading-relaxed">
            <p>
              Chuột phải vào bất kỳ bảng nào ở thanh bên → chọn <strong>So sánh dữ liệu...</strong>
            </p>
            <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default space-y-2">
              <span className="font-semibold text-primary block">Quy trình thực hiện:</span>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Chọn bảng Nguồn (Source) và bảng Đích (Target) - có thể thuộc 2 kết nối/database khác nhau.</li>
                <li>Xác nhận cột khóa (Primary Key được chọn sẵn hoặc chọn khóa tổ hợp).</li>
                <li>Bấm <strong>So sánh</strong> để xem báo cáo 4 nhóm: <em>Dòng giống nhau, Dòng thay đổi, Dòng chỉ có ở Nguồn (cần INSERT), Dòng chỉ có ở Đích (cần DELETE)</em>.</li>
                <li>Vào tab <strong>Script đồng bộ</strong>: Nhận script SQL đã được format chuẩn xác và mở trong Editor để bạn tự kiểm tra trước khi chạy.</li>
              </ol>
            </div>
          </div>
        ),
      },
      {
        id: "gui-schema",
        number: 9,
        title: "So sánh cấu trúc (Schema Diff) & Sơ đồ ER",
        icon: Network,
        summary: "So sánh cấu trúc bảng, cột, khóa, index giữa 2 DB và sơ đồ quan hệ ER Diagram.",
        keywords: ["schema diff", "sơ đồ er", "erd", "quan hệ", "migration"],
        render: () => (
          <div className="space-y-4 text-xs text-secondary leading-relaxed">
            <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default space-y-1.5">
              <span className="font-semibold text-primary block">Schema Diff</span>
              <p>
                Chuột phải vào cơ sở dữ liệu → chọn <strong>So sánh cấu trúc cơ sở dữ liệu...</strong> để so sánh sự khác biệt về bảng, cột, kiểu dữ liệu, index, trigger giữa Dev và Production. Tự động sinh file migration script.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default space-y-1.5">
              <span className="font-semibold text-primary block">Sơ đồ quan hệ ER Diagram</span>
              <p>
                Nhấn nút <strong>Sơ đồ ER</strong> để xem biểu đồ quan hệ các bảng, tìm kiếm bảng nhanh và 1-click để nhảy tới dữ liệu của bảng tương ứng.
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "gui-teamsync",
        number: 10,
        title: "Chia sẻ cấu hình nhóm qua Git (Team Sync)",
        icon: GitBranch,
        summary: "Đồng bộ kết nối qua kho Git nội bộ với mã hóa chuẩn 2.0 (PBKDF2 600k + AES-GCM).",
        keywords: ["team sync", "git", "pull", "push", "đồng bộ nhóm", "mã hóa"],
        render: () => (
          <div className="space-y-4 text-xs text-secondary leading-relaxed">
            <p>
              Thay vì gửi chuỗi kết nối qua chat thiếu an toàn, Tabularis cho phép đồng bộ danh sách kết nối qua kho Git nội bộ:
            </p>
            <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default space-y-2">
              <ul className="list-disc pl-5 space-y-1">
                <li><strong className="text-primary">Git Engine an toàn:</strong> Sử dụng cờ <code className="text-blue-400">--ff-only</code>, không bao giờ tự ý ghi đè hay làm mất lịch sử của đồng đội.</li>
                <li><strong className="text-primary">Mã hóa chuẩn 2.0:</strong> PBKDF2-SHA256 với <strong>600.000 vòng lặp</strong> và xác thực toàn vẹn <code className="text-emerald-400">AES-GCM AAD</code>.</li>
                <li><strong className="text-primary">Bảo vệ mật khẩu:</strong> Mật khẩu mặc định được lược bỏ khi xuất bundle trừ khi bạn chủ động đặt Passphrase chia sẻ riêng.</li>
              </ul>
            </div>
          </div>
        ),
      },
      {
        id: "gui-mcp-ai",
        number: 11,
        title: "Kết nối trợ lý AI và Máy chủ MCP",
        icon: Bot,
        summary: "Biến Tabularis thành MCP Server cho Claude Desktop, Cursor, Devin và khung chat AI nội bộ.",
        keywords: ["ai", "mcp", "claude desktop", "cursor", "ollama", "openai", "trợ lý"],
        render: () => (
          <div className="space-y-4 text-xs text-secondary leading-relaxed">
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-primary block mb-1">Máy chủ MCP cho Claude Desktop / Cursor / Devin</span>
                <p>
                  Vào menu <strong>Máy chủ MCP</strong> ở thanh bên → chọn ứng dụng AI của bạn và nhấn <strong>Cài cấu hình</strong>. Trợ lý AI có thể đọc schema bảng và hỗ trợ viết query trực tiếp trên kết nối Tabularis đang mở.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default">
                <span className="font-semibold text-primary block mb-1">Khung Chat AI & Sửa lỗi SQL</span>
                <p>
                  Hỗ trợ kết nối OpenAI, Claude, Gemini hoặc Ollama cục bộ (*Cài đặt → AI*). Khi câu lệnh SQL báo lỗi, nhấn nút <strong>"Hỏi AI sửa lỗi này"</strong> để nhận ngay phân tích và câu lệnh đã fix.
                </p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "gui-shortcuts",
        number: 12,
        title: "Bảng phím tắt toàn tập",
        icon: Keyboard,
        summary: "Tổng hợp toàn bộ phím tắt thao tác nhanh trên Windows, Linux và macOS.",
        keywords: ["phím tắt", "shortcuts", "hotkeys", "keybindings"],
        render: () => (
          <div className="space-y-4 text-xs text-secondary leading-relaxed">
            <div className="overflow-x-auto border border-default rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-secondary/60 text-primary border-b border-default font-semibold">
                    <th className="p-2.5">Phím tắt (Windows/Linux)</th>
                    <th className="p-2.5">Phím tắt (macOS)</th>
                    <th className="p-2.5">Tác vụ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default">
                  <tr>
                    <td className="p-2.5 font-mono text-primary">Ctrl + Enter</td>
                    <td className="p-2.5 font-mono text-primary">⌘ + Enter</td>
                    <td className="p-2.5">Chạy câu lệnh SQL tại vị trí con trỏ / bôi đen</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono text-primary">Ctrl + F5</td>
                    <td className="p-2.5 font-mono text-primary">⌘ + F5</td>
                    <td className="p-2.5">Chạy toàn bộ nội dung trong Console</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono text-primary">Ctrl + T</td>
                    <td className="p-2.5 font-mono text-primary">⌘ + T</td>
                    <td className="p-2.5">Mở Tab Console mới</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono text-primary">Ctrl + W</td>
                    <td className="p-2.5 font-mono text-primary">⌘ + W</td>
                    <td className="p-2.5">Đóng tab hiện tại</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono text-primary">Ctrl + P</td>
                    <td className="p-2.5 font-mono text-primary">⌘ + P</td>
                    <td className="p-2.5">Mở thanh Điều hướng nhanh (Quick Navigator)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono text-primary">Ctrl + B</td>
                    <td className="p-2.5 font-mono text-primary">⌘ + B</td>
                    <td className="p-2.5">Ẩn / hiện thanh bên (Sidebar)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono text-primary">Ctrl + J</td>
                    <td className="p-2.5 font-mono text-primary">⌘ + J</td>
                    <td className="p-2.5">Mở kho mẫu SQL Snippets</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono text-primary">Ctrl + S</td>
                    <td className="p-2.5 font-mono text-primary">⌘ + S</td>
                    <td className="p-2.5">Lưu các thay đổi dữ liệu đang chờ trong lưới</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono text-primary">Ctrl + H</td>
                    <td className="p-2.5 font-mono text-primary">⌘ + H</td>
                    <td className="p-2.5">Xem lịch sử các truy vấn đã chạy</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono text-primary">Ctrl + → / Ctrl + ←</td>
                    <td className="p-2.5 font-mono text-primary">⌘ + → / ⌘ + ←</td>
                    <td className="p-2.5">Chuyển sang trang sau / trang trước trong lưới</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ),
      },
      {
        id: "gui-troubleshooting",
        number: 13,
        title: "Xử lý sự cố thường gặp (Troubleshooting)",
        icon: HelpCircle,
        summary: "Hướng dẫn giải quyết nhanh các lỗi kết nối, phân quyền, font chữ và safe mode.",
        keywords: ["sự cố", "lỗi", "troubleshooting", "không kết nối được", "font"],
        render: () => (
          <div className="space-y-3 text-xs text-secondary leading-relaxed">
            <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default space-y-1">
              <span className="font-semibold text-primary block">Không kết nối được vào database?</span>
              <p>Kiểm tra IP/Cổng/Tường lửa máy chủ. Thử đổi chế độ SSL sang <em>Ưu tiên</em> hoặc <em>Tắt</em>. Nếu database nằm trong mạng nội bộ VPC, cấu hình tab <strong>SSH</strong> qua máy trung gian.</p>
            </div>
            <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default space-y-1">
              <span className="font-semibold text-primary block">Không sửa được ô dữ liệu trong bảng?</span>
              <p>Bảng chưa có Khóa chính (Primary Key), hoặc câu SELECT thiếu cột khóa chính, hoặc kết nối đang bật chế độ <strong>Read-Only</strong>.</p>
            </div>
            <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default space-y-1">
              <span className="font-semibold text-primary block">Lệnh SQL bị chặn hoặc hiện cảnh báo?</span>
              <p>Cơ chế <strong>Safe Mode</strong> đang bảo vệ môi trường Production/Staging. Bạn có thể điều chỉnh tại tab <em>Giao diện</em> của kết nối nếu thực sự muốn ghi.</p>
            </div>
            <div className="p-3 rounded-xl bg-surface-secondary/40 border border-default space-y-1">
              <span className="font-semibold text-primary block">Chữ tiếng Việt bị lệch dấu trên Windows tiếng Nhật?</span>
              <p>Bản 0.13.28+ đã tự động ưu tiên phông chữ <code className="text-blue-400">Segoe UI</code> để khắc phục triệt để. Bạn cũng có thể chủ động chọn phông chữ tại <em>Cài đặt → Giao diện</em>.</p>
            </div>
          </div>
        ),
      },
    ],
    []
  );

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    const query = searchQuery.toLowerCase();
    return sections.filter(
      (sec) =>
        sec.title.toLowerCase().includes(query) ||
        sec.summary.toLowerCase().includes(query) ||
        sec.keywords.some((kw) => kw.includes(query))
    );
  }, [sections, searchQuery]);

  const activeSection = useMemo(() => {
    return sections.find((s) => s.id === selectedSectionId) || sections[0];
  }, [sections, selectedSectionId]);

  const handleOpenGitHubDoc = async () => {
    try {
      await openUrl("https://github.com/bakaryuu1997-sys/Tabularis/blob/main/HUONG_DAN_SU_DUNG.md");
    } catch {
      // Fallback
      window.open("https://github.com/bakaryuu1997-sys/Tabularis/blob/main/HUONG_DAN_SU_DUNG.md", "_blank");
    }
  };

  const handleCopyDocLink = () => {
    navigator.clipboard.writeText("https://github.com/bakaryuu1997-sys/Tabularis/blob/main/HUONG_DAN_SU_DUNG.md");
    setHasCopiedLink(true);
    setTimeout(() => setHasCopiedLink(false), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-elevated border border-strong rounded-2xl shadow-2xl w-[920px] max-w-[95vw] h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-default bg-base shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <BookOpen size={20} />
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

        {/* Body (Sidebar + Content) */}
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
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all ${
                      isSelected
                        ? "bg-blue-600 text-white font-semibold shadow-md shadow-blue-500/20"
                        : "text-secondary hover:text-primary hover:bg-surface-secondary/70"
                    }`}
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
      </div>
    </Modal>
  );
};
