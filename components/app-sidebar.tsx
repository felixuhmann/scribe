import { Files, MessageSquare } from 'lucide-react';

import { DocumentChatPanel } from '@/components/document-chat/document-chat-panel';
import { SidebarFileExplorer } from '@/components/sidebar-file-explorer';
import { Sidebar, SidebarContent, SidebarHeader } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const sidebarTabTriggerClass =
  'gap-2 text-sidebar-foreground/65 hover:text-sidebar-foreground dark:text-sidebar-foreground/65 dark:hover:text-sidebar-foreground data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:shadow-sm dark:data-active:bg-sidebar-accent dark:data-active:text-sidebar-accent-foreground dark:data-active:shadow-sm';

export function AppSidebar() {
  return (
    <Sidebar collapsible="none">
      <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col gap-0">
        <SidebarHeader className="border-sidebar-border shrink-0 border-b px-2 py-2">
          <TabsList className="w-full border border-sidebar-border/60 bg-sidebar-accent/40 p-1 text-sidebar-foreground/70 shadow-none dark:bg-sidebar-accent/25">
            <TabsTrigger value="chat" className={cn(sidebarTabTriggerClass)}>
              <MessageSquare className="size-4 shrink-0 opacity-90" aria-hidden />
              Chat
            </TabsTrigger>
            <TabsTrigger value="files" className={cn(sidebarTabTriggerClass)}>
              <Files className="size-4 shrink-0 opacity-90" aria-hidden />
              Files
            </TabsTrigger>
          </TabsList>
        </SidebarHeader>
        <SidebarContent className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
          <TabsContent
            value="chat"
            className="mt-0 flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden"
          >
            <DocumentChatPanel />
          </TabsContent>
          <TabsContent
            value="files"
            className="mt-0 flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden"
          >
            <SidebarFileExplorer />
          </TabsContent>
        </SidebarContent>
      </Tabs>
    </Sidebar>
  );
}
