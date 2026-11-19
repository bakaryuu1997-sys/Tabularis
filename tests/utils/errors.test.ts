import { describe, it, expect } from "vitest";
import { toErrorMessage } from "../../src/utils/errors";

describe("errors", () => {
  it("returns plain string as is", () => {
    expect(toErrorMessage("Connection failed")).toBe("Connection failed");
  });

  it("extracts message from Error object", () => {
    expect(toErrorMessage(new Error("Network timeout"))).toBe("Network timeout");
  });

  it("extracts message from object with message property", () => {
    expect(toErrorMessage({ message: "Custom error" })).toBe("Custom error");
  });

  it("maps MySQL EOF error to friendly SSH message", () => {
    const raw = "error communicating with database: expected to read 4 bytes, got 0 bytes at EOF";
    expect(toErrorMessage(raw)).toBe(
      "SSH tunnel was closed or disconnected (EOF). Please try reconnecting."
    );
  });

  it("maps generic 0 bytes at EOF error to friendly SSH message", () => {
    const raw = "Database stream disconnected: got 0 bytes at EOF";
    expect(toErrorMessage(raw)).toBe(
      "SSH tunnel was closed or disconnected (EOF). Please try reconnecting."
    );
  });
});
