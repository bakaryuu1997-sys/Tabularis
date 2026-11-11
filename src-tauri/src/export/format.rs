use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportFormat {
    Csv,
    Json,
}

impl ExportFormat {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s.trim().to_ascii_lowercase().as_str() {
            "csv" => Ok(Self::Csv),
            "json" => Ok(Self::Json),
            other => Err(format!("Unsupported export format: {}", other)),
        }
    }
}

pub const DEFAULT_CSV_DELIMITER: u8 = b',';

/// Returns the first byte of the supplied string, falling back to a comma when
/// the option is `None`, an empty string, or pure whitespace.
pub fn parse_csv_delimiter(value: Option<&str>) -> u8 {
    value
        .and_then(|d| d.bytes().next())
        .unwrap_or(DEFAULT_CSV_DELIMITER)
}

/// Converts a JSON value into the string representation used by the CSV writer.
/// Strings are emitted verbatim, `null` becomes the sentinel `NULL`, and every
/// other scalar/composite delegates to `Value::to_string`.
pub fn value_to_csv_string(val: &Value) -> String {
    match val {
        Value::String(s) => s.clone(),
        Value::Null => "NULL".to_string(),
        other => other.to_string(),
    }
}

/// Character encoding of a CSV export.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CsvEncoding {
    Utf8,
    /// Windows-31J (the Shift_JIS variant Japanese Excel and Windows tools use).
    ShiftJis,
}

/// File-level choices for a CSV export, picked from a named preset.
///
/// Excel on Japanese Windows reads a CSV as Shift_JIS unless the file starts with a UTF-8 byte order mark, so a
/// plain UTF-8 file shows garbled text. The presets cover the three cases BrSE work needs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CsvStyle {
    pub encoding: CsvEncoding,
    /// Start the file with the UTF-8 byte order mark (EF BB BF). Only meaningful for UTF-8.
    pub bom: bool,
    /// End records with CRLF instead of LF.
    pub crlf: bool,
}

impl CsvStyle {
    /// UTF-8, no BOM, LF: what exports produced before presets existed.
    pub const UTF8: Self = Self { encoding: CsvEncoding::Utf8, bom: false, crlf: false };
    /// UTF-8 with BOM and CRLF: opens correctly in Excel, keeps every Unicode character.
    pub const UTF8_BOM: Self = Self { encoding: CsvEncoding::Utf8, bom: true, crlf: true };
    /// Shift_JIS and CRLF: for older Japanese systems; characters Shift_JIS lacks become `?`.
    pub const SHIFT_JIS: Self = Self { encoding: CsvEncoding::ShiftJis, bom: false, crlf: true };

    /// Maps a preset name (`utf8`, `utf8-bom`, `shift_jis`) to a style. `None` or an empty name is `utf8`.
    pub fn from_preset(preset: Option<&str>) -> Result<Self, String> {
        let name = preset.map(|p| p.trim().to_ascii_lowercase()).unwrap_or_default();
        match name.as_str() {
            "" | "utf8" | "utf-8" => Ok(Self::UTF8),
            "utf8-bom" | "utf-8-bom" => Ok(Self::UTF8_BOM),
            "shift_jis" | "shift-jis" | "sjis" => Ok(Self::SHIFT_JIS),
            other => Err(format!("Unsupported CSV encoding preset: {}", other)),
        }
    }
}
