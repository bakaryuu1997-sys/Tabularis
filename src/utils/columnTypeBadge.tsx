import React from "react";
import {
  Hash,
  Type,
  Calendar,
  ToggleLeft,
  Braces,
  Fingerprint,
  Binary,
  Code,
} from "lucide-react";

export interface ColumnTypeInfo {
  icon: React.ReactNode;
  shortName: string;
  badgeClass: string;
}

/**
 * Maps a SQL data type string (e.g. "bigint", "varchar(255)", "timestamptz", "jsonb")
 * to a standardized compact visual badge with icon and distinct color scheme.
 */
export function getColumnTypeVisual(rawType?: string | null): ColumnTypeInfo {
  if (!rawType) {
    return {
      icon: <Code size={10} className="shrink-0" />,
      shortName: "ANY",
      badgeClass: "bg-surface-secondary text-muted border-default",
    };
  }

  const t = rawType.toLowerCase().trim();

  // 1. Integer / Numbers
  if (/\b(?:tiny|small|medium|big)?int(?:eger)?\d*\b|serial|float|double|decimal|numeric|real|money|number|fixed/.test(t)) {
    let label = "NUM";
    if (t.includes("bigint") || t.includes("int8")) label = "INT8";
    else if (t.includes("smallint") || t.includes("int2")) label = "INT2";
    else if (t.includes("int")) label = "INT";
    else if (t.includes("decimal") || t.includes("numeric")) label = "DEC";
    else if (t.includes("float") || t.includes("double") || t.includes("real")) label = "FLOAT";
    else if (t.includes("serial")) label = "SERIAL";

    return {
      icon: <Hash size={10} className="shrink-0 text-blue-400" />,
      shortName: label,
      badgeClass: "bg-blue-500/10 text-blue-300 border-blue-500/25",
    };
  }

  // 2. Date / Time / Timestamps
  if (/date|time|timestamp|year/.test(t)) {
    let label = "DATE";
    if (t.includes("timestamp") || t.includes("timestamptz")) label = "TS";
    else if (t.includes("time")) label = "TIME";

    return {
      icon: <Calendar size={10} className="shrink-0 text-purple-400" />,
      shortName: label,
      badgeClass: "bg-purple-500/10 text-purple-300 border-purple-500/25",
    };
  }

  // 3. Boolean / Bit
  if (/bool|^bit/.test(t)) {
    return {
      icon: <ToggleLeft size={10} className="shrink-0 text-pink-400" />,
      shortName: "BOOL",
      badgeClass: "bg-pink-500/10 text-pink-300 border-pink-500/25",
    };
  }

  // 4. JSON / JSONB
  if (/json/.test(t)) {
    return {
      icon: <Braces size={10} className="shrink-0 text-amber-400" />,
      shortName: t.includes("jsonb") ? "JSONB" : "JSON",
      badgeClass: "bg-amber-500/10 text-amber-300 border-amber-500/25",
    };
  }

  // 5. UUID / Identifiers
  if (/uuid|guid/.test(t)) {
    return {
      icon: <Fingerprint size={10} className="shrink-0 text-cyan-400" />,
      shortName: "UUID",
      badgeClass: "bg-cyan-500/10 text-cyan-300 border-cyan-500/25",
    };
  }

  // 6. Binary / Blob / Bytea
  if (/bytea|blob|binary|varbinary|image/.test(t)) {
    return {
      icon: <Binary size={10} className="shrink-0 text-slate-400" />,
      shortName: "BIN",
      badgeClass: "bg-slate-500/10 text-slate-300 border-slate-500/25",
    };
  }

  // 7. String / Text (Varchar, Text, Char)
  let strLabel = "TEXT";
  if (t.includes("varchar")) strLabel = "VARCHAR";
  else if (t.includes("char")) strLabel = "CHAR";

  return {
    icon: <Type size={10} className="shrink-0 text-emerald-400" />,
    shortName: strLabel,
    badgeClass: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  };
}
