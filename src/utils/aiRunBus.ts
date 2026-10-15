/// Tiny one-slot bus that lets the floating AI chat widget ask the Editor page
/// to insert a SQL snippet into the current console and run it, or lets the
/// Editor (e.g. error banner) ask the AI chat widget to open with a prompt.
///
/// The widget and the Editor page live in different parts of the tree, so this
/// avoids threading a callback through many providers. If the recipient isn't
/// mounted yet, the request is buffered until it subscribes.

type RunHandler = (sql: string) => void;
type PromptHandler = (prompt: string) => void;

let runHandler: RunHandler | null = null;
let pendingRun: string | null = null;

let promptHandler: PromptHandler | null = null;
let pendingPrompt: string | null = null;

/// Request that the current SQL be inserted into the editor and executed.
export function requestRunSql(sql: string): void {
  const code = sql.trim();
  if (!code) return;
  if (runHandler) runHandler(code);
  else pendingRun = code;
}

/// Subscribe the Editor page as the SQL run handler.
export function onRunSql(h: RunHandler): () => void {
  runHandler = h;
  if (pendingRun != null) {
    const buffered = pendingRun;
    pendingRun = null;
    h(buffered);
  }
  return () => {
    if (runHandler === h) runHandler = null;
  };
}

/// Request that the AI chat widget open and handle the given prompt.
export function requestAiPrompt(prompt: string): void {
  const text = prompt.trim();
  if (!text) return;
  if (promptHandler) promptHandler(text);
  else pendingPrompt = text;
}

/// Subscribe the AI chat widget as the prompt handler.
export function onAiPrompt(h: PromptHandler): () => void {
  promptHandler = h;
  if (pendingPrompt != null) {
    const buffered = pendingPrompt;
    pendingPrompt = null;
    h(buffered);
  }
  return () => {
    if (promptHandler === h) promptHandler = null;
  };
}
