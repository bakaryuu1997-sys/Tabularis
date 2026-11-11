import { describe, expect, it } from "vitest";
import {
  DEFAULT_BEGIN_TRANSACTION_SQL,
  GENERIC_SSL_MODES,
  beginTransactionSql,
  defaultSslModeLabel,
  isSslDisabledMode,
  resolveSslModes,
} from "../../src/utils/connectionOptions";

describe("beginTransactionSql", () => {
  it("uses the statement the driver declares", () => {
    expect(beginTransactionSql({ begin_transaction_sql: "BEGIN;" })).toBe("BEGIN;");
    expect(beginTransactionSql({ begin_transaction_sql: "BEGIN IMMEDIATE;" })).toBe("BEGIN IMMEDIATE;");
  });

  it("falls back to START TRANSACTION for drivers that declare nothing", () => {
    expect(beginTransactionSql({})).toBe(DEFAULT_BEGIN_TRANSACTION_SQL);
    expect(beginTransactionSql({ begin_transaction_sql: "  " })).toBe("START TRANSACTION;");
    expect(beginTransactionSql(null)).toBe("START TRANSACTION;");
    expect(beginTransactionSql(undefined)).toBe("START TRANSACTION;");
  });
});

describe("resolveSslModes", () => {
  it("offers the modes the driver declares and preselects its default", () => {
    const result = resolveSslModes({
      ssl_modes: ["disable", "allow", "prefer", "require"],
      default_ssl_mode: "prefer",
    });
    expect(result).toEqual({ modes: ["disable", "allow", "prefer", "require"], defaultMode: "prefer" });
  });

  it("supports a driver with only two modes, like a ClickHouse plugin", () => {
    expect(resolveSslModes({ ssl_modes: ["disable", "require"], default_ssl_mode: "disable" })).toEqual({
      modes: ["disable", "require"],
      defaultMode: "disable",
    });
  });

  it("uses the generic list for a plugin that declares nothing", () => {
    const result = resolveSslModes({});
    expect(result.modes).toEqual([...GENERIC_SSL_MODES]);
    expect(result.defaultMode).toBe("required");
    expect(resolveSslModes(null).modes).toEqual([...GENERIC_SSL_MODES]);
  });

  it("ignores blank modes and an empty list", () => {
    expect(resolveSslModes({ ssl_modes: [] }).modes).toEqual([...GENERIC_SSL_MODES]);
    expect(resolveSslModes({ ssl_modes: ["", "  ", "tls"] }).modes).toEqual(["tls"]);
  });

  it("ignores a default that is not one of the modes", () => {
    expect(resolveSslModes({ ssl_modes: ["off", "on"], default_ssl_mode: "required" }).defaultMode).toBe("off");
    expect(resolveSslModes({ ssl_modes: ["off", "required"], default_ssl_mode: "nope" }).defaultMode).toBe("required");
  });

  it("returns a fresh array so callers cannot change the shared default", () => {
    resolveSslModes({}).modes.push("hacked");
    expect(resolveSslModes({}).modes).toEqual([...GENERIC_SSL_MODES]);
  });
});

describe("isSslDisabledMode", () => {
  it.each([["disable", true], ["disabled", true], ["require", false], ["preferred", false], ["", false], [null, false], [undefined, false]])(
    "%s -> %s",
    (mode, expected) => {
      expect(isSslDisabledMode(mode as string | null | undefined)).toBe(expected);
    },
  );
});

describe("defaultSslModeLabel", () => {
  it.each([
    ["verify-ca", "Verify CA"],
    ["verify_identity", "Verify Identity"],
    ["require", "Require"],
    ["verify-full", "Verify Full"],
  ])("%s -> %s", (mode, label) => {
    expect(defaultSslModeLabel(mode)).toBe(label);
  });
});
