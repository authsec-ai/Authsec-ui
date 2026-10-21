/**
 * `NewIdentityProviderPage` — /identity-providers/new?returnTo=<path>. One page:
 *
 *   ① Provider          Okta · Microsoft Entra ID · Google Workspace ·
 *                       Active Directory · Other SAML or OIDC · AuthSec directory
 *   ② Connection        protocol, domain/tenant, client ID + secret (OIDC) or
 *                       entity ID, SSO URL, certificate (SAML)
 *   ③ User provisioning optional SCIM (POST /authsec/scim-connections)
 *   ④ Test sign-in      see below
 *
 * Save creates the provider with the same payloads as CreateAuthMethodPage
 * (OIDC) and CreateSamlMethodPage (SAML): POST /authsec/identity-providers.
 * It then returns to `returnTo` with `idp=<new id>` added, so the picker that
 * sent the operator here preselects it.
 *
 * Not offered, because the backend has no endpoint for it:
 * - Active Directory over LDAP as a sign-in provider (only directory sync).
 * - A console-driven test sign-in that reports the result back here.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

import { oidcCallbackUrl, useCreateIdentityProviderMutation } from "@/app/api/authMethodApi";
import {
  ATTRIBUTE_MAPPING_PRESETS,
  parseIdpMetadataXml,
  samlAcsUrl,
  samlEntityId,
} from "@/app/api/samlApi";
import { useCreateScimConnectionMutation, type CreateScimConnectionResponse } from "@/app/api/scimConnectionsApi";
import { ConsolePage, type Crumb } from "@/components/console/ConsolePage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CopyValue,
  FieldHelp,
  FieldLabel,
  SectionCard,
  Segmented,
  SetupLayout,
  SidePanel,
} from "@/features/applications/create/SetupForm";
import { Notice } from "@/features/applications/create/WizardParts";
import { cn } from "@/lib/utils";
import { SessionManager } from "@/utils/sessionManager";

import { AUTHSEC_DIRECTORY } from "./IdentityProviderPicker";

type ProviderKey = "okta" | "entra" | "google" | "ldap" | "other" | "authsec";
type Protocol = "oidc" | "saml";

const PROVIDERS: {
  key: ProviderKey;
  title: string;
  body: string;
  protocols: Protocol[];
  displayName: string;
  unavailable?: string;
}[] = [
  { key: "okta", title: "Okta", body: "OIDC or SAML", protocols: ["oidc", "saml"], displayName: "Okta" },
  { key: "entra", title: "Microsoft Entra ID", body: "OIDC or SAML", protocols: ["oidc", "saml"], displayName: "Microsoft Entra ID" },
  { key: "google", title: "Google Workspace", body: "OIDC", protocols: ["oidc"], displayName: "Google Workspace" },
  {
    key: "ldap",
    title: "Active Directory",
    body: "LDAP",
    protocols: [],
    displayName: "Active Directory",
    unavailable: "Sign-in over LDAP isn't available yet. Sync Active Directory users from Directory sync instead.",
  },
  { key: "other", title: "Other SAML or OIDC", body: "Any standard provider", protocols: ["oidc", "saml"], displayName: "" },
  {
    key: "authsec",
    title: "AuthSec directory",
    body: "Users managed in AuthSec; no external provider",
    protocols: [],
    displayName: "AuthSec directory",
  },
];

const SAML_SLUG: Record<ProviderKey, string> = {
  okta: "okta",
  entra: "azure-ad",
  google: "google",
  ldap: "",
  other: "",
  authsec: "",
};

const DEFAULT_ATTRIBUTES = { email: "email", first_name: "firstName", last_name: "lastName" };

const HELP: Record<ProviderKey, { term: string; body: ReactNode }[]> = {
  okta: [
    { term: "In Okta", body: "Applications → Create App Integration → OIDC → Web Application (or SAML 2.0)." },
    { term: "Client ID and secret", body: "Copy them from the new Okta app into this page." },
    { term: "Redirect URI", body: "Copy it from this page into the Okta app's sign-in redirect URIs." },
  ],
  entra: [
    { term: "In Entra admin center", body: "Applications → App registrations → New registration." },
    { term: "Tenant", body: "Overview shows the Directory (tenant) ID; a verified domain works too." },
    { term: "Client ID and secret", body: "Application (client) ID on Overview; the secret's Value under Certificates & secrets." },
    { term: "Redirect URI", body: "Add it under Authentication as a Web platform redirect URI." },
  ],
  google: [
    { term: "In Google Cloud Console", body: "APIs & Services → Credentials → Create OAuth client ID → Web application." },
    { term: "Redirect URI", body: "Paste it into Authorized redirect URIs." },
    { term: "Client ID and secret", body: "Copy them from the new OAuth client into this page." },
  ],
  ldap: [{ term: "Active Directory", body: "Sync users from Directory sync; they can then sign in with AuthSec." }],
  other: [
    { term: "OIDC", body: "Your provider's authorization, token and userinfo URLs are in its discovery document (/.well-known/openid-configuration)." },
    { term: "SAML", body: "Paste the provider's metadata XML to fill Entity ID, SSO URL and certificate." },
  ],
  authsec: [{ term: "AuthSec directory", body: "Invite users by email from the Users page. No provider settings are needed." }],
};

function normalizeTenant(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\/login\.microsoftonline\.com\//i, "")
    .replace(/\/.*$/, "")
    .trim();
}

function normalizeDomain(value: string) {
  return value.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
}

/** Only same-app paths are accepted as a return target. */
function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/identity-providers";
  return raw;
}

function originOf(returnTo: string): { name: string; crumbs: Crumb[] } {
  const path = returnTo.split("?")[0];
  if (path === "/applications/new") {
    return { name: "Add MCP", crumbs: [{ label: "MCP", to: "/applications" }, { label: "Add", to: returnTo }] };
  }
  if (path === "/agents/new") {
    return { name: "Register agent", crumbs: [{ label: "Agents", to: "/agents" }, { label: "Register", to: returnTo }] };
  }
  if (path === "/service-accounts/new") {
    return {
      name: "Create service account",
      crumbs: [{ label: "Service accounts", to: "/service-accounts" }, { label: "Create", to: returnTo }],
    };
  }
  return { name: "Identity providers", crumbs: [{ label: "Identity providers", to: "/identity-providers" }] };
}

function withIdp(returnTo: string, id: string): string {
  const [path, query = ""] = returnTo.split("?");
  const params = new URLSearchParams(query);
  params.set("idp", id);
  return `${path}?${params.toString()}`;
}

function apiError(err: unknown, fallback: string) {
  const e = err as { data?: { error?: string; message?: string } };
  return e?.data?.error ?? e?.data?.message ?? fallback;
}

export default function NewIdentityProviderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));
  const origin = originOf(returnTo);
  const workspaceId = SessionManager.getSession()?.workspace_id ?? "";

  const [key, setKey] = useState<ProviderKey>("okta");
  const [protocol, setProtocol] = useState<Protocol>("oidc");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [authUrl, setAuthUrl] = useState("");
  const [tokenUrl, setTokenUrl] = useState("");
  const [userinfoUrl, setUserinfoUrl] = useState("");
  const [metadataXml, setMetadataXml] = useState("");
  const [metadataHint, setMetadataHint] = useState<{ ok: boolean; text: string } | null>(null);
  const [entityId, setEntityId] = useState("");
  const [ssoUrl, setSsoUrl] = useState("");
  const [sloUrl, setSloUrl] = useState("");
  const [certificate, setCertificate] = useState("");
  const [nameIdFormat, setNameIdFormat] = useState("urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress");
  const [scim, setScim] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id: string; scim?: CreateScimConnectionResponse; scimError?: string } | null>(null);

  const [createIdp] = useCreateIdentityProviderMutation();
  const [createScim] = useCreateScimConnectionMutation();

  const provider = PROVIDERS.find((p) => p.key === key)!;
  const external = provider.protocols.length > 0;
  const callbackUrl = useMemo(() => oidcCallbackUrl(), []);
  const providerLabel = key === "other" ? name.trim() || "your provider" : provider.title;

  const selectProvider = (next: ProviderKey) => {
    const p = PROVIDERS.find((x) => x.key === next)!;
    if (p.unavailable) return;
    setKey(next);
    setError(null);
    setTouched(false);
    if (p.protocols.length > 0 && !p.protocols.includes(protocol)) setProtocol(p.protocols[0]);
  };

  const applyMetadata = () => {
    const parsed = parseIdpMetadataXml(metadataXml.trim());
    if (!parsed) {
      setMetadataHint({ ok: false, text: "Couldn't read that XML. Paste the IdP metadata (it contains <IDPSSODescriptor>)." });
      return;
    }
    const filled: string[] = [];
    if (parsed.entity_id) {
      setEntityId(parsed.entity_id);
      filled.push("Entity ID");
    }
    if (parsed.sso_url) {
      setSsoUrl(parsed.sso_url);
      filled.push("SSO URL");
    }
    if (parsed.slo_url) setSloUrl(parsed.slo_url);
    if (parsed.certificate) {
      setCertificate(parsed.certificate);
      filled.push("certificate");
    }
    // Transient NameIDs change every sign-in, which would create a new user each time.
    if (parsed.name_id_format && !parsed.name_id_format.includes("transient")) setNameIdFormat(parsed.name_id_format);
    setMetadataHint(
      filled.length
        ? { ok: true, text: `Filled ${filled.join(", ")} from the metadata.` }
        : { ok: false, text: "The XML has no entity ID, SSO URL or certificate. Fill them in below." },
    );
  };

  // ── Validation (what each create payload needs) ──────────────────────────
  const tenant = normalizeTenant(domain);
  const oktaDomain = normalizeDomain(domain);
  const missing: string[] = [];
  if (external) {
    if (key === "other" && !name.trim()) missing.push("Name");
    if (protocol === "oidc") {
      if (key === "okta" && !oktaDomain) missing.push("Okta domain");
      if (key === "entra" && !tenant) missing.push("Tenant");
      if (key === "other") {
        if (!/^https:\/\/\S+/.test(authUrl.trim())) missing.push("Authorization URL");
        if (!/^https:\/\/\S+/.test(tokenUrl.trim())) missing.push("Token URL");
        if (!/^https:\/\/\S+/.test(userinfoUrl.trim())) missing.push("Userinfo URL");
      }
      if (!clientId.trim()) missing.push("Client ID");
      if (!clientSecret.trim()) missing.push("Client secret");
    } else {
      if (!entityId.trim()) missing.push("Entity ID");
      if (!ssoUrl.trim()) missing.push("SSO URL");
      if (!certificate.trim()) missing.push("Certificate");
    }
  }
  const showMissing = (field: string) => touched && missing.includes(field);

  const oidcEndpoints = () => {
    if (key === "okta") {
      const base = `https://${oktaDomain}/oauth2/v1`;
      return { provider_name: "okta", authorization_url: `${base}/authorize`, token_url: `${base}/token`, userinfo_url: `${base}/userinfo` };
    }
    if (key === "entra") {
      return {
        provider_name: "microsoft",
        authorization_url: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
        token_url: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        userinfo_url: "https://graph.microsoft.com/oidc/userinfo",
      };
    }
    if (key === "google") {
      return {
        provider_name: "google",
        authorization_url: "https://accounts.google.com/o/oauth2/v2/auth",
        token_url: "https://oauth2.googleapis.com/token",
        userinfo_url: "https://openidconnect.googleapis.com/v1/userinfo",
      };
    }
    return {
      provider_name: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "oidc",
      authorization_url: authUrl.trim(),
      token_url: tokenUrl.trim(),
      userinfo_url: userinfoUrl.trim(),
    };
  };

  const save = async () => {
    setTouched(true);
    setError(null);
    if (key === "authsec") {
      navigate(withIdp(returnTo, AUTHSEC_DIRECTORY));
      return;
    }
    if (missing.length > 0) {
      setError(`Fill in: ${missing.join(", ")}.`);
      return;
    }
    setSaving(true);
    const displayName = key === "other" ? name.trim() : provider.displayName;
    try {
      const created =
        protocol === "oidc"
          ? await createIdp({
              provider_type: "oidc",
              display_name: displayName,
              config: {
                ...oidcEndpoints(),
                client_id: clientId.trim(),
                client_secret: clientSecret.trim(),
                redirect_uri: callbackUrl,
                scopes: "openid profile email",
              },
            }).unwrap()
          : await createIdp({
              provider_type: "saml",
              display_name: displayName,
              config: {
                provider_name:
                  SAML_SLUG[key] || displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "saml",
                // Trimmed: a stray space breaks SAML sign-in invisibly.
                entity_id: entityId.trim(),
                sso_url: ssoUrl.trim(),
                slo_url: sloUrl.trim() || undefined,
                certificate: certificate.trim(),
                name_id_format: nameIdFormat,
                attribute_mapping: { ...(ATTRIBUTE_MAPPING_PRESETS[SAML_SLUG[key]] ?? DEFAULT_ATTRIBUTES) },
              },
            }).unwrap();

      if (!scim) {
        toast.success(`${displayName} saved.`);
        navigate(withIdp(returnTo, created.id));
        return;
      }
      // SCIM: the token is shown once, so stay here until it is copied.
      try {
        const conn = await createScim({ identity_provider_id: created.id }).unwrap();
        setSaved({ id: created.id, scim: conn });
      } catch (err) {
        setSaved({ id: created.id, scimError: apiError(err, "Couldn't turn on user provisioning.") });
      }
      toast.success(`${displayName} saved.`);
    } catch (err) {
      setError(apiError(err, "Couldn't save the identity provider."));
    } finally {
      setSaving(false);
    }
  };

  const crumbs: Crumb[] = [...origin.crumbs, { label: "New identity provider" }];
  const locked = Boolean(saved);

  return (
    <ConsolePage
      crumbs={crumbs}
      title="New identity provider"
      description={`You return to ${origin.name} when it is saved.`}
      actions={
        saved ? (
          <Button className="text-white" onClick={() => navigate(withIdp(returnTo, saved.id))}>
            Return to {origin.name}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => navigate(returnTo)} disabled={saving}>
              Cancel
            </Button>
            <Button className="text-white" onClick={() => void save()} disabled={saving || Boolean(provider.unavailable)}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {saving ? "Saving…" : "Save and return"}
            </Button>
          </>
        )
      }
    >
      {error ? <Notice tone="danger" title="Not saved.">{error}</Notice> : null}
      {saved ? (
        saved.scim ? (
          <Notice tone="success" title="Saved. Copy the provisioning token now.">
            It is shown only once. Paste the endpoint and token into {providerLabel}'s SCIM provisioning settings.
          </Notice>
        ) : (
          <Notice tone="warning" title="Saved, but provisioning is off.">
            {saved.scimError} You can turn it on later from Directory sync.
          </Notice>
        )
      ) : null}

      <SetupLayout
        side={
          <SidePanel
            title="Where to find these values"
            items={[
              ...HELP[key],
              ...(key !== "authsec" ? [{ term: "No provider yet?", body: "Choose AuthSec directory and invite users by email." }] : []),
            ]}
          />
        }
      >
        <SectionCard n={1} title="Provider">
          <div role="radiogroup" aria-label="Provider" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {PROVIDERS.map((p) => {
              const selected = p.key === key;
              return (
                <button
                  key={p.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-disabled={p.unavailable || locked ? true : undefined}
                  disabled={locked}
                  title={p.unavailable}
                  onClick={() => selectProvider(p.key)}
                  className={cn(
                    "relative rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "border-(--color-primary) bg-(--color-primary-soft) ring-1 ring-(--color-primary)"
                      : "border-(--color-border-subtle) bg-(--color-surface-raised) hover:border-(--color-border-strong)",
                    p.unavailable && "cursor-not-allowed opacity-60 hover:border-(--color-border-subtle)",
                  )}
                >
                  <span className="block pr-6 text-[length:var(--font-size-md)] font-semibold text-(--color-text)">{p.title}</span>
                  <span className="mt-1 block text-[length:13px] leading-relaxed text-(--color-text-muted)">
                    {p.unavailable ? "Not available yet" : p.body}
                  </span>
                  {selected ? <Check className="absolute right-3 top-3 size-4 text-(--color-primary-text)" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard n={2} title="Connection">
          {key === "authsec" ? (
            <FieldHelp>
              No connection is needed. People sign in with AuthSec accounts; invite them by email from the{" "}
              <Link to="/users" className="font-medium text-(--color-primary-text) underline underline-offset-2">
                Users
              </Link>{" "}
              page.
            </FieldHelp>
          ) : (
            <>
              <div className="space-y-1.5">
                <FieldLabel id="idp-protocol-label">Protocol</FieldLabel>
                <Segmented
                  labelledBy="idp-protocol-label"
                  value={protocol}
                  onChange={setProtocol}
                  disabled={locked}
                  options={[
                    { value: "oidc", label: "OIDC", disabled: !provider.protocols.includes("oidc") },
                    {
                      value: "saml",
                      label: "SAML",
                      disabled: !provider.protocols.includes("saml"),
                      title: provider.protocols.includes("saml") ? undefined : `${provider.title} connects over OIDC here.`,
                    },
                  ]}
                />
              </div>

              {key === "other" ? (
                <Field id="idp-name" label="Name" required error={showMissing("Name")}>
                  <Input id="idp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Auth0" disabled={locked} />
                </Field>
              ) : null}

              {protocol === "oidc" ? (
                <>
                  {key === "okta" ? (
                    <Field id="idp-domain" label="Okta domain" required error={showMissing("Okta domain")}>
                      <Input id="idp-domain" className="font-mono" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.okta.com" disabled={locked} />
                    </Field>
                  ) : key === "entra" ? (
                    <Field id="idp-domain" label="Tenant" required error={showMissing("Tenant")} help="Directory (tenant) ID or a verified domain, e.g. acme.onmicrosoft.com.">
                      <Input id="idp-domain" className="font-mono" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.onmicrosoft.com" disabled={locked} />
                    </Field>
                  ) : key === "google" ? (
                    <FieldHelp>Any Google account the OAuth client allows can sign in; AuthSec doesn't limit it to one Workspace domain.</FieldHelp>
                  ) : (
                    <>
                      <Field id="idp-auth" label="Authorization URL" required error={showMissing("Authorization URL")}>
                        <Input id="idp-auth" className="font-mono" value={authUrl} onChange={(e) => setAuthUrl(e.target.value)} placeholder="https://idp.example.com/authorize" disabled={locked} />
                      </Field>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="idp-token" label="Token URL" required error={showMissing("Token URL")}>
                          <Input id="idp-token" className="font-mono" value={tokenUrl} onChange={(e) => setTokenUrl(e.target.value)} placeholder="https://idp.example.com/token" disabled={locked} />
                        </Field>
                        <Field id="idp-userinfo" label="Userinfo URL" required error={showMissing("Userinfo URL")}>
                          <Input id="idp-userinfo" className="font-mono" value={userinfoUrl} onChange={(e) => setUserinfoUrl(e.target.value)} placeholder="https://idp.example.com/userinfo" disabled={locked} />
                        </Field>
                      </div>
                    </>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="idp-client-id" label="Client ID" required error={showMissing("Client ID")}>
                      <Input id="idp-client-id" className="font-mono" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" disabled={locked} />
                    </Field>
                    <Field id="idp-client-secret" label="Client secret" required error={showMissing("Client secret")}>
                      <Input id="idp-client-secret" type="password" className="font-mono" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="new-password" disabled={locked} />
                    </Field>
                  </div>
                  <CopyValue label="Redirect URI" value={callbackUrl} />
                </>
              ) : (
                <>
                  <Field id="idp-metadata" label="Metadata XML" help="Optional. Paste the provider's metadata to fill the fields below.">
                    <Textarea
                      id="idp-metadata"
                      rows={3}
                      className="font-mono text-[length:13px]"
                      value={metadataXml}
                      onChange={(e) => setMetadataXml(e.target.value)}
                      disabled={locked}
                    />
                  </Field>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" variant="outline" size="sm" onClick={applyMetadata} disabled={locked || !metadataXml.trim()}>
                      Fill from metadata
                    </Button>
                    {metadataHint ? <FieldHelp error={!metadataHint.ok}>{metadataHint.text}</FieldHelp> : null}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="idp-entity" label="Entity ID" required error={showMissing("Entity ID")}>
                      <Input id="idp-entity" className="font-mono" value={entityId} onChange={(e) => setEntityId(e.target.value)} disabled={locked} />
                    </Field>
                    <Field id="idp-sso" label="SSO URL" required error={showMissing("SSO URL")}>
                      <Input id="idp-sso" className="font-mono" value={ssoUrl} onChange={(e) => setSsoUrl(e.target.value)} disabled={locked} />
                    </Field>
                  </div>
                  <Field id="idp-cert" label="Certificate" required error={showMissing("Certificate")}>
                    <Textarea
                      id="idp-cert"
                      rows={4}
                      className="font-mono text-[length:13px]"
                      value={certificate}
                      onChange={(e) => setCertificate(e.target.value)}
                      placeholder="-----BEGIN CERTIFICATE-----"
                      disabled={locked}
                    />
                  </Field>
                  <CopyValue label="ACS URL" value={samlAcsUrl(workspaceId)} />
                  <CopyValue label="SP entity ID" value={samlEntityId(workspaceId)} />
                </>
              )}
            </>
          )}
        </SectionCard>

        {external ? (
          <SectionCard n={3} title="User provisioning" aside="Optional">
            <div className="flex items-start gap-3">
              <Switch id="idp-scim" checked={scim} onCheckedChange={setScim} disabled={locked} className="mt-0.5" />
              <div>
                <label htmlFor="idp-scim" className="text-[length:var(--font-size-sm)] font-semibold text-(--color-text)">
                  Create and remove users automatically (SCIM)
                </label>
                <FieldHelp>
                  Users added or removed in {providerLabel} are added or removed here. You get a SCIM endpoint and token
                  after saving.
                </FieldHelp>
              </div>
            </div>
            {saved?.scim ? (
              <div className="space-y-2">
                <CopyValue label="SCIM endpoint" value={saved.scim.endpoint} />
                <CopyValue label="SCIM token" value={saved.scim.token} />
              </div>
            ) : null}
          </SectionCard>
        ) : null}

        {external ? (
          <SectionCard n={4} title="Test sign-in">
            <FieldHelp>
              A test sign-in can't be run from this page yet: there's no console endpoint that reports the result back.
              After saving, open your workspace's sign-in page in a private window and choose {providerLabel}.
            </FieldHelp>
          </SectionCard>
        ) : null}
      </SetupLayout>
    </ConsolePage>
  );
}

function Field({
  id,
  label,
  required = false,
  error = false,
  help,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: boolean;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      {children}
      {error ? <FieldHelp error>Enter the {label.toLowerCase()}.</FieldHelp> : help ? <FieldHelp>{help}</FieldHelp> : null}
    </div>
  );
}
