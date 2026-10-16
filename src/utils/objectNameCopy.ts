import type { DriverCapabilities, PluginManifest } from "../types/plugins";
import { quoteIdentifier, quoteTableRef } from "./identifiers";

export type ObjectNameCopyFormat = "name" | "quoted" | "qualified" | "select";

export function formatObjectNameForCopy(
  name: string,
  format: ObjectNameCopyFormat,
  driver: string | PluginManifest | DriverCapabilities | null | undefined,
  schema?: string,
): string {
  if (format === "name") return name;
  if (format === "quoted") return quoteIdentifier(name, driver);
  if (format === "qualified") return quoteTableRef(name, driver, schema);
  if (format === "select") {
    const quoted = quoteTableRef(name, driver, schema);
    return `SELECT * FROM ${quoted} LIMIT 100;`;
  }
  return name;
}
