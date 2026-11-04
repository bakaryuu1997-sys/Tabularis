import type { SavedConnection } from "../contexts/DatabaseContext";
import type { SavedQuery } from "../contexts/SavedQueriesContext";

export interface TeamWorkspaceBundle {
  version: "1.0";
  exportedAt: string;
  generator: string;
  encrypted: boolean;
  salt?: string;
  iv?: string;
  cipherPayload?: string;
  connections?: SavedConnection[];
  savedQueries?: SavedQuery[];
}

export interface WorkspaceExportOptions {
  includePasswords?: boolean;
  passphrase?: string;
  selectedConnectionIds?: string[];
  selectedQueryIds?: string[];
}

export interface WorkspaceImportResult {
  valid: boolean;
  error?: string;
  importedConnections: SavedConnection[];
  importedQueries: SavedQuery[];
  stats: {
    addedConnections: number;
    updatedConnections: number;
    skippedConnections: number;
    addedQueries: number;
    updatedQueries: number;
    skippedQueries: number;
  };
}

// ---------------------------------------------------------------------------
// Web Crypto AES-256-GCM Encryption / Decryption Helpers
// ---------------------------------------------------------------------------

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptText(plainText: string, passphrase: string): Promise<{ cipherBase64: string; saltHex: string; ivHex: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);

  const enc = new TextEncoder();
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(plainText)
  );

  const cipherBase64 = btoa(String.fromCharCode(...new Uint8Array(cipherBuffer)));
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
  const ivHex = Array.from(iv).map((b) => b.toString(16).padStart(2, "0")).join("");

  return { cipherBase64, saltHex, ivHex };
}

export async function decryptText(cipherBase64: string, passphrase: string, saltHex: string, ivHex: string): Promise<string> {
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
  const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
  const key = await deriveKey(passphrase, salt);

  const rawBytes = Uint8Array.from(atob(cipherBase64), (c) => c.charCodeAt(0));
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    rawBytes
  );

  return new TextDecoder().decode(decryptedBuffer);
}

// ---------------------------------------------------------------------------
// Bundle Export & Import
// ---------------------------------------------------------------------------

export async function exportTeamWorkspaceBundle(
  connections: SavedConnection[],
  savedQueries: SavedQuery[],
  options: WorkspaceExportOptions = {}
): Promise<string> {
  let targetConnections = options.selectedConnectionIds
    ? connections.filter((c) => options.selectedConnectionIds!.includes(c.id))
    : [...connections];

  const targetQueries = options.selectedQueryIds
    ? savedQueries.filter((q) => options.selectedQueryIds!.includes(q.id))
    : [...savedQueries];

  // Strip passwords if not explicitly permitted or if no encryption passphrase is provided
  if (!options.includePasswords || !options.passphrase) {
    targetConnections = targetConnections.map((c) => ({
      ...c,
      params: {
        ...c.params,
        password: "",
      },
    }));
  }

  const baseBundle = {
    connections: targetConnections,
    savedQueries: targetQueries,
  };

  if (options.passphrase && options.passphrase.trim().length > 0) {
    const rawJson = JSON.stringify(baseBundle);
    const { cipherBase64, saltHex, ivHex } = await encryptText(rawJson, options.passphrase.trim());

    const bundle: TeamWorkspaceBundle = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      generator: "Tabularis Studio",
      encrypted: true,
      salt: saltHex,
      iv: ivHex,
      cipherPayload: cipherBase64,
    };

    return JSON.stringify(bundle, null, 2);
  }

  const bundle: TeamWorkspaceBundle = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    generator: "Tabularis Studio",
    encrypted: false,
    connections: targetConnections,
    savedQueries: targetQueries,
  };

  return JSON.stringify(bundle, null, 2);
}

export async function parseAndReconcileWorkspaceBundle(
  jsonContent: string,
  existingConnections: SavedConnection[],
  existingQueries: SavedQuery[],
  passphrase?: string,
  conflictMode: "merge_new" | "overwrite" = "merge_new"
): Promise<WorkspaceImportResult> {
  try {
    const parsed = JSON.parse(jsonContent) as TeamWorkspaceBundle;
    if (parsed.version !== "1.0") {
      return {
        valid: false,
        error: "Phiên bản bundle không tương thích (chỉ hỗ trợ v1.0)",
        importedConnections: [],
        importedQueries: [],
        stats: { addedConnections: 0, updatedConnections: 0, skippedConnections: 0, addedQueries: 0, updatedQueries: 0, skippedQueries: 0 },
      };
    }

    let bundleConnections: SavedConnection[] = parsed.connections || [];
    let bundleQueries: SavedQuery[] = parsed.savedQueries || [];

    if (parsed.encrypted) {
      if (!passphrase || !passphrase.trim()) {
        return {
          valid: false,
          error: "Bundle đã được mã hóa bằng mật khẩu. Vui lòng nhập passphrase để giải mã.",
          importedConnections: [],
          importedQueries: [],
          stats: { addedConnections: 0, updatedConnections: 0, skippedConnections: 0, addedQueries: 0, updatedQueries: 0, skippedQueries: 0 },
        };
      }

      if (!parsed.salt || !parsed.iv || !parsed.cipherPayload) {
        return {
          valid: false,
          error: "Dữ liệu mã hóa của bundle bị thiếu salt hoặc vector khởi tạo (IV).",
          importedConnections: [],
          importedQueries: [],
          stats: { addedConnections: 0, updatedConnections: 0, skippedConnections: 0, addedQueries: 0, updatedQueries: 0, skippedQueries: 0 },
        };
      }

      try {
        const decryptedJson = await decryptText(parsed.cipherPayload, passphrase.trim(), parsed.salt, parsed.iv);
        const payload = JSON.parse(decryptedJson) as { connections?: SavedConnection[]; savedQueries?: SavedQuery[] };
        bundleConnections = payload.connections || [];
        bundleQueries = payload.savedQueries || [];
      } catch {
        return {
          valid: false,
          error: "Giải mã thất bại. Mật khẩu passphrase không chính xác hoặc dữ liệu bị hỏng.",
          importedConnections: [],
          importedQueries: [],
          stats: { addedConnections: 0, updatedConnections: 0, skippedConnections: 0, addedQueries: 0, updatedQueries: 0, skippedQueries: 0 },
        };
      }
    }

    const existingConnMap = new Map(existingConnections.map((c) => [c.id, c]));
    const existingConnNameMap = new Map(existingConnections.map((c) => [c.name.toLowerCase(), c]));

    const existingQueryMap = new Map(existingQueries.map((q) => [q.id, q]));
    const existingQueryNameMap = new Map(existingQueries.map((q) => [q.name.toLowerCase(), q]));

    const resultConnections: SavedConnection[] = [];
    let addedConnections = 0;
    let updatedConnections = 0;
    let skippedConnections = 0;

    for (const conn of bundleConnections) {
      const match = existingConnMap.get(conn.id) || existingConnNameMap.get(conn.name.toLowerCase());
      if (match) {
        if (conflictMode === "overwrite") {
          resultConnections.push(conn);
          updatedConnections++;
        } else {
          skippedConnections++;
        }
      } else {
        resultConnections.push(conn);
        addedConnections++;
      }
    }

    const resultQueries: SavedQuery[] = [];
    let addedQueries = 0;
    let updatedQueries = 0;
    let skippedQueries = 0;

    for (const q of bundleQueries) {
      const match = existingQueryMap.get(q.id) || existingQueryNameMap.get(q.name.toLowerCase());
      if (match) {
        if (conflictMode === "overwrite") {
          resultQueries.push(q);
          updatedQueries++;
        } else {
          skippedQueries++;
        }
      } else {
        resultQueries.push(q);
        addedQueries++;
      }
    }

    return {
      valid: true,
      importedConnections: resultConnections,
      importedQueries: resultQueries,
      stats: {
        addedConnections,
        updatedConnections,
        skippedConnections,
        addedQueries,
        updatedQueries,
        skippedQueries,
      },
    };
  } catch (err) {
    return {
      valid: false,
      error: `Lỗi đọc file bundle: ${String(err)}`,
      importedConnections: [],
      importedQueries: [],
      stats: { addedConnections: 0, updatedConnections: 0, skippedConnections: 0, addedQueries: 0, updatedQueries: 0, skippedQueries: 0 },
    };
  }
}
