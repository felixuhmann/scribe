import { AppSidebar } from '@/components/app-sidebar';
import { EditorSessionProvider } from '@/components/editor-session-context';
import { ScribeEditor } from '@/components/scribe-editor';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

export function App() {
  return (
    <TooltipProvider delayDuration={0}>
      <EditorSessionProvider>
        <SidebarProvider className="h-full min-h-0">
          <AppSidebar />
          <SidebarInset className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <ScribeEditor />
          </SidebarInset>
        </SidebarProvider>
      </EditorSessionProvider>
    </TooltipProvider>
  );
}
