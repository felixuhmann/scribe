import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { DocumentChatPanel } from '@/components/document-chat-panel';

export function AppSidebar() {
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" type="button">
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg font-semibold">
                S
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">Scribe</span>
                <span className="text-sidebar-foreground/70 text-xs">Documents</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
        <DocumentChatPanel />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
