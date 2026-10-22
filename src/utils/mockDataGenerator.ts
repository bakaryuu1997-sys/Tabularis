export interface TableColumn {
  name: string;
  data_type?: string;
  type?: string;
  is_pk?: boolean;
  is_primary?: boolean;
  is_nullable?: boolean;
  nullable?: boolean;
  default_value?: string | null;
}

const SAMPLE_FIRST_NAMES = [
  "Alex", "Jordan", "Taylor", "Morgan", "Sam", "Chris", "Pat", "Casey",
  "Minh", "Linh", "Duc", "Anh", "Hoa", "Kenji", "Yuki", "Haruto", "Yui"
];

const SAMPLE_LAST_NAMES = [
  "Nguyen", "Tran", "Le", "Pham", "Smith", "Johnson", "Williams", "Brown",
  "Jones", "Garcia", "Miller", "Davis", "Sato", "Suzuki", "Takahashi"
];

const SAMPLE_DOMAINS = ["example.com", "company.org", "testmail.net", "acme.io"];

const SAMPLE_CITIES = ["Hanoi", "Ho Chi Minh City", "Da Nang", "Tokyo", "Osaka", "New York", "San Francisco", "London"];

const SAMPLE_STATUSES = ["active", "pending", "completed", "inactive"];

/**
 * Generates a mock value for a single column based on column name and data type.
 */
export function generateMockValue(
  col: TableColumn,
  index: number,
  _totalCount?: number,
): unknown {
  const name = col.name.toLowerCase();
  const type = (col.data_type || col.type || "").toLowerCase();
  const isPk = Boolean(col.is_pk || col.is_primary);

  // If Primary key with auto-increment / serial / int id
  if (isPk && (type.includes("int") || type.includes("serial"))) {
    return index + 1;
  }

  // UUID
  if (type.includes("uuid") || name.includes("uuid") || (isPk && type.includes("char"))) {
    const hex = (len: number) =>
      Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
  }

  // Email
  if (name.includes("email") || name.includes("mail")) {
    const fn = SAMPLE_FIRST_NAMES[(index + 3) % SAMPLE_FIRST_NAMES.length].toLowerCase();
    const ln = SAMPLE_LAST_NAMES[(index + 7) % SAMPLE_LAST_NAMES.length].toLowerCase();
    const domain = SAMPLE_DOMAINS[index % SAMPLE_DOMAINS.length];
    return `${fn}.${ln}${index + 1}@${domain}`;
  }

  // Full Name
  if (name.includes("full_name") || name === "name" || name.includes("user_name") || name.includes("author")) {
    const fn = SAMPLE_FIRST_NAMES[index % SAMPLE_FIRST_NAMES.length];
    const ln = SAMPLE_LAST_NAMES[(index * 2) % SAMPLE_LAST_NAMES.length];
    return `${fn} ${ln}`;
  }
  if (name.includes("first_name")) {
    return SAMPLE_FIRST_NAMES[index % SAMPLE_FIRST_NAMES.length];
  }
  if (name.includes("last_name")) {
    return SAMPLE_LAST_NAMES[index % SAMPLE_LAST_NAMES.length];
  }

  // Phone
  if (name.includes("phone") || name.includes("mobile") || name.includes("tel")) {
    const num = String(10000000 + ((index * 98765) % 90000000));
    return `09${num.slice(0, 8)}`;
  }

  // Address / City / Country
  if (name.includes("city")) {
    return SAMPLE_CITIES[index % SAMPLE_CITIES.length];
  }
  if (name.includes("address") || name.includes("street")) {
    return `${(index + 1) * 12} ${SAMPLE_CITIES[index % SAMPLE_CITIES.length]} St.`;
  }
  if (name.includes("country")) {
    return "Vietnam";
  }

  // Status / State
  if (name.includes("status") || name.includes("state")) {
    return SAMPLE_STATUSES[index % SAMPLE_STATUSES.length];
  }

  // Boolean
  if (type.includes("bool") || name.startsWith("is_") || name.startsWith("has_")) {
    return index % 2 === 0;
  }

  // Price / Amount / Balance / Total / Salary
  if (
    name.includes("price") ||
    name.includes("amount") ||
    name.includes("total") ||
    name.includes("salary") ||
    name.includes("cost") ||
    type.includes("decimal") ||
    type.includes("numeric")
  ) {
    return Number((((index + 1) * 49.95) % 1500 + 10).toFixed(2));
  }

  // Integer / Count / Age / Quantity
  if (type.includes("int")) {
    if (name.includes("age")) return 20 + (index % 45);
    if (name.includes("quantity") || name.includes("qty")) return 1 + (index % 10);
    return (index + 1) * 10;
  }

  // Date / Timestamp
  if (type.includes("date") || type.includes("time") || name.endsWith("_at") || name.endsWith("_date")) {
    const now = new Date();
    // Scatter dates within last 30 days
    const past = new Date(now.getTime() - (index * 86400000 * 2.5));
    const pad = (n: number) => String(n).padStart(2, "0");
    const dStr = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}`;
    const tStr = `${pad(past.getHours())}:${pad(past.getMinutes())}:${pad(past.getSeconds())}`;
    return type.includes("time") ? `${dStr} ${tStr}` : dStr;
  }

  // JSON
  if (type.includes("json")) {
    return JSON.stringify({ tag: `item_${index + 1}`, active: true });
  }

  // Default string fallback
  return `${col.name}_${index + 1}`;
}

/**
 * Generates an array of mock row objects for a table.
 */
export function generateMockRows(
  columns: TableColumn[],
  count: number,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    const row: Record<string, unknown> = {};
    for (const col of columns) {
      row[col.name] = generateMockValue(col, i, count);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Formats a value for SQL INSERT literal.
 */
function toSqlLiteral(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return Number.isNaN(val) ? "NULL" : String(val);
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "object") {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

/**
 * Generates a batch SQL INSERT statement for mock rows.
 */
export function generateMockInsertSql(
  tableName: string,
  columns: TableColumn[],
  rows: Record<string, unknown>[],
  dialect: string = "postgres",
): string {
  if (rows.length === 0 || columns.length === 0) return "";

  const quote = dialect === "mysql" ? "`" : '"';
  const quotedTable = tableName.includes(".")
    ? tableName.split(".").map(part => `${quote}${part.replace(/["`]/g, "")}${quote}`).join(".")
    : `${quote}${tableName.replace(/["`]/g, "")}${quote}`;

  const colNames = columns.map(c => `${quote}${c.name.replace(/["`]/g, "")}${quote}`).join(", ");
  
  const valueRows = rows.map(row => {
    const values = columns.map(c => toSqlLiteral(row[c.name])).join(", ");
    return `  (${values})`;
  }).join(",\n");

  return `INSERT INTO ${quotedTable} (\n  ${colNames}\n)\nVALUES\n${valueRows};`;
}
