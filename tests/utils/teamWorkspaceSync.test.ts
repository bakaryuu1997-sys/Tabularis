import { describe, it, expect } from "vitest";
import {
  exportTeamWorkspaceBundle,
  parseAndReconcileWorkspaceBundle,
  encryptText,
  decryptText,
} from "../../src/utils/teamWorkspaceSync";
import type { SavedConnection } from "../../src/contexts/DatabaseContext";
import type { SavedQuery } from "../../src/contexts/SavedQueriesContext";

describe("teamWorkspaceSync", () => {
  const mockConnections: SavedConnection[] = [
    {
      id: "conn-1",
      name: "Production PostgreSQL",
      environment: "production",
      params: {
        driver: "postgres",
        host: "db.internal",
        port: 5432,
        database: "main",
        username: "postgres",
        password: "secret_password",
      },
    },
    {
      id: "conn-2",
      name: "Staging MySQL",
      environment: "staging",
      params: {
        driver: "mysql",
        host: "staging-db.internal",
        port: 3306,
        database: "staging",
        username: "app",
        password: "staging_password",
      },
    },
  ];

  const mockQueries: SavedQuery[] = [
    {
      id: "q-1",
      name: "Top 10 Active Users",
      sql: "SELECT * FROM users WHERE status = 'active' LIMIT 10;",
      connection_id: "conn-1",
      database: "main",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  it("exports unencrypted bundle with passwords stripped", async () => {
    const json = await exportTeamWorkspaceBundle(mockConnections, mockQueries, {
      includePasswords: false,
    });

    const parsed = JSON.parse(json);
    expect(parsed.version).toBe("1.0");
    expect(parsed.encrypted).toBe(false);
    expect(parsed.connections).toHaveLength(2);
    expect(parsed.connections[0].params.password).toBe("");
    expect(parsed.savedQueries).toHaveLength(1);
  });

  it("encrypts and decrypts bundle using Web Crypto AES-256-GCM with passphrase", async () => {
    const passphrase = "team-secure-master-key-2026";
    const json = await exportTeamWorkspaceBundle(mockConnections, mockQueries, {
      includePasswords: true,
      passphrase,
    });

    const parsed = JSON.parse(json);
    expect(parsed.encrypted).toBe(true);
    expect(parsed.cipherPayload).toBeTruthy();
    expect(parsed.salt).toBeTruthy();
    expect(parsed.iv).toBeTruthy();

    // Reconcile with correct passphrase
    const result = await parseAndReconcileWorkspaceBundle(json, [], [], passphrase);
    expect(result.valid).toBe(true);
    expect(result.importedConnections).toHaveLength(2);
    expect(result.importedConnections[0].params.password).toBe("secret_password");
    expect(result.importedQueries).toHaveLength(1);
    expect(result.stats.addedConnections).toBe(2);
    expect(result.stats.addedQueries).toBe(1);
  });

  it("fails gracefully on incorrect passphrase", async () => {
    const passphrase = "real-key";
    const json = await exportTeamWorkspaceBundle(mockConnections, mockQueries, {
      includePasswords: true,
      passphrase,
    });

    const result = await parseAndReconcileWorkspaceBundle(json, [], [], "wrong-key");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Giải mã thất bại");
  });

  it("handles merge_new vs overwrite conflict resolution modes", async () => {
    const json = await exportTeamWorkspaceBundle(mockConnections, mockQueries);

    const existing: SavedConnection[] = [
      {
        ...mockConnections[0],
        name: "Production PostgreSQL",
        params: { ...mockConnections[0].params, host: "old-host.internal" },
      },
    ];

    // merge_new: skips existing
    const mergeResult = await parseAndReconcileWorkspaceBundle(json, existing, [], undefined, "merge_new");
    expect(mergeResult.stats.addedConnections).toBe(1);
    expect(mergeResult.stats.skippedConnections).toBe(1);

    // overwrite: updates existing
    const overwriteResult = await parseAndReconcileWorkspaceBundle(json, existing, [], undefined, "overwrite");
    expect(overwriteResult.stats.addedConnections).toBe(1);
    expect(overwriteResult.stats.updatedConnections).toBe(1);
  });
});
