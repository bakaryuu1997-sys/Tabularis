/** Clean and normalize error text for AI prompt injection. */
export function formatSqlErrorForAi(error: string): string {
  const trimmed = error.trim();
  return trimmed.length > 0 ? trimmed : "Unknown error";
}

/**
 * Build a structured prompt asking the AI to diagnose and fix a failed SQL statement.
 */
export function buildSqlErrorPrompt(query: string, error: string): string {
  const cleanError = formatSqlErrorForAi(error);
  const cleanQuery = query.trim();

  return `Câu truy vấn SQL sau bị lỗi khi thực thi trên cơ sở dữ liệu:

\`\`\`sql
${cleanQuery}
\`\`\`

Thông báo lỗi từ database engine:
\`\`\`
${cleanError}
\`\`\`

Hãy giải thích nguyên nhân gây ra lỗi và sửa lại câu lệnh SQL hoàn chỉnh, tối ưu và chính xác nhất.`;
}
