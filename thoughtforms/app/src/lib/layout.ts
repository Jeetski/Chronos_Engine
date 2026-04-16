import type { BoardNode } from "../types";

export function mergeNodes(existing: BoardNode[], incoming: BoardNode[]): BoardNode[] {
  const byId = new Map(existing.map((node) => [node.id, node]));
  for (const node of incoming) {
    const current = byId.get(node.id);
    byId.set(node.id, current ? { ...node, x: current.x, y: current.y } : node);
  }
  return Array.from(byId.values());
}

export function pruneTransient(nodes: BoardNode[]): BoardNode[] {
  return nodes.filter((node) => !node.transient);
}
