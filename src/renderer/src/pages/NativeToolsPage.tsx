import NativeToolsPanel from '../components/NativeToolsPanel';

interface Props {
  onError: (error: unknown) => void;
}

export default function NativeToolsPage({ onError }: Props): React.JSX.Element {
  return (
    <main className="flex flex-1 flex-col overflow-y-auto">
      <header className="border-b border-steam-elevated/50 px-6 py-3">
        <h1 className="text-lg font-bold">Ferramentas</h1>
        <p className="text-xs text-steam-text/50">Instale ferramentas de desenvolvimento no seu ambiente local.</p>
      </header>
      <div className="flex-1 p-6">
        <NativeToolsPanel onError={onError} />
      </div>
    </main>
  );
}
