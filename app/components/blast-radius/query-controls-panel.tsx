import { useEffect, useState } from "react";
import type React from "react";

import type { SymbolSearchItem, SymbolSearchResponse } from "@/lib/api-types";

import { readJsonOrThrow } from "./shared";

type QueryControlsPanelProps = {
  repoId: string;
  symbol: string;
  maxDepth: number;
  effectiveSymbol: string;
  onSymbolChange: (value: string) => void;
  onMaxDepthChange: (value: number) => void;
  onRunBlast: () => void;
  isBlastPending: boolean;
  isAffectedPending: boolean;
};

export function QueryControlsPanel(props: QueryControlsPanelProps): React.JSX.Element {
  const {
    repoId,
    symbol,
    maxDepth,
    effectiveSymbol,
    onSymbolChange,
    onMaxDepthChange,
    onRunBlast,
    isBlastPending,
    isAffectedPending,
  } = props;

  const [searchResults, setSearchResults] = useState<SymbolSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const prefixedSymbolValue = symbol;

  const shouldSearch = Boolean(repoId) && Boolean(prefixedSymbolValue.trim());
  const visibleSearchResults = shouldSearch ? searchResults : [];
  const visibleSearchError = shouldSearch ? searchError : null;

  useEffect(() => {
    if (!shouldSearch) {
      return;
    }

    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);

      try {
        const url = new URL("/api/symbol-search", window.location.origin);
        url.searchParams.set("repoId", repoId);
        url.searchParams.set("query", prefixedSymbolValue.trim());

        const response = await fetch(url.toString(), {
          signal: controller.signal,
        });

        const payload = await readJsonOrThrow<SymbolSearchResponse>(response);
        setSearchResults(payload.results.slice(0, 5));
        setIsSearchOpen(payload.results.length > 0);
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") {
          return;
        }

        setSearchResults([]);
        setIsSearchOpen(false);
        setSearchError(error instanceof Error ? error.message : "Symbol search failed");
      } finally {
        setIsSearching(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [prefixedSymbolValue, repoId, shouldSearch]);

  function handleSelectSymbol(item: SymbolSearchItem): void {
    onSymbolChange(item.symbol);
    setIsSearchOpen(false);
  }

  return (
    <div className="lg:col-span-1">
      <h2 className="mb-3 text-lg font-semibold">Queries</h2>

      {!repoId ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center">
          <p className="text-sm font-medium text-zinc-500">No repository selected</p>
          <p className="mt-1 text-xs text-zinc-400">Select a repo from the list above, or ingest a new one to get started.</p>
        </div>
      ) : (
        <>
          <div className="mb-4 space-y-2">
            <label className="text-sm font-semibold">Seed symbol</label>
            <div className="relative">
              <input
                value={prefixedSymbolValue}
                onChange={(event) => onSymbolChange(event.target.value)}
                onFocus={() => {
                  if (visibleSearchResults.length > 0) {
                    setIsSearchOpen(true);
                  }
                }}
                onBlur={() => {
                  window.setTimeout(() => setIsSearchOpen(false), 120);
                }}
                placeholder="Search by file name or symbol..."
                className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
              />

              {isSearchOpen && shouldSearch ? (
                <div className="absolute z-20 mt-1.5 max-h-60 w-full overflow-auto rounded-lg border border-zinc-200 bg-white p-1.5 shadow-xl transition-all duration-200">
                  {visibleSearchResults.map((item) => {
                    const fileName = item.filePath ? item.filePath.split("/").pop() : "";
                    return (
                      <button
                        key={item.symbol}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          handleSelectSymbol(item);
                        }}
                        className="w-full flex flex-col rounded-md px-2.5 py-1.5 text-left hover:bg-zinc-50 transition-colors duration-150"
                      >
                        <span className="font-semibold text-zinc-800 text-sm">
                          {item.label}
                        </span>
                        {fileName ? (
                          <span className="text-zinc-500 text-xs mt-0.5 truncate">
                            {fileName}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {!symbol.trim() && repoId ? (
              <p className="text-xs text-zinc-500">Using default: {effectiveSymbol}</p>
            ) : null}
            {isSearching && shouldSearch ? <p className="text-xs text-zinc-500 animate-pulse">Searching symbols...</p> : null}
            {visibleSearchError ? <p className="text-xs text-red-600">{visibleSearchError}</p> : null}
            
            <div className="flex flex-col gap-1.5 pt-1">
              <label className="text-xs font-semibold text-zinc-500">Max blast depth</label>
              <input
                type="number"
                min={1}
                max={8}
                value={maxDepth}
                onChange={(event) => onMaxDepthChange(Number(event.target.value) || 3)}
                className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none transition-all duration-150 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
              />
            </div>
            <button
              type="button"
              onClick={onRunBlast}
              disabled={isBlastPending || isAffectedPending || !effectiveSymbol}
              className="h-10 w-full rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors duration-150 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
            >
              {isBlastPending
                ? "Running blast..."
                : isAffectedPending
                  ? "Finding affected pages..."
                  : "Run blast radius"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
