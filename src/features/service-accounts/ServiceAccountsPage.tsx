import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ClipboardCopy, ExternalLink, Plus, Server } from "lucide-react";
import { toast } from "react-hot-toast";

import {
  useListWorkspaceServiceAccountsQuery,
  useCreateWorkspaceServiceAccountMutation,
  useProvisionWorkloadCredentialMutation,
  useListServiceAccountAccessQuery,
  type WorkspaceServiceAccount,
} from "@/app/api/agentIdentityApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import {
  ConsoleFilterBar,
  EntityCell,
  type ConsoleFilterOption,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { ConsolePage } from "@/components/console/ConsolePage";
import { RightDrawer } from "@/components/primitives/RightDrawer";

const DOCS_URL = "https://docs.authsec.dev/getting-started";

// ── Auth-method helpers ───────────────────────────────────────────────────────

type AuthMethod = "credential" | "kubernetes" | "none";

function authMethodOf(sa: WorkspaceServiceAccount): AuthMethod {
  if (sa.spiffe_id) return "kubernetes";
  if (sa.oauth_client_id) return "credential";
  return "none";
}

const AUTH_BADGE: Record<AuthMethod, { label: string; variant: "default" | "outline" | "secondary" }> =
  {
    credential: { label: "Secret / JWT", variant: "default" },
    kubernetes: { label: "Kubernetes", variant: "secondary" },
    none: { label: "No credential", variant: "outline" },
  };

// ── Filter definitions ────────────────────────────────────────────────────────

type FilterKey = "all" | "credential" | "kubernetes" | "no_credential";

const FILTER_DEFS: ConsoleFilterOption[] = [
  { key: "all", label: "All" },
  { key: "credential", label: "Credential (M2M)" },
  { key: "kubernetes", label: "Kubernetes" },
  { key: "no_credential", label: "No credential" },
];

function applyFilter(items: WorkspaceServiceAccount[], filter: FilterKey): WorkspaceServiceAccount[] {
  switch (filter) {
    case "credential":
      return items.filter((sa) => !!sa.oauth_client_id && !sa.spiffe_id);
    case "kubernetes":
      return items.filter((sa) => !!sa.spiffe_id);
    case "no_credential":
      return items.filter((sa) => !sa.oauth_client_id && !sa.spiffe_id);
    default:
      return items;
  }
}

// ── Create wizard ─────────────────────────────────────────────────────────────

type WizardAuthChoice = "secret" | "jwks" | "kubernetes";
type WizardStep = "form" | "result";

const AUTH_CHOICE_CARDS: {
  method: WizardAuthChoice;
  title: string;
  desc: string;
}[] = [
  {
    method: "secret",
    title: "Client secret",
    desc: "Generates a client_id + secret. Use with the client_credentials grant for any server-to-server call.",
  },
  {
    method: "jwks",
    title: "Private-key JWT",
    desc: "You supply a JWKS URI. AuthSec verifies your private-key signature — no shared secret to rotate.",
  },
  {
    method: "kubernetes",
    title: "Kubernetes / SPIFFE",
    desc: "Your pod presents a SPIFFE SVID at runtime. Configured per MCP server, not here. Guidance only.",
  },
];

interface CreateResult {
  sa: WorkspaceServiceAccount;
  authChoice: WizardAuthChoice;
  credential?: { client_id: string; auth_method: string; client_secret?: string };
}

function CreateServiceAccountDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (sa: WorkspaceServiceAccount) => void;
}) {
  const [step, setStep] = useState<WizardStep>("form");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [authChoice, setAuthChoice] = useState<WizardAuthChoice>("secret");
  const [jwksUri, setJwksUri] = useState("");
  const [result, setResult] = useState<CreateResult | null>(null);
  const [createSA, { isLoading: creating }] = useCreateWorkspaceServiceAccountMutation();
  const [provisionCred, { isLoading: provisioning }] = useProvisionWorkloadCredentialMutation();
  const isLoading = creating || provisioning;

  const reset = () => {
    setStep("form");
    setName("");
    setDescription("");
    setAuthChoice("secret");
    setJwksUri("");
    setResult(null);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (authChoice === "jwks" && !jwksUri.trim()) {
      toast.error("JWKS URI is required for private-key JWT.");
      return;
    }
    try {
      const sa = await createSA({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      }).unwrap();

      let credential: CreateResult["credential"] | undefined;
      if (authChoice === "secret") {
        credential = await provisionCred({ saId: sa.id, use_client_secret: true }).unwrap();
      } else if (authChoice === "jwks") {
        credential = await provisionCred({ saId: sa.id, jwks_uri: jwksUri.trim() }).unwrap();
      }

      setResult({ sa, authChoice, credential });
      setStep("result");
      onCreated(sa);
      toast.success("Service account created.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't create service account.");
    }
  };

  const copy = (val: string) => {
    void navigator.clipboard.writeText(val);
    toast.success("Copied");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create service account</DialogTitle>
          <DialogDescription>
            {step === "form"
              ? "A service account is a machine principal. Pick an auth method — you can change it later."
              : "Save these values now — the secret won't be shown again."}
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="sa-name">Name</Label>
              <Input
                id="sa-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="data-pipeline-worker"
                autoComplete="off"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sa-desc">Description</Label>
              <Input
                id="sa-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
                autoComplete="off"
                className="h-9"
              />
            </div>

            <div className="space-y-2">
              <Label>Auth method</Label>
              <div className="space-y-2">
                {AUTH_CHOICE_CARDS.map((card) => (
                  <button
                    key={card.method}
                    type="button"
                    onClick={() => setAuthChoice(card.method)}
                    className={[
                      "w-full rounded-lg border px-4 py-3 text-left transition-colors",
                      authChoice === card.method
                        ? "border-[var(--component-button-primary-bg)] bg-blue-50/40"
                        : "border-border hover:border-[var(--color-border-strong)]",
                    ].join(" ")}
                  >
                    <p className="text-sm font-medium text-foreground">{card.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{card.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {authChoice === "jwks" && (
              <div className="space-y-1.5">
                <Label htmlFor="sa-jwks">JWKS URI</Label>
                <Input
                  id="sa-jwks"
                  value={jwksUri}
                  onChange={(e) => setJwksUri(e.target.value)}
                  placeholder="https://example.com/.well-known/jwks.json"
                  autoComplete="off"
                  className="h-9 font-mono text-xs"
                />
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleCreate()}
                disabled={!name.trim() || isLoading}
                className="text-white"
              >
                {isLoading ? "Creating…" : "Create service account"}
              </Button>
            </DialogFooter>
          </div>
        ) : result ? (
          <div className="space-y-3 py-2">
            {result.authChoice === "secret" && result.credential ? (
              <>
                {(
                  [
                    ["CLIENT_ID", result.credential.client_id],
                    ["CLIENT_SECRET", result.credential.client_secret ?? ""],
                  ] as const
                ).map(([label, val]) => (
                  <div key={label} className="space-y-1">
                    <Label>{label}</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
                        {val}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copy(val)}
                      >
                        <ClipboardCopy className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600">
                  Use <span className="font-mono text-[11px]">client_credentials</span> grant with{" "}
                  <span className="font-mono text-[11px]">client_secret_basic</span> auth.
                  Grant this service account access to an MCP server from its{" "}
                  <span className="font-medium">Access Assignments</span> tab.
                </div>
              </>
            ) : result.authChoice === "jwks" && result.credential ? (
              <>
                <div className="space-y-1">
                  <Label>CLIENT_ID</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
                      {result.credential.client_id}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => copy(result.credential!.client_id)}>
                      <ClipboardCopy className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600">
                  Sign a <span className="font-mono text-[11px]">client_assertion</span> JWT with
                  your private key and pass it as{" "}
                  <span className="font-mono text-[11px]">client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer</span>.{" "}
                  <a href={DOCS_URL} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline inline-flex items-center gap-0.5">
                    Docs <ExternalLink className="size-3" />
                  </a>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600">
                <p className="font-medium text-slate-700 mb-1">Service account created — no credential provisioned.</p>
                Kubernetes/SPIFFE identity is configured <span className="font-medium">per MCP server</span>,
                not at the workspace level. Go to the MCP server's{" "}
                <span className="font-medium">Workloads</span> tab and grant this service account
                access. At runtime your pod presents its SPIFFE SVID.{" "}
                <a href={DOCS_URL} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline inline-flex items-center gap-0.5">
                  SPIFFE guide <ExternalLink className="size-3" />
                </a>
              </div>
            )}

            <DialogFooter>
              <Button
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
                className="text-white"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

function ServiceAccountDrawer({
  sa,
  open,
  onClose,
}: {
  sa: WorkspaceServiceAccount | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: accessData, isLoading: accessLoading } = useListServiceAccountAccessQuery(
    sa?.id ?? "",
    { skip: !sa },
  );

  if (!sa) return null;
  const method = authMethodOf(sa);
  const badge = AUTH_BADGE[method];

  return (
    <RightDrawer
      open={open}
      onClose={onClose}
      ariaTitle={sa.name}
      ariaDescription="Service account details and access grants"
    >
      <div className="space-y-6 px-6 py-6">
        <div>
          <div className="flex items-center gap-2">
            <Server className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">{sa.name}</h2>
            <Badge variant={badge.variant} className="ml-1">{badge.label}</Badge>
          </div>
          {sa.description && (
            <p className="mt-1 text-sm text-muted-foreground">{sa.description}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {sa.oauth_client_id && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-0.5">Client ID</p>
              <p className="font-mono text-xs break-all text-foreground">{sa.oauth_client_id}</p>
            </div>
          )}
          {sa.spiffe_id && (
            <div className="col-span-2">
              <p className="text-xs font-medium text-muted-foreground mb-0.5">SPIFFE ID</p>
              <p className="font-mono text-xs break-all text-foreground">{sa.spiffe_id}</p>
            </div>
          )}
          {sa.owner_email && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-0.5">Owner</p>
              <p className="text-xs text-foreground">{sa.owner_email}</p>
            </div>
          )}
          {sa.owner_team && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-0.5">Team</p>
              <p className="text-xs text-foreground">{sa.owner_team}</p>
            </div>
          )}
          {sa.last_seen_at && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-0.5">Last seen</p>
              <p className="text-xs text-foreground">
                {formatDistanceToNow(new Date(sa.last_seen_at), { addSuffix: true })}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-0.5">Created</p>
            <p className="text-xs text-foreground">
              {formatDistanceToNow(new Date(sa.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-medium text-foreground">Access grants</h3>
          {accessLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !accessData?.items.length ? (
            <p className="text-sm text-muted-foreground">
              No access grants yet. Grant access from an MCP server's Access Assignments tab.
            </p>
          ) : (
            <div className="space-y-2">
              {accessData.items.map((item) => (
                <div
                  key={`${item.resource_server_id}:${item.role_id}`}
                  className="rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{item.resource_server_name}</p>
                    <Badge variant="secondary" className="shrink-0">{item.role_name}</Badge>
                  </div>
                  {item.effective_scopes.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {item.effective_scopes.map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </RightDrawer>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ServiceAccountsPage() {
  const { data, isLoading, refetch } = useListWorkspaceServiceAccountsQuery();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSA, setSelectedSA] = useState<WorkspaceServiceAccount | null>(null);

  const items = useMemo(() => {
    let list = applyFilter(data ?? [], activeFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((sa) =>
        [sa.name, sa.description, sa.owner_email, sa.oauth_client_id, sa.spiffe_id]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return list;
  }, [data, activeFilter, query]);

  const filtersWithCounts = useMemo<ConsoleFilterOption[]>(
    () =>
      FILTER_DEFS.map((f) => ({
        ...f,
        count:
          f.key === "all"
            ? (data ?? []).length
            : applyFilter(data ?? [], f.key as FilterKey).length,
      })),
    [data],
  );

  const columns = useMemo<AdaptiveColumn<WorkspaceServiceAccount>[]>(
    () => [
      {
        id: "name",
        header: "Service account",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <EntityCell label={row.original.name} detail={row.original.oauth_client_id ?? row.original.spiffe_id} />
        ),
      },
      {
        id: "auth_method",
        header: "Auth method",
        priority: 1,
        approxWidth: 140,
        cell: ({ row }) => {
          const m = authMethodOf(row.original);
          const b = AUTH_BADGE[m];
          return <Badge variant={b.variant}>{b.label}</Badge>;
        },
      },
      {
        id: "owner",
        header: "Owner",
        priority: 2,
        approxWidth: 160,
        cell: ({ row }) =>
          row.original.owner_email ? (
            <span className="text-xs text-slate-700">{row.original.owner_email}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "last_seen",
        header: "Last seen",
        priority: 3,
        approxWidth: 130,
        cell: ({ row }) => {
          const ts = row.original.last_seen_at ? new Date(row.original.last_seen_at) : null;
          const valid = ts && !Number.isNaN(ts.getTime());
          return (
            <span className="text-xs text-muted-foreground">
              {valid ? formatDistanceToNow(ts, { addSuffix: true }) : "never"}
            </span>
          );
        },
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Service Accounts"
      description="Machine principals for server-to-server (M2M) calls. Each service account holds a credential — client secret, private-key JWT, or Kubernetes SPIFFE SVID — and is granted access to specific MCP servers independently of any user session."
      actions={
        <>
          <Button variant="outline" asChild>
            <a href={DOCS_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1.5 size-3.5" />
              Docs
            </a>
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="text-white">
            <Plus className="mr-1.5 size-3.5" />
            Create service account
          </Button>
        </>
      }
    >
      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search by name, client ID, or owner"
        filters={filtersWithCounts}
        activeFilter={activeFilter}
        onFilterChange={(v) => setActiveFilter(v as FilterKey)}
      />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Loading service accounts…
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center">
              <Server className="mx-auto mb-3 size-7 text-slate-300" />
              <p className="text-sm font-medium text-foreground">
                {query || activeFilter !== "all"
                  ? "No service accounts match this filter."
                  : "No service accounts yet"}
              </p>
              {!query && activeFilter === "all" && (
                <>
                  <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                    Create a service account to get credentials for your server-to-server flows.
                    Then grant it access to an MCP server from that server's Access Assignments tab.
                  </p>
                  <div className="mt-4 flex justify-center">
                    <Button size="sm" onClick={() => setCreateOpen(true)} className="text-white">
                      <Plus className="mr-1.5 size-3.5" />
                      Create service account
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <AdaptiveTable
              tableId="service-accounts-inventory"
              data={items}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(sa) => sa.id}
              onRowClick={(sa) => setSelectedSA(sa)}
              pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <CreateServiceAccountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void refetch()}
      />

      <ServiceAccountDrawer
        sa={selectedSA}
        open={!!selectedSA}
        onClose={() => setSelectedSA(null)}
      />
    </ConsolePage>
  );
}
