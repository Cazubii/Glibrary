export type AssetCategory =
  | 'design'
  | 'banco-de-dados'
  | 'codigo'
  | 'frontend'
  | 'backend'
  | 'testes'
  | 'devops'
  | 'documentacao'
  | 'outros';

export const ASSET_CATEGORIES: AssetCategory[] = [
  'design',
  'banco-de-dados',
  'codigo',
  'frontend',
  'backend',
  'testes',
  'devops',
  'documentacao',
  'outros'
];

export const DEFAULT_ASSET_CATEGORY: AssetCategory = 'outros';

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  design: 'Design',
  'banco-de-dados': 'Banco de dados',
  codigo: 'Código',
  frontend: 'Frontend',
  backend: 'Backend',
  testes: 'Testes',
  devops: 'DevOps',
  documentacao: 'Documentação',
  outros: 'Outros'
};
const CATEGORY_KEYS = new Map<string, AssetCategory>(
  ASSET_CATEGORIES.map((category) => [category.toLowerCase(), category])
);

/** Converte um valor bruto (ex.: frontmatter `category:`) em categoria válida. */
export function toAssetCategory(raw: unknown): AssetCategory {
  if (typeof raw !== 'string') return DEFAULT_ASSET_CATEGORY;
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, '-');
  return CATEGORY_KEYS.get(normalized) ?? DEFAULT_ASSET_CATEGORY;
}

export function isAssetCategory(raw: unknown): raw is AssetCategory {
  return typeof raw === 'string' && CATEGORY_KEYS.has(raw.toLowerCase());
}

/** Verifica se um valor bruto (frontmatter) é uma categoria conhecida. */
export function isKnownAssetCategoryRaw(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, '-');
  return CATEGORY_KEYS.has(normalized);
}

/** Palavras-chave (pt/en) por categoria para inferência em agentes/skills sem `category:`. */
const CATEGORY_KEYWORDS: Array<{ category: AssetCategory; keywords: string[] }> = [
  {
    category: 'banco-de-dados',
    keywords: ['banco de dados', 'database', 'sql', 'postgres', 'mysql', 'sqlite', 'mongodb', 'redis', 'schema', 'migration', 'prisma', 'drizzle', 'query']
  },
  {
    category: 'testes',
    keywords: ['teste', 'testes', 'test', 'testing', 'e2e', 'end-to-end', 'unit', 'tdd', 'jest', 'vitest', 'playwright', 'pytest', 'coverage', 'qa']
  },
  {
    category: 'devops',
    keywords: ['devops', 'deploy', 'docker', 'kubernetes', 'k8s', 'terraform', 'infraestrutura', 'infrastructure', 'pipeline', 'ci/cd', 'ci ', ' cd', 'github actions', 'release', 'monitoring']
  },
  {
    category: 'documentacao',
    keywords: ['documenta', 'documen', 'docs', 'readme', 'changelog', 'adr', 'wiki', 'blog', 'escrev', 'writing', 'tutorial', 'tradu']
  },
  {
    category: 'frontend',
    keywords: ['frontend', 'front-end', 'front end', 'react', 'vue', 'angular', 'next.js', 'nextjs', 'svelte', 'tailwind', 'componente', 'component', 'browser', 'navegador', 'html', 'web']
  },
  {
    category: 'backend',
    keywords: ['backend', 'back-end', 'back end', 'api', 'servidor', 'server', 'rest', 'graphql', 'endpoint', 'webhook', 'node', 'express', 'fastapi', 'django']
  },
  {
    category: 'design',
    keywords: ['design', 'designer', 'ui', 'ux', 'logo', 'figma', 'layout', 'estilo', 'style', 'css', 'cor', 'icone', 'icon', 'visual', 'paleta', 'tipograf', 'typograph', 'wireframe', 'interface']
  },
  {
    category: 'codigo',
    keywords: ['codigo', 'código', 'code', 'review', 'refactor', 'refatora', 'debug', 'bug', 'lint', 'clean code', 'terminal', 'cli', 'script', 'reviso', 'revisão']
  }
];

const KEYWORD_MATCHERS: Array<{ category: AssetCategory; matchers: RegExp[] }> =
  CATEGORY_KEYWORDS.map(({ category, keywords }) => ({
    category,
    matchers: keywords.map((keyword) => {
      const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`, 'i');
    })
  }));

/**
 * Infere uma AssetCategory a partir de texto livre (nome/descrição do frontmatter ou
 * nome do arquivo), por contagem de palavras-chave (match por fronteira de palavra,
 * sem caixa. Empate = primeira na ordem fixa acima (do mais específico ao mais genérico).
 * Sem match: null.
 */
export function inferAssetCategory(text: string | undefined): AssetCategory | null {
  let best: AssetCategory | null = null;
  let bestScore = 0;
  for (const { category, matchers } of KEYWORD_MATCHERS) {
    const score = matchers.filter((matcher) => matcher.test(text ?? '')).length;
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return best;
}
