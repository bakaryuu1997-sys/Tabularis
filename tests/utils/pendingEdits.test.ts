import { describe, it, expect } from "vitest";
import {
  applyPendingChange,
  applyPendingInsertionChange,
  discardPendingInsertion,
  duplicateRowAsInsertion,
  markRowsForDeletion,
  revertPendingDeletion,
} from "../../src/utils/pendingEdits";
import { serializePkKey } from "../../src/utils/dataGrid";

const pk = (id: number) => ({ id });
const key = (id: number) => serializePkKey(pk(id));

describe("applyPendingChange", () => {
  it("records the first edit of a row with its original key", () => {
    const patch = applyPendingChange({}, pk(1), "name", "Ann");
    expect(patch.pendingChanges).toEqual({
      [key(1)]: { pkOriginalValue: pk(1), changes: { name: "Ann" } },
    });
  });

  it("adds a second column to the same row without losing the first", () => {
    const first = applyPendingChange({}, pk(1), "name", "Ann");
    const second = applyPendingChange({ pendingChanges: first.pendingChanges }, pk(1), "age", 30);
    expect(second.pendingChanges![key(1)].changes).toEqual({ name: "Ann", age: 30 });
  });

  it("removes a column when the value is undefined and drops the row when nothing is left", () => {
    const tab = { pendingChanges: applyPendingChange({}, pk(1), "name", "Ann").pendingChanges };
    expect(applyPendingChange(tab, pk(1), "name", undefined).pendingChanges).toEqual({});
  });

  it("treats null as a real value (set the column to NULL)", () => {
    expect(applyPendingChange({}, pk(1), "name", null).pendingChanges![key(1)].changes).toEqual({ name: null });
  });

  it("does not mutate the tab it receives", () => {
    const tab = { pendingChanges: { [key(1)]: { pkOriginalValue: pk(1), changes: { a: 1 } } } };
    const snapshot = JSON.stringify(tab);
    applyPendingChange(tab, pk(1), "b", 2);
    applyPendingChange(tab, pk(1), "a", undefined);
    expect(JSON.stringify(tab)).toBe(snapshot);
  });

  it("uses the same key regardless of the order of the primary-key fields", () => {
    const a = applyPendingChange({}, { a: 1, b: 2 }, "x", 1).pendingChanges!;
    const b = applyPendingChange({ pendingChanges: a }, { b: 2, a: 1 }, "y", 2).pendingChanges!;
    expect(Object.keys(b)).toHaveLength(1);
  });
});

describe("pending insertions", () => {
  const withInsertion = { pendingInsertions: { t1: { tempId: "t1", data: { name: "x" }, displayIndex: 0 } } };

  it("edits and clears a column of a new row", () => {
    const edited = applyPendingInsertionChange(withInsertion, "t1", "age", 5)!;
    expect(edited.pendingInsertions!.t1.data).toEqual({ name: "x", age: 5 });
    const cleared = applyPendingInsertionChange({ pendingInsertions: edited.pendingInsertions }, "t1", "name", undefined)!;
    expect(cleared.pendingInsertions!.t1.data).toEqual({ age: 5 });
  });

  it("ignores an unknown insertion", () => {
    expect(applyPendingInsertionChange(withInsertion, "nope", "a", 1)).toBeNull();
    expect(applyPendingInsertionChange({}, "t1", "a", 1)).toBeNull();
  });

  it("discards a new row, or does nothing when there are none", () => {
    expect(discardPendingInsertion(withInsertion, "t1")!.pendingInsertions).toEqual({});
    expect(discardPendingInsertion({}, "t1")).toBeNull();
  });
});

describe("pending deletions", () => {
  it("marks one or many rows and keeps the earlier ones", () => {
    const one = markRowsForDeletion({}, [pk(1)]);
    const more = markRowsForDeletion({ pendingDeletions: one.pendingDeletions }, [pk(2), pk(3)]);
    expect(Object.keys(more.pendingDeletions!)).toHaveLength(3);
    expect(more.pendingDeletions![key(2)]).toEqual(pk(2));
  });

  it("marking the same row twice is idempotent", () => {
    const once = markRowsForDeletion({}, [pk(1)]);
    const twice = markRowsForDeletion({ pendingDeletions: once.pendingDeletions }, [pk(1)]);
    expect(twice).toEqual(once);
  });

  it("reverts one deletion and clears the map when it becomes empty", () => {
    const both = markRowsForDeletion({}, [pk(1), pk(2)]);
    const reverted = revertPendingDeletion({ pendingDeletions: both.pendingDeletions }, pk(1))!;
    expect(Object.keys(reverted.pendingDeletions!)).toEqual([key(2)]);
    const last = revertPendingDeletion({ pendingDeletions: reverted.pendingDeletions }, pk(2))!;
    expect(last.pendingDeletions).toBeUndefined();
  });

  it("reverting without any deletions is a no-op", () => {
    expect(revertPendingDeletion({}, pk(1))).toBeNull();
  });
});

describe("duplicateRowAsInsertion", () => {
  it("copies the row, nulls auto-increment columns and appends after existing rows", () => {
    const tab = {
      autoIncrementColumns: ["id"],
      result: { columns: ["id", "name"], rows: [[1, "a"], [2, "b"]] } as never,
      pendingInsertions: { old: { tempId: "old", data: {}, displayIndex: 2 } },
    };
    const patch = duplicateRowAsInsertion(tab, { id: 2, name: "b" }, "new");
    expect(patch.pendingInsertions!.new).toEqual({ tempId: "new", data: { id: null, name: "b" }, displayIndex: 3 });
    expect(patch.pendingInsertions!.old).toBeDefined();
  });

  it("does not modify the source row", () => {
    const source = { id: 1, name: "a" };
    duplicateRowAsInsertion({ autoIncrementColumns: ["id"] }, source, "t");
    expect(source).toEqual({ id: 1, name: "a" });
  });
});
