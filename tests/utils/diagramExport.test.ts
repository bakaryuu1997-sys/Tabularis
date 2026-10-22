import { describe, it, expect } from "vitest";
import { generateMermaidErd } from "../../src/utils/diagramExport";

describe("diagramExport", () => {
  it("generates valid Mermaid ERD from nodes and edges", () => {
    const nodes = [
      {
        id: "users",
        data: {
          label: "users",
          columns: [
            { name: "id", type: "int", is_primary: true },
            { name: "email", type: "varchar", is_primary: false },
          ],
        },
      },
      {
        id: "orders",
        data: {
          label: "orders",
          columns: [
            { name: "id", type: "int", is_primary: true },
            { name: "user_id", type: "int", is_primary: false },
          ],
        },
      },
    ];

    const edges = [
      { source: "orders", target: "users" },
    ];

    const mermaid = generateMermaidErd(nodes, edges);
    expect(mermaid).toContain("erDiagram");
    expect(mermaid).toContain("users {");
    expect(mermaid).toContain("int id PK");
    expect(mermaid).toContain("varchar email");
    expect(mermaid).toContain("orders {");
    expect(mermaid).toContain("orders }|..|{ users : references");
  });
});
