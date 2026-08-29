import type React from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
} from "reactflow";

import type {
  AffectedPagesResponse,
  BlastRadiusResponse,
} from "@/lib/api-types";

import { tabClass, type TabKey } from "./shared";

type ResultsPanelProps = {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  blastPending: boolean;
  blastData?: BlastRadiusResponse;
  graphNodes: Node[];
  graphEdges: Edge[];
  onNodeClick: (nodeId: string) => void;
  affectedPending: boolean;
  affectedData?: AffectedPagesResponse;
  promptText: string;
  onCopyPrompt: () => void;
  copyState: "idle" | "copied" | "failed";
};

export function ResultsPanel(props: ResultsPanelProps): React.JSX.Element {
  const {
    activeTab,
    onTabChange,
    blastPending,
    blastData,
    graphNodes,
    graphEdges,
    onNodeClick,
    affectedPending,
    affectedData,
    promptText,
    onCopyPrompt,
    copyState,
  } = props;

  return (
    <div className="lg:col-span-2">
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className={tabClass(activeTab === "graph")} onClick={() => onTabChange("graph")}>Graph</button>
        <button type="button" className={tabClass(activeTab === "affected")} onClick={() => onTabChange("affected")}>Affected pages</button>
        <button type="button" className={tabClass(activeTab === "prompt")} onClick={() => onTabChange("prompt")}>Copy-as-prompt</button>
      </div>

      {activeTab === "graph" ? (
        <div className="h-120 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
          {blastPending ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">Loading blast graph...</div>
          ) : blastData ? (
            <ReactFlow
              nodes={graphNodes}
              edges={graphEdges}
              fitView
              onNodeClick={(_, node) => onNodeClick(node.id)}
            >
              <MiniMap zoomable pannable />
              <Controls />
              <Background />
            </ReactFlow>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              No graph yet. Run blast radius query.
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "affected" ? (
        <div className="h-120 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          {affectedPending ? <p className="text-sm text-zinc-500">Loading affected pages...</p> : null}
          {!affectedPending && !affectedData ? (
            <p className="text-sm text-zinc-500">No result yet. Run affected pages query.</p>
          ) : null}
          {affectedData ? (
            affectedData.pages.length > 0 ? (
              <ul className="space-y-2">
                {affectedData.pages.map((item) => (
                  <li key={`${item.filePath}:${item.route}`} className="rounded-lg bg-white p-3 text-sm">
                    <p className="font-semibold">{item.route || item.filePath}</p>
                    <p className="text-zinc-600">{item.filePath}</p>
                    <p className="text-zinc-500">Changed: {item.reasons.join(", ")}</p>
                    {item.symbols && item.symbols.length > 0 ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        <span className="font-medium text-zinc-600">Affected symbols:</span>{" "}
                        {item.symbols.join(", ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">No affected pages found for the provided changed files.</p>
            )
          ) : null}
        </div>
      ) : null}

      {activeTab === "prompt" ? (
        <div className="flex h-120 flex-col rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Copy-as-prompt</h3>
            <button
              type="button"
              onClick={onCopyPrompt}
              className="rounded-md bg-black px-3 py-1.5 text-xs font-semibold text-white"
            >
              {copyState === "copied"
                ? "Copied"
                : copyState === "failed"
                  ? "Copy failed"
                  : "Copy"}
            </button>
          </div>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-xs text-zinc-700">
            {promptText}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
