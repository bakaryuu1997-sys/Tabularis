/// Tiny one-slot bus that lets the floating AI chat widget ask the Editor page
/// to insert a SQL snippet into the current console and run it.
///
/// The widget and the Editor page live in different parts of the tree, so this
/// avoids threading a callback through many providers. If the Editor isn't
/// mounted yet (the user was on another route and we just navigated there), the
/// request is buffered until the Editor subscribes.
type RunHandler = (sql: string) => void;

let handler: RunHandler | null = null;
let pending: string | null = null;

/// Request that the current SQL be inserted into the editor and executed.
export function requestRunSql(sql: string): void {
  const code = sql.trim();
  if (!code) return;
  if (handler) handler(code);
  else pending = code;
}

/// Subscribe the Editor page as the handler. Drains any buffered request made
/// before the Editor mounted. Returns an unsubscribe function.
export function onRunSql(h: RunHandler): () => void {
  handler = h;
  if (pending != null) {
    const buffered = pending;
    pending = null;
    h(buffered);
  }
  return () => {
    if (handler === h) handler = null;
  };
}
