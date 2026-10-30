/**
 * TablePlus Connection Importer
 * Parses TablePlus JSON export format
 */

import type { DetectedConnection } from "../projectScanner";

interface TablePlusItem {
  ID?: string;
  ConnectionName?: string;
  Driver?: string;
  DatabaseHost?: string;
  DatabasePort?: string | number;
  DatabaseName?: string;
  DatabasePath?: string;
  DatabaseUser?: string;
  DatabasePassword?: string;
  Environment?: string;
}

export function parseTablePlusExport(jsonContent: string): DetectedConnection[] {
  try {
    const raw = JSON.parse(jsonContent);
    const list: TablePlusItem[] = Array.isArray(raw) ? raw : [raw];
    const results: DetectedConnection[] = [];

    for (const item of list) {
      const rawDriver = (item.Driver || "").toLowerCase();
      let driver: string | null = null;

      if (rawDriver.includes("postgres") || rawDriver.includes("cockroach")) {
        driver = "postgres";
      } else if (rawDriver.includes("mysql") || rawDriver.includes("mariadb")) {
        driver = "mysql";
      } else if (rawDriver.includes("sqlite")) {
        driver = "sqlite";
      }

      if (!driver) continue;

      const host = item.DatabaseHost || "127.0.0.1";
      const rawPort = item.DatabasePort;
      const port = typeof rawPort === "string" ? parseInt(rawPort, 10) : rawPort;
      const database = driver === "sqlite" ? (item.DatabasePath || item.DatabaseName || "") : (item.DatabaseName || "");

      results.push({
        id: `tableplus_${item.ID || Math.random().toString(36).substring(2, 9)}`,
        driver,
        name: item.ConnectionName || `${database || host} (TablePlus)`,
        host: driver === "sqlite" ? undefined : host,
        port: driver === "sqlite" ? undefined : port || (driver === "postgres" ? 5432 : 3306),
        database,
        username: item.DatabaseUser || undefined,
        password: item.DatabasePassword || undefined,
        sourceFile: "TablePlus",
      });
    }

    return results;
  } catch {
    return [];
  }
}
