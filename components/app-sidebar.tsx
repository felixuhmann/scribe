import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { DocumentChatPanel } from '@/components/document-chat-panel';

export function AppSidebar() {
  return (
    <Sidebar collapsible="none">
      <SidebarHeader className="border-sidebar-border shrink-0 border-b px-3 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="default" type="button" className="h-10">
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-7 items-center justify-center rounded-md font-semibold text-sm">
                S
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="text-sm font-semibold">Scribe</span>
                <span className="text-sidebar-foreground/70 text-[0.65rem]">Documents</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
        <DocumentChatPanel />
      </SidebarContent>
    </Sidebar>
  );
}
