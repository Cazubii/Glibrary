import { Bot, Compass, FolderOpen, House, Library } from 'lucide-react';
import { getAreaSections, PRIMARY_AREAS, type AreaSection, type PrimaryArea } from '../navigation';

const AREA_ICONS = {
  home: House,
  projects: FolderOpen,
  library: Library,
  discover: Compass,
  agents: Bot
} as const;

interface AreaNavigationProps {
  activeArea: PrimaryArea | null;
  onAreaChange: (area: PrimaryArea) => void;
}

export function AreaNavigation({ activeArea, onAreaChange }: AreaNavigationProps): React.JSX.Element {
  return (
    <nav aria-label="Navegação principal" className="glibrary-app-nav flex min-w-0 flex-1 gap-1 overflow-x-auto text-sm">
      {PRIMARY_AREAS.map((area) => {
        const Icon = AREA_ICONS[area.id];
        const active = activeArea === area.id;
        return (
          <button
            key={area.id}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => onAreaChange(area.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent ${active ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/65 hover:bg-steam-panel hover:text-steam-text'}`}
          >
            <Icon size={15} aria-hidden="true" />
            {area.label}
          </button>
        );
      })}
    </nav>
  );
}

interface AreaSectionNavigationProps {
  area: PrimaryArea;
  selected: AreaSection['id'];
  showAdvancedResources: boolean;
  onSelect: (section: AreaSection['id']) => void;
}

export function AreaSectionNavigation({
  area,
  selected,
  showAdvancedResources,
  onSelect
}: AreaSectionNavigationProps): React.JSX.Element | null {
  const sections = getAreaSections(area, showAdvancedResources);
  const areaLabel = PRIMARY_AREAS.find((item) => item.id === area)?.label ?? area;
  if (sections.length === 0) return null;

  return (
    <nav
      aria-label={`Seções de ${areaLabel}`}
      className="flex min-w-0 flex-wrap gap-1 border-t border-steam-elevated/30 pt-1"
    >
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          aria-current={selected === section.id ? 'page' : undefined}
          onClick={() => onSelect(section.id)}
          className={`rounded px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent ${selected === section.id ? 'bg-steam-panel font-medium text-steam-accent' : 'text-steam-text/55 hover:bg-steam-panel hover:text-steam-text'}`}
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}
