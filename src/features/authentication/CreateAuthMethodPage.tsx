// Single page authentication method creation form (v4 — workspace IDPs)

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import {
  ArrowLeft,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  Check,
  ChevronRight,
  Settings,
  X,
  ExternalLink,
  Info,
} from "lucide-react";
import { toast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { FormField, FormInput, FormBadge, FormCopyField } from "../../theme";

import {
  useCreateIdentityProviderMutation,
  oidcCallbackUrl,
} from "../../app/api/authMethodApi";
import { SessionManager } from "../../utils/sessionManager";

// ---------------------------------------------------------------------------
// Provider templates — known OIDC providers with sane endpoint defaults and
// console-specific instructions for the operator.
// ---------------------------------------------------------------------------

interface ProviderTemplate {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  scopes: string[];
  description: string;
  authorization_url: string;
  token_url: string;
  userinfo_url: string;
  consoleName: string;
  consoleUrl: string;
  setupSteps: string[];
}

const OIDC_TEMPLATES: ProviderTemplate[] = [
  {
    id: "google",
    name: "Google",
    icon: ({ className }) => (
      <svg className={cn("h-6 w-6", className)} viewBox="0 0 24 24">
        <path
          fill="#4285f4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34a853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#fbbc05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="#ea4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    ),
    accent: "bg-gradient-to-br from-[#FDE5EE] via-[#E8EDFF] to-white",
    scopes: ["openid", "profile", "email"],
    description: "Google OAuth 2.0 / OpenID Connect",
    authorization_url: "https://accounts.google.com/o/oauth2/v2/auth",
    token_url: "https://oauth2.googleapis.com/token",
    userinfo_url: "https://openidconnect.googleapis.com/v1/userinfo",
    consoleName: "Google Cloud Console",
    consoleUrl: "https://console.cloud.google.com/apis/credentials",
    setupSteps: [
      "Open Google Cloud Console → APIs & Services → Credentials",
      "Create a new OAuth 2.0 Client ID of type Web application",
      "Paste the Callback URL below into Authorized redirect URIs",
      "Copy the Client ID and Client Secret here",
    ],
  },
  {
    id: "microsoft",
    name: "Microsoft",
    icon: ({ className }) => (
      <svg
        className={cn("h-6 w-6", className)}
        viewBox="0 0 23 23"
        fill="currentColor"
      >
        <path d="M0 0h11v11H0z" fill="#f25022" />
        <path d="M12 0h11v11H12z" fill="#00a4ef" />
        <path d="M0 12h11v11H0z" fill="#ffb900" />
        <path d="M12 12h11v11H12z" fill="#7fba00" />
      </svg>
    ),
    accent: "bg-gradient-to-br from-[#E4F2FF] via-[#E9EDFF] to-white",
    scopes: ["openid", "profile", "email"],
    description: "Azure AD / Microsoft Entra ID",
    authorization_url: "",
    token_url: "",
    userinfo_url: "https://graph.microsoft.com/oidc/userinfo",
    consoleName: "Microsoft Entra admin center",
    consoleUrl: "https://entra.microsoft.com/",
    setupSteps: [
      "Open Entra admin center → Applications → App registrations → New",
      "Copy the Directory (tenant) ID or verified tenant domain",
      "Set the platform to Web and paste the Callback URL below as the redirect URI",
      "Under Certificates & secrets, create a new client secret",
      "Copy the Application (client) ID and client secret value here",
    ],
  },
  {
    id: "github",
    name: "GitHub",
    icon: ({ className }) => (
      <svg
        className={cn("h-6 w-6", className)}
        fill="#054ddcff"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
          clipRule="evenodd"
        />
      </svg>
    ),
    accent: "bg-gradient-to-br from-[#EFE3FF] via-[#F3E8FF] to-white",
    scopes: ["user:email"],
    description: "GitHub OAuth Apps",
    authorization_url: "https://github.com/login/oauth/authorize",
    token_url: "https://github.com/login/oauth/access_token",
    userinfo_url: "https://api.github.com/user",
    consoleName: "GitHub Developer Settings",
    consoleUrl: "https://github.com/settings/developers",
    setupSteps: [
      "Open GitHub → Settings → Developer settings → OAuth Apps → New",
      "Set the Authorization callback URL to the Callback URL below",
      "Generate a client secret",
      "Copy the Client ID and Client Secret here",
    ],
  },
];

// Wizard steps
const WIZARD_STEPS = [
  { id: "configuration", label: "Configuration", icon: Settings },
  { id: "review", label: "Review", icon: CheckCircle },
];

// ---------------------------------------------------------------------------
// Sub-component: clickable provider card
// ---------------------------------------------------------------------------

type ProviderOptionProps = {
  template: ProviderTemplate;
  selected: boolean;
  onSelect: () => void;
};

const ProviderOption = ({
  template,
  selected,
  onSelect,
}: ProviderOptionProps) => {
  const Icon = template.icon;
  const iconContainerClasses = selected
    ? "bg-primary/15 text-primary"
    : template.accent
      ? cn(template.accent, "text-[color:var(--color-text-secondary)]")
      : "bg-muted text-[color:var(--color-text-secondary)]";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative flex flex-col items-center gap-2 overflow-hidden rounded-lg border px-4 py-3 text-center transition-all duration-300",
        "border-[var(--component-form-section-border)] bg-[color-mix(in_oklab,var(--component-card-background) 94%,transparent)] shadow-sm",
        "hover:border-primary/60 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/60",
        selected &&
          "border-primary bg-primary/8 ring-2 ring-primary/25 shadow-md",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
          iconContainerClasses,
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-sm font-semibold text-[color:var(--color-text-primary)]">
        {template.name}
      </div>
      {selected && (
        <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <Check className="h-3 w-3" />
        </span>
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

interface FormState {
  displayName: string;
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  microsoftTenant: string;
  scopes: string[];
}

const blankFormState = (): FormState => ({
  displayName: "",
  clientId: "",
  clientSecret: "",
  authorizationUrl: "",
  tokenUrl: "",
  userinfoUrl: "",
  microsoftTenant: "",
  scopes: [],
});

const normalizeMicrosoftTenant = (value: string) =>
  value
    .trim()
    .replace(/^https?:\/\/login\.microsoftonline\.com\//i, "")
    .replace(/\/.*$/, "")
    .trim();

const microsoftEndpointsForTenant = (tenantValue: string) => {
  const tenant = normalizeMicrosoftTenant(tenantValue);
  if (!tenant) {
    return { authorizationUrl: "", tokenUrl: "" };
  }

  return {
    authorizationUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
  };
};

export function CreateAuthMethodPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [form, setForm] = useState<FormState>(blankFormState());
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createIdp, { isLoading: isCreating }] =
    useCreateIdentityProviderMutation();

  const currentStep = WIZARD_STEPS[currentStepIndex];

  // Workspace context comes from the session (JWT); the backend resolves the
  // workspace_id from the token, so we don't pass it explicitly.
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    SessionManager.getSession()?.workspace_id || null,
  );
  useEffect(() => {
    setWorkspaceId(SessionManager.getSession()?.workspace_id || null);
  }, []);

  const callbackUrl = useMemo(() => oidcCallbackUrl(), []);

  const selectedProviderTemplate = useMemo(
    () => OIDC_TEMPLATES.find((t) => t.id === selectedTemplate),
    [selectedTemplate],
  );
  const SelectedProviderIcon = selectedProviderTemplate?.icon;

  const handleTemplateSelect = (template: ProviderTemplate) => {
    setSelectedTemplate(template.id);
    setForm((prev) => ({
      ...prev,
      authorizationUrl: template.authorization_url,
      tokenUrl: template.token_url,
      userinfoUrl: template.userinfo_url,
      microsoftTenant: template.id === "microsoft" ? "" : prev.microsoftTenant,
      scopes: template.scopes,
      displayName: template.name,
    }));
  };

  const handleMicrosoftTenantChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      microsoftTenant: value,
      ...microsoftEndpointsForTenant(value),
    }));
    setErrors((prev) => ({
      ...prev,
      microsoftTenant: "",
      authorizationUrl: "",
      tokenUrl: "",
    }));
  };

  // Auto-select provider from URL ?provider=google
  useEffect(() => {
    const pre = searchParams.get("provider");
    if (pre && !selectedTemplate) {
      const tpl = OIDC_TEMPLATES.find((t) => t.id === pre.toLowerCase());
      if (tpl) handleTemplateSelect(tpl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) setCurrentStepIndex(currentStepIndex - 1);
    else navigate("/authentication");
  }, [currentStepIndex, navigate]);

  const handleNext = useCallback(() => {
    if (currentStepIndex === 0) {
      const nextErrors: Record<string, string> = {};
      if (!selectedTemplate) nextErrors.template = "Pick a provider";
      if (!form.clientId.trim()) nextErrors.clientId = "Client ID is required";
      if (!form.clientSecret.trim())
        nextErrors.clientSecret = "Client Secret is required";
      if (
        selectedTemplate === "microsoft" &&
        !normalizeMicrosoftTenant(form.microsoftTenant)
      ) {
        nextErrors.microsoftTenant = "Microsoft tenant ID/domain is required";
      }
      if (!form.authorizationUrl.trim())
        nextErrors.authorizationUrl = "Authorization URL is required";
      if (!form.tokenUrl.trim()) nextErrors.tokenUrl = "Token URL is required";
      if (!form.userinfoUrl.trim())
        nextErrors.userinfoUrl = "Userinfo URL is required";

      if (Object.keys(nextErrors).length > 0) {
        setErrors(nextErrors);
        toast.error("Fill in all required fields");
        return;
      }
    }
    setErrors({});
    if (currentStepIndex < WIZARD_STEPS.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  }, [currentStepIndex, selectedTemplate, form]);

  const canProceed = () =>
    currentStepIndex === 0
      ? Boolean(
          selectedTemplate &&
            form.clientId.trim() &&
            form.clientSecret.trim() &&
            (selectedTemplate !== "microsoft" ||
              normalizeMicrosoftTenant(form.microsoftTenant)) &&
            form.authorizationUrl.trim() &&
            form.tokenUrl.trim() &&
            form.userinfoUrl.trim(),
        )
      : Boolean(workspaceId && selectedTemplate);

  const handleFinish = async () => {
    if (!workspaceId) {
      toast.error("Missing workspace session — please sign in again.");
      return;
    }
    if (!selectedProviderTemplate) {
      toast.error("Pick a provider first.");
      return;
    }
    try {
      await createIdp({
        provider_type: "oidc",
        display_name: form.displayName || selectedProviderTemplate.name,
        config: {
          provider_name: selectedProviderTemplate.id,
          authorization_url: form.authorizationUrl,
          token_url: form.tokenUrl,
          userinfo_url: form.userinfoUrl,
          client_id: form.clientId,
          client_secret: form.clientSecret,
          redirect_uri: callbackUrl,
          scopes: form.scopes.join(" "),
        },
      }).unwrap();
      toast.success("Identity provider created!");
      navigate("/authentication", {
        state: { authProviderCreated: true, from: "/authentication/create" },
      });
    } catch (error: any) {
      console.error("Failed to create identity provider:", error);
      toast.error(
        error?.data?.error || "Failed to create identity provider.",
      );
    }
  };

  const getStepSubtitle = () =>
    currentStep.id === "configuration"
      ? "Configure your OAuth 2.0 / OpenID Connect provider"
      : "Review and finalize your identity provider";

  return (
    <div className="flex flex-col h-[90vh] w-full">
      {/* Header */}
      <div className="flex-shrink-0 border-b py-4 px-8">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Create Identity Provider</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {getStepSubtitle()}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/authentication")}
            className="h-8 w-8 rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900 dark:hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 py-4 min-h-0">
        <div className="w-full">
          {currentStepIndex === 0 && (
            <div className="space-y-6">
              {/* Provider selection */}
              <div>
                {selectedProviderTemplate && (
                  <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-4 py-3 mb-3">
                    {SelectedProviderIcon && (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background shadow-sm">
                        <SelectedProviderIcon className="h-6 w-6" />
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="font-medium">
                        {selectedProviderTemplate.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {selectedProviderTemplate.description}
                      </div>
                    </div>
                    <FormBadge variant="secondary">Selected</FormBadge>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {OIDC_TEMPLATES.map((template) => (
                    <ProviderOption
                      key={template.id}
                      template={template}
                      selected={selectedTemplate === template.id}
                      onSelect={() => handleTemplateSelect(template)}
                    />
                  ))}
                </div>
                {errors.template && (
                  <p className="text-xs text-destructive mt-2">
                    {errors.template}
                  </p>
                )}
              </div>

              {/* Inline setup guidance + callback URL */}
              {selectedProviderTemplate && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Info className="h-4 w-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold">
                        Set up in {selectedProviderTemplate.consoleName}
                      </h4>
                      <ol className="mt-2 space-y-1 text-xs text-muted-foreground list-decimal list-inside">
                        {selectedProviderTemplate.setupSteps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                      <a
                        href={selectedProviderTemplate.consoleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-xs text-blue-700 dark:text-blue-300 hover:underline"
                      >
                        Open {selectedProviderTemplate.consoleName}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>

                  <FormField label="Callback URL (Authorized redirect URI)">
                    <FormCopyField
                      value={callbackUrl}
                      onCopy={() => toast.success("Callback URL copied!")}
                      className="font-mono text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Paste this exact URL into the provider's redirect URI
                      list — it must match byte-for-byte.
                    </p>
                  </FormField>
                </div>
              )}

              {/* Form fields */}
              {selectedProviderTemplate && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <FormField
                      label="Display Name"
                      htmlFor="displayName"
                      required
                    >
                      <FormInput
                        id="displayName"
                        placeholder="Sign in with Google"
                        value={form.displayName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setForm({ ...form, displayName: e.target.value })
                        }
                        className="h-9"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Label shown to users on the login screen.
                      </p>
                    </FormField>

                    <FormField label="Scopes (space-separated)" htmlFor="scopes">
                      <FormInput
                        id="scopes"
                        placeholder="openid email profile"
                        value={form.scopes.join(" ")}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setForm({
                            ...form,
                            scopes: e.target.value.split(/\s+/).filter(Boolean),
                          })
                        }
                        className="h-9 font-mono"
                      />
                    </FormField>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <FormField
                      label="Client ID"
                      htmlFor="providerClientId"
                      required
                    >
                      <FormInput
                        id="providerClientId"
                        placeholder="Your OAuth client ID"
                        value={form.clientId}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setForm({ ...form, clientId: e.target.value });
                          setErrors({ ...errors, clientId: "" });
                        }}
                        className="h-9 font-mono"
                      />
                      {errors.clientId && (
                        <p className="text-xs text-destructive mt-1">
                          {errors.clientId}
                        </p>
                      )}
                    </FormField>

                    <FormField
                      label="Client Secret"
                      htmlFor="clientSecret"
                      required
                    >
                      <div className="relative">
                        <FormInput
                          id="clientSecret"
                          type={showClientSecret ? "text" : "password"}
                          placeholder="Your OAuth client secret"
                          value={form.clientSecret}
                          onChange={(
                            e: React.ChangeEvent<HTMLInputElement>,
                          ) => {
                            setForm({ ...form, clientSecret: e.target.value });
                            setErrors({ ...errors, clientSecret: "" });
                          }}
                          className="h-9 font-mono pr-12"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                          onClick={() => setShowClientSecret((v) => !v)}
                        >
                          {showClientSecret ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      {errors.clientSecret && (
                        <p className="text-xs text-destructive mt-1">
                          {errors.clientSecret}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Stored in Vault, never persisted to the database.
                      </p>
                    </FormField>
                  </div>

                  {selectedTemplate === "microsoft" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <FormField
                        label="Microsoft tenant ID/domain"
                        htmlFor="microsoftTenant"
                        required
                      >
                        <FormInput
                          id="microsoftTenant"
                          placeholder="Directory tenant ID or contoso.onmicrosoft.com"
                          value={form.microsoftTenant}
                          onChange={(
                            e: React.ChangeEvent<HTMLInputElement>,
                          ) => handleMicrosoftTenantChange(e.target.value)}
                          className="h-9 font-mono"
                        />
                        {errors.microsoftTenant && (
                          <p className="text-xs text-destructive mt-1">
                            {errors.microsoftTenant}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Use the Entra Directory tenant ID or verified tenant
                          domain for this workspace provider.
                        </p>
                      </FormField>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <FormField
                      label="Authorization URL"
                      htmlFor="authUrl"
                      required
                    >
                      <FormInput
                        id="authUrl"
                        placeholder="https://…/authorize"
                        value={form.authorizationUrl}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setForm({
                            ...form,
                            authorizationUrl: e.target.value,
                          })
                        }
                        className="h-9 font-mono"
                      />
                    </FormField>
                    <FormField label="Token URL" htmlFor="tokenUrl" required>
                      <FormInput
                        id="tokenUrl"
                        placeholder="https://…/token"
                        value={form.tokenUrl}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setForm({ ...form, tokenUrl: e.target.value })
                        }
                        className="h-9 font-mono"
                      />
                    </FormField>
                    <FormField
                      label="UserInfo URL"
                      htmlFor="userinfoUrl"
                      required
                    >
                      <FormInput
                        id="userinfoUrl"
                        placeholder="https://…/userinfo"
                        value={form.userinfoUrl}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setForm({ ...form, userinfoUrl: e.target.value })
                        }
                        className="h-9 font-mono"
                      />
                    </FormField>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentStepIndex === 1 && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/50 p-3 space-y-2.5">
                <div>
                  <h4 className="font-medium text-xs mb-0.5">Workspace</h4>
                  <p className="text-xs text-muted-foreground font-mono">
                    {workspaceId || "—"}
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-xs mb-0.5">Provider</h4>
                  <div className="flex items-center gap-2">
                    {SelectedProviderIcon && (
                      <div className="flex h-6 w-6 items-center justify-center rounded bg-background">
                        <SelectedProviderIcon className="h-4 w-4" />
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {selectedProviderTemplate?.name} ·{" "}
                      {form.displayName || "(no display name)"}
                    </p>
                  </div>
                </div>
                <div className="border-t pt-2.5">
                  <h4 className="font-medium text-xs mb-1">
                    OAuth Configuration
                  </h4>
                  <div className="space-y-0.5 text-[11px] text-muted-foreground">
                    <div className="flex justify-between gap-4">
                      <span>Client ID:</span>
                      <span className="font-mono truncate">
                        {form.clientId || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Callback URL:</span>
                      <span className="font-mono truncate text-right">
                        {callbackUrl}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="border-t pt-2.5">
                  <h4 className="font-medium text-xs mb-1.5">Scopes</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {form.scopes.map((scope) => (
                      <FormBadge key={scope} variant="outline">
                        {scope}
                      </FormBadge>
                    ))}
                  </div>
                </div>
                <div className="border-t pt-2.5">
                  <h4 className="font-medium text-xs mb-1">Endpoints</h4>
                  <div className="space-y-1 text-[11px] text-muted-foreground">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">Authorization URL:</span>
                      <span className="font-mono break-all">
                        {form.authorizationUrl}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">Token URL:</span>
                      <span className="font-mono break-all">
                        {form.tokenUrl}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">UserInfo URL:</span>
                      <span className="font-mono break-all">
                        {form.userinfoUrl}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t bg-background pt-4 pb-4 mt-auto px-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-[120px]">
            <Button variant="outline" onClick={handleBack} size="default">
              {currentStepIndex > 0 ? (
                <>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </>
              ) : (
                "Cancel"
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2 flex-1 justify-center">
            {WIZARD_STEPS.map((step, index) => {
              const StepIcon = step.icon;
              const isActive = index === currentStepIndex;
              const isCompleted = index < currentStepIndex;
              return (
                <React.Fragment key={step.id}>
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2",
                      isActive && "bg-primary/10",
                      isCompleted && "opacity-60",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                        isCompleted && "bg-primary text-primary-foreground",
                        isActive && "bg-primary/20 text-primary",
                        !isActive &&
                          !isCompleted &&
                          "bg-muted text-muted-foreground",
                      )}
                    >
                      {isCompleted ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <StepIcon className="h-3 w-3" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-sm font-medium",
                        isActive && "text-foreground",
                        !isActive && "text-muted-foreground",
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                  {index < WIZARD_STEPS.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <div className="flex items-center gap-2 min-w-[120px] justify-end">
            {currentStepIndex < WIZARD_STEPS.length - 1 ? (
              <Button
                onClick={handleNext}
                disabled={!canProceed()}
                size="default"
              >
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleFinish}
                disabled={!canProceed() || isCreating}
                size="default"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Create Provider
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
