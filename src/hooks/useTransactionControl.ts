import { useCallback, useState } from "react";

type ShowAlert = (message: string, options?: { title?: string; kind?: "info" | "warning" | "error" }) => unknown;

export type TransactionMode = "auto" | "manual";

/**
 * SQL that opens a transaction. PostgreSQL and SQLite use `BEGIN`; every other driver gets the
 * standard `START TRANSACTION`.
 */
export function beginTransactionSql(driver: string | null | undefined): string {
  return driver === "postgres" || driver === "sqlite" ? "BEGIN;" : "START TRANSACTION;";
}

export interface UseTransactionControlOptions {
  connectionId: string | null | undefined;
  driver: string | null | undefined;
  /** Runs a statement on the active connection; rejects when it fails. */
  runQuery: (sql: string, page: number) => Promise<unknown>;
  showAlert: ShowAlert;
  t: (key: string) => string;
}

/**
 * Manual transaction control for the editor: toggling auto / manual mode and issuing BEGIN, COMMIT
 * and ROLLBACK, tracking whether a transaction is currently open.
 */
export function useTransactionControl({
  connectionId,
  driver,
  runQuery,
  showAlert,
  t,
}: UseTransactionControlOptions) {
  const [transactionMode, setTransactionMode] = useState<TransactionMode>("auto");
  const [isTransactionActive, setIsTransactionActive] = useState(false);

  const startTransaction = useCallback(async () => {
    if (!connectionId) return;
    try {
      await runQuery(beginTransactionSql(driver), 1);
      setIsTransactionActive(true);
      showAlert(t("editor.transactionStarted"), { title: "Transaction", kind: "info" });
    } catch (e) {
      showAlert(String(e), { title: "Transaction Error", kind: "error" });
    }
  }, [connectionId, driver, runQuery, showAlert, t]);

  const finish = useCallback(
    async (sql: "COMMIT;" | "ROLLBACK;", messageKey: string, errorTitle: string) => {
      if (!connectionId) return;
      try {
        await runQuery(sql, 1);
        setIsTransactionActive(false);
        showAlert(t(messageKey), { title: "Transaction", kind: "info" });
      } catch (e) {
        showAlert(String(e), { title: errorTitle, kind: "error" });
      }
    },
    [connectionId, runQuery, showAlert, t],
  );

  const commitTransaction = useCallback(
    () => finish("COMMIT;", "editor.transactionCommitted", "Commit Error"),
    [finish],
  );
  const rollbackTransaction = useCallback(
    () => finish("ROLLBACK;", "editor.transactionRolledBack", "Rollback Error"),
    [finish],
  );

  return {
    transactionMode,
    setTransactionMode,
    isTransactionActive,
    startTransaction,
    commitTransaction,
    rollbackTransaction,
  };
}
