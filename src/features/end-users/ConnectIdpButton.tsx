import { Plus } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";

/** The Users page's main action: connect an identity provider, then come back to this tab. */
export function ConnectIdpButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <Button
      variant={variant}
      className={variant === "default" ? "text-white" : undefined}
      data-tour-id="create-auth-method-button"
      onClick={() => navigate(`/identity-providers/new?returnTo=${encodeURIComponent(pathname)}`)}
    >
      <Plus className="mr-1.5 size-4" />
      Connect identity provider
    </Button>
  );
}
