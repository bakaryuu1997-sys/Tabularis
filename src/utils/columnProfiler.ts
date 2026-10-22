/**
 * Data profiling and statistical distribution analyzer for DataGrid columns.
 */

export interface NumericStats {
  min: number;
  max: number;
  avg: number;
  sum: number;
}

export interface StringStats {
  minLength: number;
  maxLength: number;
  emptyCount: number;
}

export interface DateStats {
  earliest: string;
  latest: string;
}

export interface FrequencyEntry {
  value: string;
  count: number;
  percentage: number;
}

export interface ColumnProfileResult {
  columnName: string;
  inferredType: "number" | "string" | "boolean" | "date" | "json" | "unknown";
  totalRows: number;
  nullCount: number;
  nullPercentage: number;
  distinctCount: number;
  distinctPercentage: number;
  numericStats?: NumericStats;
  stringStats?: StringStats;
  dateStats?: DateStats;
  topFrequencies: FrequencyEntry[];
}

/**
 * Analyzes a given column across a dataset of row objects.
 */
export function profileColumn(
  columnName: string,
  rows: Array<Record<string, unknown> | unknown[]>,
  declaredType?: string,
): ColumnProfileResult {
  const totalRows = rows.length;
  if (totalRows === 0) {
    return {
      columnName,
      inferredType: "unknown",
      totalRows: 0,
      nullCount: 0,
      nullPercentage: 0,
      distinctCount: 0,
      distinctPercentage: 0,
      topFrequencies: [],
    };
  }

  let nullCount = 0;
  const valueCounts = new Map<string, number>();
  const numericValues: number[] = [];
  const stringLengths: number[] = [];
  let emptyStringCount = 0;
  const dateValues: number[] = [];

  for (const row of rows) {
    let val: unknown;
    if (Array.isArray(row)) {
      // If row is an array, we cannot easily look up by column name unless index is known.
      // Default to undefined.
      val = undefined;
    } else if (row && typeof row === "object") {
      val = (row as Record<string, unknown>)[columnName];
    }

    if (val === null || val === undefined) {
      nullCount++;
      continue;
    }

    const strVal = typeof val === "object" ? JSON.stringify(val) : String(val);
    valueCounts.set(strVal, (valueCounts.get(strVal) || 0) + 1);

    // Number check
    if (typeof val === "number" && !Number.isNaN(val)) {
      numericValues.push(val);
    } else if (typeof val === "string" && val.trim() !== "" && !Number.isNaN(Number(val))) {
      numericValues.push(Number(val));
    }

    // String check
    if (typeof val === "string") {
      stringLengths.push(val.length);
      if (val.trim() === "") {
        emptyStringCount++;
      }
      // Check if valid date string
      const ts = Date.parse(val);
      if (!Number.isNaN(ts) && val.length >= 8 && /\d{4}/.test(val)) {
        dateValues.push(ts);
      }
    } else if (val instanceof Date) {
      dateValues.push(val.getTime());
    }
  }

  const distinctCount = valueCounts.size;
  const nonNullCount = totalRows - nullCount;
  const nullPercentage = Number(((nullCount / totalRows) * 100).toFixed(1));
  const distinctPercentage = nonNullCount > 0
    ? Number(((distinctCount / nonNullCount) * 100).toFixed(1))
    : 0;

  // Infer data type
  let inferredType: ColumnProfileResult["inferredType"] = "string";
  const decl = (declaredType || "").toLowerCase();
  if (decl.includes("int") || decl.includes("num") || decl.includes("float") || decl.includes("double") || decl.includes("decimal")) {
    inferredType = "number";
  } else if (decl.includes("bool")) {
    inferredType = "boolean";
  } else if (decl.includes("date") || decl.includes("time")) {
    inferredType = "date";
  } else if (decl.includes("json")) {
    inferredType = "json";
  } else if (numericValues.length === nonNullCount && nonNullCount > 0) {
    inferredType = "number";
  } else if (dateValues.length === nonNullCount && nonNullCount > 0) {
    inferredType = "date";
  }

  let numericStats: NumericStats | undefined;
  if (numericValues.length > 0) {
    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    const sum = numericValues.reduce((a, b) => a + b, 0);
    const avg = Number((sum / numericValues.length).toFixed(2));
    numericStats = { min, max, avg, sum };
  }

  let stringStats: StringStats | undefined;
  if (stringLengths.length > 0) {
    stringStats = {
      minLength: Math.min(...stringLengths),
      maxLength: Math.max(...stringLengths),
      emptyCount: emptyStringCount,
    };
  }

  let dateStats: DateStats | undefined;
  if (dateValues.length > 0) {
    const minTs = Math.min(...dateValues);
    const maxTs = Math.max(...dateValues);
    const formatDate = (ts: number) => {
      const d = new Date(ts);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    dateStats = {
      earliest: formatDate(minTs),
      latest: formatDate(maxTs),
    };
  }

  // Calculate Top 5 Frequencies
  const sortedEntries = Array.from(valueCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topFrequencies: FrequencyEntry[] = sortedEntries.map(([value, count]) => ({
    value,
    count,
    percentage: Number(((count / totalRows) * 100).toFixed(1)),
  }));

  return {
    columnName,
    inferredType,
    totalRows,
    nullCount,
    nullPercentage,
    distinctCount,
    distinctPercentage,
    numericStats,
    stringStats,
    dateStats,
    topFrequencies,
  };
}
