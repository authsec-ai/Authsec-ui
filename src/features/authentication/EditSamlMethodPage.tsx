import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  ArrowLeft,
  CheckCircle,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import {
  FormRoot,
  FormBody,
  FormSection,
  FormSectionHeader,
  FormField,
  FormGrid,
  FormDivider,
  FormInput,
  FormCopyField,
} from "../../theme";
import {
  useGetSamlProviderQuery,
  useUpdateSamlProviderMutation,
  parseIdpMetadataXml,
  presetForSlug,
  ATTRIBUTE_MAPPING_PRESETS,
  samlEntityId,
  samlAcsUrl,
} from "../../app/api/samlApi";
import { SessionManager } from "../../utils/sessionManager";
import { SamlIdpReference } from "./CreateSamlMethodPage";
import { buildAuth0SettingsJson } from "../../app/api/samlApi";

// `transient` is intentionally absent — see CreateSamlMethodPage rationale.
const NAME_ID_FORMATS = [
  { value: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress", label: "Email Address (recommended)" },
  { value: "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified", label: "Unspecified" },
  { value: "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent", label: "Persistent" },
];

const PROVIDER_PRESET_KEYS = Object.keys(ATTRIBUTE_MAPPING_PRESETS);

export function EditSamlMethodPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const session = SessionManager.getSession();
  const workspaceId = session?.workspace_id || "";

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
    is_active: true,
  });
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [idpMetadataXml, setIdpMetadataXml] = useState("");
  const [metadataParseHint, setMetadataParseHint] = useState<
    { tone: "ok" | "warn" | "err"; text: string } | null
  >(null);

  // SP metadata URLs are deterministic from the workspace ID — display them
  // immediately so the operator can paste them into their IdP admin console.
  const spMetadata = useMemo(
    () =>
      workspaceId
        ? {
            entity_id: samlEntityId(workspaceId),
            acs_url: samlAcsUrl(workspaceId),
          }
        : null,
    [workspaceId],
  );

  // Fetch existing SAML provider data
  const { data: providerData, isLoading: isLoadingProvider } = useGetSamlProviderQuery(
    { workspace_id: workspaceId, provider_id: id || "" },
    { skip: !workspaceId || !id }
  );

  const [updateSamlProvider, { isLoading: isUpdating }] = useUpdateSamlProviderMutation();

  // Pre-populate form with existing provider data
  useEffect(() => {
    if (providerData?.provider) {
      const provider = providerData.provider;
      // Filter out NameID `transient` — the backend disallows it, but legacy
      // rows may still hold it. Fall back to the safer default.
      const safeNameID = (provider.name_id_format || "").includes("transient")
        ? "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        : provider.name_id_format || "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress";
      setFormData({
        provider_name: provider.provider_name || "",
        display_name: provider.display_name || "",
        entity_id: provider.entity_id || "",
        sso_url: provider.sso_url || "",
        slo_url: provider.slo_url || "",
        certificate: provider.certificate || "",
        name_id_format: safeNameID,
        attribute_email: provider.attribute_mapping?.email || "email",
        attribute_first_name: provider.attribute_mapping?.first_name || "firstName",
        attribute_last_name: provider.attribute_mapping?.last_name || "lastName",
        is_active: provider.is_active ?? true,
      });
    }
  }, [providerData]);

  // Apply attribute mapping preset when slug matches and operator hasn't
  // overridden the defaults yet. Same guard as Create page.
  useEffect(() => {
    const slug = formData.provider_name.toLowerCase().trim();
    if (!PROVIDER_PRESET_KEYS.includes(slug)) return;
    const loadedRow = providerData?.provider;
    if (!loadedRow) return;
    const stillStoredDefaults =
      formData.attribute_email === loadedRow.attribute_mapping?.email &&
      formData.attribute_first_name === loadedRow.attribute_mapping?.first_name &&
      formData.attribute_last_name === loadedRow.attribute_mapping?.last_name;
    if (!stillStoredDefaults) return;
    // Already loaded from DB; do not auto-replace on Edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.provider_name, providerData?.provider]);

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
        text: "Couldn't parse — make sure you pasted IdP federation metadata (containing <IDPSSODescriptor>).",
      });
      return;
    }
    const filled: string[] = [];
    setFormData((prev) => {
      const next = { ...prev };
      if (parsed.entity_id) { next.entity_id = parsed.entity_id; filled.push("Entity ID"); }
      if (parsed.sso_url) { next.sso_url = parsed.sso_url; filled.push("SSO URL"); }
      if (parsed.slo_url) { next.slo_url = parsed.slo_url; filled.push("SLO URL"); }
      if (parsed.certificate) { next.certificate = parsed.certificate; filled.push("certificate"); }
      if (parsed.name_id_format && !parsed.name_id_format.includes("transient")) {
        next.name_id_format = parsed.name_id_format;
        filled.push("NameID format");
      }
      return next;
    });
    if (filled.length === 0) {
      setMetadataParseHint({
        tone: "warn",
        text: "Parsed the XML but didn't find IdP entity/SSO/cert fields.",
      });
    } else {
      setMetadataParseHint({
        tone: "ok",
        text: `Filled ${filled.join(", ")} from the metadata XML.`,
      });
    }
  }, [idpMetadataXml]);

  const applyPreset = useCallback(() => {
    const slug = formData.provider_name.toLowerCase().trim();
    if (!PROVIDER_PRESET_KEYS.includes(slug)) {
      toast.error(`No preset for "${formData.provider_name}". Known: ${PROVIDER_PRESET_KEYS.join(", ")}`);
      return;
    }
    const preset = presetForSlug(slug);
    setFormData((prev) => ({
      ...prev,
      attribute_email: preset.email,
      attribute_first_name: preset.first_name,
      attribute_last_name: preset.last_name,
    }));
    toast.success(`Applied ${slug} attribute mapping.`);
  }, [formData.provider_name]);

  const canComplete = useMemo(
    () =>
      Boolean(
        formData.provider_name &&
          formData.display_name &&
          formData.entity_id &&
          formData.sso_url &&
          formData.certificate
      ),
    [formData]
  );

  const handleComplete = () => {
    if (canComplete) setShowConfirmDialog(true);
    else toast.error("Please fill all required fields");
  };

  const handleConfirmUpdate = async () => {
    if (!canComplete || !id) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      // Trim every IdP-side string — a single trailing space silently breaks
      // SAML entity-ID comparison at validation time.
      await updateSamlProvider({
        workspace_id: workspaceId,
        provider_id: id,
        provider_name: formData.provider_name.trim(),
        display_name: formData.display_name.trim(),
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
        is_active: formData.is_active,
      }).unwrap();
      toast.success("SAML provider updated successfully!");
      setShowConfirmDialog(false);
      navigate("/authentication");
    } catch (error: any) {
      console.error("Failed to update SAML provider:", error);
      toast.error(error?.data?.error || error?.data?.message || "Failed to update SAML provider");
    }
  };

  if (isLoadingProvider) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/50 dark:from-neutral-950 dark:via-neutral-900 dark:to-stone-950">
        <div className="container mx-auto max-w-8xl space-y-8 px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-foreground">Loading provider data...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!providerData?.provider) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/50 dark:from-neutral-950 dark:via-neutral-900 dark:to-stone-950">
        <div className="container mx-auto max-w-8xl space-y-8 px-8 py-8">
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <p className="text-foreground">Provider not found</p>
            <Button onClick={() => navigate("/authentication")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Authentication
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/50 dark:from-neutral-950 dark:via-neutral-900 dark:to-stone-950">
      <div className="container mx-auto max-w-8xl space-y-8 px-8 py-8">
        <header className="bg-card border border-border rounded-sm p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/authentication")}
                className="h-8 px-2"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-semibold">
                  Edit SAML Authentication Method
                </h1>
                <p className="text-sm text-foreground mt-1">
                  Update SAML 2.0 provider configuration and user attribute mapping.
                </p>
              </div>
            </div>
            <Button
              onClick={handleComplete}
              disabled={!canComplete || isUpdating}
              className="min-w-[140px]"
            >
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Review & Update
                </>
              )}
            </Button>
          </div>
        </header>

        <FormRoot className="px-0" maxWidth="96rem">
          <FormBody>
            {/* IdP setup reference (step-by-step cheatsheet per provider, includes SP metadata copy fields) */}
            <SamlIdpReference
              spMetadata={spMetadata ?? null}
              workspaceId={workspaceId}
              buildAuth0SettingsJson={buildAuth0SettingsJson}
            />

            {/* Paste-IdP-metadata shortcut */}
            <FormSection>
              <FormSectionHeader
                title="Replace from IdP metadata XML (optional)"
                description="Paste the IdP's federation metadata XML to re-fill Entity ID, SSO URL, SLO URL, certificate, and NameID format in one shot."
              />
              <div className="space-y-3">
                <textarea
                  value={idpMetadataXml}
                  onChange={(e) => {
                    setIdpMetadataXml(e.target.value);
                    setMetadataParseHint(null);
                  }}
                  placeholder='<EntityDescriptor entityID="..." ...>'
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
            </FormSection>

            <FormDivider />

            {/* Basic Configuration */}
            <FormSection>
              <FormSectionHeader
                title="Provider Configuration"
                description="Basic settings for the SAML provider."
              />
              <FormGrid columns={2}>
                <FormField label="Provider Name" htmlFor="provider_name" required>
                  <div className="flex gap-2">
                    <FormInput
                      id="provider_name"
                      value={formData.provider_name}
                      onChange={(e) => setFormData({ ...formData, provider_name: e.target.value })}
                      placeholder="e.g., okta, azure-ad, adfs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      title={`Apply attribute mapping preset for the current slug. Known: ${PROVIDER_PRESET_KEYS.join(", ")}`}
                      onClick={applyPreset}
                    >
                      Apply preset
                    </Button>
                  </div>
                </FormField>

                <FormField label="Display Name" htmlFor="display_name" required>
                  <FormInput
                    id="display_name"
                    value={formData.display_name}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    placeholder="e.g., Okta SSO, Azure AD"
                  />
                </FormField>
              </FormGrid>
            </FormSection>

            <FormDivider />

            {/* Identity Provider Configuration */}
            <FormSection>
              <FormSectionHeader
                title="Identity Provider Settings"
                description="Configuration provided by your IdP."
              />
              <FormGrid columns={1}>
                <FormField label="Entity ID (Issuer ID)" htmlFor="entity_id" required>
                  <FormInput
                    id="entity_id"
                    value={formData.entity_id}
                    onChange={(e) => setFormData({ ...formData, entity_id: e.target.value })}
                    placeholder="https://your-idp.com/entity-id"
                  />
                </FormField>

                <FormField label="SSO URL" htmlFor="sso_url" required>
                  <FormInput
                    id="sso_url"
                    value={formData.sso_url}
                    onChange={(e) => setFormData({ ...formData, sso_url: e.target.value })}
                    placeholder="https://idp.example.com/sso/saml"
                  />
                </FormField>

                <FormField label="SLO URL (optional)" htmlFor="slo_url">
                  <FormInput
                    id="slo_url"
                    value={formData.slo_url}
                    onChange={(e) => setFormData({ ...formData, slo_url: e.target.value })}
                    placeholder="https://idp.example.com/slo/saml"
                  />
                </FormField>

                <FormField label="X.509 Certificate" htmlFor="certificate" required>
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
                            setFormData({ ...formData, certificate: (ev.target?.result as string) ?? "" });
                          };
                          reader.readAsText(file);
                        }}
                      />
                    </label>
                    <span className="text-[10px] text-muted-foreground">or paste below</span>
                  </div>
                  <textarea
                    id="certificate"
                    value={formData.certificate}
                    onChange={(e) => setFormData({ ...formData, certificate: e.target.value })}
                    placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                  />
                </FormField>

                <FormField label="Name ID Format" htmlFor="name_id_format" required>
                  <select
                    id="name_id_format"
                    value={formData.name_id_format}
                    onChange={(e) => setFormData({ ...formData, name_id_format: e.target.value })}
                    className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {NAME_ID_FORMATS.map((format) => (
                      <option key={format.value} value={format.value}>
                        {format.label}
                      </option>
                    ))}
                  </select>
                </FormField>
              </FormGrid>
            </FormSection>

            <FormDivider />

            {/* Attribute Mapping */}
            <FormSection>
              <FormSectionHeader
                title="Attribute Mapping"
                description="Map SAML attributes to user properties."
              />
              <FormGrid columns={2}>
                <FormField label="Email Attribute" htmlFor="attribute_email" required>
                  <FormInput
                    id="attribute_email"
                    value={formData.attribute_email}
                    onChange={(e) => setFormData({ ...formData, attribute_email: e.target.value })}
                    placeholder="email"
                  />
                </FormField>

                <FormField label="First Name Attribute" htmlFor="attribute_first_name" required>
                  <FormInput
                    id="attribute_first_name"
                    value={formData.attribute_first_name}
                    onChange={(e) => setFormData({ ...formData, attribute_first_name: e.target.value })}
                    placeholder="firstName"
                  />
                </FormField>

                <FormField label="Last Name Attribute" htmlFor="attribute_last_name" required>
                  <FormInput
                    id="attribute_last_name"
                    value={formData.attribute_last_name}
                    onChange={(e) => setFormData({ ...formData, attribute_last_name: e.target.value })}
                    placeholder="lastName"
                  />
                </FormField>
              </FormGrid>
            </FormSection>

            <FormDivider />

            {/* Status */}
            <FormSection>
              <FormSectionHeader
                title="Status"
                description="Whether end users see this provider on the login page."
              />
              <FormGrid columns={2}>
                <FormField label="Active" htmlFor="is_active">
                  <div className="flex items-center h-12">
                    <input
                      id="is_active"
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <label htmlFor="is_active" className="ml-2 text-sm text-foreground">
                      Enable this SAML provider
                    </label>
                  </div>
                </FormField>
              </FormGrid>
            </FormSection>
          </FormBody>
        </FormRoot>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm SAML Provider Update</DialogTitle>
            <DialogDescription>
              Please review your SAML provider configuration before updating.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <div className="text-sm font-medium">Provider Name</div>
              <div className="text-sm text-foreground">{formData.provider_name}</div>
            </div>
            <div>
              <div className="text-sm font-medium">Display Name</div>
              <div className="text-sm text-foreground">{formData.display_name}</div>
            </div>
            <div>
              <div className="text-sm font-medium">Entity ID (Issuer ID)</div>
              <div className="text-sm text-foreground font-mono">{formData.entity_id}</div>
            </div>
            <div>
              <div className="text-sm font-medium">SSO URL</div>
              <div className="text-sm text-foreground">{formData.sso_url}</div>
            </div>
            <div>
              <div className="text-sm font-medium">Status</div>
              <div className="text-sm text-foreground">
                {formData.is_active ? "Active" : "Inactive"}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmUpdate} disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Confirm & Update"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
