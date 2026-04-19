import { ScribeEditor } from '@/components/scribe-editor';

export function App() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Scribe</h1>
        <p className="text-muted-foreground text-lg">Write in the editor below.</p>
      </div>
      <ScribeEditor />
    </main>
  );
}
