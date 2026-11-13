import { z } from 'zod';

const RepoId = z.string().trim().min(1).max(128);

export const BranchesListInputSchema = z.object({ id: RepoId });

export const BranchCreateInputSchema = z.object({
  id: RepoId,
  name: z.string().trim().min(1).max(120),
  defaultBranch: z.string().trim().min(1).max(255).optional()
});

export const BranchCheckoutInputSchema = z.object({
  id: RepoId,
  branch: z.string().trim().min(1).max(255)
});

export interface LocalBranchSummary {
  name: string;
  current: boolean;
}

export interface RemoteBranchSummary {
  name: string;
  remote: string;
  ref: string;
}

export interface GitBranchList {
  current: string | null;
  local: LocalBranchSummary[];
  remote: RemoteBranchSummary[];
}
