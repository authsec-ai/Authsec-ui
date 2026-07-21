// CreateSamlMethodPage — workspace-scoped SAML IDP creation (v5, single-page)
//
// One-page form. Picking a provider (Auth0 / Okta / Microsoft Entra / Generic)
// drives the slug default, the attribute mapping preset, the SamlIdpReference
// tab, and the per-field helper copy under each input. XML metadata paste is
// the recommended autofill path; manual fields stay visible so the operator
// can see what was filled.

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import {
  CheckCircle,
  Loader2,
  Copy,
  Upload,
  X,
  Info,
} from "lucide-react";
import { toast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { FormField, FormInput } from "../../theme";
import {
  useLazyGetSamlSPMetadataQuery,
  samlEntityId,
  samlAcsUrl,
  samlMetadataUrl,
  parseIdpMetadataXml,
  presetForSlug,
  ATTRIBUTE_MAPPING_PRESETS,
  buildAuth0SettingsJson,
} from "../../app/api/samlApi";
import { useCreateIdentityProviderMutation } from "../../app/api/authMethodApi";
import { SessionManager } from "../../utils/sessionManager";
import {
  SAML_IDP_INSTRUCTIONS,
  SAML_IDP_FIELD_HELP,
  resolveSamlIdpKey,
  type SamlIdpKey,
  type SamlFieldKey,
} from "./idp-instructions/saml";

// NameID format options. `transient` is intentionally absent — the backend
// uses NameID as the stable user identity key (provider_id), and transient
// NameIDs are per-session, so picking transient would mint a fresh user on
// every login and break user history. If a customer truly needs transient,
// reach for a SAML attribute as the identity instead.
const NAME_ID_FORMATS = [
  {
    value: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    label: "Email Address (recommended)",
  },
  {
    value: "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified",
    label: "Unspecified",
  },
  {
    value: "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent",
    label: "Persistent",
  },
];

const PROVIDER_PRESET_KEYS = Object.keys(ATTRIBUTE_MAPPING_PRESETS);

// Provider picker options. Selecting one drives the slug default, the
// attribute preset, the SamlIdpReference tab, and the per-field helper copy.
const PROVIDER_OPTIONS: Array<{
  key: SamlIdpKey;
  label: string;
  defaultSlug: string;
  defaultDisplayName: string;
}> = [
  { key: "okta", label: "Okta", defaultSlug: "okta", defaultDisplayName: "Sign in with Okta" },
  { key: "auth0", label: "Auth0", defaultSlug: "auth0", defaultDisplayName: "Sign in with Auth0" },
  { key: "azure", label: "Microsoft Entra ID", defaultSlug: "azure-ad", defaultDisplayName: "Sign in with Microsoft" },
  { key: "generic", label: "Generic / Other", defaultSlug: "", defaultDisplayName: "" },
];

export function CreateSamlMethodPage() {
  const navigate = useNavigate();
  const session = SessionManager.getSession();
  const workspaceId = session?.workspace_id || "";

  const [providerKey, setProviderKey] = useState<SamlIdpKey>("okta");

  const [formData, setFormData] = useState({
    provider_name: "okta",
    display_name: "Sign in with Okta",
    entity_id: "",
    sso_url: "",
    slo_url: "",
    certificate: "",
    name_id_format: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    attribute_email: "email",
    attribute_first_name: "firstName",
    attribute_last_name: "lastName",
  });

  // SP metadata URLs are deterministic from the workspace ID — display them
  // immediately so the operator can paste them into their IdP admin console.
  const spMetadata = useMemo(
    () =>
      workspaceId
        ? {
            entity_id: samlEntityId(workspaceId),
            acs_url: samlAcsUrl(workspaceId),
            metadata_url: samlMetadataUrl(workspaceId),
          }
        : null,
    [workspaceId],
  );

  // Lazy-fetch the actual XML to verify the backend serves matching metadata.
  // (Optional — purely a sanity preview.)
  const [fetchMetadata] = useLazyGetSamlSPMetadataQuery();

  useEffect(() => {
    if (workspaceId) {
      fetchMetadata({ workspaceId }).unwrap().catch(() => {
        // Non-fatal: fall back to deterministic URLs displayed above.
      });
    }
  }, [workspaceId, fetchMetadata]);

  const [createIdp, { isLoading: isCreating }] =
    useCreateIdentityProviderMutation();

  const [idpMetadataXml, setIdpMetadataXml] = useState("");
  const [metadataParseHint, setMetadataParseHint] = useState<
    { tone: "ok" | "warn" | "err"; text: string } | null
  >(null);

  // Provider dropdown handler: sets slug default, display name default, and
  // applies the matching attribute preset. Never clobbers operator input on
  // the slug or display name once they've typed something custom.
  const handleProviderChange = useCallback(
    (key: SamlIdpKey) => {
      const option = PROVIDER_OPTIONS.find((p) => p.key === key);
      if (!option) return;
      setProviderKey(key);
      setFormData((prev) => {
        // Only auto-fill slug + display name if the user hasn't customised
        // them away from the previous provider's defaults.
        const prevOption = PROVIDER_OPTIONS.find((p) => p.key === providerKey);
        const slugIsDefault = !prev.provider_name || prev.provider_name === prevOption?.defaultSlug;
        const displayIsDefault =
          !prev.display_name || prev.display_name === prevOption?.defaultDisplayName;
        const preset =
          option.defaultSlug && PROVIDER_PRESET_KEYS.includes(option.defaultSlug)
            ? presetForSlug(option.defaultSlug)
            : null;
        return {
          ...prev,
          provider_name: slugIsDefault ? option.defaultSlug : prev.provider_name,
          display_name: displayIsDefault ? option.defaultDisplayName : prev.display_name,
          ...(preset
            ? {
                attribute_email: preset.email,
                attribute_first_name: preset.first_name,
                attribute_last_name: preset.last_name,
              }
            : {}),
        };
      });
    },
    [providerKey],
  );

  const handleApplyIdpMetadata = useCallback(() => {
    const xml = idpMetadataXml.trim();
    if (!xml) {
      setMetadataParseHint({ tone: "err", text: "Paste IdP metadata XML first." });
      return;
    }
    const parsed = parseIdpMetadataXml(xml);
    if (!parsed) {
      setMetadataParseHint({
        tone: "err",
        text: "Couldn't parse — make sure you pasted the IdP federation metadata (the XML containing <IDPSSODescriptor>).",
      });
      return;
    }
    const next = { ...formData };
    const filled: string[] = [];
    if (parsed.entity_id) {
      next.entity_id = parsed.entity_id;
      filled.push("Entity ID");
    }
    if (parsed.sso_url) {
      next.sso_url = parsed.sso_url;
      filled.push("SSO URL");
    }
    if (parsed.slo_url) {
      next.slo_url = parsed.slo_url;
      filled.push("SLO URL");
    }
    if (parsed.certificate) {
      next.certificate = parsed.certificate;
      filled.push("certificate");
    }
    if (
      parsed.name_id_format &&
      // Don't switch to transient even if the IdP declares it.
      !parsed.name_id_format.includes("transient")
    ) {
      next.name_id_format = parsed.name_id_format;
      filled.push("NameID format");
    }
    setFormData(next);
    if (filled.length === 0) {
      setMetadataParseHint({
        tone: "warn",
        text: "Parsed the XML but didn't find IdP entity/SSO/cert fields. Paste in manually below.",
      });
    } else {
      setMetadataParseHint({
        tone: "ok",
        text: `Filled ${filled.join(", ")} from the metadata XML.`,
      });
    }
  }, [idpMetadataXml, formData]);

  // If the operator types a slug that matches a known preset and the
  // attribute fields still look default, sync the preset. Keeps backward
  // compatibility with operators who skip the provider dropdown.
  useEffect(() => {
    const slug = formData.provider_name.toLowerCase().trim();
    if (!PROVIDER_PRESET_KEYS.includes(slug)) return;
    const stillDefaults =
      formData.attribute_email === "email" &&
      formData.attribute_first_name === "firstName" &&
      formData.attribute_last_name === "lastName";
    if (!stillDefaults) return;
    const preset = presetForSlug(slug);
    setFormData((prev) => ({
      ...prev,
      attribute_email: preset.email,
      attribute_first_name: preset.first_name,
      attribute_last_name: preset.last_name,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.provider_name]);

  // Keep providerKey in sync with provider_name if the user types a value that
  // resolves to a different category (e.g. types "okta-prod" → still okta tab).
  useEffect(() => {
    const resolved = resolveSamlIdpKey(formData.provider_name);
    if (resolved !== providerKey) setProviderKey(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.provider_name]);

  const canSave = Boolean(
    workspaceId &&
      formData.provider_name.trim() &&
      formData.display_name.trim() &&
      formData.entity_id.trim() &&
      formData.sso_url.trim() &&
      formData.certificate.trim(),
  );

  const handleFinish = async () => {
    if (!workspaceId) {
      toast.error("Missing workspace session — please sign in again.");
      return;
    }
    if (!canSave) {
      toast.error("Provider, display name, Entity ID, SSO URL, and certificate are required.");
      return;
    }
    try {
      // Trim every IdP-side string — a single trailing space pasted into the
      // textarea would otherwise silently break SAML login (entity ID mismatch
      // where the two strings look identical to a human).
      await createIdp({
        provider_type: "saml",
        display_name: formData.display_name.trim(),
        config: {
          provider_name: formData.provider_name.trim(),
          entity_id: formData.entity_id.trim(),
          sso_url: formData.sso_url.trim(),
          slo_url: formData.slo_url.trim() || undefined,
          certificate: formData.certificate.trim(),
          name_id_format: formData.name_id_format,
          attribute_mapping: {
            email: formData.attribute_email,
            first_name: formData.attribute_first_name,
            last_name: formData.attribute_last_name,
          },
        },
      }).unwrap();
      toast.success("SAML identity provider created!");
      navigate("/authentication", {
        state: { authProviderCreated: true },
      });
    } catch (error: any) {
      console.error("Failed to create SAML provider:", error);
      toast.error(
        error?.data?.error || "Failed to create SAML identity provider",
      );
    }
  };

  const fieldHelp = (field: SamlFieldKey): string | undefined =>
    SAML_IDP_FIELD_HELP[providerKey]?.[field];

  return (
    <div className="flex min-h-full w-full flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b py-4 px-8">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Create SAML provider</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pick your IdP, paste its metadata, save. AuthSec auto-fills what
              it can and tells you exactly where to find the rest.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/authentication")}
            aria-label="Close"
            className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body — single continuous form, page scrolls as one document */}
      <div className="flex-1 px-8 py-6">
        <div className="w-full space-y-8">
          {/* ── Provider picker ─────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionHeader
              title="Provider"
              subtitle="Drives the attribute preset, the per-field hints, and the setup tab below."
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PROVIDER_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => handleProviderChange(option.key)}
                  className={cn(
                    "flex h-10 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors",
                    providerKey === option.key
                      ? "border-transparent bg-(--color-primary-soft) text-(--color-primary-text)"
                      : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text) hover:bg-(--color-surface-subtle)",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Display Name" htmlFor="display_name" required>
                <FormInput
                  id="display_name"
                  placeholder="Sign in with Okta"
                  value={formData.display_name}
                  onChange={(e) =>
                    setFormData({ ...formData, display_name: e.target.value })
                  }
                  className="h-9"
                />
              </FormField>
              <FormField label="Provider Slug" htmlFor="provider_name" required>
                <FormInput
                  id="provider_name"
                  placeholder="e.g. okta or azure-ad"
                  value={formData.provider_name}
                  onChange={(e) =>
                    setFormData({ ...formData, provider_name: e.target.value })
                  }
                  className="h-9 font-mono"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Used in the login URL:{" "}
                  <span className="font-mono">
                    /saml/initiate/{formData.provider_name || "{slug}"}
                  </span>
                </p>
              </FormField>
            </div>
          </section>

          {/* ── SP metadata + provider-specific paste targets ───────── */}
          <section className="space-y-3">
            <SectionHeader
              title="Paste these into your IdP"
              subtitle={`Tab below auto-selects ${SAML_IDP_INSTRUCTIONS[providerKey].label} based on the provider you picked. Switch tabs to see another vendor's paste targets.`}
            />
            <SamlIdpReference
              spMetadata={spMetadata ?? null}
              workspaceId={workspaceId}
              buildAuth0SettingsJson={buildAuth0SettingsJson}
              activeTab={providerKey}
              onActiveTabChange={setProviderKey}
            />
          </section>

          {/* ── IdP metadata import (recommended autofill) ──────────── */}
          <section className="space-y-3">
            <SectionHeader
              title="Import IdP metadata XML (recommended)"
              subtitle={
                providerKey === "azure"
                  ? "Microsoft Entra: section 3 → 'App Federation Metadata Url' OR section 3 → Federation Metadata XML download. Paste the file contents below."
                  : providerKey === "okta"
                    ? "Okta: app → Sign On tab → 'Identity Provider metadata' link, copy the entire XML. Paste below."
                    : providerKey === "auth0"
                      ? "Auth0: Addons → SAML2 Web App → Usage tab → 'Identity Provider Metadata' link, copy the XML. Paste below."
                      : "Most IdPs publish a 'Federation Metadata' or 'SAML 2.0 Metadata' XML. Paste below to autofill the manual fields."
              }
            />
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30 p-4 space-y-3">
              <textarea
                value={idpMetadataXml}
                onChange={(e) => {
                  setIdpMetadataXml(e.target.value);
                  setMetadataParseHint(null);
                }}
                placeholder='<EntityDescriptor entityID="https://sts.windows.net/.../" ...>'
                rows={4}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono resize-vertical"
              />
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] flex-1 min-w-0">
                  {metadataParseHint && (
                    <span
                      className={cn(
                        metadataParseHint.tone === "ok" && "text-green-700 dark:text-green-400",
                        metadataParseHint.tone === "warn" && "text-amber-700 dark:text-amber-400",
                        metadataParseHint.tone === "err" && "text-red-700 dark:text-red-400",
                      )}
                    >
                      {metadataParseHint.text}
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="text-white shrink-0"
                  disabled={!idpMetadataXml.trim()}
                  onClick={handleApplyIdpMetadata}
                >
                  Apply metadata
                </Button>
              </div>
            </div>
          </section>

          {/* ── Manual IdP fields with per-provider helper text ─────── */}
          <section className="space-y-3">
            <SectionHeader
              title="Identity Provider details"
              subtitle="Filled by metadata import above, or paste manually. Hints under each field tell you what your IdP calls each value."
            />
            <div className="space-y-3">
              <FormField
                label="IdP Entity ID (Issuer)"
                htmlFor="entity_id"
                required
              >
                <FormInput
                  id="entity_id"
                  placeholder="https://your-idp.com/entity-id"
                  value={formData.entity_id}
                  onChange={(e) =>
                    setFormData({ ...formData, entity_id: e.target.value })
                  }
                  className="h-9 font-mono"
                />
                {fieldHelp("entity_id") && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {fieldHelp("entity_id")}
                  </p>
                )}
              </FormField>

              <FormField
                label="IdP SSO URL (SingleSignOnService)"
                htmlFor="sso_url"
                required
              >
                <FormInput
                  id="sso_url"
                  placeholder="https://your-idp.com/sso/saml"
                  value={formData.sso_url}
                  onChange={(e) =>
                    setFormData({ ...formData, sso_url: e.target.value })
                  }
                  className="h-9 font-mono"
                />
                {fieldHelp("sso_url") && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {fieldHelp("sso_url")}
                  </p>
                )}
              </FormField>

              <FormField
                label="IdP SLO URL (SingleLogoutService, optional)"
                htmlFor="slo_url"
              >
                <FormInput
                  id="slo_url"
                  placeholder="https://your-idp.com/slo/saml"
                  value={formData.slo_url}
                  onChange={(e) =>
                    setFormData({ ...formData, slo_url: e.target.value })
                  }
                  className="h-9 font-mono"
                />
                {fieldHelp("slo_url") && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {fieldHelp("slo_url")}
                  </p>
                )}
              </FormField>

              <FormField
                label="X.509 Signing Certificate"
                htmlFor="certificate"
                required
              >
                <div className="flex items-center gap-2 mt-1">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 text-[11px] font-medium hover:bg-accent">
                    <Upload className="h-3 w-3" />
                    Upload .pem / .crt
                    <input
                      type="file"
                      accept=".pem,.crt,.cer"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setFormData({
                            ...formData,
                            certificate: (ev.target?.result as string) ?? "",
                          });
                        };
                        reader.readAsText(file);
                      }}
                    />
                  </label>
                  <span className="text-[10px] text-muted-foreground">or paste below</span>
                </div>
                <textarea
                  id="certificate"
                  placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDtDCCApygAwIBAgIG...&#10;-----END CERTIFICATE-----"
                  value={formData.certificate}
                  onChange={(e) =>
                    setFormData({ ...formData, certificate: e.target.value })
                  }
                  rows={6}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono resize-vertical"
                />
                {fieldHelp("certificate") && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {fieldHelp("certificate")}
                  </p>
                )}
              </FormField>

              <FormField label="Name ID Format" htmlFor="name_id_format">
                <select
                  id="name_id_format"
                  value={formData.name_id_format}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      name_id_format: e.target.value,
                    })
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {NAME_ID_FORMATS.map((format) => (
                    <option key={format.value} value={format.value}>
                      {format.label}
                    </option>
                  ))}
                </select>
                {fieldHelp("name_id_format") && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {fieldHelp("name_id_format")}
                  </p>
                )}
              </FormField>
            </div>
          </section>

          {/* ── Attribute mapping (last — usually defaults from preset) */}
          <section className="space-y-3">
            <SectionHeader
              title="Attribute mapping"
              subtitle="Pre-filled from the provider preset. Override only if your IdP emits different attribute names."
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="Email" htmlFor="attribute_email">
                <FormInput
                  id="attribute_email"
                  placeholder="email"
                  value={formData.attribute_email}
                  onChange={(e) =>
                    setFormData({ ...formData, attribute_email: e.target.value })
                  }
                  className="h-9 font-mono"
                />
              </FormField>
              <FormField label="First name" htmlFor="attribute_first_name">
                <FormInput
                  id="attribute_first_name"
                  placeholder="firstName"
                  value={formData.attribute_first_name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      attribute_first_name: e.target.value,
                    })
                  }
                  className="h-9 font-mono"
                />
              </FormField>
              <FormField label="Last name" htmlFor="attribute_last_name">
                <FormInput
                  id="attribute_last_name"
                  placeholder="lastName"
                  value={formData.attribute_last_name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      attribute_last_name: e.target.value,
                    })
                  }
                  className="h-9 font-mono"
                />
              </FormField>
            </div>
          </section>
        </div>
      </div>

      {/* Footer — single Save action, stays pinned while the form scrolls */}
      <div className="sticky bottom-0 z-10 flex-shrink-0 border-t bg-background py-4 px-8">
        <div className="flex w-full items-center justify-between gap-4">
          <Button variant="outline" onClick={() => navigate("/authentication")}>
            Cancel
          </Button>
          <Button
            onClick={handleFinish}
            disabled={!canSave || isCreating}
            className="text-white"
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Create provider
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Small section heading helper ──────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}

// ─── Shared IdP reference panel (also used by EditSamlMethodPage) ─────────────

export function SamlIdpReference({
  spMetadata,
  workspaceId,
  buildAuth0SettingsJson: buildJson,
  activeTab: controlledActiveTab,
  onActiveTabChange,
}: {
  spMetadata: { acs_url?: string; entity_id?: string } | null;
  workspaceId: string | null;
  buildAuth0SettingsJson: (wsId: string) => string;
  /** Controlled tab. When set, the picker reflects this; switching tabs calls
   *  onActiveTabChange. Leave unset for an uncontrolled panel. */
  activeTab?: SamlIdpKey;
  onActiveTabChange?: (key: SamlIdpKey) => void;
}) {
  const acsUrl = spMetadata?.acs_url ?? "";
  const entityId = spMetadata?.entity_id ?? "";
  const placeholder = "— load SP metadata first —";

  const FIELDS: Record<SamlIdpKey, Array<{ label: string; idpName: string; value: string }>> = {
    auth0: [
      { label: "Application Callback URL", idpName: "Addons → SAML2 Web App → Application Callback URL", value: acsUrl || placeholder },
      { label: "Audience", idpName: "Addons → SAML2 Web App → Settings → audience", value: entityId || placeholder },
    ],
    okta: [
      { label: "Single sign-on URL", idpName: "Configure SAML → Single sign-on URL", value: acsUrl || placeholder },
      { label: "Audience URI (SP Entity ID)", idpName: "Configure SAML → Audience URI (SP Entity ID)", value: entityId || placeholder },
      { label: "Name ID format", idpName: "Configure SAML → Name ID format", value: "EmailAddress" },
    ],
    azure: [
      { label: "Identifier (Entity ID)", idpName: "Basic SAML Configuration → Identifier", value: entityId || placeholder },
      { label: "Reply URL (ACS URL)", idpName: "Basic SAML Configuration → Reply URL", value: acsUrl || placeholder },
      { label: "Sign on URL", idpName: "Basic SAML Configuration → Sign on URL", value: acsUrl || placeholder },
    ],
    generic: [
      { label: "ACS URL / Reply URL", idpName: "ACS URL / Recipient URL / Reply URL / Callback URL", value: acsUrl || placeholder },
      { label: "SP Entity ID / Audience URI", idpName: "Audience URI / SP Entity ID / SP Issuer", value: entityId || placeholder },
      { label: "NameID format", idpName: "Name ID format", value: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" },
    ],
  };

  const [internalTab, setInternalTab] = React.useState<SamlIdpKey>("okta");
  const activeTab = controlledActiveTab ?? internalTab;
  const setTab = onActiveTabChange ?? setInternalTab;
  const instruction = SAML_IDP_INSTRUCTIONS[activeTab];
  const fields = FIELDS[activeTab];

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        IdP setup reference
      </p>

      {/* Tab strip */}
      <div className="flex gap-1 flex-wrap">
        {(["auth0", "okta", "azure", "generic"] as SamlIdpKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-semibold transition-colors",
              activeTab === key
                ? "border-transparent bg-(--color-primary-soft) text-(--color-primary-text)"
                : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)",
            )}
          >
            {SAML_IDP_INSTRUCTIONS[key].label}
          </button>
        ))}
      </div>

      {/* Nav path */}
      <p className="text-[11px] font-medium text-muted-foreground">
        <span className="font-semibold text-foreground">Navigate to: </span>
        {instruction.navPath}
      </p>

      {/* Field reference */}
      <div className="space-y-1">
        {fields.map((f) => (
          <div
            key={f.label}
            className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5"
          >
            <span className="text-[11px] text-muted-foreground min-w-[180px] shrink-0 truncate" title={f.idpName}>
              {f.label}
            </span>
            <span className="text-[11px] font-mono flex-1 truncate text-foreground">
              {f.value}
            </span>
            <button
              type="button"
              aria-label={`Copy ${f.label}`}
              onClick={() => {
                if (f.value && f.value !== placeholder) {
                  navigator.clipboard.writeText(f.value);
                  toast.success(`${f.label} copied`);
                }
              }}
              disabled={!f.value || f.value === placeholder}
              className="shrink-0 rounded p-0.5 hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
            >
              <Copy className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        ))}
      </div>

      {/* Steps */}
      <details className="group">
        <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1">
          <Info className="h-3 w-3" />
          Step-by-step guide
        </summary>
        <ol className="mt-2 space-y-1 pl-4 list-decimal">
          {instruction.steps.map((step, i) => (
            <li key={i} className="text-[11px] text-muted-foreground leading-relaxed">
              {step}
            </li>
          ))}
        </ol>
        <div className="mt-2 text-[11px] text-muted-foreground">
          <span className="font-semibold">Certificate: </span>
          {instruction.certLocation}
        </div>
      </details>

      {/* Gotchas */}
      {instruction.gotchas.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[11px] font-semibold text-[var(--color-warning)] hover:opacity-80 transition-opacity list-none flex items-center gap-1">
            <Info className="h-3 w-3" />
            Common gotchas
          </summary>
          <ul className="mt-2 space-y-1 pl-4 list-disc">
            {instruction.gotchas.map((g, i) => (
              <li key={i} className="text-[11px] text-muted-foreground leading-relaxed">
                {g}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Auth0 Settings JSON */}
      {activeTab === "auth0" && workspaceId && (
        <div className="space-y-2">
          <FormField label="Auth0 SAML2 Addon — Settings JSON (paste into Addons → SAML2 Web App → Settings)">
            <div className="space-y-2">
              <pre className="max-h-44 overflow-auto rounded-md border bg-background p-2 font-mono text-[11px] leading-tight">
                {buildJson(workspaceId)}
              </pre>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(buildJson(workspaceId));
                  toast.success("Auth0 Settings JSON copied!");
                }}
                className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] font-medium hover:bg-accent"
              >
                <Copy className="h-3 w-3" />
                Copy Auth0 Settings JSON
              </button>
            </div>
          </FormField>
        </div>
      )}
    </div>
  );
}
