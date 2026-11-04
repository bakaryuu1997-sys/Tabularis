import type { SavedConnection } from "../contexts/DatabaseContext";
import type { SavedQuery } from "../contexts/SavedQueriesContext";
import { base64ToBytes, bytesToBase64 } from "./base64";

/** Bundle format written by this version. Version 1.0 bundles can still be imported. */
export const BUNDLE_VERSION = "2.0";
const LEGACY_BUNDLE_VERSION = "1.0";

/** OWASP (2023) minimum for PBKDF2-HMAC-SHA256. */
export const PBKDF2_ITERATIONS = 600_000;
const LEGACY_PBKDF2_ITERATIONS = 100_000;
/** Upper bound accepted from a bundle, so a crafted file cannot freeze the app. */
const MAX_ACCEPTED_ITERATIONS = 5_000_000;

export interface KdfParams {
  name: "PBKDF2";
  hash: "SHA-256";
  iterations: number;
}

export interface TeamWorkspaceBundle {
  version: string;
  /** Omitted unless requested, so identical workspaces produce identical files (clean `git diff`). */
  exportedAt?: string;
  generator: string;
  encrypted: boolean;
  kdf?: KdfParams;
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
  /** Adds `exportedAt`. Off by default because it makes every export differ. */
  includeTimestamp?: boolean;
}

export type WorkspaceImportErrorCode =
  | "unsupported_version"
  | "passphrase_required"
  | "missing_cipher_fields"
  | "decrypt_failed"
  | "invalid_kdf"
  | "parse_failed";

export interface WorkspaceImportStats {
  addedConnections: number;
  updatedConnections: number;
  skippedConnections: number;
  addedQueries: number;
  updatedQueries: number;
  skippedQueries: number;
}

export interface WorkspaceImportResult {
  valid: boolean;
  /** Stable machine-readable reason; the UI translates it. */
  errorCode?: WorkspaceImportErrorCode;
  /** English diagnostic detail for logs. Never shown as the primary message. */
  error?: string;
  importedConnections: SavedConnection[];
  importedQueries: SavedQuery[];
  stats: WorkspaceImportStats;
}

const EMPTY_STATS: WorkspaceImportStats = {
  addedConnections: 0,
  updatedConnections: 0,
  skippedConnections: 0,
  addedQueries: 0,
  updatedQueries: 0,
  skippedQueries: 0,
};

function failure(errorCode: WorkspaceImportErrorCode, error: string): WorkspaceImportResult {
  return { valid: false, errorCode, error, importedConnections: [], importedQueries: [], stats: { ...EMPTY_STATS } };
}

// ---------------------------------------------------------------------------
// AES-256-GCM encryption with a PBKDF2 derived key
// ---------------------------------------------------------------------------

const CURRENT_KDF: KdfParams = { name: "PBKDF2", hash: "SHA-256", iterations: PBKDF2_ITERATIONS };
const LEGACY_KDF: KdfParams = { name: "PBKDF2", hash: "SHA-256", iterations: LEGACY_PBKDF2_ITERATIONS };

/**
 * Additional authenticated data. Binding the format version and KDF parameters into the
 * GCM tag means an attacker cannot lower the iteration count in the file header without
 * making decryption fail. Version 1.0 bundles were written without it.
 */
function buildAad(version: string, kdf: KdfParams): Uint8Array | undefined {
  if (version === LEGACY_BUNDLE_VERSION) return undefined;
  return new TextEncoder().encode(`tabularis-team-workspace|${version}|${kdf.name}-${kdf.hash}|${kdf.iterations}`);
}

async function deriveKey(passphrase: string, salt: Uint8Array, kdf: KdfParams): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), { name: "PBKDF2" }, false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: kdf.iterations, hash: kdf.hash },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new Error("Invalid hex string");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function encryptText(
  plainText: string,
  passphrase: string,
  kdf: KdfParams = CURRENT_KDF,
  version: string = BUNDLE_VERSION,
): Promise<{ cipherBase64: string; saltHex: string; ivHex: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, kdf);
  const aad = buildAad(version, kdf);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource, ...(aad ? { additionalData: aad as BufferSource } : {}) },
    key,
    new TextEncoder().encode(plainText),
  );
  return { cipherBase64: bytesToBase64(new Uint8Array(cipherBuffer)), saltHex: toHex(salt), ivHex: toHex(iv) };
}

export async function decryptText(
  cipherBase64: string,
  passphrase: string,
  saltHex: string,
  ivHex: string,
  kdf: KdfParams = CURRENT_KDF,
  version: string = BUNDLE_VERSION,
): Promise<string> {
  const key = await deriveKey(passphrase, fromHex(saltHex), kdf);
  const aad = buildAad(version, kdf);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromHex(ivHex) as BufferSource, ...(aad ? { additionalData: aad as BufferSource } : {}) },
    key,
    base64ToBytes(cipherBase64) as BufferSource,
  );
  return new TextDecoder().decode(decrypted);
}

// ---------------------------------------------------------------------------
// Deterministic serialisation (git friendly)
// ---------------------------------------------------------------------------

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeysDeep(v)]),
    );
  }
  return value;
}

/** Stable JSON: sorted keys, sorted collections, two-space indent, trailing newline. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value), null, 2) + "\n";
}

const byIdThenName = <T extends { id: string; name: string }>(a: T, b: T) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : a.name.localeCompare(b.name);

// ---------------------------------------------------------------------------
// Bundle export & import
// ---------------------------------------------------------------------------

export async function exportTeamWorkspaceBundle(
  connections: SavedConnection[],
  savedQueries: SavedQuery[],
  options: WorkspaceExportOptions = {},
): Promise<string> {
  const connectionIds = options.selectedConnectionIds ? new Set(options.selectedConnectionIds) : null;
  const queryIds = options.selectedQueryIds ? new Set(options.selectedQueryIds) : null;

  let targetConnections = connections.filter((c) => !connectionIds || connectionIds.has(c.id));
  const targetQueries = savedQueries.filter((q) => !queryIds || queryIds.has(q.id));

  const passphrase = options.passphrase?.trim();

  // Passwords only leave the app inside an encrypted bundle that the user explicitly asked for.
  if (!options.includePasswords || !passphrase) {
    targetConnections = targetConnections.map((c) => ({ ...c, params: { ...c.params, password: "" } }));
  }

  const payload = {
    connections: [...targetConnections].sort(byIdThenName),
    savedQueries: [...targetQueries].sort(byIdThenName),
  };
  const header = {
    version: BUNDLE_VERSION,
    generator: "Tabularis",
    ...(options.includeTimestamp ? { exportedAt: new Date().toISOString() } : {}),
  };

  if (passphrase) {
    const { cipherBase64, saltHex, ivHex } = await encryptText(stableStringify(payload), passphrase);
    const bundle: TeamWorkspaceBundle = {
      ...header,
      encrypted: true,
      kdf: { ...CURRENT_KDF },
      salt: saltHex,
      iv: ivHex,
      cipherPayload: cipherBase64,
    };
    return stableStringify(bundle);
  }

  const bundle: TeamWorkspaceBundle = { ...header, encrypted: false, ...payload };
  return stableStringify(bundle);
}

function resolveKdf(bundle: TeamWorkspaceBundle): KdfParams | null {
  if (bundle.version === LEGACY_BUNDLE_VERSION) return LEGACY_KDF;
  const kdf = bundle.kdf;
  if (
    !kdf ||
    kdf.name !== "PBKDF2" ||
    kdf.hash !== "SHA-256" ||
    !Number.isInteger(kdf.iterations) ||
    kdf.iterations < PBKDF2_ITERATIONS ||
    kdf.iterations > MAX_ACCEPTED_ITERATIONS
  ) {
    return null;
  }
  return kdf;
}

export async function parseAndReconcileWorkspaceBundle(
  jsonContent: string,
  existingConnections: SavedConnection[],
  existingQueries: SavedQuery[],
  passphrase?: string,
  conflictMode: "merge_new" | "overwrite" = "merge_new",
): Promise<WorkspaceImportResult> {
  let parsed: TeamWorkspaceBundle;
  try {
    parsed = JSON.parse(jsonContent) as TeamWorkspaceBundle;
  } catch (err) {
    return failure("parse_failed", `Could not parse bundle JSON: ${String(err)}`);
  }

  if (parsed?.version !== BUNDLE_VERSION && parsed?.version !== LEGACY_BUNDLE_VERSION) {
    return failure("unsupported_version", `Unsupported bundle version: ${String(parsed?.version)}`);
  }

  let bundleConnections: SavedConnection[] = parsed.connections ?? [];
  let bundleQueries: SavedQuery[] = parsed.savedQueries ?? [];

  if (parsed.encrypted) {
    if (!passphrase?.trim()) return failure("passphrase_required", "Bundle is encrypted; a passphrase is required");
    if (!parsed.salt || !parsed.iv || !parsed.cipherPayload) {
      return failure("missing_cipher_fields", "Bundle is missing salt, iv or cipherPayload");
    }
    const kdf = resolveKdf(parsed);
    if (!kdf) return failure("invalid_kdf", "Bundle declares unsupported or too weak key-derivation parameters");

    try {
      const decrypted = await decryptText(parsed.cipherPayload, passphrase.trim(), parsed.salt, parsed.iv, kdf, parsed.version);
      const payload = JSON.parse(decrypted) as { connections?: SavedConnection[]; savedQueries?: SavedQuery[] };
      bundleConnections = payload.connections ?? [];
      bundleQueries = payload.savedQueries ?? [];
    } catch {
      return failure("decrypt_failed", "Decryption failed: wrong passphrase or corrupted data");
    }
  }

  const stats: WorkspaceImportStats = { ...EMPTY_STATS };
  const reconcile = <T extends { id: string; name: string }>(
    incoming: T[],
    existing: T[],
    counters: { added: keyof WorkspaceImportStats; updated: keyof WorkspaceImportStats; skipped: keyof WorkspaceImportStats },
  ): T[] => {
    const byId = new Set(existing.map((e) => e.id));
    const byName = new Set(existing.map((e) => e.name.toLowerCase()));
    const result: T[] = [];
    for (const item of incoming) {
      if (byId.has(item.id) || byName.has(item.name.toLowerCase())) {
        if (conflictMode === "overwrite") {
          result.push(item);
          stats[counters.updated]++;
        } else {
          stats[counters.skipped]++;
        }
      } else {
        result.push(item);
        stats[counters.added]++;
      }
    }
    return result;
  };

  const importedConnections = reconcile(bundleConnections, existingConnections, {
    added: "addedConnections",
    updated: "updatedConnections",
    skipped: "skippedConnections",
  });
  const importedQueries = reconcile(bundleQueries, existingQueries, {
    added: "addedQueries",
    updated: "updatedQueries",
    skipped: "skippedQueries",
  });

  return { valid: true, importedConnections, importedQueries, stats };
}
