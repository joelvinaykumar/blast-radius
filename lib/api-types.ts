import { z } from "zod";

export const JobStatusSchema = z.enum([
  "queued",
  "cloning",
  "parsing",
  "writing_graph",
  "ready",
  "failed",
]);

export const CreateRepoRequestSchema = z.object({
  repoUrl: z.string().url(),
  branch: z.string().min(1).max(200).optional(),
});

export const CreateRepoResponseSchema = z.object({
  jobId: z.string().uuid(),
  status: JobStatusSchema,
});

export const IngestResultSchema = z.object({
  repoId: z.string().min(1),
  repoName: z.string().min(1),
  branch: z.string().min(1),
  parsedFiles: z.number().int().nonnegative(),
  parsedSymbols: z.number().int().nonnegative(),
  parsedDependencies: z.number().int().nonnegative(),
});

export const IngestedRepoSummarySchema = z.object({
  repoId: z.string().min(1),
  repoUrl: z.string().min(1),
  repoName: z.string().min(1),
  branch: z.string().min(1),
  ingestedAt: z.string().datetime(),
  parsedFiles: z.number().int().nonnegative(),
  parsedSymbols: z.number().int().nonnegative(),
  parsedDependencies: z.number().int().nonnegative(),
});

export const IngestedReposResponseSchema = z.object({
  repositories: z.array(IngestedRepoSummarySchema),
});

export const JobStatusResponseSchema = z.object({
  jobId: z.string().uuid(),
  status: JobStatusSchema,
  repoUrl: z.string().min(1),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  error: z.string().nullable(),
  result: IngestResultSchema.nullable(),
});

export const BlastRadiusQuerySchema = z.object({
  repoId: z.string().min(1),
  symbol: z.string().min(1),
  maxDepth: z.number().int().min(1).max(8).default(3),
});

export const AffectedPagesQuerySchema = z.object({
  repoId: z.string().min(1),
  changedFiles: z.array(z.string().min(1)).min(1).max(200),
});

export const SymbolSearchQuerySchema = z.object({
  repoId: z.string().min(1),
  query: z.string().min(1).max(300),
});

export const BlastNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.string(),
  filePath: z.string().nullable(),
  score: z.number().nullable(),
});

export const BlastEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.string(),
});

export const BlastRadiusResponseSchema = z.object({
  nodes: z.array(BlastNodeSchema),
  edges: z.array(BlastEdgeSchema),
  impactedFileCount: z.number().int().nonnegative(),
  impactedSymbolCount: z.number().int().nonnegative(),
});

export const AffectedPageSchema = z.object({
  route: z.string(),
  filePath: z.string(),
  reasons: z.array(z.string()),
  symbols: z.array(z.string()).default([]),
});

export const AffectedPagesResponseSchema = z.object({
  pages: z.array(AffectedPageSchema),
});

export const SymbolSearchItemSchema = z.object({
  symbol: z.string().min(1),
  label: z.string().min(1),
  filePath: z.string().nullable(),
});

export const SymbolSearchResponseSchema = z.object({
  results: z.array(SymbolSearchItemSchema),
});

export type JobStatus = z.infer<typeof JobStatusSchema>;
export type CreateRepoRequest = z.infer<typeof CreateRepoRequestSchema>;
export type CreateRepoResponse = z.infer<typeof CreateRepoResponseSchema>;
export type IngestResult = z.infer<typeof IngestResultSchema>;
export type IngestedRepoSummary = z.infer<typeof IngestedRepoSummarySchema>;
export type IngestedReposResponse = z.infer<typeof IngestedReposResponseSchema>;
export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>;
export type BlastRadiusQuery = z.infer<typeof BlastRadiusQuerySchema>;
export type AffectedPagesQuery = z.infer<typeof AffectedPagesQuerySchema>;
export type SymbolSearchQuery = z.infer<typeof SymbolSearchQuerySchema>;
export type BlastNode = z.infer<typeof BlastNodeSchema>;
export type BlastEdge = z.infer<typeof BlastEdgeSchema>;
export type BlastRadiusResponse = z.infer<typeof BlastRadiusResponseSchema>;
export type AffectedPage = z.infer<typeof AffectedPageSchema>;
export type AffectedPagesResponse = z.infer<typeof AffectedPagesResponseSchema>;
export type SymbolSearchItem = z.infer<typeof SymbolSearchItemSchema>;
export type SymbolSearchResponse = z.infer<typeof SymbolSearchResponseSchema>;
