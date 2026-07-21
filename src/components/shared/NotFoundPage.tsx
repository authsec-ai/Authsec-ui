import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";

/**
 * Global catch-all for unmatched routes. Without this, react-router renders
 * nothing and the user sees a blank page — which also masks stale
 * deployments that lack newer routes.
 */
export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Compass className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium tracking-wide text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold text-foreground">Page not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The page you're looking for doesn't exist or may have moved. Check the
        URL, or head back to the dashboard.
      </p>
      <Button asChild className="mt-2 text-white">
        <Link to="/dashboard">Go to dashboard</Link>
      </Button>
    </div>
  );
}
