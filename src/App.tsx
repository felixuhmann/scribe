import { Button } from '@/components/ui/button';

export function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Scribe</h1>
        <p className="text-muted-foreground text-lg">
          shadcn/ui + Tailwind — try the buttons below.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="button">Default</Button>
        <Button type="button" variant="secondary">
          Secondary
        </Button>
        <Button type="button" variant="outline">
          Outline
        </Button>
        <Button type="button" variant="destructive">
          Destructive
        </Button>
      </div>
    </main>
  );
}
