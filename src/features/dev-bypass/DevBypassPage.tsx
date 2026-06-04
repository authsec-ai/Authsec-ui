import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch } from "@/app/hooks";
import { checkSession } from "@/auth/slices/authSlice";
import {
  SessionManager,
  type SessionData,
} from "@/utils/sessionManager";
import {
  createUserFromJWT,
  decodeJWT,
  isTokenExpired,
  type JWTPayload,
} from "@/utils/jwt";

if (!import.meta.env.DEV) {
  throw new Error("DevBypassPage must not be loaded outside DEV builds");
}

interface DecodeResult {
  payload: JWTPayload | null;
  error: string | null;
}

function inspect(token: string): DecodeResult {
  const trimmed = token.trim();
  if (!trimmed) return { payload: null, error: null };

  const payload = decodeJWT(trimmed);
  if (!payload) {
    return { payload: null, error: "Invalid JWT — could not decode." };
  }
  if (isTokenExpired(trimmed)) {
    return { payload, error: "Token is expired." };
  }
  const tenantId =
    payload.tenant_id || (payload.workspace_id as string | undefined) || "";
  const missing: string[] = [];
  if (!tenantId) missing.push("tenant_id (or workspace_id)");
  if (!payload.client_id) missing.push("client_id");
  if (missing.length > 0) {
    return {
      payload,
      error: `JWT is missing required claims: ${missing.join(", ")}`,
    };
  }
  return { payload, error: null };
}

export function DevBypassPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [token, setToken] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const decoded = useMemo(() => inspect(token), [token]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const { payload, error } = decoded;
    if (error || !payload) {
      setSubmitError(error ?? "Paste a JWT first.");
      return;
    }

    const tenantId =
      payload.tenant_id ||
      (payload.workspace_id as string | undefined) ||
      "";

    const project = payload.project_id
      ? {
          id: payload.project_id,
          name: "Dev",
          slug: "dev",
          ownerId: payload.client_id,
          role: "owner",
        }
      : null;

    const sessionData: SessionData = {
      token: token.trim(),
      user: createUserFromJWT(payload),
      projects: project ? [project] : [],
      currentProject: project,
      jwtPayload: { ...payload, tenant_id: tenantId },
      tenant_id: tenantId,
      workspace_domain: payload.workspace_domain,
      project_id: payload.project_id || "",
      client_id: payload.client_id,
      user_id: payload.client_id,
      expiresAt: payload.exp * 1000,
      roles: payload.roles ?? [],
      resources: payload.resources ?? [],
      scopes: payload.scopes ?? [],
      groups: payload.groups ?? [],
    };

    SessionManager.saveSession(sessionData);
    dispatch(checkSession());
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="mx-auto w-full max-w-3xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dev Bypass</h1>
        <p className="text-sm text-muted-foreground">
          Dev-only. Paste a platform JWT to skip the login flow and land on
          /dashboard. Stripped from production builds.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sign in with a platform JWT</CardTitle>
          <CardDescription>
            The token must carry <code>tenant_id</code> (or{" "}
            <code>workspace_id</code>) and <code>client_id</code> claims.{" "}
            <code>project_id</code> is optional — workspace-only tokens are
            accepted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="eyJhbGciOi…"
              rows={8}
              className="font-mono text-xs"
              autoFocus
            />

            {decoded.error && token.trim() && (
              <Alert variant="destructive">
                <AlertTitle>JWT problem</AlertTitle>
                <AlertDescription>{decoded.error}</AlertDescription>
              </Alert>
            )}

            {submitError && !decoded.error && (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              disabled={!decoded.payload || !!decoded.error}
            >
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>

      {decoded.payload && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Decoded payload</CardTitle>
            <CardDescription>
              Sanity-check the claims before submitting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(decoded.payload, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
