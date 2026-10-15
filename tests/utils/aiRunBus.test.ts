import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  requestRunSql,
  onRunSql,
  requestAiPrompt,
  onAiPrompt,
} from "../../src/utils/aiRunBus";

describe("aiRunBus", () => {
  it("delivers SQL request directly when subscriber is mounted", () => {
    const handler = vi.fn();
    const unsub = onRunSql(handler);

    requestRunSql("SELECT 1;");
    expect(handler).toHaveBeenCalledWith("SELECT 1;");

    unsub();
  });

  it("buffers SQL request and drains when subscriber mounts", () => {
    requestRunSql("SELECT 2;");
    const handler = vi.fn();
    const unsub = onRunSql(handler);

    expect(handler).toHaveBeenCalledWith("SELECT 2;");

    unsub();
  });

  it("delivers AI prompt directly when subscriber is mounted", () => {
    const handler = vi.fn();
    const unsub = onAiPrompt(handler);

    requestAiPrompt("Fix this query");
    expect(handler).toHaveBeenCalledWith("Fix this query");

    unsub();
  });

  it("buffers AI prompt and drains when subscriber mounts", () => {
    requestAiPrompt("Buffered prompt");
    const handler = vi.fn();
    const unsub = onAiPrompt(handler);

    expect(handler).toHaveBeenCalledWith("Buffered prompt");

    unsub();
  });

  it("ignores empty or blank requests", () => {
    const runHandler = vi.fn();
    const promptHandler = vi.fn();
    const unsub1 = onRunSql(runHandler);
    const unsub2 = onAiPrompt(promptHandler);

    requestRunSql("   ");
    requestAiPrompt("   ");

    expect(runHandler).not.toHaveBeenCalled();
    expect(promptHandler).not.toHaveBeenCalled();

    unsub1();
    unsub2();
  });
});
