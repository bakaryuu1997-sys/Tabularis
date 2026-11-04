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
    expect(parsed.version).toBe("2.0");
    expect(parsed.exportedAt).toBeUndefined();
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
    expect(result.errorCode).toBe("decrypt_failed");
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

describe("teamWorkspaceSync v2 format", () => {
  const conn = (id: string, name: string): SavedConnection => ({
    id,
    name,
    params: { driver: "postgres", host: "h", database: "d", password: "pw" },
  });
  const query = (id: string, name: string): SavedQuery => ({
    id,
    name,
    sql: "SELECT 1",
    connection_id: "a",
    database: "d",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });

  it("produces identical output regardless of input order or key order", async () => {
    const a = await exportTeamWorkspaceBundle([conn("b", "B"), conn("a", "A")], [query("2", "Q2"), query("1", "Q1")]);
    const b = await exportTeamWorkspaceBundle([conn("a", "A"), conn("b", "B")], [query("1", "Q1"), query("2", "Q2")]);
    expect(a).toBe(b);
    expect(a.endsWith("\n")).toBe(true);
    expect(JSON.parse(a).connections.map((c: SavedConnection) => c.id)).toEqual(["a", "b"]);
  });

  it("only adds a timestamp when asked", async () => {
    const withTs = await exportTeamWorkspaceBundle([], [], { includeTimestamp: true });
    expect(JSON.parse(withTs).exportedAt).toEqual(expect.any(String));
  });

  it("derives keys with at least 600k PBKDF2 iterations and records them in the header", async () => {
    const json = await exportTeamWorkspaceBundle([conn("a", "A")], [], { includePasswords: true, passphrase: "pass" });
    expect(JSON.parse(json).kdf).toEqual({ name: "PBKDF2", hash: "SHA-256", iterations: 600000 });
  });

  it("rejects a header whose iteration count was weakened", async () => {
    const json = JSON.parse(
      await exportTeamWorkspaceBundle([conn("a", "A")], [], { includePasswords: true, passphrase: "pass" }),
    );
    json.kdf.iterations = 1000;
    const result = await parseAndReconcileWorkspaceBundle(JSON.stringify(json), [], [], "pass");
    expect(result.errorCode).toBe("invalid_kdf");
  });

  it("detects tampering with the authenticated header", async () => {
    const json = JSON.parse(
      await exportTeamWorkspaceBundle([conn("a", "A")], [], { includePasswords: true, passphrase: "pass" }),
    );
    json.kdf.iterations = 700000;
    const result = await parseAndReconcileWorkspaceBundle(JSON.stringify(json), [], [], "pass");
    expect(result.errorCode).toBe("decrypt_failed");
  });

  it("still imports version 1.0 bundles encrypted with 100k iterations", async () => {
    const payload = JSON.stringify({ connections: [conn("legacy", "Legacy")], savedQueries: [] });
    const legacyKdf = { name: "PBKDF2", hash: "SHA-256", iterations: 100000 } as const;
    const { cipherBase64, saltHex, ivHex } = await encryptText(payload, "old-pass", legacyKdf, "1.0");
    const bundle = JSON.stringify({
      version: "1.0",
      generator: "Tabularis Studio",
      encrypted: true,
      salt: saltHex,
      iv: ivHex,
      cipherPayload: cipherBase64,
    });
    const result = await parseAndReconcileWorkspaceBundle(bundle, [], [], "old-pass");
    expect(result.valid).toBe(true);
    expect(result.importedConnections[0].id).toBe("legacy");
  });

  it("handles payloads far larger than the old spread-based base64 limit", async () => {
    const big = Array.from({ length: 3000 }, (_, i) => query(String(i), `Query ${i}`));
    big.forEach((q) => (q.sql = "SELECT '" + "x".repeat(300) + "'"));
    const json = await exportTeamWorkspaceBundle([], big, { passphrase: "pass" });
    const result = await parseAndReconcileWorkspaceBundle(json, [], [], "pass");
    expect(result.valid).toBe(true);
    expect(result.importedQueries).toHaveLength(3000);
  });

  it("reports structured error codes instead of localized text", async () => {
    expect((await parseAndReconcileWorkspaceBundle("not json", [], [])).errorCode).toBe("parse_failed");
    expect((await parseAndReconcileWorkspaceBundle('{"version":"9.9"}', [], [])).errorCode).toBe("unsupported_version");
    const enc = await exportTeamWorkspaceBundle([], [], { passphrase: "p" });
    expect((await parseAndReconcileWorkspaceBundle(enc, [], [])).errorCode).toBe("passphrase_required");
    const missing = JSON.parse(enc);
    delete missing.iv;
    expect((await parseAndReconcileWorkspaceBundle(JSON.stringify(missing), [], [], "p")).errorCode).toBe("missing_cipher_fields");
  });
});
