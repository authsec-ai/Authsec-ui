// CreateSamlMethodPage — workspace-scoped SAML IDP creation (v4)
//
// No client selector: SAML IDPs are owned by the workspace and apply to all
// applications by default. Application-level whitelisting is opt-in via the
// Application policy UI (separate page).

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import {
  ArrowLeft,
  CheckCircle,
  Loader2,
  Check,
  ChevronRight,
  Settings,
  X,
  Info,
} from "lucide-react";
import { toast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { FormField, FormInput, FormCopyField } from "../../theme";
import {
  useLazyGetSamlSPMetadataQuery,
  samlEntityId,
  samlAcsUrl,
  samlMetadataUrl,
  parseIdpMetadataXml,
  presetForSlug,
  ATTRIBUTE_MAPPING_PRESETS,
} from "../../app/api/samlApi";
import { useCreateIdentityProviderMutation } from "../../app/api/authMethodApi";
import { SessionManager } from "../../utils/sessionManager";

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

// Wizard steps
const WIZARD_STEPS = [
  { id: "configuration", label: "Configuration", icon: Settings },
  { id: "identity-provider", label: "Identity Provider", icon: Settings },
  { id: "review", label: "Review", icon: CheckCircle },
];

export function CreateSamlMethodPage() {
  const navigate = useNavigate();
  const session = SessionManager.getSession();
  const workspaceId = session?.workspace_id || "";

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState({
    provider_name: "",
    display_name: "",
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
  const [fetchMetadata, { isLoading: loadingMetadata }] =
    useLazyGetSamlSPMetadataQuery();

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

  // Auto-apply attribute mapping preset when the provider_name slug matches a
  // known IdP (okta, azure-ad, adfs, onelogin, …). Only fires while the
  // attribute fields are still at their initial Okta defaults — never
  // clobbers explicit operator input.
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

  const currentStep = WIZARD_STEPS[currentStepIndex];

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) setCurrentStepIndex(currentStepIndex - 1);
    else navigate("/authentication");
  }, [currentStepIndex, navigate]);

  const handleNext = useCallback(() => {
    if (currentStepIndex === 0) {
      if (!formData.provider_name || !formData.display_name) {
        toast.error("Provider name and display name are required");
        return;
      }
    }
    if (currentStepIndex === 1) {
      if (!formData.entity_id || !formData.sso_url || !formData.certificate) {
        toast.error("Entity ID, SSO URL, and certificate are required");
        return;
      }
    }
    if (currentStepIndex < WIZARD_STEPS.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  }, [currentStepIndex, formData]);

  const canProceed = () => {
    if (currentStepIndex === 0)
      return Boolean(formData.provider_name && formData.display_name);
    if (currentStepIndex === 1)
      return Boolean(
        formData.entity_id && formData.sso_url && formData.certificate,
      );
    return Boolean(workspaceId && formData.provider_name && formData.entity_id);
  };

  const handleFinish = async () => {
    if (!workspaceId) {
      toast.error("Missing workspace session — please sign in again.");
      return;
    }
    try {
      await createIdp({
        provider_type: "saml",
        display_name: formData.display_name,
        config: {
          provider_name: formData.provider_name,
          entity_id: formData.entity_id,
          sso_url: formData.sso_url,
          slo_url: formData.slo_url || undefined,
          certificate: formData.certificate,
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

  const getStepSubtitle = () => {
    switch (currentStep.id) {
      case "configuration":
        return "Configure your SAML provider settings";
      case "identity-provider":
        return "IdP metadata — pasted from your SAML Identity Provider";
      case "review":
        return "Review and finalize your SAML configuration";
      default:
        return "";
    }
  };
  const getStepTitle = () => {
    switch (currentStep.id) {
      case "configuration":
        return "Configure";
      case "identity-provider":
        return "Identity Provider";
      case "review":
        return "Review";
      default:
        return "";
    }
  };

  return (
    <div className="flex flex-col h-[90vh] w-full">
      {/* Header */}
      <div className="flex-shrink-0 border-b py-4 px-8">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{getStepTitle()}</h2>
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
          {/* Step 0 */}
          {currentStepIndex === 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: provider naming + SP metadata for the operator */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-semibold mb-3">
                    Provider Information
                  </h3>
                  <div className="space-y-3">
                    <FormField
                      label="Provider Slug"
                      htmlFor="provider_name"
                      required
                    >
                      <FormInput
                        id="provider_name"
                        placeholder="e.g. okta or azure-ad"
                        value={formData.provider_name}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            provider_name: e.target.value,
                          })
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
                    <FormField
                      label="Display Name"
                      htmlFor="display_name"
                      required
                    >
                      <FormInput
                        id="display_name"
                        placeholder="Sign in with Okta"
                        value={formData.display_name}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            display_name: e.target.value,
                          })
                        }
                        className="h-9"
                      />
                    </FormField>
                  </div>
                </div>

                {/* SP metadata — what to paste into the IdP admin console */}
                {spMetadata && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30 p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <div>
                        <h4 className="text-sm font-semibold">
                          Service Provider Metadata
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Paste these values into your SAML Identity Provider
                          (Okta, Azure AD, OneLogin, etc.).
                        </p>
                      </div>
                    </div>

                    <FormField label="SP Entity ID (Audience URI)">
                      <FormCopyField
                        value={spMetadata.entity_id}
                        onCopy={() => toast.success("Entity ID copied!")}
                        className="font-mono text-sm"
                      />
                    </FormField>

                    <FormField label="ACS URL (Assertion Consumer Service)">
                      <FormCopyField
                        value={spMetadata.acs_url}
                        onCopy={() => toast.success("ACS URL copied!")}
                        className="font-mono text-sm"
                      />
                    </FormField>

                    <FormField label="SP Metadata XML URL (optional import)">
                      <FormCopyField
                        value={spMetadata.metadata_url}
                        onCopy={() =>
                          toast.success("Metadata URL copied!")
                        }
                        className="font-mono text-sm"
                      />
                    </FormField>

                    {loadingMetadata && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Verifying SP metadata endpoint…
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right: attribute mapping */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-semibold mb-3">
                    Attribute Mapping
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Names of the SAML attributes your IdP will send in the
                    assertion.
                  </p>
                  <div className="space-y-3">
                    <FormField
                      label="Email Attribute"
                      htmlFor="attribute_email"
                    >
                      <FormInput
                        id="attribute_email"
                        placeholder="email"
                        value={formData.attribute_email}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            attribute_email: e.target.value,
                          })
                        }
                        className="h-9 font-mono"
                      />
                    </FormField>
                    <FormField
                      label="First Name Attribute"
                      htmlFor="attribute_first_name"
                    >
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
                    <FormField
                      label="Last Name Attribute"
                      htmlFor="attribute_last_name"
                    >
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
                </div>
              </div>
            </div>
          )}

          {/* Step 1 — IdP metadata */}
          {currentStepIndex === 1 && (
            <div>
              <h3 className="text-base font-semibold mb-3">
                Identity Provider Configuration
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Copy these values from your SAML IdP admin console (Okta SSO
                URL + cert, Azure AD federation metadata, etc.). The fastest
                path is to paste the IdP's metadata XML below — we'll extract
                everything automatically.
              </p>

              {/* Paste-IdP-metadata shortcut. Most IdPs publish a federation
                  metadata XML the operator can copy in one click — parsing it
                  fills Entity ID, SSO URL, SLO URL, certificate, and NameID
                  format in one shot. Eliminates the typo class of SAML bugs. */}
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold">
                      Paste IdP metadata XML (recommended)
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Download "Federation Metadata XML" from your IdP (Azure
                      AD: <em>App Registrations → Endpoints</em>; Okta:{" "}
                      <em>Sign On → Identity Provider metadata</em>) and paste
                      below to auto-fill the fields.
                    </p>
                  </div>
                </div>
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
                </FormField>

                <FormField
                  label="X.509 Signing Certificate"
                  htmlFor="certificate"
                  required
                >
                  <textarea
                    id="certificate"
                    placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDtDCCApygAwIBAgIG...&#10;-----END CERTIFICATE-----"
                    value={formData.certificate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        certificate: e.target.value,
                      })
                    }
                    rows={6}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono resize-vertical"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Paste the PEM-encoded certificate including the BEGIN/END
                    markers.
                  </p>
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
                </FormField>
              </div>
            </div>
          )}

          {/* Step 2 — review */}
          {currentStepIndex === 2 && (
            <div className="space-y-3">
              <h3 className="text-base font-semibold mb-3">Review & Create</h3>
              <div className="rounded-lg border bg-muted/50 p-3 space-y-2.5">
                <div>
                  <h4 className="font-medium text-xs mb-0.5">Workspace</h4>
                  <p className="text-xs text-muted-foreground font-mono">
                    {workspaceId || "—"}
                  </p>
                </div>

                <div className="border-t pt-2.5">
                  <h4 className="font-medium text-xs mb-1">
                    Provider Information
                  </h4>
                  <div className="space-y-0.5 text-[11px] text-muted-foreground">
                    <div className="flex justify-between gap-4">
                      <span>Slug:</span>
                      <span className="font-mono">
                        {formData.provider_name || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Display Name:</span>
                      <span>{formData.display_name || "—"}</span>
                    </div>
                  </div>
                </div>

                {spMetadata && (
                  <div className="border-t pt-2.5">
                    <h4 className="font-medium text-xs mb-1">
                      Service Provider (paste into your IdP)
                    </h4>
                    <div className="space-y-0.5 text-[11px] text-muted-foreground">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">Entity ID:</span>
                        <span className="font-mono break-all">
                          {spMetadata.entity_id}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">ACS URL:</span>
                        <span className="font-mono break-all">
                          {spMetadata.acs_url}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="border-t pt-2.5">
                  <h4 className="font-medium text-xs mb-1">Identity Provider</h4>
                  <div className="space-y-0.5 text-[11px] text-muted-foreground">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">Entity ID (Issuer):</span>
                      <span className="font-mono break-all">
                        {formData.entity_id || "—"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">SSO URL:</span>
                      <span className="font-mono break-all">
                        {formData.sso_url || "—"}
                      </span>
                    </div>
                    {formData.slo_url && (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">SLO URL:</span>
                        <span className="font-mono break-all">
                          {formData.slo_url}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">Name ID Format:</span>
                      <span className="text-xs">
                        {NAME_ID_FORMATS.find(
                          (f) => f.value === formData.name_id_format,
                        )?.label || formData.name_id_format}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-2.5">
                  <h4 className="font-medium text-xs mb-1">Attribute Mapping</h4>
                  <div className="space-y-0.5 text-[11px] text-muted-foreground">
                    <div className="flex justify-between gap-4">
                      <span>Email:</span>
                      <span className="font-mono">
                        {formData.attribute_email || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>First Name:</span>
                      <span className="font-mono">
                        {formData.attribute_first_name || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Last Name:</span>
                      <span className="font-mono">
                        {formData.attribute_last_name || "—"}
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
