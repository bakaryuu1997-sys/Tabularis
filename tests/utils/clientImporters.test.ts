import { describe, it, expect } from "vitest";
import { parseDBeaverDataSources } from "../../src/utils/importers/dbeaver";
import { parseTablePlusExport } from "../../src/utils/importers/tableplus";

describe("clientImporters", () => {
  describe("parseDBeaverDataSources", () => {
    it("parses connections from DBeaver data-sources.json", () => {
      const json = JSON.stringify({
        folders: {},
        connections: {
          "postgres-jdbc-189": {
            provider: "postgresql",
            driver: "postgres-jdbc",
            name: "Postgres Production",
            configuration: {
              host: "pg.company.internal",
              port: "5432",
              database: "main_prod",
              user: "app_user",
            },
          },
          "mysql-8-190": {
            provider: "mysql",
            driver: "mysql8",
            name: "MySQL Staging",
            configuration: {
              host: "10.0.0.5",
              port: "3306",
              database: "staging_shop",
              user: "admin",
            },
          },
        },
      });

      const results = parseDBeaverDataSources(json);
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        driver: "postgres",
        name: "Postgres Production",
        host: "pg.company.internal",
        port: 5432,
        database: "main_prod",
        username: "app_user",
      });
      expect(results[1]).toMatchObject({
        driver: "mysql",
        name: "MySQL Staging",
        host: "10.0.0.5",
        port: 3306,
        database: "staging_shop",
        username: "admin",
      });
    });
  });

  describe("parseTablePlusExport", () => {
    it("parses TablePlus JSON export format", () => {
      const json = JSON.stringify([
        {
          ID: "conn_1",
          ConnectionName: "Local Postgres",
          Driver: "PostgreSQL",
          DatabaseHost: "127.0.0.1",
          DatabasePort: "5432",
          DatabaseName: "myapp_dev",
          DatabaseUser: "postgres",
          DatabasePassword: "mypassword",
          Environment: "local",
        },
        {
          ID: "conn_2",
          ConnectionName: "Production SQLite",
          Driver: "SQLite",
          DatabasePath: "/data/sqlite/production.db",
          Environment: "production",
        },
      ]);

      const results = parseTablePlusExport(json);
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        driver: "postgres",
        name: "Local Postgres",
        host: "127.0.0.1",
        port: 5432,
        database: "myapp_dev",
        username: "postgres",
        password: "mypassword",
      });
      expect(results[1]).toMatchObject({
        driver: "sqlite",
        name: "Production SQLite",
        database: "/data/sqlite/production.db",
      });
    });
  });
});
