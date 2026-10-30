import { describe, it, expect } from "vitest";
import {
  parseEnvContent,
  parseDockerComposeContent,
  parsePrismaContent,
  detectProjectConnections,
  scanProjectDirectory,
  type DetectedConnection,
} from "../../src/utils/projectScanner";

describe("projectScanner", () => {
  describe("parseEnvContent", () => {
    it("extracts postgres connection from DATABASE_URL", () => {
      const content = `
PORT=3000
DATABASE_URL="postgresql://admin:secret123@db.example.com:5432/production_db?sslmode=require"
JWT_SECRET=supersecret
`;
      const detected = parseEnvContent(content, ".env");
      expect(detected).toHaveLength(1);
      expect(detected[0]).toMatchObject({
        driver: "postgres",
        name: "production_db (.env)",
        host: "db.example.com",
        port: 5432,
        username: "admin",
        password: "secret123",
        database: "production_db",
        sourceFile: ".env",
      });
    });

    it("extracts mysql connection from individual DB_* environment variables", () => {
      const content = `
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=ecommerce
DB_USERNAME=root
DB_PASSWORD=rootpass
`;
      const detected = parseEnvContent(content, ".env.local");
      expect(detected).toHaveLength(1);
      expect(detected[0]).toMatchObject({
        driver: "mysql",
        name: "ecommerce (.env.local)",
        host: "127.0.0.1",
        port: 3306,
        username: "root",
        password: "rootpass",
        database: "ecommerce",
        sourceFile: ".env.local",
      });
    });

    it("extracts sqlite connection from path", () => {
      const content = `
DATABASE_URL="file:./dev.db"
`;
      const detected = parseEnvContent(content, ".env");
      expect(detected).toHaveLength(1);
      expect(detected[0].driver).toBe("sqlite");
      expect(detected[0].database).toBe("./dev.db");
    });
  });

  describe("parseDockerComposeContent", () => {
    it("extracts postgres service with custom mapped port and environment variables", () => {
      const yaml = `
version: '3.8'
services:
  web:
    build: .
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: app_development
      POSTGRES_USER: devuser
      POSTGRES_PASSWORD: devpassword
    ports:
      - "5433:5432"
`;
      const detected = parseDockerComposeContent(yaml, "docker-compose.yml");
      expect(detected).toHaveLength(1);
      expect(detected[0]).toMatchObject({
        driver: "postgres",
        name: "app_development (docker: db)",
        host: "127.0.0.1",
        port: 5433,
        username: "devuser",
        password: "devpassword",
        database: "app_development",
        sourceFile: "docker-compose.yml",
      });
    });

    it("extracts mysql service with default port if not mapped", () => {
      const yaml = `
services:
  database:
    image: mysql:8.0
    environment:
      MYSQL_DATABASE: my_store
      MYSQL_ROOT_PASSWORD: mysecretpassword
`;
      const detected = parseDockerComposeContent(yaml, "compose.yml");
      expect(detected).toHaveLength(1);
      expect(detected[0]).toMatchObject({
        driver: "mysql",
        name: "my_store (docker: database)",
        host: "127.0.0.1",
        port: 3306,
        username: "root",
        password: "mysecretpassword",
        database: "my_store",
        sourceFile: "compose.yml",
      });
    });
  });

  describe("parsePrismaContent", () => {
    it("resolves datasource provider and url", () => {
      const schema = `
datasource db {
  provider = "postgresql"
  url      = "postgresql://user:pass@localhost:5432/prisma_db"
}

generator client {
  provider = "prisma-client-js"
}
`;
      const detected = parsePrismaContent(schema, "prisma/schema.prisma");
      expect(detected).toHaveLength(1);
      expect(detected[0]).toMatchObject({
        driver: "postgres",
        name: "prisma_db (prisma)",
        host: "localhost",
        port: 5432,
        username: "user",
        database: "prisma_db",
        sourceFile: "prisma/schema.prisma",
      });
    });
  });

  describe("detectProjectConnections deduplication", () => {
    it("deduplicates connections matching the same host, port, database, and driver", () => {
      const list: DetectedConnection[] = [
        {
          id: "1",
          driver: "postgres",
          name: "app (.env)",
          host: "localhost",
          port: 5432,
          database: "app",
          sourceFile: ".env",
        },
        {
          id: "2",
          driver: "postgres",
          name: "app (docker: db)",
          host: "localhost",
          port: 5432,
          database: "app",
          sourceFile: "docker-compose.yml",
        },
      ];
      const merged = detectProjectConnections(list);
      expect(merged).toHaveLength(1);
      expect(merged[0].sourceFile).toContain(".env");
    });
  });

  describe("scanProjectDirectory", () => {
    it("scans multiple files and returns combined deduplicated connections", async () => {
      const fileMap: Record<string, string> = {
        "/app/.env": "DATABASE_URL=postgres://pguser:pgpass@localhost:5432/main_db",
        "/app/docker-compose.yml": `
services:
  db:
    image: mysql:8
    environment:
      MYSQL_DATABASE: analytics
    ports:
      - "3307:3306"
`,
      };

      const readFileFn = async (path: string) => {
        if (fileMap[path]) return fileMap[path];
        throw new Error("File not found");
      };

      const detected = await scanProjectDirectory("/app", readFileFn);
      expect(detected).toHaveLength(2);
      expect(detected.map((d) => d.database)).toContain("main_db");
      expect(detected.map((d) => d.database)).toContain("analytics");
    });
  });
});
