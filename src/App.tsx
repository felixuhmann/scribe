import { AppShell } from '@/components/app-shell';
import { DocumentWorkspaceProvider } from '@/components/document-workspace-context';
import { EditorSessionProvider } from '@/components/editor-session-context';
import { TooltipProvider } from '@/components/ui/tooltip';

export function App() {
  return (
    <TooltipProvider delayDuration={0}>
      <DocumentWorkspaceProvider>
        <EditorSessionProvider>
          <AppShell />
        </EditorSessionProvider>
      </DocumentWorkspaceProvider>
    </TooltipProvider>
  );
}
