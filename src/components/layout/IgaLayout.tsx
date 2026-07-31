/**
 * IgaLayout — shell for the Agentic IGA console.
 *
 * Same chrome as `AppLayout` (sidebar + header + scrollable main) but with
 * `IgaSidebar`, and without the wizard/voice-agent/right-sidebar machinery that
 * belongs to the legacy authorization console.
 */

import type { ReactNode } from "react";

import { IgaSidebar } from "./IgaSidebar";
import { AppHeader } from "./AppHeader";
import { SidebarProvider } from "@/components/ui/sidebar";
import "../../theme/admin-shell.css";

export function IgaLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider
      defaultOpen={true}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 16)",
          "--app-shell-surface": "var(--background)",
          "--app-shell-border": "var(--border)",
          "--sidebar-surface": "var(--app-shell-surface)",
          "--sidebar-border": "var(--app-shell-border)",
        } as React.CSSProperties
      }
    >
      <div
        data-ui-scope="admin-shell"
        className="flex h-screen w-screen overflow-hidden bg-background"
      >
        <div>
          <IgaSidebar />
        </div>

        <div data-slot="admin-main-surface" className="flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <div className="flex-1 overflow-hidden">
            <div
              className="h-full w-full overflow-y-auto scrollbar-hide"
              data-main-content-area="true"
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
