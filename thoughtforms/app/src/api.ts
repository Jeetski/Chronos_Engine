import type { BootstrapPayload, QueryPayload } from "./types";

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchBootstrap(): Promise<BootstrapPayload> {
  const response = await fetch("/api/thoughtforms/bootstrap");
  return readJson<BootstrapPayload>(response);
}

export async function queryChronos(prompt: string): Promise<QueryPayload> {
  const response = await fetch("/api/thoughtforms/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt })
  });
  return readJson<QueryPayload>(response);
}
