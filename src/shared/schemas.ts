import { z } from 'zod'
import { isSafeDirectoryName } from './validators';

export const CommandSpecSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional()
})

export const ProjectKindSchema = z.enum([
  'node',
  'python',
  'docker',
  'rust',
  'go',
  'dotnet',
  'java',
  'make',
  'static',
  'unknown'
])

export const RepoStatusSchema = z.enum([
  'not_cloned',
  'cloning',
  'cloned',
  'installing',
  'installed',
  'running',
  'error',
  'missing'
])

export const DetectionResultSchema = z.object({
  kinds: z.array(ProjectKindSchema),
  packageManager: z
    .enum([
      'npm',
      'pnpm',
      'yarn',
      'bun',
      'pip',
      'poetry',
      'uv',
      'pipenv',
      'cargo',
      'go',
      'dotnet',
      'maven',
      'gradle'
    ])
    .optional(),
  installCandidates: z.array(CommandSpecSchema),
  startCandidates: z.array(CommandSpecSchema),
  requiredTools: z.array(z.string()),
  hasEnvExample: z.boolean(),
  detectedPort: z.number().int().positive().optional(),
  isMonorepo: z.boolean().optional(),
  readmeCommands: z.array(CommandSpecSchema).optional()
})

export const RepoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  owner: z.string().optional(),
  remoteUrl: z.string().optional(),
  localPath: z.string().optional(),
  status: RepoStatusSchema,
  description: z.string().optional(),
  language: z.string().optional(),
  stars: z.number().int().nonnegative().optional(),
  topics: z.array(z.string()).optional(),
  coverPath: z.string().optional(),
  tags: z.array(z.string()),
  favorite: z.boolean(),
  notes: z.string().optional(),
  detection: DetectionResultSchema.optional(),
  installCommand: CommandSpecSchema.optional(),
  startCommand: CommandSpecSchema.optional(),
  commandsEditedByUser: z.boolean().optional(),
  extraCommands: z
    .array(z.object({ label: z.string().min(1), spec: CommandSpecSchema }))
    .optional(),
  openUrl: z.string().optional(),
  addedAt: z.string(),
  installedAt: z.string().optional(),
  lastRunAt: z.string().optional(),
  lastPulledAt: z.string().optional(),
  behindBy: z.number().int().nonnegative().optional(),
  lastError: z.string().optional()
})

export const SettingsSchema = z.object({
  reposRoot: z.string().min(1),
  basesRoot: z.string().min(1).default('BASES'),
  skillFolders: z.array(z.string()).default([]),
  scanFolders: z.array(z.string()),
  githubToken: z.string().optional(),
  editorCommand: z.string().min(1),
  terminalPreference: z.string().min(1),
  theme: z.enum(['dark', 'light']),
  viewMode: z.enum(['grid', 'list']),
  checkUpdatesOnStart: z.boolean()
})

export const SkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  path: z.string().min(1),
  source: z.string().min(1),
  tags: z.array(z.string()),
  favorite: z.boolean(),
  addedAt: z.string(),
  updatedAt: z.string().optional()
});

export const BaseItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  remoteUrl: z.string().optional(),
  localPath: z.string().optional(),
  tags: z.array(z.string()),
  favorite: z.boolean(),
  addedAt: z.string(),
  notes: z.string().optional()
});

export const ProjectRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  localPath: z.string().optional(),
  remoteUrl: z.string().optional(),
  tags: z.array(z.string()).default([]),
  favorite: z.boolean().default(false),
  skillIds: z.array(z.string()).default([]),
  baseIds: z.array(z.string()).default([]),
  notes: z.string().optional(),
  addedAt: z.string()
});

export const LibraryFileSchema = z.object({
  version: z.literal(2),
  repos: z.array(RepoSchema).default([]),
  skills: z.array(SkillSchema).default([]),
  bases: z.array(BaseItemSchema).default([]),
  projects: z.array(ProjectRefSchema).default([]),
  settings: SettingsSchema
});

export const SkillUpdateInputSchema = z
  .object({
    id: z.string().min(1),
    patch: z
      .object({
        tags: z.array(z.string()).optional(),
        favorite: z.boolean().optional()
      })
      .strict()
  })
  .strict();

export const BaseUpdateInputSchema = z
  .object({
    id: z.string().min(1),
    patch: z
      .object({
        name: z
          .string()
          .trim()
          .min(1)
          .refine(isSafeDirectoryName, 'Nome de base inválido')
          .optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
        favorite: z.boolean().optional()
      })
      .strict()
  })
  .strict();

export const ProjectUpdateInputSchema = z
  .object({
    id: z.string().min(1),
    skillIds: z.array(z.string()).optional(),
    baseIds: z.array(z.string()).optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    favorite: z.boolean().optional()
  })
  .strict();

export const TagRenameInputSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1)
  })
  .strict();

export const TagNameInputSchema = z.object({ name: z.string().min(1) }).strict();

export const RepoPatchSchema = RepoSchema.partial().omit({ id: true });

export const RepoUpdateInputSchema = RepoPatchSchema.extend({
  id: z.string().min(1)
});

export const AddByUrlInputSchema = z.object({
  url: z.string().min(1),
  clone: z.boolean(),
  name: z.string().min(1).optional()
})

export const AddLocalInputSchema = z.object({
  path: z.string().min(1)
})

export const RepoIdInputSchema = z.object({
  id: z.string().min(1)
})

export const RepoRemoveInputSchema = z.object({
  id: z.string().min(1),
  deleteFolder: z.boolean()
})

export const SettingsPatchSchema = SettingsSchema.partial()

export const ProcessRunInputSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['install', 'start', 'extra']),
  extraIndex: z.number().int().nonnegative().optional()
})
