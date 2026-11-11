//! Writes UTF-8 text in another character set.

use std::io::{self, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use encoding_rs::{Encoder, EncoderResult, Encoding};

/// Character used in place of one the target encoding cannot represent.
const REPLACEMENT: &[u8] = b"?";

/// Characters Unicode and Windows-31J (Excel) map differently. The Unicode form is not in Shift_JIS, the
/// Microsoft form is, so swapping them keeps text that came from Excel or Access round-tripping.
fn to_windows_31j_form(c: char) -> char {
    match c {
        '\u{301C}' => '\u{FF5E}', // WAVE DASH 〜 -> FULLWIDTH TILDE ～
        '\u{2016}' => '\u{2225}', // DOUBLE VERTICAL LINE ‖ -> PARALLEL TO ∥
        '\u{2212}' => '\u{FF0D}', // MINUS SIGN − -> FULLWIDTH HYPHEN-MINUS －
        '\u{2014}' => '\u{2015}', // EM DASH — -> HORIZONTAL BAR ―
        '\u{00A2}' => '\u{FFE0}', // CENT SIGN ¢ -> FULLWIDTH CENT SIGN ￠
        '\u{00A3}' => '\u{FFE1}', // POUND SIGN £ -> FULLWIDTH POUND SIGN ￡
        '\u{00AC}' => '\u{FFE2}', // NOT SIGN ¬ -> FULLWIDTH NOT SIGN ￢
        other => other,
    }
}

/// A `Write` that takes UTF-8 bytes (in chunks that may split a character) and writes them encoded.
///
/// Characters the encoding cannot represent are written as `?` and counted in `replaced`, instead of the
/// `&#1234;` escapes `encoding_rs` would insert, which would corrupt a CSV silently.
pub struct EncodingWriter<W: Write> {
    inner: W,
    encoder: Encoder,
    /// Trailing bytes of an incomplete UTF-8 sequence from the previous `write`.
    pending: Vec<u8>,
    replaced: Arc<AtomicU64>,
}

impl<W: Write> EncodingWriter<W> {
    pub fn new(inner: W, encoding: &'static Encoding, replaced: Arc<AtomicU64>) -> Self {
        Self { inner, encoder: encoding.new_encoder(), pending: Vec::new(), replaced }
    }

    fn encode_text(&mut self, text: &str) -> io::Result<()> {
        let mapped: String = text.chars().map(to_windows_31j_form).collect();
        let mut rest = mapped.as_str();
        let mut out = [0u8; 4096];
        loop {
            let (result, read, written) =
                self.encoder.encode_from_utf8_without_replacement(rest, &mut out, false);
            self.inner.write_all(&out[..written])?;
            rest = &rest[read..];
            match result {
                EncoderResult::InputEmpty => return Ok(()),
                EncoderResult::OutputFull => {}
                EncoderResult::Unmappable(_) => {
                    self.inner.write_all(REPLACEMENT)?;
                    self.replaced.fetch_add(1, Ordering::Relaxed);
                }
            }
        }
    }
}

impl<W: Write> Write for EncodingWriter<W> {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        self.pending.extend_from_slice(data);
        let complete = match std::str::from_utf8(&self.pending) {
            Ok(_) => self.pending.len(),
            // An incomplete sequence at the end is kept for the next call; anything else is invalid input.
            Err(e) if e.error_len().is_none() => e.valid_up_to(),
            Err(e) => return Err(io::Error::new(io::ErrorKind::InvalidData, e)),
        };
        let tail = self.pending.split_off(complete);
        let head = std::mem::replace(&mut self.pending, tail);
        let text = String::from_utf8(head).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        self.encode_text(&text)?;
        Ok(data.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

#[cfg(test)]
mod tests;
