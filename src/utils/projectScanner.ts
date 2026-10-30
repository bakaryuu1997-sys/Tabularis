/**
 * Project Scanner Utility
 * Discovers and extracts database connection settings from modern codebases:
 * - .env, .env.local, .env.development, .env.production
 * - docker-compose.yml, docker-compose.yaml, compose.yml, compose.yaml
 * - prisma/schema.prisma
 */

export interface DetectedConnection {
  id: string;
  driver: string;
  name: string;
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  sourceFile: string;
}

/**
 * Normalizes driver string to Tabularis supported drivers: postgres, mysql, sqlite.
 */
function normalizeDriver(raw: string): string | null {
  const lower = raw.trim().toLowerCase();
  if (lower.includes("postgres") || lower === "pgsql" || lower === "psql" || lower.includes("cockroach")) {
    return "postgres";
  }
  if (lower.includes("mysql") || lower.includes("mariadb")) {
    return "mysql";
  }
  if (lower.includes("sqlite") || lower.includes("sqlite3")) {
    return "sqlite";
  }
  return null;
}

/**
 * Parses a standard URI or connection URL (e.g. postgresql://user:pass@host:5432/dbname?opts)
 */
function parseUrl(urlStr: string, sourceName: string): DetectedConnection | null {
  try {
    let cleaned = urlStr.trim().replace(/^["']|["']$/g, "");
    if (cleaned.startsWith("file:")) {
      const dbPath = cleaned.replace(/^file:/, "");
      return {
        id: `detected_${Math.random().toString(36).substring(2, 9)}`,
        driver: "sqlite",
        name: `${dbPath.split(/[/\\]/).pop() || "sqlite"} (${sourceName})`,
        database: dbPath,
        sourceFile: sourceName,
      };
    }

    if (cleaned.startsWith("sqlite:")) {
      const dbPath = cleaned.replace(/^sqlite:(?:\/\/)?/, "");
      return {
        id: `detected_${Math.random().toString(36).substring(2, 9)}`,
        driver: "sqlite",
        name: `${dbPath.split(/[/\\]/).pop() || "sqlite"} (${sourceName})`,
        database: dbPath,
        sourceFile: sourceName,
      };
    }

    const parsed = new URL(cleaned);
    const driver = normalizeDriver(parsed.protocol.replace(/:$/, ""));
    if (!driver) return null;

    const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    const username = decodeURIComponent(parsed.username || "");
    const password = decodeURIComponent(parsed.password || "");
    const host = parsed.hostname;
    const port = parsed.port ? parseInt(parsed.port, 10) : driver === "postgres" ? 5432 : 3306;

    return {
      id: `detected_${Math.random().toString(36).substring(2, 9)}`,
      driver,
      name: `${dbName || host} (${sourceName})`,
      host,
      port,
      database: dbName,
      username: username || undefined,
      password: password || undefined,
      sourceFile: sourceName,
    };
  } catch {
    return null;
  }
}

/**
 * Parses .env file text content.
 */
export function parseEnvContent(content: string, fileName: string): DetectedConnection[] {
  const lines = content.split(/\r?\n/);
  const envMap: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      envMap[key] = val;
    }
  }

  const results: DetectedConnection[] = [];

  // 1. Direct DATABASE_URL or similar keys
  const urlKeys = [
    "DATABASE_URL",
    "DB_URL",
    "POSTGRES_URL",
    "POSTGRESQL_URL",
    "MYSQL_URL",
    "SQLITE_URL",
  ];

  for (const key of urlKeys) {
    if (envMap[key]) {
      const parsed = parseUrl(envMap[key], fileName);
      if (parsed) {
        results.push(parsed);
      }
    }
  }

  // 2. Component keys (DB_HOST, DB_PORT, DB_DATABASE, etc.)
  const rawDriver =
    envMap["DB_CONNECTION"] ||
    envMap["DATABASE_CLIENT"] ||
    envMap["DB_TYPE"] ||
    envMap["DB_DRIVER"] ||
    (envMap["POSTGRES_DB"] ? "postgres" : undefined) ||
    (envMap["MYSQL_DATABASE"] ? "mysql" : undefined);

  if (rawDriver) {
    const driver = normalizeDriver(rawDriver);
    if (driver) {
      const host = envMap["DB_HOST"] || envMap["DATABASE_HOST"] || envMap["POSTGRES_HOST"] || envMap["MYSQL_HOST"] || "127.0.0.1";
      const rawPort = envMap["DB_PORT"] || envMap["DATABASE_PORT"] || envMap["POSTGRES_PORT"] || envMap["MYSQL_PORT"];
      const port = rawPort ? parseInt(rawPort, 10) : driver === "postgres" ? 5432 : 3306;
      const database = envMap["DB_DATABASE"] || envMap["DATABASE_NAME"] || envMap["DB_NAME"] || envMap["POSTGRES_DB"] || envMap["MYSQL_DATABASE"] || "";
      const username = envMap["DB_USERNAME"] || envMap["DATABASE_USERNAME"] || envMap["DB_USER"] || envMap["DATABASE_USER"] || envMap["POSTGRES_USER"] || envMap["MYSQL_USER"] || (driver === "postgres" ? "postgres" : "root");
      const password = envMap["DB_PASSWORD"] || envMap["DATABASE_PASSWORD"] || envMap["DB_PASS"] || envMap["POSTGRES_PASSWORD"] || envMap["MYSQL_PASSWORD"] || envMap["MYSQL_ROOT_PASSWORD"];

      if (database || driver === "sqlite") {
        results.push({
          id: `detected_${Math.random().toString(36).substring(2, 9)}`,
          driver,
          name: `${database || host} (${fileName})`,
          host,
          port,
          database,
          username,
          password,
          sourceFile: fileName,
        });
      }
    }
  }

  return results;
}

/**
 * Parses docker-compose.yml / compose.yml content.
 */
export function parseDockerComposeContent(yamlContent: string, fileName: string): DetectedConnection[] {
  const results: DetectedConnection[] = [];
  const lines = yamlContent.split(/\r?\n/);

  let inServices = false;
  let currentService = "";
  let currentImage = "";
  let currentPorts: string[] = [];
  let currentEnv: Record<string, string> = {};
  let currentSection = "";

  const flushService = () => {
    if (!currentService || !currentImage) return;

    const lowerImg = currentImage.toLowerCase();
    let driver: string | null = null;
    let defaultPort = 5432;

    if (lowerImg.includes("postgres")) {
      driver = "postgres";
      defaultPort = 5432;
    } else if (lowerImg.includes("mysql") || lowerImg.includes("mariadb")) {
      driver = "mysql";
      defaultPort = 3306;
    }

    if (driver) {
      let hostPort = defaultPort;
      for (const p of currentPorts) {
        const parts = p.replace(/['"]/g, "").split(":");
        if (parts.length >= 2) {
          const hp = parseInt(parts[0], 10);
          if (!isNaN(hp) && hp > 0) {
            hostPort = hp;
            break;
          }
        }
      }

      const dbName =
        currentEnv["POSTGRES_DB"] ||
        currentEnv["MYSQL_DATABASE"] ||
        currentService;
      const username =
        currentEnv["POSTGRES_USER"] ||
        currentEnv["MYSQL_USER"] ||
        (driver === "postgres" ? "postgres" : "root");
      const password =
        currentEnv["POSTGRES_PASSWORD"] ||
        currentEnv["MYSQL_PASSWORD"] ||
        currentEnv["MYSQL_ROOT_PASSWORD"] ||
        undefined;

      results.push({
        id: `detected_${Math.random().toString(36).substring(2, 9)}`,
        driver,
        name: `${dbName} (docker: ${currentService})`,
        host: "127.0.0.1",
        port: hostPort,
        database: dbName,
        username,
        password,
        sourceFile: fileName,
      });
    }

    currentService = "";
    currentImage = "";
    currentPorts = [];
    currentEnv = {};
    currentSection = "";
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (line.match(/^services:\s*$/i)) {
      inServices = true;
      continue;
    }

    if (!inServices) continue;

    // Detect top-level service block under services (typically 2-4 spaces indent)
    const serviceMatch = line.match(/^ {2}([a-zA-Z0-9_-]+):\s*$/);
    if (serviceMatch) {
      flushService();
      currentService = serviceMatch[1];
      currentSection = "";
      continue;
    }

    if (!currentService) continue;

    const imgMatch = line.match(/^\s+image:\s*(.+)$/);
    if (imgMatch) {
      currentImage = imgMatch[1].trim().replace(/^['"]|['"]$/g, "");
      continue;
    }

    if (line.match(/^\s+ports:\s*$/)) {
      currentSection = "ports";
      continue;
    }

    if (line.match(/^\s+environment:\s*$/)) {
      currentSection = "env";
      continue;
    }

    if (currentSection === "ports") {
      const portItem = line.match(/^\s+-\s*["']?([^"'\s]+)["']?/);
      if (portItem) {
        currentPorts.push(portItem[1]);
        continue;
      }
    }

    if (currentSection === "env") {
      const envItemDash = line.match(/^\s+-\s*([A-Za-z0-9_]+)=(.+)$/);
      if (envItemDash) {
        currentEnv[envItemDash[1].trim()] = envItemDash[2].trim().replace(/^['"]|['"]$/g, "");
        continue;
      }
      const envItemColon = line.match(/^\s+([A-Za-z0-9_]+):\s*(.+)$/);
      if (envItemColon) {
        currentEnv[envItemColon[1].trim()] = envItemColon[2].trim().replace(/^['"]|['"]$/g, "");
        continue;
      }
    }
  }

  flushService();
  return results;
}

/**
 * Parses prisma/schema.prisma content.
 */
export function parsePrismaContent(schemaContent: string, fileName: string): DetectedConnection[] {
  const results: DetectedConnection[] = [];

  const providerMatch = schemaContent.match(/provider\s*=\s*["']([^"']+)["']/);
  const urlMatch = schemaContent.match(/url\s*=\s*(["']([^"']+)["']|env\(["']([^"']+)["']\))/);

  if (providerMatch && urlMatch) {
    const rawDriver = providerMatch[1];
    const driver = normalizeDriver(rawDriver);
    if (driver) {
      const directUrl = urlMatch[2];
      if (directUrl) {
        const parsed = parseUrl(directUrl, fileName);
        if (parsed) {
          parsed.name = `${parsed.database || "db"} (prisma)`;
          results.push(parsed);
        }
      }
    }
  }

  return results;
}

/**
 * Deduplicates detected connections by driver, host, port, and database name.
 */
export function detectProjectConnections(connections: DetectedConnection[]): DetectedConnection[] {
  const map = new Map<string, DetectedConnection>();

  for (const conn of connections) {
    const key = `${conn.driver}://${conn.host || ""}:${conn.port || ""}/${conn.database || ""}`.toLowerCase();
    if (!map.has(key)) {
      map.set(key, conn);
    } else {
      const existing = map.get(key)!;
      if (!existing.sourceFile.includes(conn.sourceFile)) {
        existing.sourceFile += `, ${conn.sourceFile}`;
      }
    }
  }

  return Array.from(map.values());
}

/** Candidate filenames to check within a project directory */
const SCAN_TARGETS = [
  { name: ".env", parser: parseEnvContent },
  { name: ".env.local", parser: parseEnvContent },
  { name: ".env.development", parser: parseEnvContent },
  { name: ".env.dev", parser: parseEnvContent },
  { name: ".env.production", parser: parseEnvContent },
  { name: ".env.staging", parser: parseEnvContent },
  { name: "docker-compose.yml", parser: parseDockerComposeContent },
  { name: "docker-compose.yaml", parser: parseDockerComposeContent },
  { name: "compose.yml", parser: parseDockerComposeContent },
  { name: "compose.yaml", parser: parseDockerComposeContent },
  { name: "prisma/schema.prisma", parser: parsePrismaContent },
];

/**
 * Scans a chosen project root folder for database configuration files.
 */
export async function scanProjectDirectory(
  dirPath: string,
  readFileFn: (path: string) => Promise<string>,
): Promise<DetectedConnection[]> {
  const normalizedDir = dirPath.replace(/[/\\]+$/, "");
  const allDetected: DetectedConnection[] = [];

  for (const target of SCAN_TARGETS) {
    const fullPath = `${normalizedDir}/${target.name}`;
    try {
      const content = await readFileFn(fullPath);
      if (content && content.trim()) {
        const found = target.parser(content, target.name);
        allDetected.push(...found);
      }
    } catch {
      // File not found or unreadable, continue to next
    }
  }

  return detectProjectConnections(allDetected);
}
