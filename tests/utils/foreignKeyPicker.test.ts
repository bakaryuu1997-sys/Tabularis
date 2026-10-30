import { describe, it, expect } from "vitest";
import {
  detectLabelColumns,
  filterFkCandidates,
  type FkCandidate,
} from "../../src/utils/foreignKeyPicker";

describe("foreignKeyPicker", () => {
  describe("detectLabelColumns", () => {
    it("detects standard name and email columns", () => {
      const columns = ["id", "username", "email", "created_at", "status"];
      const { primaryLabel, secondaryLabel } = detectLabelColumns(columns, "id");
      expect(primaryLabel).toBe("username");
      expect(secondaryLabel).toBe("email");
    });

    it("detects title or label when name is not present", () => {
      const columns = ["id", "title", "slug", "content"];
      const { primaryLabel, secondaryLabel } = detectLabelColumns(columns, "id");
      expect(primaryLabel).toBe("title");
      expect(secondaryLabel).toBe("slug");
    });

    it("falls back gracefully when only id exists", () => {
      const columns = ["id", "created_at", "updated_at"];
      const { primaryLabel, secondaryLabel } = detectLabelColumns(columns, "id");
      expect(primaryLabel).toBeUndefined();
      expect(secondaryLabel).toBeUndefined();
    });
  });

  describe("filterFkCandidates", () => {
    const candidates: FkCandidate[] = [
      { key: 1, label: "Alice Walker", secondaryLabel: "alice@example.com" },
      { key: 2, label: "Bob Smith", secondaryLabel: "bob@test.com" },
      { key: 3, label: "Charlie Brown", secondaryLabel: "charlie@peanuts.org" },
      { key: 104, label: "David Miller", secondaryLabel: "david@corp.net" },
    ];

    it("returns all candidates when search is empty", () => {
      expect(filterFkCandidates(candidates, "")).toHaveLength(4);
      expect(filterFkCandidates(candidates, "   ")).toHaveLength(4);
    });

    it("filters by key", () => {
      const result = filterFkCandidates(candidates, "104");
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe(104);
    });

    it("filters by primary or secondary label case-insensitively", () => {
      const result1 = filterFkCandidates(candidates, "smith");
      expect(result1).toHaveLength(1);
      expect(result1[0].label).toBe("Bob Smith");

      const result2 = filterFkCandidates(candidates, "peanuts");
      expect(result2).toHaveLength(1);
      expect(result2[0].key).toBe(3);
    });
  });
});
