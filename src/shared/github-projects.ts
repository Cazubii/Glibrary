import { z } from 'zod';

export const ProjectVisibilitySchema = z.enum(['all', 'private', 'public']);
export type ProjectVisibility = z.infer<typeof ProjectVisibilitySchema>;

export const ListAccountReposInputSchema = z.object({
  page: z.number().int().positive().default(1),
  perPage: z.number().int().min(1).max(100).default(50),
  sort: z.literal('updated').default('updated'),
  visibility: ProjectVisibilitySchema.default('all'),
  /** A API não aceita esse filtro; ele é aplicado à página recebida. */
  fork: z.boolean().default(true)
});

export type ListAccountReposInput = z.input<typeof ListAccountReposInputSchema> & {
  token?: string;
};

export interface ProjectRepoSummary {
  id: number;
  name: string;
  fullName: string;
  description?: string;
  visibility: 'private' | 'public';
  isFork: boolean;
  language?: string;
  stars: number;
  updatedAt: string;
  htmlUrl: string;
  defaultBranch?: string;
}

export interface ProjectRepoPage {
  repos: ProjectRepoSummary[];
  page: number;
  perPage: number;
  hasMore: boolean;
}
