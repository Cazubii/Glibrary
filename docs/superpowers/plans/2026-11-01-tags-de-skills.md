# Filtro e gestão de tags — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** permitir categorizar e organizar Skills, Bases e Projetos com tags livres: editar tags e favoritar nos cards, filtrar a grade por chips (semântica E) e renomear/apagar tags em massa.

**Architecture:** helpers puros de tag em `src/shared/tags.ts`; métodos de update e gestão global em `LibraryStore`; 5 canais IPC em `assets.ipc.ts` (2 updates novos, `project:update` estendido, `tags:rename`, `tags:delete`); UI com `TagChips` + `TagManagerDialog` + `TagPopover` + cards extraídos para `AssetCards.tsx`. Sem migração: os itens já têm `tags: string[]` e `favorite`.

**Tech Stack:** Electron + electron-vite, React 19, TypeScript strict, Zod v4, Zustand, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-01-tags-de-skills-design.md`

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/shared/tags.ts` | criar | normalização, identidade, filtro e contagem de tags (puro) |
| `src/shared/validators.ts` | criar | `isSafeDirectoryName` (movido de `assets.ipc.ts`) |
| `src/shared/schemas.ts` | modificar | `SkillSchema`/`BaseItemSchema`/`ProjectRefSchema` nomeados + schemas de input dos updates e de tags |
| `src/shared/ipc-channels.ts` | modificar | canais `skills:update`, `bases:update`, `tags:rename`, `tags:delete` |
| `src/main/services/library-store.ts` | modificar | `updateSkill`, `updateBase`, `updateProject`, `renameTag`, `deleteTag` |
| `src/main/services/skills-scan.ts` | criar | `discoverSkills` + `parseSkillMetadata` (extraídos do handler) |
| `src/main/ipc/assets.ipc.ts` | modificar | novos handlers; `skillsScan` delega a `discoverSkills` |
| `src/renderer/src/lib/api.ts` | modificar | clientes dos novos canais; `projectUpdate` aceita `tags`/`favorite` |
| `src/renderer/src/components/TagChips.tsx` | criar | barra de chips com contagem, seleção, Limpar e engrenagem |
| `src/renderer/src/components/TagManagerDialog.tsx` | criar | dialog global de renomear/apagar tags |
| `src/renderer/src/components/TagPopover.tsx` | criar | popover de edição de tags com sugestões |
| `src/renderer/src/components/AssetCards.tsx` | criar | `SkillCard`, `BaseCard`, `ProjectCard` com tags + favorito |
| `src/renderer/src/pages/AssetLibraryPage.tsx` | modificar | estado do filtro, chips, dialog, cards e favoritos |
| `tests/tags.test.ts` | criar | helpers de tag |
| `tests/schemas.test.ts` | criar | validação Zod dos inputs novos |
| `tests/skills-scan.test.ts` | criar | descoberta e preservação na ressincronização |
| `tests/library-store.test.ts` | modificar | updates, rename/delete global |
| `docs/DECISOES.md` | modificar | decisões duráveis da feature |

Convenções (obrigatórias): sem `any`; imports de tipo com `import type` (regra `consistent-type-imports`); `noUnusedLocals` ativo (nada de import/variável sem uso); respostas IPC `{ ok: true, data } | { ok: false, error }`; UI em pt-BR; gate antes de cada commit: `pnpm typecheck && pnpm lint && pnpm test`.

---

### Task 1: Helpers de tag em `src/shared/tags.ts`

**Files:**
- Create: `src/shared/tags.ts`
- Test: `tests/tags.test.ts`

- [ ] **Step 1: Escrever o teste falhando**

Criar `tests/tags.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  normalizeTag,
  tagKey,
  sameTag,
  normalizeTagList,
  matchesTags,
  countTags
} from '../src/shared/tags';

describe('normalizeTag', () => {
  it('remove espaços das bordas e colapsa espaços internos', () => {
    expect(normalizeTag('  docs   de  produto ')).toBe('docs de produto');
  });

  it('devolve null para vazio ou só espaços', () => {
    expect(normalizeTag('')).toBeNull();
    expect(normalizeTag('   ')).toBeNull();
  });
});

describe('tagKey e sameTag', () => {
  it('compara sem diferenciar maiúsculas e ignora espaços externos', () => {
    expect(sameTag('Docs', 'docs')).toBe(true);
    expect(sameTag(' docs ', 'DOCS')).toBe(true);
    expect(sameTag('docs', 'deploy')).toBe(false);
    expect(tagKey(' Docs ')).toBe('docs');
  });
});

describe('normalizeTagList', () => {
  it('normaliza, remove vazios e deduplica preservando a primeira grafia', () => {
    expect(normalizeTagList([' Docs ', 'docs', 'Deploy', '  ', 'deploy'])).toEqual(['Docs', 'Deploy']);
  });

  it('devolve lista vazia para entrada vazia', () => {
    expect(normalizeTagList([])).toEqual([]);
  });
});

describe('matchesTags', () => {
  it('exige todas as tags selecionadas (E), sem diferenciar maiúsculas', () => {
    expect(matchesTags(['Docs', 'deploy'], ['docs', 'deploy'])).toBe(true);
    expect(matchesTags(['Docs'], ['docs', 'deploy'])).toBe(false);
    expect(matchesTags(['Docs'], [])).toBe(true);
  });
});

describe('countTags', () => {
  it('conta itens por tag, deduplica por item e ordena por contagem e chave', () => {
    const counts = countTags([
      { tags: ['Docs', 'deploy'] },
      { tags: ['docs'] },
      { tags: ['deploy', 'Deploy'] }
    ]);
    expect(counts).toEqual([
      { name: 'deploy', count: 2 },
      { name: 'Docs', count: 2 }
    ]);
  });

  it('ignora tags vazias', () => {
    expect(countTags([{ tags: ['  ', 'docs'] }])).toEqual([{ name: 'docs', count: 1 }]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test -- tests/tags.test.ts`
Expected: FAIL — módulo `../src/shared/tags` não encontrado.

- [ ] **Step 3: Implementar o mínimo para passar**

Criar `src/shared/tags.ts`:

```ts
export interface TagCount {
  name: string;
  count: number;
}

export function normalizeTag(input: string): string | null {
  const trimmed = input.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed : null;
}

export function tagKey(tag: string): string {
  return tag.trim().toLowerCase();
}

export function sameTag(a: string, b: string): boolean {
  return tagKey(a) === tagKey(b);
}

export function normalizeTagList(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    if (tag == null) continue;
    const key = tagKey(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

export function matchesTags(itemTags: string[], selected: string[]): boolean {
  return selected.every((tag) => itemTags.some((item) => sameTag(item, tag)));
}

export function countTags(list: { tags: string[] }[]): TagCount[] {
  const map = new Map<string, TagCount>();
  for (const item of list) {
    const seen = new Set<string>();
    for (const raw of item.tags) {
      const tag = normalizeTag(raw);
      if (tag == null) continue;
      const key = tagKey(tag);
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = map.get(key);
      if (entry != null) entry.count += 1;
      else map.set(key, { name: tag, count: 1 });
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || tagKey(a.name).localeCompare(tagKey(b.name))
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm test -- tests/tags.test.ts`
Expected: PASS — 8 testes.

- [ ] **Step 5: Commit**

```bash
git add src/shared/tags.ts tests/tags.test.ts
git commit -m "feat: helpers de normalizacao, identidade e contagem de tags em shared/tags.ts"
```

---

### Task 2: Schemas de input e canais IPC

**Files:**
- Create: `src/shared/validators.ts`
- Modify: `src/shared/schemas.ts`
- Modify: `src/shared/ipc-channels.ts`
- Test: `tests/schemas.test.ts`

- [ ] **Step 1: Escrever o teste falhando**

Criar `tests/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  SkillUpdateInputSchema,
  BaseUpdateInputSchema,
  ProjectUpdateInputSchema,
  TagRenameInputSchema,
  TagNameInputSchema
} from '../src/shared/schemas';

describe('SkillUpdateInputSchema', () => {
  it('aceita patch com tags e favorite', () => {
    const parsed = SkillUpdateInputSchema.parse({
      id: 's1',
      patch: { tags: ['docs'], favorite: true }
    });
    expect(parsed).toEqual({ id: 's1', patch: { tags: ['docs'], favorite: true } });
  });

  it('aceita patch vazio', () => {
    expect(SkillUpdateInputSchema.parse({ id: 's1', patch: {} })).toEqual({ id: 's1', patch: {} });
  });

  it('rejeita chave desconhecida no patch', () => {
    expect(() => SkillUpdateInputSchema.parse({ id: 's1', patch: { name: 'x' } })).toThrow();
  });
});

describe('BaseUpdateInputSchema', () => {
  it('aceita nome, descrição, tags e favorite', () => {
    const parsed = BaseUpdateInputSchema.parse({
      id: 'b1',
      patch: { name: 'starter', description: 'd', tags: ['x'], favorite: false }
    });
    expect(parsed.patch.name).toBe('starter');
    expect(parsed.patch.favorite).toBe(false);
  });

  it('rejeita nome de base inválido', () => {
    expect(() => BaseUpdateInputSchema.parse({ id: 'b1', patch: { name: '..' } })).toThrow();
    expect(() => BaseUpdateInputSchema.parse({ id: 'b1', patch: { name: 'a/b' } })).toThrow();
    expect(() => BaseUpdateInputSchema.parse({ id: 'b1', patch: { name: 'con' } })).toThrow();
  });
});

describe('ProjectUpdateInputSchema', () => {
  it('aceita tags e favorite além dos campos existentes', () => {
    const parsed = ProjectUpdateInputSchema.parse({
      id: 'p1',
      tags: ['docs'],
      favorite: true,
      skillIds: ['s1'],
      baseIds: [],
      notes: 'ok'
    });
    expect(parsed.tags).toEqual(['docs']);
    expect(parsed.favorite).toBe(true);
    expect(parsed.skillIds).toEqual(['s1']);
  });

  it('rejeita campo desconhecido', () => {
    expect(() => ProjectUpdateInputSchema.parse({ id: 'p1', patch: {} })).toThrow();
  });
});

describe('TagRenameInputSchema e TagNameInputSchema', () => {
  it('exige from e to não vazios', () => {
    expect(TagRenameInputSchema.parse({ from: 'docs', to: 'documentação' })).toEqual({
      from: 'docs',
      to: 'documentação'
    });
    expect(() => TagRenameInputSchema.parse({ from: '', to: 'x' })).toThrow();
    expect(() => TagRenameInputSchema.parse({ from: 'x' })).toThrow();
  });

  it('exige name não vazio', () => {
    expect(TagNameInputSchema.parse({ name: 'docs' })).toEqual({ name: 'docs' });
    expect(() => TagNameInputSchema.parse({ name: '' })).toThrow();
    expect(() => TagNameInputSchema.parse({})).toThrow();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test -- tests/schemas.test.ts`
Expected: FAIL — exports não existem em `src/shared/schemas`.

- [ ] **Step 3: Criar `src/shared/validators.ts`**

```ts
export function isSafeDirectoryName(name: string): boolean {
  return (
    name !== '.' &&
    name !== '..' &&
    !/[<>:"|?*\\/\0-\x1f]/.test(name) &&
    !/[. ]$/.test(name) &&
    !/^(con|prn|aux|nul|conin\$|conout\$|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)
  );
}
```

- [ ] **Step 4: Extrair schemas nomeados e adicionar inputs em `src/shared/schemas.ts`**

Adicionar `import { isSafeDirectoryName } from './validators';` no topo. Substituir o corpo de `LibraryFileSchema` pelos schemas nomeados (mesmos campos de hoje) e adicionar os inputs. O restante do arquivo permanece:

```ts
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

export const SkillUpdateInputSchema = z.object({
  id: z.string().min(1),
  patch: z
    .object({
      tags: z.array(z.string()).optional(),
      favorite: z.boolean().optional()
    })
    .strict()
});

export const BaseUpdateInputSchema = z.object({
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
});

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

export const TagRenameInputSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1)
});

export const TagNameInputSchema = z.object({ name: z.string().min(1) });
```

- [ ] **Step 5: Adicionar os canais em `src/shared/ipc-channels.ts`**

Em `IpcChannels`, após `projectAdd: 'projects:add'`:

```ts
  projectAdd: 'projects:add',
  skillUpdate: 'skills:update',
  baseUpdate: 'bases:update',
  tagsRename: 'tags:rename',
  tagsDelete: 'tags:delete'
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `pnpm test -- tests/schemas.test.ts`
Expected: PASS — 7 testes.

Run: `pnpm typecheck && pnpm lint`
Expected: sem erros (o `LibraryFileSchema` refactorado continua coberto pelos testes existentes de `library-store`).

- [ ] **Step 7: Commit**

```bash
git add src/shared/validators.ts src/shared/schemas.ts src/shared/ipc-channels.ts tests/schemas.test.ts
git commit -m "feat: schemas de input de skill/base/project update e gestao de tags, com canais IPC"
```

---

### Task 3: `LibraryStore.updateSkill/updateBase/updateProject`

**Files:**
- Modify: `src/main/services/library-store.ts`
- Test: `tests/library-store.test.ts`

- [ ] **Step 1: Escrever os testes falhando**

Em `tests/library-store.test.ts`, adicionar imports `Skill`, `BaseItem`, `ProjectRef` ao `import type { Repo }` existente e as factories:

```ts
function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: `skill-${counter++}`,
    name: 'demo',
    path: join(dir, 'skills', 'demo'),
    source: join(dir, 'skills'),
    tags: [],
    favorite: false,
    addedAt: new Date().toISOString(),
    ...overrides
  };
}

function makeBase(overrides: Partial<BaseItem> = {}): BaseItem {
  return {
    id: `base-${counter++}`,
    name: 'starter',
    remoteUrl: 'https://github.com/example/starter.git',
    tags: [],
    favorite: false,
    addedAt: new Date().toISOString(),
    ...overrides
  };
}

function makeProject(overrides: Partial<ProjectRef> = {}): ProjectRef {
  return {
    id: `proj-${counter++}`,
    name: 'app',
    localPath: join(dir, 'app'),
    tags: [],
    favorite: false,
    skillIds: [],
    baseIds: [],
    addedAt: new Date().toISOString(),
    ...overrides
  };
}
```

E, dentro de `describe('LibraryStore')`:

```ts
  it('updateSkill persiste tags e favorite com normalização', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({ skills: [makeSkill({ id: 's1', name: 'Demo', tags: ['old'] })] });
    const updated = await store.updateSkill('s1', {
      tags: [' Docs ', 'docs', 'deploy'],
      favorite: true
    });
    expect(updated.tags).toEqual(['Docs', 'deploy']);
    expect(updated.favorite).toBe(true);
    const lib = await new LibraryStore(dir, join(dir, 'repos')).load();
    expect(lib.skills[0]).toMatchObject({ tags: ['Docs', 'deploy'], favorite: true });
  });

  it('updateSkill mantém campos não alterados e lança para id inexistente', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({
      skills: [makeSkill({ id: 's1', name: 'Demo', description: 'd' })]
    });
    const updated = await store.updateSkill('s1', { favorite: true });
    expect(updated.name).toBe('Demo');
    expect(updated.description).toBe('d');
    expect(updated.tags).toEqual([]);
    await expect(store.updateSkill('nope', { favorite: true })).rejects.toThrow();
  });

  it('updateBase persiste nome, descrição, tags e favorite', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({ bases: [makeBase({ id: 'b1', name: 'starter' })] });
    const updated = await store.updateBase('b1', {
      name: 'template',
      description: 'd',
      tags: ['x'],
      favorite: true
    });
    expect(updated).toMatchObject({
      name: 'template',
      description: 'd',
      tags: ['x'],
      favorite: true
    });
    await expect(store.updateBase('nope', {})).rejects.toThrow();
  });

  it('updateProject persiste tags, favorite, associações e notas', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({ projects: [makeProject({ id: 'p1', name: 'app' })] });
    const updated = await store.updateProject('p1', {
      skillIds: ['s1'],
      baseIds: ['b1'],
      notes: 'ok',
      tags: ['web'],
      favorite: true
    });
    expect(updated).toMatchObject({
      skillIds: ['s1'],
      baseIds: ['b1'],
      notes: 'ok',
      tags: ['web'],
      favorite: true
    });
    await expect(store.updateProject('nope', {})).rejects.toThrow();
  });
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test -- tests/library-store.test.ts`
Expected: FAIL — `store.updateSkill is not a function`.

- [ ] **Step 3: Implementar em `src/main/services/library-store.ts`**

Adicionar imports:

```ts
import { SkillSchema, BaseItemSchema, ProjectRefSchema, LibraryFileSchema, RepoSchema, SettingsPatchSchema } from '../../shared/schemas';
import { normalizeTagList } from '../../shared/tags';
```

(substituindo a linha de import de schemas atual — `LibraryFileSchema`, `RepoSchema`, `SettingsPatchSchema` já são importados; acrescentar os três novos e `normalizeTagList`.)

Adicionar os métodos na classe, após `replaceAssets`:

```ts
  async updateSkill(
    id: string,
    patch: { tags?: string[]; favorite?: boolean }
  ): Promise<Skill> {
    const index = this.data.skills.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(`Skill não encontrada: ${id}`);
    const merged = SkillSchema.parse({
      ...this.data.skills[index],
      ...(patch.tags != null ? { tags: normalizeTagList(patch.tags) } : {}),
      ...(patch.favorite != null ? { favorite: patch.favorite } : {})
    });
    this.data.skills[index] = merged;
    await this.save();
    return merged;
  }

  async updateBase(
    id: string,
    patch: { name?: string; description?: string; tags?: string[]; favorite?: boolean }
  ): Promise<BaseItem> {
    const index = this.data.bases.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(`Base não encontrada: ${id}`);
    const merged = BaseItemSchema.parse({
      ...this.data.bases[index],
      ...(patch.name != null ? { name: patch.name } : {}),
      ...(patch.description != null ? { description: patch.description } : {}),
      ...(patch.tags != null ? { tags: normalizeTagList(patch.tags) } : {}),
      ...(patch.favorite != null ? { favorite: patch.favorite } : {})
    });
    this.data.bases[index] = merged;
    await this.save();
    return merged;
  }

  async updateProject(
    id: string,
    patch: {
      skillIds?: string[];
      baseIds?: string[];
      notes?: string;
      tags?: string[];
      favorite?: boolean;
    }
  ): Promise<ProjectRef> {
    const index = this.data.projects.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(`Projeto não encontrado: ${id}`);
    const merged = ProjectRefSchema.parse({
      ...this.data.projects[index],
      ...(patch.skillIds != null ? { skillIds: patch.skillIds } : {}),
      ...(patch.baseIds != null ? { baseIds: patch.baseIds } : {}),
      ...(patch.notes != null ? { notes: patch.notes } : {}),
      ...(patch.tags != null ? { tags: normalizeTagList(patch.tags) } : {}),
      ...(patch.favorite != null ? { favorite: patch.favorite } : {})
    });
    this.data.projects[index] = merged;
    await this.save();
    return merged;
  }
```

- [ ] **Step 4: Rodar e confirmar passagem**

Run: `pnpm test -- tests/library-store.test.ts`
Expected: PASS — todos os testes do arquivo.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/library-store.ts tests/library-store.test.ts
git commit -m "feat: updateSkill, updateBase e updateProject no LibraryStore com normalizacao de tags"
```

---

### Task 4: `LibraryStore.renameTag/deleteTag`

**Files:**
- Modify: `src/main/services/library-store.ts`
- Test: `tests/library-store.test.ts`

- [ ] **Step 1: Escrever os testes falhando**

Adicionar em `tests/library-store.test.ts`:

```ts
  it('renameTag reescreve a tag nos três tipos e persiste', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({
      skills: [makeSkill({ id: 's1', tags: ['docs', 'web'] })],
      bases: [makeBase({ id: 'b1', tags: ['Docs'] })],
      projects: [makeProject({ id: 'p1', tags: ['docs'] })]
    });
    await store.renameTag('docs', 'documentação');
    const lib = await new LibraryStore(dir, join(dir, 'repos')).load();
    expect(lib.skills[0].tags).toEqual(['documentação', 'web']);
    expect(lib.bases[0].tags).toEqual(['documentação']);
    expect(lib.projects[0].tags).toEqual(['documentação']);
  });

  it('renameTag altera só a grafia quando o destino é a mesma tag', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({ skills: [makeSkill({ id: 's1', tags: ['docs'] })] });
    await store.renameTag('docs', 'Docs');
    expect(store.listSkills()[0].tags).toEqual(['Docs']);
  });

  it('renameTag lança erro para tag inexistente ou destino duplicado', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({ skills: [makeSkill({ id: 's1', tags: ['docs', 'web'] })] });
    await expect(store.renameTag('nope', 'x')).rejects.toThrow('Tag não encontrada');
    await expect(store.renameTag('docs', 'WEB')).rejects.toThrow('Tag já existe');
  });

  it('deleteTag remove a tag de todos os tipos e persiste', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await store.replaceAssets({
      skills: [makeSkill({ id: 's1', tags: ['docs', 'web'] })],
      bases: [makeBase({ id: 'b1', tags: ['DOCS'] })],
      projects: [makeProject({ id: 'p1', tags: ['docs'] })]
    });
    await store.deleteTag('docs');
    const lib = await new LibraryStore(dir, join(dir, 'repos')).load();
    expect(lib.skills[0].tags).toEqual(['web']);
    expect(lib.bases[0].tags).toEqual([]);
    expect(lib.projects[0].tags).toEqual([]);
  });

  it('deleteTag lança erro para tag inexistente', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    await store.load();
    await expect(store.deleteTag('nope')).rejects.toThrow('Tag não encontrada');
  });
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test -- tests/library-store.test.ts`
Expected: FAIL — `store.renameTag is not a function`.

- [ ] **Step 3: Implementar em `src/main/services/library-store.ts`**

Adicionar `tagKey` ao import existente de `shared/tags`:

```ts
import { normalizeTagList, tagKey } from '../../shared/tags';
```

Adicionar os métodos após `updateProject`:

```ts
  async renameTag(from: string, to: string): Promise<void> {
    const source = normalizeTag(from);
    const target = normalizeTag(to);
    if (source == null || target == null) throw new Error('Tag inválida');
    const keyFrom = tagKey(source);
    const keyTo = tagKey(target);
    const all = [...this.data.skills, ...this.data.bases, ...this.data.projects];
    const hasKey = (key: string): boolean =>
      all.some((item) => item.tags.some((tag) => tagKey(tag) === key));
    if (!hasKey(keyFrom)) throw new Error(`Tag não encontrada: ${source}`);
    if (keyTo !== keyFrom && hasKey(keyTo)) throw new Error(`Tag já existe: ${target}`);
    const rewrite = (tags: string[]): string[] =>
      normalizeTagList(tags.map((tag) => (tagKey(tag) === keyFrom ? target : tag)));
    this.data.skills = this.data.skills.map((item) => ({ ...item, tags: rewrite(item.tags) }));
    this.data.bases = this.data.bases.map((item) => ({ ...item, tags: rewrite(item.tags) }));
    this.data.projects = this.data.projects.map((item) => ({ ...item, tags: rewrite(item.tags) }));
    await this.save();
  }

  async deleteTag(name: string): Promise<void> {
    const target = normalizeTag(name);
    if (target == null) throw new Error('Tag inválida');
    const key = tagKey(target);
    const all = [...this.data.skills, ...this.data.bases, ...this.data.projects];
    if (!all.some((item) => item.tags.some((tag) => tagKey(tag) === key))) {
      throw new Error(`Tag não encontrada: ${target}`);
    }
    const strip = (tags: string[]): string[] => tags.filter((tag) => tagKey(tag) !== key);
    this.data.skills = this.data.skills.map((item) => ({ ...item, tags: strip(item.tags) }));
    this.data.bases = this.data.bases.map((item) => ({ ...item, tags: strip(item.tags) }));
    this.data.projects = this.data.projects.map((item) => ({ ...item, tags: strip(item.tags) }));
    await this.save();
  }
```

E importar `normalizeTag` (usado no topo de ambos os métodos):

```ts
import { normalizeTag, normalizeTagList, tagKey } from '../../shared/tags';
```

- [ ] **Step 4: Rodar e confirmar passagem**

Run: `pnpm test -- tests/library-store.test.ts`
Expected: PASS — todos.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/library-store.ts tests/library-store.test.ts
git commit -m "feat: renameTag e deleteTag globais no LibraryStore com regras de unicidade"
```

---

### Task 5: Extrair `discoverSkills` para `src/main/services/skills-scan.ts`

**Files:**
- Create: `src/main/services/skills-scan.ts`
- Test: `tests/skills-scan.test.ts`

- [ ] **Step 1: Escrever o teste falhando**

Criar `tests/skills-scan.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { discoverSkills, parseSkillMetadata } from '../src/main/services/skills-scan';
import type { Skill } from '../src/shared/types';

let dir: string;
let counter = 0;

beforeEach(async () => {
  dir = join(tmpdir(), `glib-scan-${Date.now()}-${counter++}`);
  await fs.mkdir(dir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function writeSkill(root: string, folder: string, body: string): Promise<string> {
  const skillDir = join(root, folder);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(join(skillDir, 'SKILL.md'), body, 'utf-8');
  return skillDir;
}

describe('parseSkillMetadata', () => {
  it('lê name e description do frontmatter', () => {
    const meta = parseSkillMetadata(
      '---\nname: "Minha skill"\ndescription: Faz coisas\n---\n# corpo',
      'fallback'
    );
    expect(meta).toEqual({ name: 'Minha skill', description: 'Faz coisas' });
  });

  it('usa fallback quando não há frontmatter', () => {
    expect(parseSkillMetadata('# só corpo', 'pasta')).toEqual({ name: 'pasta' });
  });
});

describe('discoverSkills', () => {
  it('descobre SKILL.md na raiz e em pastas filhas diretas', async () => {
    const root = join(dir, 'skills');
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(join(root, 'SKILL.md'), '---\nname: Raiz\n---\n', 'utf-8');
    await writeSkill(root, 'filha', '---\nname: Filha\n---\n');
    const skills = await discoverSkills([root], []);
    expect(skills.map((s) => s.name).sort()).toEqual(['Filha', 'Raiz']);
    expect(skills.every((s) => s.source === root)).toBe(true);
  });

  it('preserva id, tags e favorite de skills existentes na ressincronização', async () => {
    const root = join(dir, 'skills');
    const skillDir = await writeSkill(root, 'demo', '---\nname: Demo\n---\n');
    const existing: Skill[] = [
      {
        id: 'id-fixo',
        name: 'Demo',
        path: skillDir,
        source: root,
        tags: ['docs', 'web'],
        favorite: true,
        addedAt: '2026-01-01T00:00:00.000Z'
      }
    ];
    const skills = await discoverSkills([root], existing);
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      id: 'id-fixo',
      tags: ['docs', 'web'],
      favorite: true,
      addedAt: '2026-01-01T00:00:00.000Z'
    });
    expect(skills[0].updatedAt).toBeTruthy();
  });

  it('ignora pastas inexistentes e não varre subpastas além das diretas', async () => {
    const root = join(dir, 'skills');
    await writeSkill(root, 'uma', '---\nname: Uma\n---\n');
    await fs.mkdir(join(root, 'uma', 'nested'), { recursive: true });
    await fs.writeFile(
      join(root, 'uma', 'nested', 'SKILL.md'),
      '---\nname: Nested\n---\n',
      'utf-8'
    );
    const skills = await discoverSkills([root, join(dir, 'nao-existe')], []);
    expect(skills.map((s) => s.name)).toEqual(['Uma']);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test -- tests/skills-scan.test.ts`
Expected: FAIL — módulo `../src/main/services/skills-scan` não encontrado.

- [ ] **Step 3: Implementar `src/main/services/skills-scan.ts`**

(Lógica extraída do handler `skillsScan` de `assets.ipc.ts`, sem alteração de comportamento.)

```ts
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { readdir, readFile, stat } from 'fs/promises';
import { basename, join, resolve } from 'path';
import type { Skill } from '../../shared/types';

export function parseSkillMetadata(
  content: string,
  fallback: string
): { name: string; description?: string } {
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  const name =
    frontmatter?.[1]?.match(/^name:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim() ?? fallback;
  const description = frontmatter?.[1]?.match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim();
  return { name, ...(description ? { description } : {}) };
}

export async function discoverSkills(roots: string[], existing: Skill[]): Promise<Skill[]> {
  const byPath = new Map(existing.map((skill) => [resolve(skill.path).toLowerCase(), skill]));
  const discovered = new Map<string, Skill>();
  for (const root of roots) {
    if (!existsSync(root) || !(await stat(root)).isDirectory()) continue;
    const entries = await readdir(root, { withFileTypes: true });
    const candidates = [
      join(root, 'SKILL.md'),
      ...entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(root, entry.name, 'SKILL.md'))
    ];
    for (const file of candidates) {
      if (!existsSync(file)) continue;
      const path = resolve(file, '..');
      const key = path.toLowerCase();
      if (discovered.has(key)) continue;
      const content = await readFile(file, 'utf8');
      const previous = byPath.get(key);
      const meta = parseSkillMetadata(content, basename(path));
      discovered.set(key, {
        id: previous?.id ?? randomUUID(),
        name: meta.name,
        ...(meta.description ? { description: meta.description } : {}),
        path,
        source: resolve(root),
        tags: previous?.tags ?? [],
        favorite: previous?.favorite ?? false,
        addedAt: previous?.addedAt ?? new Date().toISOString(),
        updatedAt: new Date((await stat(file)).mtimeMs).toISOString()
      });
    }
  }
  return [...discovered.values()];
}
```

- [ ] **Step 4: Rodar e confirmar passagem**

Run: `pnpm test -- tests/skills-scan.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/skills-scan.ts tests/skills-scan.test.ts
git commit -m "refactor: discoverSkills extraido para services/skills-scan com preservacao de tags"
```

---

### Task 6: Handlers IPC de update e gestão de tags

**Files:**
- Modify: `src/main/ipc/assets.ipc.ts`

Sem testes novos: handlers finos sobre métodos do store já testados; a validação Zod é coberta por `tests/schemas.test.ts`.

- [ ] **Step 1: Trocar imports de `src/main/ipc/assets.ipc.ts`**

Substituir o bloco de imports por:

```ts
import { ipcMain, shell, dialog, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, stat } from 'fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'path';
import type { BaseItem, IpcResult, ProjectRef, Skill } from '../../shared/types';
import { IpcChannels } from '../../shared/ipc-channels';
import {
  BaseUpdateInputSchema,
  ProjectUpdateInputSchema,
  SettingsPatchSchema,
  SkillUpdateInputSchema,
  TagNameInputSchema,
  TagRenameInputSchema
} from '../../shared/schemas';
import { isSafeDirectoryName } from '../../shared/validators';
import type { LibraryStore } from '../services/library-store';
import type { GitService } from '../services/git-service';
import { isValidGitUrl } from '../../shared/git-utils';
import { discoverSkills } from '../services/skills-scan';
```

Remover as sobras não usadas: `readdir`, `readFile` de `fs/promises`; o schema local `ProjectPatch`; a função local `isSafeDirectoryName`; a função `metadata` (agora em `skills-scan`). O `BaseInput` passa a usar `isSafeDirectoryName` importado de `shared/validators`. Manter `randomUUID`, `existsSync`, `mkdir`, `stat`, `basename`, `join`, `resolve`, `relative`, `isAbsolute` (usados por `baseAdd`/`baseClone`/`projectAdd`/`skillOpen`).

- [ ] **Step 2: Simplificar o handler `skillsScan`**

Substituir todo o corpo do handler por:

```ts
  ipcMain.handle(IpcChannels.skillsScan, async (): Promise<IpcResult<Skill[]>> => {
    try {
      const skills = await discoverSkills(store.getSettings().skillFolders, store.listSkills());
      await store.replaceAssets({ skills });
      return ok(skills);
    } catch (e) {
      return fail(e);
    }
  });
```

- [ ] **Step 3: Reescrever `projectUpdate` com o schema compartilhado e o store**

Substituir o handler `projectUpdate` por:

```ts
  ipcMain.handle(
    IpcChannels.projectUpdate,
    async (_event, raw: unknown): Promise<IpcResult<ProjectRef>> => {
      try {
        const input = ProjectUpdateInputSchema.parse(raw);
        const { id, ...patch } = input;
        const project = store.listProjects().find((item) => item.id === id);
        if (!project) throw new Error('Projeto não encontrado');
        if (patch.skillIds?.some((skillId) => !store.listSkills().some((item) => item.id === skillId)))
          throw new Error('A associação contém uma Skill desconhecida');
        if (patch.baseIds?.some((baseId) => !store.listBases().some((item) => item.id === baseId)))
          throw new Error('A associação contém uma Base desconhecida');
        return ok(await store.updateProject(id, patch));
      } catch (e) {
        return fail(e);
      }
    }
  );
```

- [ ] **Step 4: Adicionar os novos handlers ao final de `registerAssetsIpc`**

```ts
  ipcMain.handle(IpcChannels.skillUpdate, async (_event, raw: unknown): Promise<IpcResult<Skill>> => {
    try {
      const { id, patch } = SkillUpdateInputSchema.parse(raw);
      return ok(await store.updateSkill(id, patch));
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(
    IpcChannels.baseUpdate,
    async (_event, raw: unknown): Promise<IpcResult<BaseItem>> => {
      try {
        const { id, patch } = BaseUpdateInputSchema.parse(raw);
        return ok(await store.updateBase(id, patch));
      } catch (e) {
        return fail(e);
      }
    }
  );

  ipcMain.handle(IpcChannels.tagsRename, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const { from, to } = TagRenameInputSchema.parse(raw);
      await store.renameTag(from, to);
      return ok(null);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(IpcChannels.tagsDelete, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const { name } = TagNameInputSchema.parse(raw);
      await store.deleteTag(name);
      return ok(null);
    } catch (e) {
      return fail(e);
    }
  });
```

- [ ] **Step 5: Gate completo**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: tudo verde (75 testes atuais + novos das Tasks 1–5).

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/assets.ipc.ts
git commit -m "feat: handlers IPC skill:update, base:update, tags:rename e tags:delete"
```

---

### Task 7: Clientes em `src/renderer/src/lib/api.ts`

**Files:**
- Modify: `src/renderer/src/lib/api.ts`

- [ ] **Step 1: Estender `projectUpdate` e adicionar os novos clientes**

Substituir a assinatura atual de `projectUpdate` e inserir os novos métodos logo após:

```ts
  projectUpdate: (
    id: string,
    patch: Partial<Pick<ProjectRef, 'skillIds' | 'baseIds' | 'notes' | 'tags' | 'favorite'>>
  ): Promise<ProjectRef> =>
    unwrap(window.api.invoke(IpcChannels.projectUpdate, { id, ...patch })),
  skillUpdate: (id: string, patch: { tags?: string[]; favorite?: boolean }): Promise<Skill> =>
    unwrap(window.api.invoke(IpcChannels.skillUpdate, { id, patch })),
  baseUpdate: (
    id: string,
    patch: { name?: string; description?: string; tags?: string[]; favorite?: boolean }
  ): Promise<BaseItem> =>
    unwrap(window.api.invoke(IpcChannels.baseUpdate, { id, patch })),
  tagsRename: (from: string, to: string): Promise<null> =>
    unwrap(window.api.invoke(IpcChannels.tagsRename, { from, to })),
  tagsDelete: (name: string): Promise<null> =>
    unwrap(window.api.invoke(IpcChannels.tagsDelete, { name })),
```

- [ ] **Step 2: Gate**

Run: `pnpm typecheck && pnpm lint`
Expected: sem erros (nenhum chamador usa o tipo antigo de `projectUpdate` de forma incompatível — `RepoDetailPage.tsx` chama `projectUpdate`? não; apenas `AssetLibraryPage`).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/lib/api.ts
git commit -m "feat: clientes de skillUpdate, baseUpdate, tagsRename e tagsDelete no renderer"
```

---

### Task 8: `TagChips.tsx` e `TagManagerDialog.tsx` (apresentacionais)

**Files:**
- Create: `src/renderer/src/components/TagChips.tsx`
- Create: `src/renderer/src/components/TagManagerDialog.tsx`

- [ ] **Step 1: Criar `src/renderer/src/components/TagChips.tsx`**

```tsx
import { Settings2, X } from 'lucide-react';
import type { TagCount } from '@shared/tags';
import { sameTag } from '@shared/tags';

interface Props {
  tags: TagCount[];
  selected: string[];
  onToggle: (name: string) => void;
  onClear: () => void;
  onManage: () => void;
}

export default function TagChips({
  tags,
  selected,
  onToggle,
  onClear,
  onManage
}: Props): React.JSX.Element {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {tags.map(({ name, count }) => {
        const active = selected.some((tag) => sameTag(tag, name));
        return (
          <button
            key={name}
            type="button"
            onClick={() => onToggle(name)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
              active
                ? 'border-steam-accent bg-steam-accent/20 text-steam-accent'
                : 'border-steam-elevated bg-steam-panel text-steam-text/70 hover:text-steam-accent'
            }`}
          >
            {name}
            <span className="opacity-60">{count}</span>
          </button>
        );
      })}
      {selected.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-steam-text/50 hover:text-steam-text"
        >
          <X size={12} />
          Limpar
        </button>
      )}
      <button
        type="button"
        onClick={onManage}
        aria-label="Gerenciar tags"
        className="ml-auto rounded p-1.5 text-steam-text/40 hover:text-steam-accent"
      >
        <Settings2 size={15} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Criar `src/renderer/src/components/TagManagerDialog.tsx`**

```tsx
import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { TagCount } from '@shared/tags';

interface Props {
  tags: TagCount[];
  onRename: (from: string, to: string) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onClose: () => void;
}

export default function TagManagerDialog({
  tags,
  onRename,
  onDelete,
  onClose
}: Props): React.JSX.Element {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Gerenciar tags"
    >
      <div className="w-full max-w-md rounded border border-steam-elevated bg-steam-panel p-5">
        <div className="flex items-center">
          <h2 className="text-lg font-semibold">Gerenciar tags</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="ml-auto rounded p-1 text-steam-text/50 hover:text-steam-text"
          >
            <X size={16} />
          </button>
        </div>
        <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
          {tags.map(({ name, count }) => (
            <li
              key={name}
              className="flex items-center gap-2 rounded border border-steam-elevated bg-steam-bg px-3 py-2"
            >
              {editing === name ? (
                <>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="min-w-0 flex-1 rounded border border-steam-elevated bg-steam-panel px-2 py-1 text-sm"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void onRename(name, draft).then(() => setEditing(null));
                    }}
                    className="rounded bg-steam-accent px-2 py-1 text-xs text-steam-bg"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="rounded px-2 py-1 text-xs text-steam-text/60"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                  <span className="text-xs text-steam-text/40">{count}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(name);
                      setDraft(name);
                    }}
                    className="rounded px-2 py-1 text-xs text-steam-text/60 hover:text-steam-accent"
                  >
                    Renomear
                  </button>
                  {confirming === name ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          void onDelete(name).then(() => setConfirming(null));
                        }}
                        className="rounded bg-red-500/80 px-2 py-1 text-xs text-white"
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="rounded px-2 py-1 text-xs text-steam-text/60"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(name)}
                      aria-label={`Apagar tag ${name}`}
                      className="rounded p-1 text-steam-text/40 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
          {tags.length === 0 && (
            <li className="py-6 text-center text-sm text-steam-text/50">
              Nenhuma tag para gerenciar.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Gate**

Run: `pnpm typecheck && pnpm lint`
Expected: sem erros (componentes ainda não usados — exportados, então `noUnusedLocals` não se aplica).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/TagChips.tsx src/renderer/src/components/TagManagerDialog.tsx
git commit -m "feat: TagChips e TagManagerDialog com selecao, limpar, renomear e apagar"
```

---

### Task 9: Filtro por chips e gestão global em `AssetLibraryPage.tsx`

**Files:**
- Modify: `src/renderer/src/pages/AssetLibraryPage.tsx`

- [ ] **Step 1: Atualizar imports e estado**

No topo de `src/renderer/src/pages/AssetLibraryPage.tsx`, acrescentar:

```tsx
import { countTags, matchesTags, sameTag } from '@shared/tags';
import TagChips from '../components/TagChips';
import TagManagerDialog from '../components/TagManagerDialog';
```

Após `const [showBaseForm, setShowBaseForm] = useState(false);`, adicionar:

```tsx
  const [selected, setSelected] = useState<Record<Section, string[]>>({
    skills: [],
    bases: [],
    projects: []
  });
  const [manageOpen, setManageOpen] = useState(false);
```

E uma constante de seções acima do componente:

```tsx
const sections: Section[] = ['skills', 'bases', 'projects'];
```

- [ ] **Step 2: Adicionar contagens, handlers de filtro/gestão e filtros combinados**

Após `addBase`, inserir:

```tsx
  const sectionTags = useMemo(
    () => ({
      skills: countTags(assets.skills),
      bases: countTags(assets.bases),
      projects: countTags(assets.projects)
    }),
    [assets]
  );
  const globalTags = useMemo(
    () => countTags([...assets.skills, ...assets.bases, ...assets.projects]),
    [assets]
  );

  const toggleTag = (name: string): void =>
    setSelected((prev) => ({
      ...prev,
      [section]: prev[section].some((tag) => sameTag(tag, name))
        ? prev[section].filter((tag) => !sameTag(tag, name))
        : [...prev[section], name]
    }));
  const clearTags = (): void => setSelected((prev) => ({ ...prev, [section]: [] }));

  const handleRenameTag = async (from: string, to: string): Promise<void> => {
    try {
      await api.tagsRename(from, to);
      setSelected((prev) => {
        const next = { ...prev };
        for (const key of sections) {
          next[key] = next[key].map((tag) => (sameTag(tag, from) ? to : tag));
        }
        return next;
      });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteTag = async (name: string): Promise<void> => {
    try {
      await api.tagsDelete(name);
      setSelected((prev) => {
        const next = { ...prev };
        for (const key of sections) {
          next[key] = next[key].filter((tag) => !sameTag(tag, name));
        }
        return next;
      });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
```

Substituir os três `useMemo` de `filteredSkills`/`filteredBases`/`filteredProjects` por:

```tsx
  const selectedTags = selected[section];
  const matchQuery = (text: string): boolean =>
    text.toLowerCase().includes(query.toLowerCase());
  const filteredSkills = useMemo(
    () =>
      assets.skills.filter(
        (s) => matchesTags(s.tags, selectedTags) && matchQuery(`${s.name} ${s.description ?? ''} ${s.source}`)
      ),
    [assets.skills, selectedTags, query]
  );
  const filteredBases = useMemo(
    () =>
      assets.bases.filter(
        (b) => matchesTags(b.tags, selectedTags) && matchQuery(`${b.name} ${b.description ?? ''} ${b.remoteUrl ?? ''}`)
      ),
    [assets.bases, selectedTags, query]
  );
  const filteredProjects = useMemo(
    () =>
      assets.projects.filter(
        (p) => matchesTags(p.tags, selectedTags) && matchQuery(`${p.name} ${p.localPath ?? ''} ${p.notes ?? ''}`)
      ),
    [assets.projects, selectedTags, query]
  );
```

- [ ] **Step 3: Inserir os chips e o dialog no JSX**

Logo após `<nav>...</nav>`, dentro do container de conteúdo (antes de `{section === 'skills' && ...}`), inserir:

```tsx
        <TagChips
          tags={sectionTags[section]}
          selected={selectedTags}
          onToggle={toggleTag}
          onClear={clearTags}
          onManage={() => setManageOpen(true)}
        />
```

E ao final do `<main>`, antes do fechamento:

```tsx
    {manageOpen && (
      <TagManagerDialog
        tags={globalTags}
        onRename={handleRenameTag}
        onDelete={handleDeleteTag}
        onClose={() => setManageOpen(false)}
      />
    )}
```

- [ ] **Step 4: Gate**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: verde.

- [ ] **Step 5: Verificação manual rápida**

Run: `pnpm dev` → smoke: a janela abre, as três abas renderizam, a busca filtra e a
engrenagem (sempre visível na barra de tags, mesmo sem tags) abre/fecha o dialog —
com biblioteca vazia ele mostra "Nenhuma tag para gerenciar". Os chips de tags
passam a aparecer quando existirem tags — criadas na Task 10.
Encerrar com `Ctrl+C`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/pages/AssetLibraryPage.tsx
git commit -m "feat: filtro de tags por chips com semantica E e gestao global nas tres abas"
```

---

### Task 10: `TagPopover.tsx`, `AssetCards.tsx` e favoritos

**Files:**
- Create: `src/renderer/src/components/TagPopover.tsx`
- Create: `src/renderer/src/components/AssetCards.tsx`
- Modify: `src/renderer/src/pages/AssetLibraryPage.tsx`

- [ ] **Step 1: Criar `src/renderer/src/components/TagPopover.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { normalizeTag, sameTag } from '@shared/tags';

interface Props {
  currentTags: string[];
  allTags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  onClose: () => void;
}

export default function TagPopover({
  currentTags,
  allTags,
  onAdd,
  onRemove,
  onClose
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const draftTag = normalizeTag(draft);
  const suggestions =
    draftTag == null
      ? []
      : allTags.filter(
          (tag) =>
            tag.toLowerCase().includes(draftTag.toLowerCase()) &&
            !currentTags.some((current) => sameTag(current, tag))
        );
  const commit = (): void => {
    const tag = normalizeTag(draft);
    if (tag == null) return;
    if (!currentTags.some((current) => sameTag(current, tag))) onAdd(tag);
    setDraft('');
  };
  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-20 mt-1 w-64 rounded border border-steam-elevated bg-steam-bg p-3 shadow-lg"
    >
      <div className="flex flex-wrap gap-1.5">
        {currentTags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-steam-elevated px-2 py-0.5 text-xs"
          >
            {tag}
            <button type="button" onClick={() => onRemove(tag)} aria-label={`Remover tag ${tag}`}>
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        placeholder="Nova tag… (Enter)"
        autoFocus
        className="mt-2 w-full rounded border border-steam-elevated bg-steam-panel px-2 py-1 text-xs outline-none focus:border-steam-accent"
      />
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {suggestions.slice(0, 8).map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onAdd(tag)}
              className="rounded-full border border-steam-elevated px-2 py-0.5 text-xs text-steam-text/60 hover:text-steam-accent"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Criar `src/renderer/src/components/AssetCards.tsx`**

```tsx
import { useState } from 'react';
import {
  BriefcaseBusiness,
  FolderOpen,
  Layers3,
  Star,
  Tag,
  Trash2,
  WandSparkles
} from 'lucide-react';
import type { BaseItem, ProjectRef, Skill } from '@shared/types';
import { sameTag } from '@shared/tags';
import TagPopover from './TagPopover';

function TagArea({
  tags,
  allTags,
  onChange
}: {
  tags: string[];
  allTags: string[];
  onChange: (tags: string[]) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex flex-wrap items-center gap-1.5 text-left"
      >
        {tags.length === 0 ? (
          <span className="flex items-center gap-1 rounded-full border border-dashed border-steam-elevated px-2 py-0.5 text-xs text-steam-text/40">
            <Tag size={11} />
            Adicionar tag
          </span>
        ) : (
          tags.map((tag) => (
            <span key={tag} className="rounded-full bg-steam-elevated px-2 py-0.5 text-xs text-steam-text/70">
              {tag}
            </span>
          ))
        )}
      </button>
      {open && (
        <TagPopover
          currentTags={tags}
          allTags={allTags}
          onAdd={(tag) => onChange([...tags, tag])}
          onRemove={(tag) => onChange(tags.filter((current) => !sameTag(current, tag)))}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function StarButton({
  active,
  onClick
}: {
  active: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={active ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      className={`rounded p-1 ${active ? 'text-steam-accent' : 'text-steam-text/40 hover:text-steam-accent'}`}
    >
      <Star size={15} fill={active ? 'currentColor' : 'none'} />
    </button>
  );
}

export function SkillCard({
  skill,
  allTags,
  onTagsChange,
  onFavorite,
  onOpen,
  onRemove
}: {
  skill: Skill;
  allTags: string[];
  onTagsChange: (tags: string[]) => void;
  onFavorite: () => void;
  onOpen: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <article className="rounded border border-steam-elevated bg-steam-panel p-4">
      <div className="flex items-start gap-3">
        <WandSparkles size={18} className="mt-0.5 shrink-0 text-steam-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{skill.name}</h2>
          <p className="mt-1 line-clamp-2 text-sm text-steam-text/60">
            {skill.description ?? 'Sem descrição no cabeçalho de SKILL.md.'}
          </p>
          <p className="mt-3 truncate text-xs text-steam-text/40" title={skill.path}>
            {skill.source}
          </p>
        </div>
        <StarButton active={skill.favorite} onClick={onFavorite} />
      </div>
      <TagArea tags={skill.tags} allTags={allTags} onChange={onTagsChange} />
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-1 rounded bg-steam-elevated px-2 py-1 text-xs hover:text-steam-accent"
        >
          <FolderOpen size={13} />
          Abrir skill
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${skill.name}`}
          className="ml-auto rounded p-1 text-steam-text/40 hover:text-red-400"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}

export function BaseCard({
  base,
  allTags,
  onTagsChange,
  onFavorite,
  onClone,
  onRemove
}: {
  base: BaseItem;
  allTags: string[];
  onTagsChange: (tags: string[]) => void;
  onFavorite: () => void;
  onClone: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <article className="rounded border border-steam-elevated bg-steam-panel p-4">
      <div className="flex items-start gap-3">
        <Layers3 size={18} className="mt-0.5 shrink-0 text-steam-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{base.name}</h2>
          <p className="mt-2 break-all text-xs text-steam-text/50">
            {base.localPath ?? base.remoteUrl ?? base.description ?? 'Base local'}
          </p>
        </div>
        <StarButton active={base.favorite} onClick={onFavorite} />
      </div>
      <TagArea tags={base.tags} allTags={allTags} onChange={onTagsChange} />
      <div className="mt-4 flex items-center gap-2">
        {base.remoteUrl && !base.localPath && (
          <button
            type="button"
            onClick={onClone}
            className="rounded bg-steam-elevated px-2 py-1 text-xs hover:text-steam-accent"
          >
            Clonar para ~/BASES
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${base.name}`}
          className="ml-auto rounded p-1 text-steam-text/40 hover:text-red-400"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}

export function ProjectCard({
  project,
  assets,
  allTags,
  onSave,
  onTagsChange,
  onFavorite
}: {
  project: ProjectRef;
  assets: { skills: Skill[]; bases: BaseItem[] };
  allTags: string[];
  onSave: (patch: { skillIds: string[]; baseIds: string[]; notes?: string }) => Promise<void>;
  onTagsChange: (tags: string[]) => void;
  onFavorite: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(project.notes ?? '');
  return (
    <article className="rounded border border-steam-elevated bg-steam-panel p-4">
      <div className="flex items-start gap-3">
        <BriefcaseBusiness size={18} className="mt-0.5 text-steam-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{project.name}</h2>
          <p className="mt-1 truncate text-xs text-steam-text/45" title={project.localPath}>
            {project.localPath ?? project.remoteUrl ?? 'Sem caminho associado'}
          </p>
          <p className="mt-2 text-xs text-steam-text/60">
            {project.skillIds.length} skills · {project.baseIds.length} bases
          </p>
        </div>
        <StarButton active={project.favorite} onClick={onFavorite} />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded bg-steam-elevated px-3 py-1.5 text-xs"
        >
          {open ? 'Fechar' : 'Editar contexto'}
        </button>
      </div>
      <TagArea tags={project.tags} allTags={allTags} onChange={onTagsChange} />
      {open && (
        <div className="mt-4 grid gap-4 border-t border-steam-elevated/50 pt-4 md:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-semibold uppercase text-steam-text/50">
              Skills usadas
            </legend>
            {assets.skills.map((skill) => (
              <label key={skill.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={project.skillIds.includes(skill.id)}
                  onChange={(e) =>
                    void onSave({
                      skillIds: e.target.checked
                        ? [...project.skillIds, skill.id]
                        : project.skillIds.filter((x) => x !== skill.id),
                      baseIds: project.baseIds,
                      notes
                    })
                  }
                />
                {skill.name}
              </label>
            ))}
            {assets.skills.length === 0 && (
              <p className="text-xs text-steam-text/40">Ainda não há Skills na biblioteca.</p>
            )}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-semibold uppercase text-steam-text/50">
              Bases usadas
            </legend>
            {assets.bases.map((base) => (
              <label key={base.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={project.baseIds.includes(base.id)}
                  onChange={(e) =>
                    void onSave({
                      skillIds: project.skillIds,
                      baseIds: e.target.checked
                        ? [...project.baseIds, base.id]
                        : project.baseIds.filter((x) => x !== base.id),
                      notes
                    })
                  }
                />
                {base.name}
              </label>
            ))}
            {assets.bases.length === 0 && (
              <p className="text-xs text-steam-text/40">Ainda não há Bases na biblioteca.</p>
            )}
          </fieldset>
          <label className="flex flex-col gap-1 text-xs text-steam-text/50 md:col-span-2">
            Notas
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => void onSave({ skillIds: project.skillIds, baseIds: project.baseIds, notes })}
              rows={2}
              className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-sm text-steam-text"
            />
          </label>
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 3: Ligar os cards em `src/renderer/src/pages/AssetLibraryPage.tsx`**

Imports: adicionar `import { BaseCard, ProjectCard, SkillCard } from '../components/AssetCards';`. Remover `Trash2` e `FolderOpen` de `lucide-react` (agora só nos cards) e remover a função `ProjectCard` local do fim do arquivo. Manter `WandSparkles`, `Layers3`, `BriefcaseBusiness` (usados nos botões de aba).

Handlers — inserir após `handleDeleteTag`:

```tsx
  const allTagNames = useMemo(() => globalTags.map((tag) => tag.name), [globalTags]);

  const updateSkillTags = async (skill: Skill, tags: string[]): Promise<void> => {
    try {
      await api.skillUpdate(skill.id, { tags });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const toggleSkillFavorite = async (skill: Skill): Promise<void> => {
    try {
      await api.skillUpdate(skill.id, { favorite: !skill.favorite });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const updateBaseTags = async (base: BaseItem, tags: string[]): Promise<void> => {
    try {
      await api.baseUpdate(base.id, { tags });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const toggleBaseFavorite = async (base: BaseItem): Promise<void> => {
    try {
      await api.baseUpdate(base.id, { favorite: !base.favorite });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const updateProjectTags = async (project: ProjectRef, tags: string[]): Promise<void> => {
    try {
      await api.projectUpdate(project.id, { tags });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const toggleProjectFavorite = async (project: ProjectRef): Promise<void> => {
    try {
      await api.projectUpdate(project.id, { favorite: !project.favorite });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
```

Substituir o grid de skills por:

```tsx
        {filteredSkills.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredSkills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                allTags={allTagNames}
                onTagsChange={(tags) => void updateSkillTags(skill, tags)}
                onFavorite={() => void toggleSkillFavorite(skill)}
                onOpen={() =>
                  void api
                    .skillOpen(skill.id)
                    .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
                }
                onRemove={() =>
                  void api
                    .skillRemove(skill.id)
                    .then(refresh)
                    .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
                }
              />
            ))}
          </div>
        ) : (
          <Empty
            text={
              settings?.skillFolders.length
                ? 'Nenhum SKILL.md foi encontrado nas origens configuradas.'
                : 'Adicione uma pasta que contenha SKILL.md para importar suas skills.'
            }
          />
        )}
```

Substituir o grid de bases por:

```tsx
        {filteredBases.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredBases.map((base) => (
              <BaseCard
                key={base.id}
                base={base}
                allTags={allTagNames}
                onTagsChange={(tags) => void updateBaseTags(base, tags)}
                onFavorite={() => void toggleBaseFavorite(base)}
                onClone={() =>
                  void api
                    .baseClone(base.id)
                    .then(refresh)
                    .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
                }
                onRemove={() =>
                  void api
                    .baseRemove(base.id)
                    .then(refresh)
                    .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
                }
              />
            ))}
          </div>
        ) : (
          <Empty text="Adicione uma base para reutilizar como início de novos projetos." />
        )}
```

Substituir a lista de projetos por:

```tsx
        {filteredProjects.length ? (
          <div className="space-y-3">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                assets={assets}
                allTags={allTagNames}
                onSave={async (patch) => {
                  try {
                    await api.projectUpdate(project.id, patch);
                    await refresh();
                  } catch (e) {
                    onError(e instanceof Error ? e.message : String(e));
                  }
                }}
                onTagsChange={(tags) => void updateProjectTags(project, tags)}
                onFavorite={() => void toggleProjectFavorite(project)}
              />
            ))}
          </div>
        ) : (
          <Empty text="A migração não encontrou projetos. Os repositórios locais da biblioteca v1 aparecem aqui como contexto." />
        )}
```

- [ ] **Step 4: Gate**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/TagPopover.tsx src/renderer/src/components/AssetCards.tsx src/renderer/src/pages/AssetLibraryPage.tsx
git commit -m "feat: popover de tags e favoritos nos cards de Skill, Base e Projeto"
```

---

### Task 11: Gate final, aceite manual e decisões

**Files:**
- Modify: `docs/DECISOES.md`

- [ ] **Step 1: Gate completo**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: tudo verde; build gera `out/main`, `out/preload`, `out/renderer`.

- [ ] **Step 2: Aceite manual (critérios da spec)**

Run: `pnpm dev` e conferir na janela do app:

1. Atribuir e remover tags em skills, bases e projetos pelos cards (popover salva na hora).
2. Filtrar por 2+ tags com semântica E, combinando com a busca textual.
3. Contadores por tag corretos; Limpar zera a seleção.
4. Renomear uma tag (dialog da engrenagem) e ver a mudança nas três abas; a seleção ativa acompanha o novo nome.
5. Apagar uma tag com confirmação e vê-la sumir dos itens.
6. Fechar e reabrir o app com todas as tags e favoritos gravados.

Encerrar com `Ctrl+C`.

- [ ] **Step 3: Registrar decisões em `docs/DECISOES.md`**

Adicionar ao final do arquivo:

```markdown
## 2026-11-01 — Tags de Skills/Bases/Projetos

### Identidade case-insensitive com preservação da primeira grafia
`Docs` e `docs` são a mesma tag; a grafia do primeiro uso é a gravada. Renomear para a
mesma tag com grafia diferente é permitido (ajuste de caixa); renomear para OUTRA tag
existente é erro, sem merge implícito.

### Tags vivem nos itens, sem lista própria em library.json
Cada item guarda `tags: string[]`; uma tag sem itens apenas não aparece nos chips.
Evita migração de dados e estado duplicado.

### skill:update e base:update aninhados; project:update estende o contrato plano
Os canais novos usam `{ id, patch }`; o `project:update` existente permanece plano
(`{ id, ...campos }`) e ganha `tags`/`favorite`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/DECISOES.md
git commit -m "docs: decisoes das tags de skills, bases e projetos"
```
