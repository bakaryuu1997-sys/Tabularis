import { useCallback, useRef, useState } from "react";
import {
  classifyDangerousQuery,
  type DangerousQueryKind,
} from "../utils/sqlAnalysis";
import { checkSqlSafety } from "../utils/sqlSafety";

export type ExtendedDangerousQueryKind = DangerousQueryKind | "production";

/** Details about the dangerous statement that triggered a confirmation. */
export interface DangerousQueryInfo {
  /** Why the statement was flagged — drives the dialog copy. */
  kind: ExtendedDangerousQueryKind;
  /** The flagged statement itself, shown to the user as a preview. */
  sql: string;
  /** How many statements in the batch were flagged (>= 1). */
  count: number;
  /** Whether the query targets a production connection. */
  isProduction?: boolean;
  /** Concrete reasons why the query was flagged. */
  reasons?: string[];
}

/** i18n key pairs for each danger kind, shared by every consumer of the guard. */
export const DANGEROUS_QUERY_I18N: Record<
  ExtendedDangerousQueryKind,
  { title: string; message: string }
> = {
  "no-where": {
    title: "editor.dangerousQueryTitle",
    message: "editor.dangerousQueryMessage",
  },
  drop: {
    title: "editor.dangerousQueryDropTitle",
    message: "editor.dangerousQueryDropMessage",
  },
  truncate: {
    title: "editor.dangerousQueryTruncateTitle",
    message: "editor.dangerousQueryTruncateMessage",
  },
  production: {
    title: "safety.productionWarningTitle",
    message: "safety.productionAlert",
  },
};

/**
 * Gates execution of dangerous statements (DELETE/UPDATE with no WHERE, DROP,
 * TRUNCATE, or targeting PRODUCTION) behind a user confirmation with a 5-second countdown.
 */
export function useDangerousQueryGuard() {
  const [pending, setPending] = useState<DangerousQueryInfo | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const requestConfirmation = useCallback(
    (info: DangerousQueryInfo): Promise<boolean> => {
      if (resolverRef.current) return Promise.resolve(false);
      return new Promise((resolve) => {
        resolverRef.current = resolve;
        setPending(info);
      });
    },
    [],
  );

  const resolve = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setPending(null);
  }, []);

  const guardQuery = useCallback(
    (sqlOrQueries: string | string[], environment?: string): Promise<boolean> => {
      const statements = Array.isArray(sqlOrQueries)
        ? sqlOrQueries
        : [sqlOrQueries];

      let first: DangerousQueryInfo | null = null;
      let count = 0;
      for (const sql of statements) {
        const safety = checkSqlSafety(sql, environment);
        if (safety.isDangerous) {
          count++;
          if (!first) {
            const kind: ExtendedDangerousQueryKind = safety.dangerTypes.includes("drop")
              ? "drop"
              : safety.dangerTypes.includes("truncate")
                ? "truncate"
                : safety.dangerTypes.includes("production_target")
                  ? "production"
                  : "no-where";

            first = {
              kind,
              sql,
              count: 0,
              isProduction: safety.isProduction,
              reasons: safety.reasons,
            };
          }
        }
      }

      if (!first) return Promise.resolve(true);
      return requestConfirmation({ ...first, count });
    },
    [requestConfirmation],
  );

  return { pending, isPending: pending !== null, guardQuery, resolve };
}
