import { Library } from 'lucide-react';

export default function App(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-steam-bg text-steam-text">
      <Library size={64} className="text-steam-accent" />
      <h1 className="mt-4 text-3xl font-bold">Glibrary</h1>
      <p className="mt-2 text-steam-text/60">Sua biblioteca de repositórios</p>
    </div>
  );
}
