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
