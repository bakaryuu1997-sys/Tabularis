/**
 * DBeaver Connection Importer
 * Parses DBeaver's data-sources.json
 */

import type { DetectedConnection } from "../projectScanner";

interface DBeaverConnectionConfig {
  host?: string;
  port?: string | number;
  database?: string;
  user?: string;
  url?: string;
}

interface DBeaverConnectionEntry {
  provider?: string;
  driver?: string;
  name?: string;
  configuration?: DBeaverConnectionConfig;
}

interface DBeaverDataSourcesFile {
  connections?: Record<string, DBeaverConnectionEntry>;
}

export function parseDBeaverDataSources(jsonContent: string): DetectedConnection[] {
  try {
    const data: DBeaverDataSourcesFile = JSON.parse(jsonContent);
    if (!data.connections || typeof data.connections !== "object") {
      return [];
    }

    const results: DetectedConnection[] = [];

    for (const [id, entry] of Object.entries(data.connections)) {
      const provider = (entry.provider || entry.driver || "").toLowerCase();
      let driver: string | null = null;

      if (provider.includes("postgres") || provider.includes("cockroach")) {
        driver = "postgres";
      } else if (provider.includes("mysql") || provider.includes("mariadb")) {
        driver = "mysql";
      } else if (provider.includes("sqlite")) {
        driver = "sqlite";
      }

      if (!driver) continue;

      const cfg = entry.configuration || {};
      const host = cfg.host || "127.0.0.1";
      const port = typeof cfg.port === "string" ? parseInt(cfg.port, 10) : cfg.port;
      const database = cfg.database || "";
      const username = cfg.user || undefined;

      results.push({
        id: `dbeaver_${id}`,
        driver,
        name: entry.name || `${database || host} (DBeaver)`,
        host: driver === "sqlite" ? undefined : host,
        port: driver === "sqlite" ? undefined : port || (driver === "postgres" ? 5432 : 3306),
        database,
        username,
        sourceFile: "DBeaver",
      });
    }

    return results;
  } catch {
    return [];
  }
}
