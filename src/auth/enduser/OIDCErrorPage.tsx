import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthSplitFrame } from "../components/AuthSplitFrame";
import { AuthValuePanel } from "../components/AuthValuePanel";
import { AuthActionPanel } from "../components/AuthActionPanel";
import { AuthStepHeader } from "../components/AuthStepHeader";

export function OIDCErrorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const message = useMemo(
    () =>
      searchParams.get("message") ||
      "The authentication flow could not be completed.",
    [searchParams],
  );

  return (
    <AuthSplitFrame
      shellVariant="enduser-single-card"
      valuePanel={
        <AuthValuePanel
          eyebrow="OIDC Error"
          title="The sign-in flow could not continue."
          subtitle="Review the error and restart the OAuth login if the challenge has expired."
          points={[
            "This route is the terminal error state for the PAR-backed browser flow.",
            "Retry from the login challenge instead of replaying stale callback URLs.",
          ]}
        />
      }
    >
      <AuthActionPanel className="space-y-6">
        <AuthStepHeader
          title="Authentication failed"
          subtitle={message}
        />
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={() => navigate("/oidc/login", { replace: true })}>
            Restart sign-in
          </Button>
          <Button variant="outline" onClick={() => window.history.back()}>
            Go back
          </Button>
        </div>
      </AuthActionPanel>
    </AuthSplitFrame>
  );
}

export default OIDCErrorPage;
