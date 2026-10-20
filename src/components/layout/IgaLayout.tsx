/**
 * IgaLayout — shell for the Agentic IGA console.
 *
 * Same chrome as `AppLayout` (sidebar + header + scrollable main) but with
 * `IgaSidebar`, and without the wizard/voice-agent/right-sidebar machinery that
 * belongs to the legacy authorization console.
 */

import { Suspense, useState, type ReactNode } from "react";

import { PageLoadingSkeleton } from "./PageLoadingSkeleton";
import { IgaSidebar } from "./IgaSidebar";
import { AppHeader } from "./AppHeader";
import { PageFooterSlotContext } from "./PageFooter";
import { SidebarProvider } from "@/components/ui/sidebar";
import "../../theme/admin-shell.css";
import "./iga-pages-skin.css";
import "./iga-shell-skin.css";

export function IgaLayout({ children }: { children: ReactNode }) {
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null);
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
      {/* `data-shell="iga"` scopes iga-shell-skin.css to this console's
          chrome. AppLayout renders the same AppHeader, Breadcrumb and sidebar
          primitives and deliberately carries no such attribute, so the
          authorization console is unaffected by it. */}
      <div
        data-ui-scope="admin-shell"
        data-shell="iga"
        // Pinned to the window, and clipped rather than hidden.
        //
        // `h-screen` + `overflow-hidden` left this shell in the document flow
        // and still scrollable by script: anything that made the document a
        // little taller than the window (a popup, a `scrollIntoView` with
        // nowhere left to scroll inside the content area) scrolled the shell or
        // the page instead, sliding the header off the top and leaving a blank
        // band under the page's action bar. The sidebar is `position: fixed`,
        // so it alone stayed put. `fixed inset-0` keeps the header and footer at
        // the window's edges whatever the document does, and `overflow-clip`
        // makes this box impossible to scroll at all.
        className="fixed inset-0 flex overflow-clip bg-background"
      >
        <div>
          <IgaSidebar />
        </div>

        <div data-slot="admin-main-surface" className="flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <div className="min-h-0 flex-1 overflow-clip">
            <div
              className="h-full w-full overflow-y-auto scrollbar-hide"
              data-main-content-area="true"
            >
              <PageFooterSlotContext.Provider value={footerSlot}>
                <Suspense fallback={<PageLoadingSkeleton />}>
                  {children}
                </Suspense>
              </PageFooterSlotContext.Provider>
            </div>
          </div>
          {/* A page's action bar (<PageFooter>) renders here: below the scroll
              area, at the bottom of the window, never over the content. Empty,
              it takes no space. */}
          <div
            ref={setFooterSlot}
            data-slot="page-footer"
            className="shrink-0 border-t border-(--color-border-subtle) bg-(--color-surface-raised) empty:hidden"
          />
        </div>
      </div>
    </SidebarProvider>
  );
}
