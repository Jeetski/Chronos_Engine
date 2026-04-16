import { useEffect, useRef, useState } from "react";
import type { BoardNode } from "../types";

type CanvasBoardProps = {
  nodes: BoardNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
};

type DragState = {
  id: string;
  originX: number;
  originY: number;
  startX: number;
  startY: number;
};

const BOARD_WIDTH = 1800;
const BOARD_HEIGHT = 1400;

export function CanvasBoard({ nodes, selectedId, onSelect, onMove }: CanvasBoardProps) {
  const [dragging, setDragging] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    dragRef.current = dragging;
  }, [dragging]);

  useEffect(() => {
    if (!dragging) {
      return undefined;
    }

    function handlePointerMove(event: PointerEvent) {
      const active = dragRef.current;
      if (!active) {
        return;
      }
      const nextX = Math.max(32, active.originX + (event.clientX - active.startX));
      const nextY = Math.max(32, active.originY + (event.clientY - active.startY));
      onMove(active.id, nextX, nextY);
    }

    function handlePointerUp() {
      setDragging(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragging, onMove]);

  return (
    <section className="canvas-shell">
      <div className="canvas-toolbar">
        <div>
          <p className="eyebrow">Board</p>
          <h2>Spatial surface</h2>
        </div>
        <p className="canvas-note">Drag cards around. Chronos bootstrap cards stay; query cards can be cleared from the side panel.</p>
      </div>
      <div className="canvas-scroll">
        <div className="canvas-board" style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT }}>
          {nodes.map((node) => {
            const isSelected = node.id === selectedId;
            return (
              <article
                key={node.id}
                className={`board-node${isSelected ? " selected" : ""}`}
                style={{
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  borderColor: node.color,
                  boxShadow: isSelected ? `0 0 0 1px ${node.color}, 0 24px 64px rgba(4, 10, 24, 0.48)` : undefined
                }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  onSelect(node.id);
                  setDragging({
                    id: node.id,
                    originX: node.x,
                    originY: node.y,
                    startX: event.clientX,
                    startY: event.clientY
                  });
                }}
              >
                <div className="node-accent" style={{ background: node.color }} />
                <header>
                  <span className="node-kind">{node.kind.replaceAll("_", " ")}</span>
                  {node.transient ? <span className="node-state">query</span> : <span className="node-state">{node.source}</span>}
                </header>
                <h3>{node.title}</h3>
                {node.subtitle ? <p className="node-subtitle">{node.subtitle}</p> : null}
                {node.body ? <p className="node-body">{node.body}</p> : null}
                {node.tags.length ? (
                  <div className="node-tags">
                    {node.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
