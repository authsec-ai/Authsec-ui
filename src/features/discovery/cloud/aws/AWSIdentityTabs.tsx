/**
 * The five identity-scoped tabs of AWSIdentityDrawer.
 *
 * Each one wraps exactly one endpoint, always filtered by `identity_id`. That
 * filter is not an optimisation for permissions — the grain is one row per
 * policy statement per identity and none of these routes paginate, so an
 * unscoped permissions read is unbounded in the worst way.
 *
 * Every tab is `skip`-gated by its parent on the active tab, so opening the
 * drawer costs one request, not five.
 */

import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Boxes,
  Info,
  KeyRound,
  Network,
  ShieldQuestion,
  Timer,
} from "lucide-react";

import { StatusBadge } from "@/components/ui/status-badge";
import { DetailGrid, DetailRow, DrawerEmpty } from "@/components/console/detail";
import {
  useListAwsAssumeEdgesQuery,
  useListAwsConnectorsQuery,
  useListAwsPermissionsQuery,
  useListAwsResourcesQuery,
  useListAwsSecretsQuery,
  useListAwsUsageQuery,
  useListAwsWorkloadsQuery,
  type AWSConnectorAttrs,
  type AWSWorkloadAttrs,
  type CloudIdentity,
  type CloudPermission,
} from "@/app/api/cloudDiscoveryApi";
import {
  ASSUME_MECHANISM_LABEL,
  ASSUME_SUBJECT_LABEL,
  ASSUME_SUBJECT_TONE,
  EFFECT_LABEL,
  EFFECT_TONE,
  resourceKindLabel,
  RUNTIME_KIND_LABEL,
  SCOPE_KIND_LABEL,
  SCOPE_KIND_TONE,
  SENSITIVITY_LABEL,
  SENSITIVITY_TONE,
  stackPredatesCompute,
  TEMPLATE_VERSION_WITH_COMPUTE,
  USAGE_SOURCE_LABEL,
  usageServiceLabel,
} from "./awsInventoryLabels";
import { InventoryNotice, PhaseUnobservableNotice } from "./AWSInventoryNotices";

/* ─────────────────────────────── helpers ────────────────────────────────── */

/** `null` means UNKNOWN for an identity or a secret, never "never used" —
 * models/cloud_discovery.go says so explicitly. Never upgrade an absence into
 * a more confident claim than the data supports. */
function relativeOrUnknown(iso: string | null | undefined): string {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "Unknown";
}

function absolute(iso: string | null | undefined): string | undefined {
  return iso ? new Date(iso).toLocaleString() : undefined;
}

function TabLoading() {
  return <p className="text-sm text-muted-foreground">Loading…</p>;
}

/** A row of small mono chips. Used for IAM action strings, which routinely
 * number in the dozens on a single statement, so the container wraps rather
 * than truncating — a clipped action list is a misleading one. */
function ActionChips({ actions }: { actions: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {actions.map((a) => (
        <span
          key={a}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground"
        >
          {a}
        </span>
      ))}
    </div>
  );
}

/* ──────────────────────────── Permissions ───────────────────────────────── */

/** Splits `<source>#s<index>` back into the policy it came from.
 *
 * The backend builds native_id as `fmt.Sprintf("%s#s%d", source, i)` where
 * source is a managed-policy ARN or `inline:<name>`. Grouping by source is how
 * a reader sees "these six statements all come from one attached policy"
 * rather than six unrelated rows. Uses the LAST `#s` so a policy name that
 * happens to contain the sequence still splits correctly.
 */
function policySourceOf(nativeId: string): string {
  const at = nativeId.lastIndexOf("#s");
  return at === -1 ? nativeId : nativeId.slice(0, at);
}

function policySourceLabel(source: string): { label: string; kind: string } {
  if (source.startsWith("inline:")) {
    return { label: source.slice("inline:".length), kind: "Inline policy" };
  }
  const name = source.split("/").pop() ?? source;
  return { label: name, kind: "Managed policy" };
}

export function PermissionsTab({ identity }: { identity: CloudIdentity }) {
  const { data: permissions, isLoading } = useListAwsPermissionsQuery({
    identity_id: identity.id,
  });

  // Resources filter by connector_id, never identity_id, so a statement's
  // named resource has to be resolved client-side. Scoped to this identity's
  // own connector so the fetch is as small as the API allows.
  const { data: resources } = useListAwsResourcesQuery({ connector_id: identity.connector_id });

  const resourceById = useMemo(
    () => new Map((resources ?? []).map((r) => [r.id, r])),
    [resources],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, CloudPermission[]>();
    for (const p of permissions ?? []) {
      const source = policySourceOf(p.native_id);
      const list = map.get(source);
      if (list) list.push(p);
      else map.set(source, [p]);
    }
    // Inline policies last: an attached managed policy is the more common
    // explanation for a grant, so it reads first.
    return [...map.entries()].sort(([a], [b]) => {
      const ai = a.startsWith("inline:") ? 1 : 0;
      const bi = b.startsWith("inline:") ? 1 : 0;
      return ai - bi || a.localeCompare(b);
    });
  }, [permissions]);

  if (isLoading) return <TabLoading />;

  if (!permissions?.length) {
    return (
      <div className="space-y-3">
        <PhaseUnobservableNotice surface="Permission extraction" />
        <DrawerEmpty
          icon={<ShieldQuestion />}
          title="No permission statements recorded"
          description="No managed or inline policy statements were extracted for this identity."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <InventoryNotice tone="info" icon={<Info />}>
        These are policy statements as <span className="font-medium">granted</span>, not computed
        effective access. A statement scoped account-wide or to a prefix names no single resource —
        that is the record of its breadth, not a missing value.
      </InventoryNotice>

      {grouped.map(([source, statements]) => {
        const { label, kind } = policySourceLabel(source);
        return (
          <section key={source} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 truncate text-[12.5px] font-medium text-foreground" title={source}>
                {label}
              </p>
              <span className="flex-none text-[10.5px] uppercase tracking-wide text-muted-foreground">
                {kind} · {statements.length}
              </span>
            </div>

            {statements.map((p) => {
              const resource = p.resource_id ? resourceById.get(p.resource_id) : undefined;
              return (
                <div key={p.id} className="space-y-2 rounded-md border px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={EFFECT_TONE[p.effect]}>{EFFECT_LABEL[p.effect]}</StatusBadge>
                    <StatusBadge tone={SCOPE_KIND_TONE[p.scope_kind]} dot={false}>
                      {SCOPE_KIND_LABEL[p.scope_kind]}
                    </StatusBadge>
                    {p.sensitivity !== "low" ? (
                      <StatusBadge tone={SENSITIVITY_TONE[p.sensitivity]} dot={false}>
                        {SENSITIVITY_LABEL[p.sensitivity]} sensitivity
                      </StatusBadge>
                    ) : null}
                  </div>

                  <ActionChips actions={p.actions} />

                  {p.scope_kind === "resource" ? (
                    resource ? (
                      <p className="truncate text-[11px] text-muted-foreground" title={resource.native_id}>
                        On {resourceKindLabel(resource.kind)}{" "}
                        <span className="font-mono text-foreground">
                          {resource.name || resource.native_id}
                        </span>
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        On one named resource, not in the discovered resource list.
                      </p>
                    )
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {p.scope_kind === "account_wide"
                        ? "Applies account-wide — no single resource is named."
                        : "Applies to a resource prefix — no single resource is named."}
                    </p>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────── Trust ─────────────────────────────────── */

export function TrustTab({ identity }: { identity: CloudIdentity }) {
  const { data: edges, isLoading } = useListAwsAssumeEdgesQuery({ identity_id: identity.id });

  const external = useMemo(
    () =>
      (edges ?? []).filter(
        (e) => e.subject_kind === "external_account" || e.subject_kind === "identity",
      ).length,
    [edges],
  );

  if (isLoading) return <TabLoading />;

  if (!edges?.length) {
    return (
      <div className="space-y-3">
        <PhaseUnobservableNotice surface="Trust-policy parsing" />
        <DrawerEmpty
          icon={<Network />}
          title="No trust relationships recorded"
          description={
            identity.kind === "iam_user"
              ? "IAM users are not assumed — they authenticate directly with credentials, so an empty trust list is expected here."
              : "No principal was found that may assume this role."
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {external > 0 ? (
        <InventoryNotice tone="warning" icon={<Info />}>
          <strong className="font-medium">
            {external === 1
              ? "One principal outside this inventory may assume this role."
              : `${external} principals outside this inventory may assume this role.`}
          </strong>{" "}
          An IAM principal or external account subject means the role can be assumed from outside
          AuthSec's own view of the account.
        </InventoryNotice>
      ) : null}

      <div className="space-y-1.5">
        {edges.map((e) => (
          <div key={e.id} className="space-y-1.5 rounded-md border px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge tone={ASSUME_SUBJECT_TONE[e.subject_kind]} dot={false}>
                {ASSUME_SUBJECT_LABEL[e.subject_kind]}
              </StatusBadge>
              <span className="font-mono text-[10.5px] text-muted-foreground">
                {ASSUME_MECHANISM_LABEL[e.mechanism]}
              </span>
            </div>
            <p className="break-all font-mono text-[11.5px] text-foreground">{e.subject}</p>
            {e.issuer ? (
              <p className="text-[11px] text-muted-foreground">
                Issuer <span className="font-mono">{e.issuer}</span>
              </p>
            ) : null}
            {e.k8s_ref ? (
              <p className="text-[11px] text-muted-foreground">
                Kubernetes <span className="font-mono">{e.k8s_ref}</span>
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────── Compute ────────────────────────────────── */

export function ComputeTab({ identity }: { identity: CloudIdentity }) {
  const { data, isLoading } = useListAwsWorkloadsQuery({ identity_id: identity.id });
  const rows = data?.rows ?? [];

  // An empty compute list has two very different explanations, and the tab
  // must not offer the wrong one. If this identity's own account is on a stack
  // older than 2026-09-08, AuthSec was never granted the compute reads — so
  // the remedy is a stack update in AWS, not waiting for a scan phase. Checked
  // per-connector rather than workspace-wide: another account being current
  // says nothing about this one.
  const { data: connectors } = useListAwsConnectorsQuery();
  const ownStackIsStale = stackPredatesCompute(
    (connectors?.find((c) => c.id === identity.connector_id)?.attrs as AWSConnectorAttrs | undefined)
      ?.template_version,
  );

  if (isLoading) return <TabLoading />;

  if (!rows.length) {
    return (
      <div className="space-y-3">
        {ownStackIsStale ? (
          <InventoryNotice tone="warning" icon={<Info />}>
            <strong className="font-medium">
              This account's stack does not grant the compute reads.
            </strong>{" "}
            It deployed a CloudFormation template older than {TEMPLATE_VERSION_WITH_COMPUTE}, so
            AuthSec cannot list Lambda functions, ECS task definitions or EC2 instances here at all.
            Update the stack in AWS and scan again — this list is empty because of a missing
            permission, not because nothing runs as this identity.
          </InventoryNotice>
        ) : (
          <PhaseUnobservableNotice surface="Compute discovery" />
        )}
        <DrawerEmpty
          icon={<Boxes />}
          title="No compute runs as this identity"
          description={
            ownStackIsStale
              ? "Nothing can be attributed to this identity until the account's stack grants the compute reads."
              : "Nothing AuthSec discovered names this identity as its execution role. A role with permissions but no compute is still a governed identity — and may be an unused one."
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted-foreground">
        Compute that runs as this identity. Whether any of it is an agent is a separate judgement.
      </p>

      <div className="space-y-1.5">
        {rows.map((w) => {
          const attrs = w.attrs as AWSWorkloadAttrs;
          return (
            <div key={w.id} className="space-y-1.5 rounded-md border px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12.5px] font-medium text-foreground" title={w.name}>
                  {w.name || w.native_id}
                </span>
                <span className="flex-none rounded bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                  {RUNTIME_KIND_LABEL[w.runtime_kind]}
                </span>
              </div>
              <p className="truncate font-mono text-[10.5px] text-muted-foreground" title={w.native_id}>
                {w.native_id}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {w.region ? <span>{w.region}</span> : null}
                {attrs?.status ? <span>{attrs.status}</span> : null}
                {attrs?.foundation_model ? (
                  <span className="font-mono">{attrs.foundation_model}</span>
                ) : null}
              </div>
              {/* For an ECS task definition the execution role is NOT this
                  identity: the task role is what the application acts as, and
                  the execution role is what ECS uses to pull images. Showing
                  it unlabelled would read as a second set of permissions this
                  identity holds. */}
              {attrs?.execution_role_arn && w.runtime_kind === "ecs_task_definition" ? (
                <p className="break-all text-[10.5px] text-muted-foreground">
                  ECS execution role (pulls images; not this identity's access):{" "}
                  <span className="font-mono">{attrs.execution_role_arn}</span>
                </p>
              ) : null}
              {attrs?.instance_profile_arn ? (
                <p className="break-all text-[10.5px] text-muted-foreground">
                  Instance profile <span className="font-mono">{attrs.instance_profile_arn}</span>
                </p>
              ) : null}
              {attrs?.env_var_names?.length ? (
                <p className="text-[10.5px] text-muted-foreground">
                  {attrs.env_var_names.length} environment variable
                  {attrs.env_var_names.length === 1 ? "" : "s"} set — names only, never values
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────── Usage ─────────────────────────────────── */

export function UsageTab({ identity }: { identity: CloudIdentity }) {
  const { data, isLoading } = useListAwsUsageQuery({ identity_id: identity.id });
  // Memoised for the same reason as the identities page: `?? []` is a fresh
  // array each render and would re-run the generatedAt reduction every time.
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const neverAccessed = data?.meta.never_accessed ?? 0;

  // Every row shares one report, so the oldest generated_at is the age of the
  // whole answer. A three-week-old report is a materially different claim from
  // this morning's, and AWS can return either.
  const generatedAt = useMemo(() => {
    const stamps = rows.map((r) => r.generated_at).filter((s): s is string => !!s);
    return stamps.length ? stamps.sort()[0] : undefined;
  }, [rows]);

  if (isLoading) return <TabLoading />;

  if (!rows.length) {
    return (
      <div className="space-y-3">
        <PhaseUnobservableNotice surface="Service activity" />
        <DrawerEmpty
          icon={<Timer />}
          title="No service activity recorded"
          description="AWS reported no service-last-accessed data for this identity. A service that could not be read produces no row at all, so this is not the same as 'never used anything'."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {neverAccessed > 0 ? (
        <InventoryNotice tone="warning" icon={<Info />}>
          <strong className="font-medium">
            {neverAccessed} of {rows.length} services have never been accessed.
          </strong>{" "}
          This identity is permitted to use them and, in AWS's tracking window, never has — granted
          access that is not being exercised.
        </InventoryNotice>
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        One row per service, because that is the grain AWS reports — it can say "never touched S3",
        not "used GetObject but never PutObject".
        {generatedAt ? ` Report generated ${relativeOrUnknown(generatedAt)}.` : ""}
      </p>

      <div className="space-y-1.5">
        {rows.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[12.5px] text-foreground">{usageServiceLabel(u.service)}</p>
              <p className="text-[10.5px] text-muted-foreground">
                {USAGE_SOURCE_LABEL[u.source]}
                {u.service !== usageServiceLabel(u.service) ? ` · ${u.service}` : ""}
              </p>
            </div>
            {u.last_used_at ? (
              <span
                className="flex-none text-[11px] text-muted-foreground"
                title={absolute(u.last_used_at)}
              >
                {relativeOrUnknown(u.last_used_at)}
              </span>
            ) : (
              <StatusBadge tone="warning" dot={false}>
                Never accessed
              </StatusBadge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────── Keys ────────────────────────────────── */

export function KeysTab({ identity }: { identity: CloudIdentity }) {
  const { data: secrets, isLoading } = useListAwsSecretsQuery({ identity_id: identity.id });

  if (isLoading) return <TabLoading />;

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted-foreground">
        Key identifiers and dates only — no secret value is ever read or stored. Oldest first: for a
        credential with no expiry, age is the finding.
      </p>

      {!secrets?.length ? (
        <DrawerEmpty
          icon={<KeyRound />}
          title="No access keys"
          description={
            identity.kind === "iam_role"
              ? "Roles hold no long-lived keys — they issue temporary credentials on assume, which is why an empty list is the expected and desirable result here."
              : "This user has no access keys recorded."
          }
        />
      ) : (
        <div className="space-y-1.5">
          {secrets.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-mono text-[11.5px] text-foreground">{s.native_id}</p>
                <p className="text-[11px] text-muted-foreground">
                  Created <span title={absolute(s.created_at)}>{relativeOrUnknown(s.created_at)}</span>{" "}
                  · last used{" "}
                  <span title={absolute(s.last_used_at)}>{relativeOrUnknown(s.last_used_at)}</span>
                </p>
              </div>
              <StatusBadge tone={s.status === "active" ? "success" : "muted"}>
                {s.status === "active" ? "Active" : "Inactive"}
              </StatusBadge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── Overview ───────────────────────────────── */

export function OverviewTab({ identity }: { identity: CloudIdentity }) {
  const attrs = identity.attrs as { path?: string; description?: string; unique_id?: string; max_session_duration?: number; tags?: Record<string, string>; has_trust_policy?: boolean };
  const tags = Object.entries(attrs?.tags ?? {});

  return (
    <div className="space-y-6">
      <section>
        <DetailGrid>
          <DetailRow label="Kind" value={identity.kind === "iam_role" ? "IAM role" : "IAM user"} />
          <DetailRow
            label="Enabled"
            value={identity.enabled ? "Yes" : "No"}
          />
          <DetailRow
            label="Created in AWS"
            value={
              <span title={absolute(identity.created_at)}>
                {relativeOrUnknown(identity.created_at)}
              </span>
            }
          />
          {/* Distinct from cloud_usage's null, which means "never". This one
              means AWS did not report a date at all. */}
          <DetailRow
            label="Last used"
            value={
              <span title={absolute(identity.last_used_at)}>
                {relativeOrUnknown(identity.last_used_at)}
              </span>
            }
          />
          {attrs?.path && attrs.path !== "/" ? (
            <DetailRow label="IAM path" value={attrs.path} mono />
          ) : null}
          {attrs?.max_session_duration ? (
            <DetailRow
              label="Max session"
              value={`${Math.round(attrs.max_session_duration / 60)} min`}
            />
          ) : null}
          {attrs?.unique_id ? (
            <DetailRow label="AWS unique id" value={attrs.unique_id} mono full />
          ) : null}
          {attrs?.description ? (
            <DetailRow label="Description" value={attrs.description} full />
          ) : null}
        </DetailGrid>
      </section>

      {tags.length ? (
        <section>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Tags
          </p>
          <div className="flex flex-wrap gap-1">
            {tags.map(([k, v]) => (
              <span
                key={k}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground"
              >
                {k}
                {v ? `=${v}` : ""}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            IAM tags are metadata by construction, so names and values are both kept — they are
            where an ownership hint usually lives.
          </p>
        </section>
      ) : null}
    </div>
  );
}
