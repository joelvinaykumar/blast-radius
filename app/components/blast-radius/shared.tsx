import type React from "react";
import { MarkerType, type Edge, type Node } from "reactflow";

import type {
  AffectedPagesResponse,
  BlastRadiusResponse,
} from "@/lib/api-types";

export type TabKey = "graph" | "affected" | "prompt";

export function parseErrorPayload(payload: unknown): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error;
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return "Unexpected API error";
}

export async function readJsonOrThrow<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(parseErrorPayload(payload));
  }

  return payload as T;
}

export function normalizeRepoInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (trimmed.startsWith("file://") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    return `file://${trimmed}`;
  }

  return trimmed;
}

export function tabClass(active: boolean): string {
  return active
    ? "rounded-full bg-black px-4 py-2 text-sm font-semibold text-white"
    : "rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100";
}

export function toGraphNodes(data: BlastRadiusResponse, seedSymbol: string, focusedNodeId: string | null): Node[] {
  return data.nodes.map((item, index) => {
    const x = (index % 4) * 230;
    const y = Math.floor(index / 4) * 120;
    const isSeed = item.id === seedSymbol;
    const isFocused = focusedNodeId === item.id;

    return {
      id: item.id,
      data: {
        label: `${item.label} · ${item.kind}`,
      },
      position: { x, y },
      style: {
        borderRadius: 10,
        border: isFocused ? "2px solid #0ea5e9" : isSeed ? "2px solid #22c55e" : "1px solid #d4d4d8",
        background: isFocused ? "#f0f9ff" : isSeed ? "#f0fdf4" : "#ffffff",
        color: "#111827",
        fontSize: 12,
        width: 210,
      },
    };
  });
}

export function toGraphEdges(data: BlastRadiusResponse, focusedNodeId: string | null): Edge[] {
  return data.edges.map((item) => {
    const isFocused = focusedNodeId ? item.source === focusedNodeId || item.target === focusedNodeId : false;

    return {
      id: item.id,
      source: item.source,
      target: item.target,
      label: item.type,
      markerEnd: {
        type: MarkerType.ArrowClosed,
      },
      animated: isFocused,
      style: {
        stroke: isFocused ? "#0284c7" : "#64748b",
        strokeWidth: isFocused ? 2 : 1,
      },
      labelStyle: {
        fill: "#334155",
        fontSize: 11,
      },
    };
  });
}

export function buildPrompt(args: {
  repoId: string;
  symbol: string;
  blast: BlastRadiusResponse | null;
  affected: AffectedPagesResponse | null;
}): string {
  const { repoId, symbol, blast, affected } = args;

  const blastSummary = blast
    ? `Blast nodes: ${blast.nodes.length}, edges: ${blast.edges.length}, impacted files: ${blast.impactedFileCount}`
    : "Blast nodes: n/a";

  const affectedSummary = affected
    ? affected.pages
        .slice(0, 10)
        .map((item) => `- ${item.route || item.filePath}`)
        .join("\n")
    : "- n/a";

  return [
    "Analyze impact for this repository graph context:",
    `repoId: ${repoId}`,
    `seed symbol: ${symbol}`,
    "",
    blastSummary,
    "",
    "Affected pages:",
    affectedSummary,
  ].join("\n");
}

export function RefreshCcwIcon(props: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className} aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 15.3-6.3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.3 6.3L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

export function EllipsisVerticalIcon(props: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className} aria-hidden="true">
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}
