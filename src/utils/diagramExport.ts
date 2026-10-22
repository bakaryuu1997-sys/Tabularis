/**
 * Diagram export utilities for Schema ERD diagrams.
 */

export interface DiagramNodeData {
  label?: string;
  columns?: Array<{ name: string; type: string; is_primary?: boolean }>;
}

export interface DiagramNode {
  id: string;
  data: unknown;
}

export interface DiagramEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
}

/**
 * Generates Mermaid ERD markdown code from nodes and edges.
 */
export function generateMermaidErd(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): string {
  if (nodes.length === 0) return "erDiagram\n";

  let out = "erDiagram\n";

  for (const node of nodes) {
    const data = (node.data || {}) as DiagramNodeData;
    const rawName = data.label || node.id;
    const cleanName = rawName.replace(/[^a-zA-Z0-9_]/g, "_");

    out += `    ${cleanName} {\n`;
    const cols = data.columns || [];
    if (cols.length === 0) {
      out += `        string id PK\n`;
    } else {
      for (const col of cols) {
        const cleanType = (col.type || "string").replace(/[^a-zA-Z0-9_]/g, "_");
        const cleanCol = col.name.replace(/[^a-zA-Z0-9_]/g, "_");
        const pkSuffix = col.is_primary ? " PK" : "";
        out += `        ${cleanType} ${cleanCol}${pkSuffix}\n`;
      }
    }
    out += `    }\n`;
  }

  for (const edge of edges) {
    const src = edge.source.replace(/[^a-zA-Z0-9_]/g, "_");
    const tgt = edge.target.replace(/[^a-zA-Z0-9_]/g, "_");
    out += `    ${src} }|..|{ ${tgt} : references\n`;
  }

  return out;
}

/**
 * Downloads a text string as a file in the browser.
 */
export function downloadTextFile(content: string, filename: string, mimeType = "text/plain"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
