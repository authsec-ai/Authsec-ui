/**
 * IgaSidebar — the Agentic IGA console's sidebar.
 *
 * Both products share one sidebar (UX proposal): Core AuthSec and Agentic IGA
 * are collapsible groups in it, and the group holding the current page opens
 * itself. This wrapper stays so IgaLayout keeps its own import.
 */

import { AppSidebar } from "./AppSidebar";

export function IgaSidebar(props: React.ComponentProps<typeof AppSidebar>) {
  return <AppSidebar {...props} />;
}
