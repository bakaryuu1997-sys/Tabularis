//! What the MCP server writes to stderr about the JSON-RPC traffic.
//!
//! MCP clients (Claude Desktop, IDE plugins…) usually capture a server's stderr into their own log files.
//! Requests carry SQL and responses carry result rows, so echoing whole messages would copy database content
//! into files outside Tabularis' control (and past its approval and audit trail). By default only metadata is
//! written: byte size, request id, method and tool name. Full payloads need `TABULARIS_MCP_DEBUG=1`.

use serde_json::Value;

const DEBUG_ENV: &str = "TABULARIS_MCP_DEBUG";

/// True when the user explicitly asked for full message payloads in the log.
pub fn payload_logging_enabled() -> bool {
    std::env::var(DEBUG_ENV)
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

/// One-line description of a JSON-RPC message that never includes arguments, results or error text.
pub fn summarize(line: &str) -> String {
    let bytes = line.len();
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return format!("{bytes} bytes (not valid JSON)");
    };

    let mut parts = vec![format!("{bytes} bytes")];
    match value.get("id") {
        Some(Value::String(id)) => parts.push(format!("id={}", short(id))),
        Some(Value::Number(id)) => parts.push(format!("id={id}")),
        _ => {}
    }
    if let Some(method) = value.get("method").and_then(Value::as_str) {
        parts.push(format!("method={}", short(method)));
        if method == "tools/call" {
            if let Some(tool) = value.pointer("/params/name").and_then(Value::as_str) {
                parts.push(format!("tool={}", short(tool)));
            }
        }
    }
    if value.get("error").is_some() {
        // The message of an error can quote SQL or data, so only the code is kept.
        let code = value.pointer("/error/code").and_then(Value::as_i64);
        parts.push(match code {
            Some(code) => format!("error code={code}"),
            None => "error".to_string(),
        });
    } else if value.get("result").is_some() {
        parts.push("result".to_string());
    }
    parts.join(", ")
}

/// Text to log for one message: the summary, or the raw line when payload logging is on.
pub fn describe(line: &str, payloads: bool) -> String {
    if payloads {
        line.to_string()
    } else {
        summarize(line)
    }
}

/// Client-supplied strings are cut so a hostile client cannot flood the log.
fn short(text: &str) -> String {
    const MAX: usize = 64;
    let cleaned: String = text.chars().filter(|c| !c.is_control()).take(MAX).collect();
    if text.chars().count() > MAX {
        format!("{cleaned}…")
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests;
