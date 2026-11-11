use super::format::{parse_csv_delimiter, value_to_csv_string, ExportFormat, DEFAULT_CSV_DELIMITER};
use super::progress::ProgressEmitter;
use super::sink::{CsvSink, JsonSink, RowSink};
use serde_json::{json, Value};

// ---------------------------------------------------------------------------
// ExportFormat::parse
// ---------------------------------------------------------------------------

#[test]
fn parse_csv_format_accepts_lowercase() {
    assert_eq!(ExportFormat::parse("csv").unwrap(), ExportFormat::Csv);
}

#[test]
fn parse_csv_format_is_case_insensitive() {
    assert_eq!(ExportFormat::parse("CSV").unwrap(), ExportFormat::Csv);
    assert_eq!(ExportFormat::parse("Csv").unwrap(), ExportFormat::Csv);
}

#[test]
fn parse_json_format_is_case_insensitive() {
    assert_eq!(ExportFormat::parse("json").unwrap(), ExportFormat::Json);
    assert_eq!(ExportFormat::parse("JSON").unwrap(), ExportFormat::Json);
}

#[test]
fn parse_format_trims_whitespace() {
    assert_eq!(ExportFormat::parse("  csv ").unwrap(), ExportFormat::Csv);
}

#[test]
fn parse_format_rejects_unknown() {
    let err = ExportFormat::parse("xml").unwrap_err();
    assert!(err.contains("xml"));
}

// ---------------------------------------------------------------------------
// parse_csv_delimiter
// ---------------------------------------------------------------------------

#[test]
fn delimiter_defaults_to_comma_when_none() {
    assert_eq!(parse_csv_delimiter(None), DEFAULT_CSV_DELIMITER);
}

#[test]
fn delimiter_defaults_to_comma_for_empty_string() {
    assert_eq!(parse_csv_delimiter(Some("")), DEFAULT_CSV_DELIMITER);
}

#[test]
fn delimiter_uses_first_byte() {
    assert_eq!(parse_csv_delimiter(Some(";")), b';');
    assert_eq!(parse_csv_delimiter(Some("|extra")), b'|');
    assert_eq!(parse_csv_delimiter(Some("\t")), b'\t');
}

// ---------------------------------------------------------------------------
// value_to_csv_string
// ---------------------------------------------------------------------------

#[test]
fn value_to_csv_emits_raw_string_without_quotes() {
    assert_eq!(value_to_csv_string(&json!("hello")), "hello");
}

#[test]
fn value_to_csv_emits_null_sentinel() {
    assert_eq!(value_to_csv_string(&Value::Null), "NULL");
}

#[test]
fn value_to_csv_serializes_numbers_and_bools() {
    assert_eq!(value_to_csv_string(&json!(42)), "42");
    assert_eq!(value_to_csv_string(&json!(3.5)), "3.5");
    assert_eq!(value_to_csv_string(&json!(true)), "true");
    assert_eq!(value_to_csv_string(&json!(false)), "false");
}

#[test]
fn value_to_csv_serializes_objects_and_arrays_as_json() {
    assert_eq!(value_to_csv_string(&json!({"a": 1})), r#"{"a":1}"#);
    assert_eq!(value_to_csv_string(&json!([1, 2, 3])), "[1,2,3]");
}

// ---------------------------------------------------------------------------
// ProgressEmitter
// ---------------------------------------------------------------------------

#[test]
fn progress_emits_at_each_interval() {
    let mut emitted: Vec<u64> = Vec::new();
    {
        let mut p = ProgressEmitter::new(3, |c| emitted.push(c));
        for _ in 0..7 {
            p.tick();
        }
    }
    assert_eq!(emitted, vec![3, 6]);
}

#[test]
fn progress_finish_always_emits_final_count() {
    let mut emitted: Vec<u64> = Vec::new();
    {
        let mut p = ProgressEmitter::new(100, |c| emitted.push(c));
        for _ in 0..5 {
            p.tick();
        }
        p.finish();
    }
    // 5 ticks, no interval emission, but finish() emits the final count.
    assert_eq!(emitted, vec![5]);
}

#[test]
fn progress_finish_emits_zero_on_empty_stream() {
    let mut emitted: Vec<u64> = Vec::new();
    {
        let mut p = ProgressEmitter::new(100, |c| emitted.push(c));
        p.finish();
    }
    assert_eq!(emitted, vec![0]);
}

#[test]
fn progress_interval_zero_is_normalized_to_one() {
    let mut emitted: Vec<u64> = Vec::new();
    {
        let mut p = ProgressEmitter::new(0, |c| emitted.push(c));
        for _ in 0..3 {
            p.tick();
        }
    }
    assert_eq!(emitted, vec![1, 2, 3]);
}

#[test]
fn progress_counter_tracks_total_ticks() {
    let mut p = ProgressEmitter::new(100, |_| ());
    for _ in 0..42 {
        p.tick();
    }
    assert_eq!(p.count(), 42);
}

// ---------------------------------------------------------------------------
// CsvSink
// ---------------------------------------------------------------------------

fn collect_csv(delimiter: u8, rows: &[(Vec<&str>, Vec<Value>)]) -> String {
    let mut buf: Vec<u8> = Vec::new();
    {
        let mut sink = CsvSink::new(&mut buf, delimiter);
        for (headers, values) in rows {
            let headers_owned: Vec<String> = headers.iter().map(|s| s.to_string()).collect();
            sink.write_row(&headers_owned, values).unwrap();
        }
        sink.finish().unwrap();
    }
    String::from_utf8(buf).unwrap()
}

#[test]
fn csv_writes_headers_once_then_rows() {
    let csv = collect_csv(
        b',',
        &[
            (vec!["id", "name"], vec![json!(1), json!("alice")]),
            (vec!["id", "name"], vec![json!(2), json!("bob")]),
        ],
    );
    assert_eq!(csv, "id,name\n1,alice\n2,bob\n");
}

#[test]
fn csv_respects_custom_delimiter() {
    let csv = collect_csv(
        b';',
        &[(vec!["a", "b"], vec![json!("x"), json!("y")])],
    );
    assert_eq!(csv, "a;b\nx;y\n");
}

#[test]
fn csv_emits_null_sentinel_for_null_values() {
    let csv = collect_csv(b',', &[(vec!["v"], vec![Value::Null])]);
    assert_eq!(csv, "v\nNULL\n");
}

#[test]
fn csv_quotes_values_containing_delimiter() {
    let csv = collect_csv(
        b',',
        &[(vec!["v"], vec![json!("a,b")])],
    );
    assert!(csv.contains("\"a,b\""));
}

// ---------------------------------------------------------------------------
// JsonSink
// ---------------------------------------------------------------------------

fn collect_json(rows: &[(Vec<&str>, Vec<Value>)]) -> String {
    let mut buf: Vec<u8> = Vec::new();
    {
        let mut sink = JsonSink::new(&mut buf);
        for (headers, values) in rows {
            let headers_owned: Vec<String> = headers.iter().map(|s| s.to_string()).collect();
            sink.write_row(&headers_owned, values).unwrap();
        }
        sink.finish().unwrap();
    }
    String::from_utf8(buf).unwrap()
}

#[test]
fn json_empty_stream_writes_empty_array() {
    let json_out = collect_json(&[]);
    assert_eq!(json_out, "[]");
}

#[test]
fn json_single_row_is_wrapped_in_array() {
    let json_out = collect_json(&[(vec!["id", "name"], vec![json!(1), json!("alice")])]);
    let parsed: Value = serde_json::from_str(&json_out).unwrap();
    assert_eq!(parsed, json!([{"id": 1, "name": "alice"}]));
}

#[test]
fn json_multiple_rows_separated_by_commas() {
    let json_out = collect_json(&[
        (vec!["id"], vec![json!(1)]),
        (vec!["id"], vec![json!(2)]),
        (vec!["id"], vec![json!(3)]),
    ]);
    let parsed: Value = serde_json::from_str(&json_out).unwrap();
    assert_eq!(parsed, json!([{"id": 1}, {"id": 2}, {"id": 3}]));
}

#[test]
fn json_preserves_value_types_unchanged() {
    let json_out = collect_json(&[(
        vec!["n", "f", "b", "s", "z"],
        vec![json!(42), json!(3.5), json!(true), json!("hi"), Value::Null],
    )]);
    let parsed: Value = serde_json::from_str(&json_out).unwrap();
    assert_eq!(
        parsed,
        json!([{"n": 42, "f": 3.5, "b": true, "s": "hi", "z": null}])
    );
}

#[test]
fn json_missing_value_defaults_to_null() {
    // Defensive: if a driver yields fewer values than headers, the sink fills
    // the gap with null rather than panicking.
    let mut buf: Vec<u8> = Vec::new();
    {
        let mut sink = JsonSink::new(&mut buf);
        let headers = vec!["a".to_string(), "b".to_string()];
        sink.write_row(&headers, &[json!(1)]).unwrap();
        sink.finish().unwrap();
    }
    let parsed: Value = serde_json::from_str(&String::from_utf8(buf).unwrap()).unwrap();
    assert_eq!(parsed, json!([{"a": 1, "b": null}]));
}

// ---------------------------------------------------------------------------
// CSV presets (encoding, BOM, line ending)
// ---------------------------------------------------------------------------

mod csv_style_tests {
    use super::super::encoding::EncodingWriter;
    use super::super::format::{CsvEncoding, CsvStyle};
    use super::super::sink::{CsvSink, RowSink};
    use serde_json::{json, Value};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;

    fn rows() -> (Vec<String>, Vec<Vec<Value>>) {
        (
            vec!["名前".to_string(), "city".to_string()],
            vec![vec![json!("山田"), json!("Hà Nội")], vec![json!("ｱｲｳ"), Value::Null]],
        )
    }

    fn write_all<S: RowSink>(sink: &mut S) {
        let (headers, data) = rows();
        for row in &data {
            sink.write_row(&headers, row).unwrap();
        }
        sink.finish().unwrap();
    }

    #[test]
    fn presets_map_to_the_documented_styles() {
        assert_eq!(CsvStyle::from_preset(None).unwrap(), CsvStyle::UTF8);
        assert_eq!(CsvStyle::from_preset(Some("")).unwrap(), CsvStyle::UTF8);
        assert_eq!(CsvStyle::from_preset(Some("utf8")).unwrap(), CsvStyle::UTF8);
        assert_eq!(CsvStyle::from_preset(Some(" UTF8-BOM ")).unwrap(), CsvStyle::UTF8_BOM);
        assert_eq!(CsvStyle::from_preset(Some("shift_jis")).unwrap(), CsvStyle::SHIFT_JIS);
        assert_eq!(CsvStyle::from_preset(Some("Shift-JIS")).unwrap(), CsvStyle::SHIFT_JIS);
    }

    #[test]
    fn the_default_style_keeps_the_old_output() {
        assert_eq!(CsvStyle::UTF8, CsvStyle { encoding: CsvEncoding::Utf8, bom: false, crlf: false });
    }

    #[test]
    fn excel_presets_end_records_with_crlf_and_only_utf8_gets_a_bom() {
        assert!(CsvStyle::UTF8_BOM.bom && CsvStyle::UTF8_BOM.crlf);
        assert!(!CsvStyle::SHIFT_JIS.bom && CsvStyle::SHIFT_JIS.crlf);
    }

    #[test]
    fn unknown_presets_are_rejected_with_their_name() {
        let err = CsvStyle::from_preset(Some("latin1")).unwrap_err();
        assert_eq!(err, "Unsupported CSV encoding preset: latin1");
    }

    #[test]
    fn lf_is_still_the_default_record_terminator() {
        let mut buf = Vec::new();
        {
            let mut sink = CsvSink::new(&mut buf, b',');
            write_all(&mut sink);
        }
        let text = String::from_utf8(buf).unwrap();
        assert!(text.contains('\n') && !text.contains('\r'));
    }

    #[test]
    fn crlf_terminates_every_record_when_asked() {
        let mut buf = Vec::new();
        {
            let mut sink = CsvSink::with_line_ending(&mut buf, b',', true);
            write_all(&mut sink);
        }
        let text = String::from_utf8(buf).unwrap();
        assert_eq!(text, "名前,city\r\n山田,Hà Nội\r\nｱｲｳ,NULL\r\n");
    }

    #[test]
    fn a_shift_jis_file_has_the_exact_bytes_excel_expects() {
        let replaced = Arc::new(AtomicU64::new(0));
        let mut bytes = Vec::new();
        {
            let writer = EncodingWriter::new(&mut bytes, encoding_rs::SHIFT_JIS, replaced.clone());
            let mut sink = CsvSink::with_line_ending(writer, b',', true);
            write_all(&mut sink);
        }
        // Header 名前 = 96 BC 91 4F; 山田 = 8E 52 93 63; ｱｲｳ = B1 B2 B3; "Hà Nội": à and ộ are not in Shift_JIS.
        let mut expected: Vec<u8> = vec![0x96, 0xBC, 0x91, 0x4F];
        expected.extend_from_slice(b",city\r\n");
        expected.extend_from_slice(&[0x8E, 0x52, 0x93, 0x63]);
        expected.extend_from_slice(b",H? N?i\r\n");
        expected.extend_from_slice(&[0xB1, 0xB2, 0xB3]);
        expected.extend_from_slice(b",NULL\r\n");
        assert_eq!(bytes, expected);
        assert_eq!(replaced.load(Ordering::Relaxed), 2);
    }

    #[test]
    fn a_quoted_field_with_a_comma_survives_the_encoder() {
        let replaced = Arc::new(AtomicU64::new(0));
        let mut bytes = Vec::new();
        {
            let writer = EncodingWriter::new(&mut bytes, encoding_rs::SHIFT_JIS, replaced);
            let mut sink = CsvSink::with_line_ending(writer, b',', true);
            sink.write_row(&["a".to_string()], &[json!("東京,都")]).unwrap();
            sink.finish().unwrap();
        }
        assert_eq!(&bytes[..3], b"a\r\n");
        assert_eq!(bytes[3], b'"');
        assert_eq!(*bytes.last().unwrap(), b'\n');
    }
}
