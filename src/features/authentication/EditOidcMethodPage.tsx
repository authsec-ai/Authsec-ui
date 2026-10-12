// Edit an OIDC identity provider (workspace IDP). The provider is addressed
// by its identity_providers id; the client secret is write-only.

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Loader2, Save } from "lucide-react";
import { Button } from "../../components/ui/button";
import { toast } from "../../lib/toast";
import { FormField, FormInput, FormCopyField } from "../../theme";
import {
  useGetOIDCIdentityProviderQuery,
  useUpdateOIDCIdentityProviderMutation,
  oidcCallbackUrl,
} from "../../app/api/authMethodApi";
import { OIDC_TEMPLATES, providerFieldLabels } from "./CreateAuthMethodPage";
import { providerLoadError } from "./utils/providerLoadError";

interface OidcForm {
  displayName: string;
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scopes: string;
}

const EMPTY: OidcForm = {
  displayName: "",
  clientId: "",
  clientSecret: "",
  authorizationUrl: "",
  tokenUrl: "",
  userinfoUrl: "",
  scopes: "",
};

export function EditOidcMethodPage() {
  const navigate = useNavigate();
  const { id = "" } = useParams<{ id: string }>();
  const { data, isLoading, error } = useGetOIDCIdentityProviderQuery(id, {
    skip: !id,
  });
  const [update, { isLoading: isSaving }] = useUpdateOIDCIdentityProviderMutation();
  const [form, setForm] = useState<OidcForm>(EMPTY);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    if (!data) return;
    const cfg = data.config ?? {};
    setForm({
      displayName: data.display_name || cfg.display_name || "",
      clientId: cfg.client_id || "",
      clientSecret: "",
      authorizationUrl: cfg.authorization_url || "",
      tokenUrl: cfg.token_url || "",
      userinfoUrl: cfg.userinfo_url || "",
      scopes: cfg.scopes || "",
    });
  }, [data]);

  const template = useMemo(
    () => OIDC_TEMPLATES.find((t) => t.id === data?.config?.provider_name),
    [data],
  );
  const labels = providerFieldLabels(template);
  const callbackUrl = data?.config?.redirect_uri || oidcCallbackUrl();
  const back = () => navigate("/identity-providers");

  const set = (key: keyof OidcForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const canSave =
    form.displayName.trim() !== "" &&
    form.clientId.trim() !== "" &&
    form.authorizationUrl.trim() !== "" &&
    form.tokenUrl.trim() !== "" &&
    form.userinfoUrl.trim() !== "";

  const handleSave = async () => {
    try {
      await update({
        id,
        display_name: form.displayName.trim(),
        config: {
          client_id: form.clientId.trim(),
          // Empty keeps the stored secret.
          client_secret: form.clientSecret.trim() || undefined,
          authorization_url: form.authorizationUrl.trim(),
          token_url: form.tokenUrl.trim(),
          userinfo_url: form.userinfoUrl.trim(),
          scopes: form.scopes.trim() || undefined,
        },
      }).unwrap();
      toast.success("Identity provider updated");
      back();
    } catch (e: any) {
      toast.error(e?.data?.error || e?.data?.message || "Failed to update the identity provider");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-foreground">Loading provider…</span>
      </div>
    );
  }

  if (!data || data.provider_type !== "oidc") {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <p className="text-foreground">
          {data ? "This provider is not an OIDC provider" : providerLoadError(error)}
        </p>
        <Button onClick={back}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Identity Providers
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-8 py-8">
      <header className="bg-card border border-border rounded-sm p-6 shadow-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={back} className="h-8 px-2" aria-label="Back to Identity Providers">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Edit {template?.name ?? "OIDC"} provider</h1>
            <p className="text-sm text-foreground mt-1">
              {data.display_name} · {data.config?.provider_name}
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={!canSave || isSaving} className="min-w-[120px]">
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save
        </Button>
      </header>

      <section className="bg-card border border-border rounded-sm p-6 shadow-sm space-y-6">
        <FormField label="Callback URL (Authorized redirect URI)">
          <FormCopyField
            value={callbackUrl}
            onCopy={() => toast.success("Callback URL copied!")}
            className="font-mono text-sm"
          />
        </FormField>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <FormField label="Display Name" htmlFor="displayName" required>
            <FormInput id="displayName" value={form.displayName} onChange={set("displayName")} className="h-9" />
          </FormField>
          <FormField label="Scopes" htmlFor="scopes">
            <FormInput id="scopes" value={form.scopes} onChange={set("scopes")} placeholder="openid profile email" className="h-9 font-mono" />
          </FormField>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <FormField label={labels.clientId} htmlFor="providerClientId" required>
            <FormInput
              id="providerClientId"
              name="idp-client-id"
              autoComplete="off"
              value={form.clientId}
              onChange={set("clientId")}
              className="h-9 font-mono"
            />
            {labels.clientIdHelp && (
              <p className="text-[11px] text-muted-foreground mt-1">{labels.clientIdHelp}</p>
            )}
          </FormField>
          <FormField label={labels.clientSecret} htmlFor="clientSecret">
            <div className="relative">
              <FormInput
                id="clientSecret"
                name="idp-client-secret"
                autoComplete="new-password"
                type={showSecret ? "text" : "password"}
                placeholder="Leave empty to keep the current secret"
                value={form.clientSecret}
                onChange={set("clientSecret")}
                className="h-9 font-mono pr-12"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                onClick={() => setShowSecret((v) => !v)}
                aria-label={showSecret ? "Hide secret" : "Show secret"}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              The stored secret is never shown. Enter a new one only to rotate it.
            </p>
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <FormField label="Authorization URL" htmlFor="authorizationUrl" required>
            <FormInput id="authorizationUrl" value={form.authorizationUrl} onChange={set("authorizationUrl")} className="h-9 font-mono" />
          </FormField>
          <FormField label="Token URL" htmlFor="tokenUrl" required>
            <FormInput id="tokenUrl" value={form.tokenUrl} onChange={set("tokenUrl")} className="h-9 font-mono" />
          </FormField>
          <FormField label="Userinfo URL" htmlFor="userinfoUrl" required>
            <FormInput id="userinfoUrl" value={form.userinfoUrl} onChange={set("userinfoUrl")} className="h-9 font-mono" />
          </FormField>
        </div>
      </section>
    </div>
  );
}

export default EditOidcMethodPage;
