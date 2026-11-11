use super::EncodingWriter;
use encoding_rs::SHIFT_JIS;
use std::io::Write;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

fn encode(chunks: &[&[u8]]) -> (Vec<u8>, u64) {
    let replaced = Arc::new(AtomicU64::new(0));
    let mut out = Vec::new();
    {
        let mut w = EncodingWriter::new(&mut out, SHIFT_JIS, replaced.clone());
        for chunk in chunks {
            w.write_all(chunk).unwrap();
        }
        w.flush().unwrap();
    }
    (out, replaced.load(Ordering::Relaxed))
}

#[test]
fn ascii_passes_through_unchanged() {
    assert_eq!(encode(&[b"id,name\r\n1,abc\r\n"]), (b"id,name\r\n1,abc\r\n".to_vec(), 0));
}

#[test]
fn hiragana_kanji_and_fullwidth_forms_become_shift_jis() {
    // あ = 82 A0, 日本 = 93 FA 96 7B, Ａ (fullwidth) = 82 60
    assert_eq!(encode(&["あ".as_bytes()]).0, vec![0x82, 0xA0]);
    assert_eq!(encode(&["日本".as_bytes()]).0, vec![0x93, 0xFA, 0x96, 0x7B]);
    assert_eq!(encode(&["Ａ".as_bytes()]).0, vec![0x82, 0x60]);
}

#[test]
fn halfwidth_katakana_is_a_single_byte() {
    // ｱ (U+FF71) = B1
    assert_eq!(encode(&["ｱ".as_bytes()]), (vec![0xB1], 0));
}

#[test]
fn windows_31j_compatibility_characters_are_mapped_not_replaced() {
    // 〜 (wave dash, U+301C) is written as the CP932 tilde 81 60 that Excel uses.
    let (bytes, replaced) = encode(&["〜".as_bytes()]);
    assert_eq!(bytes, vec![0x81, 0x60]);
    assert_eq!(replaced, 0);
    // − (minus sign) becomes the fullwidth hyphen-minus 81 7C.
    assert_eq!(encode(&["−".as_bytes()]), (vec![0x81, 0x7C], 0));
    // Circled digit ① is a CP932 extension.
    assert_eq!(encode(&["①".as_bytes()]).1, 0);
}

#[test]
fn yen_sign_becomes_the_backslash_byte() {
    assert_eq!(encode(&["¥".as_bytes()]), (vec![0x5C], 0));
}

#[test]
fn characters_shift_jis_lacks_become_a_question_mark_and_are_counted() {
    // Vietnamese letters and emoji are not in Shift_JIS.
    let (bytes, replaced) = encode(&["aề😀b".as_bytes()]);
    assert_eq!(bytes, b"a??b".to_vec());
    assert_eq!(replaced, 2);
}

#[test]
fn no_numeric_character_references_are_ever_written() {
    let (bytes, _) = encode(&["ễ".as_bytes()]);
    assert!(!bytes.contains(&b'&') && !bytes.contains(&b'#'));
}

#[test]
fn a_character_split_across_two_writes_is_not_lost() {
    let bytes = "あ".as_bytes(); // E3 81 82
    let (out, replaced) = encode(&[&bytes[..1], &bytes[1..2], &bytes[2..]]);
    assert_eq!(out, vec![0x82, 0xA0]);
    assert_eq!(replaced, 0);
    let (out, _) = encode(&[&"a日".as_bytes()[..2], &"a日".as_bytes()[2..]]);
    assert_eq!(out, vec![b'a', 0x93, 0xFA]);
}

#[test]
fn invalid_utf8_is_an_error_not_silent_garbage() {
    let replaced = Arc::new(AtomicU64::new(0));
    let mut out = Vec::new();
    let mut w = EncodingWriter::new(&mut out, SHIFT_JIS, replaced);
    assert!(w.write_all(&[0xFF, 0xFE]).is_err());
}

#[test]
fn large_input_is_encoded_completely() {
    let text = "日本語".repeat(5000);
    let (out, replaced) = encode(&[text.as_bytes()]);
    assert_eq!(out.len(), text.chars().count() * 2);
    assert_eq!(replaced, 0);
}
