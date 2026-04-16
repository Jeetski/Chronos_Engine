export type BoardNode = {
  id: string;
  kind: string;
  title: string;
  subtitle?: string;
  body?: string;
  tags: string[];
  x: number;
  y: number;
  width: number;
  color: string;
  source: string;
  transient: boolean;
};

export type BootstrapPayload = {
  ok: boolean;
  message: string;
  meta: {
    projectName: string;
    mode: string;
    fetchedAt: string;
  };
  context: {
    profile?: {
      nickname?: string;
      theme?: string;
    };
    status?: Record<string, string>;
    today?: {
      date: string;
      blockCount: number;
      blocks: Array<{
        name: string;
        type: string;
        start?: string;
        end?: string;
        status?: string;
        category?: string;
      }>;
    };
    counts?: Record<string, number>;
  };
  nodes: BoardNode[];
};

export type QueryPayload = {
  ok: boolean;
  prompt: string;
  reply: string;
  nodes: BoardNode[];
  context?: {
    matches?: number;
    hitsByType?: Record<string, number>;
  };
};

export type ChatMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  text: string;
};
