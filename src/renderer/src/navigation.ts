export const PRIMARY_AREAS = [
  { id: 'home', label: 'Início' },
  { id: 'projects', label: 'Projetos' },
  { id: 'library', label: 'Biblioteca' },
  { id: 'discover', label: 'Descobrir' },
  { id: 'agents', label: 'Agentes' }
] as const;

export type PrimaryArea = (typeof PRIMARY_AREAS)[number]['id'];

export interface AreaSection {
  id:
    | 'local-projects'
    | 'github-projects'
    | 'resources'
    | 'collections'
    | 'github-search'
    | 'top-repos'
    | 'repo-analysis'
    | 'agent-runs'
    | 'consumption';
  label: string;
  advanced?: boolean;
}

export const AREA_SECTIONS: Record<PrimaryArea, readonly AreaSection[]> = {
  home: [],
  projects: [
    { id: 'local-projects', label: 'Neste computador' },
    { id: 'github-projects', label: 'No GitHub' }
  ],
  library: [
    { id: 'resources', label: 'Recursos' },
    { id: 'collections', label: 'Coleções', advanced: true }
  ],
  discover: [
    { id: 'github-search', label: 'Buscar no GitHub' },
    { id: 'top-repos', label: 'Top 7 dias' },
    { id: 'repo-analysis', label: 'Analisar repositório', advanced: true }
  ],
  agents: [
    { id: 'agent-runs', label: 'Execuções' },
    { id: 'consumption', label: 'Consumo', advanced: true }
  ]
};

export function getAreaSections(area: PrimaryArea, showAdvancedResources: boolean): AreaSection[] {
  return AREA_SECTIONS[area].filter((section) => showAdvancedResources || section.advanced !== true);
}
