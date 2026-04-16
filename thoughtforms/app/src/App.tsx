import { startTransition, useEffect, useMemo, useState } from "react";
import { fetchBootstrap, queryChronos } from "./api";
import { BridgePanel } from "./components/BridgePanel";
import { CanvasBoard } from "./components/CanvasBoard";
import { mergeNodes, pruneTransient } from "./lib/layout";
import type { BoardNode, BootstrapPayload, ChatMessage } from "./types";

function message(id: string, role: ChatMessage["role"], text: string): ChatMessage {
  return { id, role, text };
}

export default function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [nodes, setNodes] = useState<BoardNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("today");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    message(
      "system-0",
      "system",
      "Thoughtforms is a sidecar prototype. It only reads a light slice of Chronos and turns responses into whiteboard cards."
    )
  ]);

  async function loadBootstrap() {
    setLoading(true);
    try {
      const payload = await fetchBootstrap();
      setBootstrap(payload);
      startTransition(() => {
        setNodes(payload.nodes);
        setSelectedId(payload.nodes[0]?.id ?? null);
      });
      setMessages((current) => [
        current[0],
        message("assistant-bootstrap", "assistant", payload.message)
      ]);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Bootstrap failed.";
      setMessages((current) => [...current, message(`assistant-error-${Date.now()}`, "assistant", text)]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBootstrap();
  }, []);

  async function handleSubmit() {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || loading) {
      return;
    }
    setLoading(true);
    setMessages((current) => [...current, message(`user-${Date.now()}`, "user", cleanPrompt)]);
    try {
      const payload = await queryChronos(cleanPrompt);
      startTransition(() => {
        setNodes((current) => mergeNodes(current, payload.nodes));
        if (payload.nodes[0]?.id) {
          setSelectedId(payload.nodes[0].id);
        }
      });
      setMessages((current) => [...current, message(`assistant-${Date.now()}`, "assistant", payload.reply)]);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Query failed.";
      setMessages((current) => [...current, message(`assistant-error-${Date.now()}`, "assistant", text)]);
    } finally {
      setLoading(false);
    }
  }

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedId) ?? null, [nodes, selectedId]);

  return (
    <div className="app-shell">
      <BridgePanel
        bootstrap={bootstrap}
        messages={messages}
        prompt={prompt}
        loading={loading}
        onPromptChange={setPrompt}
        onSubmit={handleSubmit}
        onResetTransient={() => {
          setNodes((current) => pruneTransient(current));
          if (selectedNode?.transient) {
            setSelectedId(null);
          }
        }}
        onReload={() => {
          void loadBootstrap();
        }}
      />
      <main className="workspace-shell">
        <div className="workspace-header">
          <div>
            <p className="eyebrow">Chronos Bridge</p>
            <h1>Thoughtforms Prototype</h1>
          </div>
          <div className="workspace-meta">
            <span>{bootstrap?.meta?.mode ?? "prototype"}</span>
            <span>{bootstrap?.meta?.fetchedAt ?? "loading"}</span>
          </div>
        </div>
        <CanvasBoard
          nodes={nodes}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMove={(id, x, y) => {
            setNodes((current) =>
              current.map((node) => (node.id === id ? { ...node, x, y } : node))
            );
          }}
        />
        <aside className="inspector">
          <p className="eyebrow">Inspector</p>
          {selectedNode ? (
            <>
              <h2>{selectedNode.title}</h2>
              <p className="inspector-kind">{selectedNode.kind}</p>
              {selectedNode.subtitle ? <p>{selectedNode.subtitle}</p> : null}
              {selectedNode.body ? <p>{selectedNode.body}</p> : null}
              <div className="inspector-meta">
                <span>source: {selectedNode.source}</span>
                <span>{selectedNode.transient ? "query card" : "bootstrap card"}</span>
              </div>
              {selectedNode.tags.length ? (
                <div className="node-tags">
                  {selectedNode.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="empty-copy">Select a card to inspect it here.</p>
          )}
        </aside>
      </main>
    </div>
  );
}
