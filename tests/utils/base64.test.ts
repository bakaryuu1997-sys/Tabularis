import { describe, it, expect } from "vitest";
import { bytesToBase64, base64ToBytes } from "../../src/utils/base64";

describe("base64 helpers", () => {
  it("round-trips small buffers", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it("matches the native btoa result", () => {
    const bytes = new TextEncoder().encode("hello world");
    expect(bytesToBase64(bytes)).toBe(btoa("hello world"));
  });

  it("handles buffers far larger than the argument-spread limit", () => {
    const size = 2_000_000;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = i % 251;
    const decoded = base64ToBytes(bytesToBase64(bytes));
    expect(decoded.length).toBe(size);
    expect(decoded[size - 1]).toBe((size - 1) % 251);
  });
});
