/**
 * `CreateApplicationPage` — Add MCP (route /applications/new). One page:
 *
 *   ① Users      identity provider people sign in through
 *   ② Server     URL → "Check server" adds the MCP as a draft
 *                (POST /authsec/applications) and reads its tools
 *                (POST /authsec/applications/:id/rescan)
 *   ③ Tools      one suggested permission per tool (not written yet)
 *   ④ SDK        snippet + env with the introspection secret (shown once)
 *   ⑤ Test       POST /authsec/applications/:id/validate
 *
 * Save writes the tool permissions in ONE PUT …/tool-scope-map call and, for
 * an external identity provider, limits sign-in to it
 * (POST /authsec/applications/:id/identity-providers). Cancel removes a draft
 * this page created (DELETE /authsec/applications/:id).
 *
 * The draft id lives in the URL (?server=&draft=1) so a reload, or a trip to
 * "Create new identity provider", resumes instead of creating a duplicate.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, KeyRound, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

import {
  useCreateApplicationMutation,
  useDeleteApplicationMutation,
  useGetApplicationQuery,
  useUpdateApplicationMutation,
} from "@/app/api/applicationsApi";
import {
  useAddApplicationIDPPolicyMutation,
  useListApplicationIDPPoliciesQuery,
} from "@/app/api/authMethodApi";
import {
  useGetScopeMatrixQuery,
  useRescanResourceServerMutation,
  useUpdateToolScopeMapMutation,
} from "@/app/api/scopeMatrixApi";
import { useListScopePresetsQuery } from "@/app/api/scopePresetsApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AUTHSEC_DIRECTORY, IdentityProviderPicker } from "@/features/identity-providers/IdentityProviderPicker";

import { DEFAULT_FORM } from "../resource-servers/resource-server-utils";
import { McpSdkSection, McpTestSection } from "./create/McpConnectSections";
import { buildToolMappings, McpToolsSection, type ToolOverrides } from "./create/McpToolsSection";
import {
  DarkCode,
  FieldHelp,
  FieldLabel,
  SectionCard,
  SectionRow,
  SetupLayout,
  SidePanel,
} from "./create/SetupForm";
import { Notice } from "./create/WizardParts";
import { deriveServerName, parseServerUrl } from "./create/wizard-utils";

type ScanState =
  | { status: "idle" }
  | { status: "ok"; key: string; partial: boolean; ms: number; warning?: string }
  | { status: "token"; key: string; error?: string }
  | { status: "error"; key: string; message: string };

type ApiError = {
  status?: number | string;
  data?: { code?: string; error?: string; failure_reason?: string };
};

function apiMessage(err: unknown, fallback: string): string {
  const e = err as ApiError;
  return e?.data?.failure_reason ?? e?.data?.error ?? fallback;
}

export default function CreateApplicationPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const serverId = searchParams.get("server");
  const isDraft = searchParams.get("draft") === "1";

  const [idp, setIdp] = useState<string | null>(null);
  const [url, setUrl] = useState(() => searchParams.get("url") ?? "");
  const [name, setName] = useState(() => searchParams.get("name") ?? "");
  const [nameEdited, setNameEdited] = useState(() => Boolean(searchParams.get("name")));
  const [presetId, setPresetId] = useState<string>(DEFAULT_FORM.scope_preset_id ?? "blank");
  const [presetTouched, setPresetTouched] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanState>({ status: "idle" });
  const [scanToken, setScanToken] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<ToolOverrides>({});
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const { data: presets = [], isLoading: presetsLoading } = useListScopePresetsQuery();
  const { data: existing } = useGetApplicationQuery(serverId ?? "", { skip: !serverId });
  const { data: matrix, isFetching: matrixFetching } = useGetScopeMatrixQuery(serverId ?? "", { skip: !serverId });
  const { data: idpPolicies } = useListApplicationIDPPoliciesQuery(serverId ?? "", { skip: !serverId });

  const [createServer, { isLoading: creating }] = useCreateApplicationMutation();
  const [updateServer, { isLoading: updating }] = useUpdateApplicationMutation();
  const [deleteServer] = useDeleteApplicationMutation();
  const [rescan, { isLoading: scanning }] = useRescanResourceServerMutation();
  const [updateMap] = useUpdateToolScopeMapMutation();
  const [addIdpPolicy] = useAddApplicationIDPPolicyMutation();

  // Fall back to the catalog's recommended template if the default id is missing.
  useEffect(() => {
    if (presetTouched || !presets.length) return;
    if (presets.some((p) => p.id === presetId)) return;
    const recommended = presets.find((p) => p.recommended) ?? presets[0];
    setPresetId(recommended.id);
  }, [presets, presetId, presetTouched]);

  // Resuming (reload, or back from "Create new identity provider"): fill the URL and name.
  useEffect(() => {
    if (hydrated || !existing) return;
    const resourceUri = existing.resource_uri || `${existing.public_base_url}${existing.protected_base_path}`;
    setUrl(resourceUri);
    setName(existing.name);
    setNameEdited(true);
    const parsed = parseServerUrl(resourceUri);
    if (parsed.ok) setSavedKey(`${parsed.resourceUri}|${existing.name.trim()}`);
    setHydrated(true);
  }, [existing, hydrated]);

  // An MCP limited to one provider already shows it.
  useEffect(() => {
    if (idp || searchParams.get("idp")) return;
    const enabled = idpPolicies?.filter((p) => p.enabled) ?? [];
    if (enabled.length === 1) setIdp(enabled[0].identity_provider_id);
  }, [idpPolicies, idp, searchParams]);

  const parsed = parseServerUrl(url);
  const trimmedName = name.trim();
  const currentKey = parsed.ok ? `${parsed.resourceUri}|${trimmedName}` : null;
  const busy = creating || updating || scanning;
  const scanIsCurrent = scan.status !== "idle" && scan.key === currentKey;
  const urlError = touched && !parsed.ok ? parsed.error : null;
  const nameError = touched && !trimmedName ? "Enter a name." : null;
  const toolCount = matrix?.tools.length ?? 0;

  const handleUrl = (value: string) => {
    setUrl(value);
    setServerError(null);
    if (!nameEdited) {
      const next = parseServerUrl(value);
      setName(next.ok ? deriveServerName(next.host) : "");
    }
  };

  const checkServer = async (mcpToken?: string) => {
    setTouched(true);
    setServerError(null);
    if (!parsed.ok || !trimmedName || !currentKey) return;

    let id = serverId;
    try {
      if (!id) {
        const created = await createServer({
          name: trimmedName,
          public_base_url: parsed.baseUrl,
          protected_base_path: parsed.path,
          scopes_supported: [],
          registration_modes: ["dcr", "cimd", "prereg"],
          scope_preset_id: presetId && presetId !== "blank" ? presetId : null,
          default_access_enabled: false,
        }).unwrap();
        id = created.id;
        if (created.introspection_secret) setSecret(created.introspection_secret);
        const params = new URLSearchParams(searchParams);
        params.set("server", created.id);
        params.set("draft", "1");
        params.delete("url");
        params.delete("name");
        setSearchParams(params, { replace: true });
        setHydrated(true);
      } else if (savedKey !== currentKey) {
        await updateServer({
          id,
          body: { name: trimmedName, public_base_url: parsed.baseUrl, protected_base_path: parsed.path },
        }).unwrap();
      }
      setSavedKey(currentKey);
    } catch (err) {
      setServerError(apiMessage(err, serverId ? "Couldn't update the MCP." : "Couldn't add the MCP."));
      return;
    }

    const started = performance.now();
    try {
      const response = await rescan({ rsId: id, mcpToken }).unwrap();
      setScanToken("");
      setScan({
        status: "ok",
        key: currentKey,
        partial: response.last_scan_status === "partial",
        ms: Math.round(performance.now() - started),
        warning: response.result.warnings?.[0] ?? undefined,
      });
    } catch (err) {
      setScanToken("");
      const e = err as ApiError;
      if (e?.data?.code === "mcp_token_required" || e?.status === 428) {
        setScan({
          status: "token",
          key: currentKey,
          error: mcpToken
            ? apiMessage(err, "The MCP server rejected that token. Paste a fresh token that can call tools/list.")
            : undefined,
        });
        return;
      }
      setScan({
        status: "error",
        key: currentKey,
        message: apiMessage(err, "AuthSec couldn't reach the server. Check the URL and that the server is running."),
      });
    }
  };

  const cancel = async () => {
    if (serverId && isDraft) {
      try {
        await deleteServer(serverId).unwrap();
      } catch {
        toast.error("Couldn't remove the draft MCP. Delete it from the MCP list.");
      }
    }
    navigate("/applications");
  };

  const save = async () => {
    setTouched(true);
    setSaveError(null);
    if (!idp) {
      setSaveError("Choose an identity provider in step 1.");
      return;
    }
    if (!serverId) {
      setSaveError("Check the server in step 2 first.");
      return;
    }
    if (!parsed.ok || !trimmedName) return;
    setSaving(true);
    try {
      if (currentKey && savedKey !== currentKey) {
        await updateServer({
          id: serverId,
          body: { name: trimmedName, public_base_url: parsed.baseUrl, protected_base_path: parsed.path },
        }).unwrap();
        setSavedKey(currentKey);
      }
      const mappings = buildToolMappings(matrix, overrides);
      if (mappings.length > 0) {
        await updateMap({ rsId: serverId, body: { mappings } }).unwrap();
        setOverrides({});
      }
      if (idp !== AUTHSEC_DIRECTORY && !idpPolicies?.some((p) => p.identity_provider_id === idp && p.enabled)) {
        await addIdpPolicy({ applicationId: serverId, identity_provider_id: idp, enabled: true }).unwrap();
      }
      toast.success(`${trimmedName || "MCP"} saved.`);
      navigate(`/applications/${serverId}/overview`);
    } catch (err) {
      setSaveError(apiMessage(err, "Couldn't save the MCP."));
    } finally {
      setSaving(false);
    }
  };

  // "Create new identity provider" returns here with the typed URL kept.
  const returnTo = useMemo(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("idp");
    if (!serverId) {
      if (url.trim()) params.set("url", url.trim());
      if (nameEdited && trimmedName) params.set("name", trimmedName);
    }
    const qs = params.toString();
    return qs ? `/applications/new?${qs}` : "/applications/new";
  }, [searchParams, serverId, url, nameEdited, trimmedName]);

  const onIdpChange = useCallback((value: string) => {
    setIdp(value);
    setSaveError(null);
  }, []);

  const curlTarget = parsed.ok ? parsed.resourceUri : "https://mcp.example.com/mcp";

  return (
    <ConsolePage
      crumbs={[{ label: "MCP", to: "/applications" }, { label: "Add" }]}
      title="Add MCP"
      description="One page. Nothing is enforced until you save."
      actions={
        <>
          <Button type="button" variant="ghost" onClick={() => void cancel()} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" className="text-white" onClick={() => void save()} disabled={saving || busy}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {saving ? "Saving…" : "Save MCP"}
          </Button>
        </>
      }
    >
      {saveError ? <Notice tone="danger" title="Not saved.">{saveError}</Notice> : null}
      <SetupLayout
        side={
          <SidePanel
            title="How it works"
            items={[
              { term: "Only the URL is needed", body: "AuthSec reads the tool list from your server." },
              {
                term: "Nothing changes until you save",
                body: "Your server keeps working as it does today. Checking it adds a draft that Cancel removes.",
              },
              { term: "Every tool request is checked", body: "A request without a valid token never reaches the tool." },
              { term: "Users come first", body: "Pick or create the identity provider, then add the server." },
            ]}
          >
            <h3 className="text-[length:var(--font-size-sm)] font-semibold text-(--color-text)">Check it from your terminal</h3>
            <DarkCode code={`curl -i ${curlTarget}`} />
            <p className="text-[length:13px] text-(--color-text-muted)">
              Once the SDK runs, this returns <span className="font-mono">HTTP/1.1 401 Unauthorized</span>.
            </p>
          </SidePanel>
        }
      >
        <SectionRow>
          <SectionCard n={1} title="Users">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="mcp-idp" required>
                Identity provider
              </FieldLabel>
              <IdentityProviderPicker
                id="mcp-idp"
                value={idp}
                onChange={onIdpChange}
                returnTo={returnTo}
                invalid={touched && !idp}
                describedBy="mcp-idp-help"
              />
              <FieldHelp id="mcp-idp-help" error={touched && !idp}>
                {touched && !idp
                  ? "Choose an identity provider."
                  : idp === AUTHSEC_DIRECTORY
                    ? "Users of this MCP sign in with AuthSec accounts. No provider limit is saved."
                    : "Users of this MCP sign in through this provider."}
              </FieldHelp>
            </div>
          </SectionCard>

          <SectionCard n={2} title="Server">
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!busy) void checkServer();
              }}
            >
              <div className="space-y-1.5">
                <FieldLabel htmlFor="mcp-url" required>
                  Server URL
                </FieldLabel>
                <Input
                  id="mcp-url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                  value={url}
                  placeholder="https://mcp.example.com/mcp"
                  onChange={(event) => handleUrl(event.target.value)}
                  onBlur={() => url && setTouched(true)}
                  aria-invalid={urlError ? true : undefined}
                  aria-describedby="mcp-url-help"
                />
                {urlError || (parsed.ok && parsed.usedDefaultPath) ? (
                  <FieldHelp id="mcp-url-help" error={Boolean(urlError)}>
                    {urlError ?? `The URL has no path, so AuthSec will use ${parsed.ok ? parsed.resourceUri : ""}.`}
                  </FieldHelp>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="mcp-name">Name</FieldLabel>
                <Input
                  id="mcp-name"
                  value={name}
                  placeholder="support-mcp"
                  onChange={(event) => {
                    setNameEdited(true);
                    setName(event.target.value);
                  }}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby="mcp-name-help"
                />
                <FieldHelp id="mcp-name-help" error={Boolean(nameError)}>
                  {nameError ?? "Read from the server. You can change it."}
                </FieldHelp>
              </div>

              {!serverId ? (
                <div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[length:13px] font-medium text-(--color-text-muted) hover:text-(--color-text)"
                    onClick={() => setShowAdvanced((v) => !v)}
                    aria-expanded={showAdvanced}
                    aria-controls="mcp-advanced"
                  >
                    {showAdvanced ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                    Permission template
                  </button>
                  {showAdvanced ? (
                    <div id="mcp-advanced" className="mt-2 space-y-1.5">
                      <Select
                        value={presetId}
                        onValueChange={(v) => {
                          setPresetTouched(true);
                          setPresetId(v);
                        }}
                        disabled={presetsLoading}
                      >
                        <SelectTrigger className="w-full" aria-label="Permission template">
                          <SelectValue placeholder={presetsLoading ? "Loading templates…" : "Choose a template"} />
                        </SelectTrigger>
                        <SelectContent>
                          {presets.map((preset) => (
                            <SelectItem key={preset.id} value={preset.id}>
                              {preset.name}
                              {preset.recommended ? " (recommended)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldHelp>
                        {presets.find((p) => p.id === presetId)?.description ??
                          "The permissions AuthSec creates for this server. The default works for most servers."}
                      </FieldHelp>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <Button type="submit" variant="outline" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {creating ? "Adding…" : updating ? "Updating…" : scanning ? "Reading tools…" : serverId ? "Check again" : "Check server"}
              </Button>
            </form>

            {serverError ? <Notice tone="danger" title="Not checked.">{serverError}</Notice> : null}

            {scanning ? (
              <Notice tone="loading">Connecting to the server and listing its tools…</Notice>
            ) : scanIsCurrent && scan.status === "ok" ? (
              <Notice tone={scan.partial ? "warning" : "success"} title="Connected.">
                {matrixFetching ? "Counting tools…" : `Tools found: ${toolCount}`} · Scan took {scan.ms} ms
                {scan.partial ? ". The server doesn't publish AuthSec metadata yet; that's expected until the SDK runs." : null}
                {scan.warning ? ` ${scan.warning}` : null}
              </Notice>
            ) : scanIsCurrent && scan.status === "error" ? (
              <Notice tone="danger" title="Tools not found.">
                {scan.message} You can still save and add tools later.
              </Notice>
            ) : !scanIsCurrent && serverId && savedKey === currentKey ? (
              <Notice tone="info">
                Added as a draft{existing?.tools_count != null ? ` · Tools found: ${existing.tools_count}` : ""}.
              </Notice>
            ) : null}

            {scanIsCurrent && scan.status === "token" && !scanning ? (
              <div className="space-y-3 rounded-lg border border-(--color-border-subtle) p-4">
                <p className="text-[length:var(--font-size-sm)] text-(--color-text)">
                  This server needs a token to list its tools. Paste a bearer token that can call{" "}
                  <code className="font-mono">tools/list</code>. AuthSec uses it for this check only and doesn't store it.
                </p>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="mcp-scan-token">MCP bearer token</FieldLabel>
                  <Input
                    id="mcp-scan-token"
                    type="password"
                    autoComplete="off"
                    className="font-mono"
                    value={scanToken}
                    onChange={(event) => setScanToken(event.target.value)}
                    aria-invalid={scan.error ? true : undefined}
                    aria-describedby={scan.error ? "mcp-scan-token-error" : undefined}
                  />
                  {scan.error ? (
                    <FieldHelp id="mcp-scan-token-error" error>
                      {scan.error}
                    </FieldHelp>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void checkServer(scanToken.trim())}
                  disabled={busy || !scanToken.trim()}
                >
                  <KeyRound className="size-4" aria-hidden />
                  Read tools with this token
                </Button>
              </div>
            ) : null}
          </SectionCard>
        </SectionRow>

        <SectionCard
          n={3}
          title="Tools and permissions"
          aside={serverId && toolCount > 0 ? "Suggested from tool names; change any of them" : undefined}
          disabled={!serverId}
        >
          <McpToolsSection serverId={serverId} overrides={overrides} onOverridesChange={setOverrides} disabled={saving} />
        </SectionCard>

        <SectionCard n={4} title="SDK Integration" disabled={!serverId}>
          <McpSdkSection serverId={serverId} secret={secret} onSecretChange={setSecret} />
        </SectionCard>

        <SectionCard n={5} title="Test Integration" disabled={!serverId}>
          <McpTestSection serverId={serverId} />
        </SectionCard>
      </SetupLayout>
    </ConsolePage>
  );
}
