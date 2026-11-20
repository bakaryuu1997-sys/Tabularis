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

  it("maps ERR_SSH_CONNECTION_RESET error code to clean SSH retry message", () => {
    const raw = "ERR_SSH_CONNECTION_RESET: SSH tunnel connection was reset. Please run the query again.";
    expect(toErrorMessage(raw)).toBe(
      "SSH tunnel connection was reset. Please run the query again."
    );
  });

  it("maps ERR_CONNECTION_RESET error code to generic retry message", () => {
    const raw = "ERR_CONNECTION_RESET: Connection was reset. Please run the query again.";
    expect(toErrorMessage(raw)).toBe(
      "Connection was reset. Please run the query again."
    );
  });

  it("finds the code when the backend message is wrapped", () => {
    expect(toErrorMessage("Query failed: ERR_CONNECTION_RESET: Connection was reset.")).toBe(
      "Connection was reset. Please run the query again."
    );
  });

  it("does not misattribute non-SSH EOF errors to SSH", () => {
    const raw = "error communicating with database: expected to read 4 bytes, got 0 bytes at EOF";
    expect(toErrorMessage(raw)).toBe(raw);
  });
});
