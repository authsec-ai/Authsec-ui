/**
 * AWS resource detail — one discovered resource, and the identities that reach
 * it.
 *
 * ── Why this drawer performs a join the API will not ────────────────────────
 *
 * `cloud_resource` has no `identity_id` column, and `/aws/resources` accepts no
 * `identity_id` filter. That is deliberate, not a gap — the repository says so
 * itself: "a resource is reached through cloud_permission, not owned by one
 * identity". Ownership runs `cloud_permission.resource_id → cloud_resource`, so
 * many identities point at one resource.
 *
 * "Who can reach this bucket" is therefore a reverse join, and it is exactly
 * the join PermissionsTab already does in the forward direction: there,
 * resources are resolved FROM permissions scoped by identity; here, identities
 * are resolved FROM permissions scoped by connector. Same two endpoints, same
 * client-side Map, opposite direction.
 *
 * ── What this list can and cannot claim ─────────────────────────────────────
 *
 * Only a statement whose `scope_kind` is "resource" carries a `resource_id`. An
 * identity holding an account-wide or prefix grant may well reach this resource
 * and will NOT appear here, because that statement names no single resource by
 * design. That is a scope limit of the join, not a truncation, and the two are
 * reported separately below — conflating them would point a reader at a filter
 * that cannot close the gap.
 *
 * An explicit Deny is authoritative in IAM: it beats any Allow, from any
 * policy. So a deny statement naming this resource does not weaken an
 * identity's reach, it removes it — those identities get their own section
 * rather than a pill inside the reach list, where the heading would assert the
 * opposite of what the row means.
 *
 * ── Two different denies, and why they are shown apart ──────────────────────
 *
 * The "explicitly denied" section below is IDENTITY-side: a statement attached
 * to a role or user that names this resource with effect Deny.
 *
 * The "Resource policy" row in the facts grid is RESOURCE-side: the bucket's or
 * key's own policy, read from `s3:GetBucketPolicy` / `kms:GetKeyPolicy` and
 * carried as an observation. It can block an identity that has every
 * identity-side Allow and appears nowhere in the lists below — which is exactly
 * why its absence used to make this console overstate access.
 *
 * Its three states are deliberate: deny, no deny, and NOT READ. A resource
 * whose policy was never read renders as unknown, never as "no deny".
 */

import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { Info, ShieldQuestion } from "lucide-react";

import { CloudPill } from "../CloudPill";
import { RightDrawer } from "@/components/primitives/RightDrawer";
import { DrawerPrevNext } from "@/components/primitives/DrawerPrevNext";
import {
  CopyField,
  DetailGrid,
  DetailRow,
  DrawerBody,
  DrawerEmpty,
  DrawerFooter,
  DrawerHeader,
  DrawerSection,
} from "@/components/console/detail";
import {
  useListAwsIdentityPageQuery,
  useListAwsObservationsQuery,
  useListAwsPermissionsQuery,
  AWS_DISCOVERY_MAX_LIMIT,
  type CloudConnector,
  type CloudIdentity,
  type CloudPermission,
  type CloudResource,
} from "@/app/api/cloudDiscoveryApi";
import {
  accountLabel,
  EFFECT_LABEL,
  EFFECT_TONE,
  IDENTITY_KIND_LABEL,
  resourceKindLabel,
  SENSITIVITY_LABEL,
  SENSITIVITY_TONE,
} from "./awsInventoryLabels";
import { InventoryNotice, TruncationLine } from "./AWSInventoryNotices";
import { truncationOf } from "./awsInventoryState";
import { isResourcePolicy, resourcePolicyFacts } from "./awsObservationFacts";

/** One identity's claim on this resource. `identity` is null when the identity
 * read truncated before reaching it — the statement is still real, only the
 * name is missing, which is why the row is kept rather than dropped. */
interface Reach {
  identityId: string;
  identity: CloudIdentity | null;
  statements: CloudPermission[];
}

/** Mono chips for IAM action strings. Wraps rather than truncating: a clipped
 * action list is a misleading one, the same reasoning as PermissionsTab's. */
function ActionChips({ actions }: { actions: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {actions.map((a) => (
        <span
          key={a}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
        >
          {a}
        </span>
      ))}
    </div>
  );
}

/** One identity card: who it is, and each statement of its that named this
 * resource. Shared by the reach list and the denied list so the two cannot
 * drift apart visually. */
function ReachRow({ reach }: { reach: Reach }) {
  return (
    <div className="space-y-2 rounded-md border px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 truncate text-xs font-medium text-foreground">
            {reach.identity ? reach.identity.name || reach.identity.native_id : "Unresolved identity"}
          </p>
          {reach.identity ? (
            <span className="flex-none rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {IDENTITY_KIND_LABEL[reach.identity.kind]}
            </span>
          ) : null}
        </div>
        <p
          className="truncate font-mono text-[11px] text-muted-foreground"
          title={reach.identity?.native_id ?? reach.identityId}
        >
          {reach.identity?.native_id ?? reach.identityId}
        </p>
      </div>

      {reach.statements.map((p) => (
        <div key={p.id} className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <CloudPill tone={EFFECT_TONE[p.effect]}>{EFFECT_LABEL[p.effect]}</CloudPill>
            {p.sensitivity !== "low" ? (
              <CloudPill tone={SENSITIVITY_TONE[p.sensitivity]} dot={false}>
                {SENSITIVITY_LABEL[p.sensitivity]} sensitivity
              </CloudPill>
            ) : null}
          </div>
          <ActionChips actions={p.actions} />
        </div>
      ))}
    </div>
  );
}

function relativeWithTitle(iso: string) {
  return (
    <span title={new Date(iso).toLocaleString()}>
      {formatDistanceToNow(new Date(iso), { addSuffix: true })}
    </span>
  );
}

export function AWSResourceDrawer({
  resource,
  connector,
  onClose,
  onPrev,
  onNext,
  index,
  total,
}: {
  resource: CloudResource | null;
  /** The account this resource belongs to, already resolved by the page. */
  connector?: CloudConnector;
  onClose: () => void;
  /** Prev/next step through the table's current page without closing. Omit
   * both to hide the pager. */
  onPrev?: () => void;
  onNext?: () => void;
  index?: number;
  total?: number;
}) {
  const open = resource !== null;
  const showPager =
    onPrev !== undefined && onNext !== undefined && index !== undefined && total !== undefined;

  // Both skip-gated on the drawer being open, so a closed drawer costs nothing.
  // Scoped to this resource's own connector, which is as narrow as the API
  // allows — `/aws/permissions` has no `resource_id` filter. The args are
  // identical for every resource in one account, so RTK Query serves the same
  // cache entry: opening ten drawers in an account is one request, not ten.
  const permissionsQuery = useListAwsPermissionsQuery(
    { connector_id: resource?.connector_id, limit: AWS_DISCOVERY_MAX_LIMIT },
    { skip: !open },
  );
  const identitiesQuery = useListAwsIdentityPageQuery(
    { connector_id: resource?.connector_id, limit: AWS_DISCOVERY_MAX_LIMIT },
    { skip: !open },
  );

  // The resource's own policy. Filtered by resource_id only, with no
  // `source_api`, so one query covers both the S3 bucket-policy read and the
  // KMS key-policy read rather than firing one per service.
  const policyQuery = useListAwsObservationsQuery(
    { resource_id: resource?.id, limit: AWS_DISCOVERY_MAX_LIMIT },
    { skip: !open },
  );

  /** `true` deny, `false` no deny, `undefined` NOT READ.
   *
   * The third state is load-bearing: a resource whose policy was never read
   * must not render as "no deny", because that is the overstatement this
   * surface exists to remove. Absence of evidence is shown as absence. */
  const policyHasDeny = useMemo<boolean | undefined>(() => {
    // `currentData`, NOT `data`. RTK Query keeps `data` at the last successful
    // result across an arg change, and this drawer stays mounted while the
    // pager steps between resources. Reading `data` would render the PREVIOUS
    // resource's policy against the new one's ARN until the refetch landed —
    // showing "Contains an explicit Deny" on a resource that has none, which is
    // the precise false claim this surface exists to prevent. `currentData` is
    // undefined while the new arg is in flight, which renders as "Not read".
    const policies = (policyQuery.currentData?.rows ?? []).filter(isResourcePolicy);
    if (!policies.length) return undefined;

    // Only the NEWEST observation per source API describes the policy as it
    // stands. `content_hash` is part of the dedupe key, so an edited policy
    // writes a new row and the previous one survives — observations are
    // durable evidence, not a reconciled inventory. Reading `.some()` across
    // every row would keep reporting a deny that was removed months ago.
    // Rows arrive `observed_at DESC`, so the first seen per source is current.
    const newest = new Map<string, (typeof policies)[number]>();
    for (const o of policies) if (!newest.has(o.source_api)) newest.set(o.source_api, o);
    return [...newest.values()].some((o) => resourcePolicyFacts(o).hasDeny === true);
  }, [policyQuery.currentData]);

  const identityById = useMemo(
    () => new Map((identitiesQuery.data?.rows ?? []).map((i) => [i.id, i])),
    [identitiesQuery.data],
  );

  /**
   * Identities split into those that reach this resource and those an explicit
   * Deny stops.
   *
   * In IAM an explicit Deny is authoritative — it beats any Allow, from any
   * policy. So an identity with a deny statement naming this resource does NOT
   * reach it, and listing it under "Identities that reach this resource" with a
   * Deny pill beside it would state the opposite of the truth in the one place
   * a reader is most likely to skim. The deny moves the identity out of the
   * reach list into its own group instead.
   */
  const { reaching, denied } = useMemo(() => {
    const empty = { reaching: [] as Reach[], denied: [] as Reach[] };
    if (!resource) return empty;

    const byIdentity = new Map<string, CloudPermission[]>();
    for (const p of permissionsQuery.data?.rows ?? []) {
      if (p.resource_id !== resource.id) continue;
      const list = byIdentity.get(p.identity_id);
      if (list) list.push(p);
      else byIdentity.set(p.identity_id, [p]);
    }

    const all: Reach[] = [...byIdentity.entries()].map(([identityId, statements]) => ({
      identityId,
      identity: identityById.get(identityId) ?? null,
      statements,
    }));
    const byName = (a: Reach, b: Reach) =>
      (a.identity?.name ?? a.identityId).localeCompare(b.identity?.name ?? b.identityId);

    return {
      reaching: all
        .filter(
          (r) =>
            r.statements.some((p) => p.effect === "allow") &&
            !r.statements.some((p) => p.effect === "deny"),
        )
        .sort(byName),
      denied: all.filter((r) => r.statements.some((p) => p.effect === "deny")).sort(byName),
    };
  }, [permissionsQuery.data, identityById, resource]);

  const permissionsTruncated = permissionsQuery.data
    ? truncationOf(permissionsQuery.data).truncated
    : false;
  // Only claim paging as the cause when paging actually fell short. An identity
  // id with no name also happens when the row survives a scan that removed the
  // identity, and telling a reader to worry about truncation then sends them
  // after the wrong thing.
  const identitiesTruncated = identitiesQuery.data
    ? truncationOf(identitiesQuery.data).truncated
    : false;
  const unresolved = [...reaching, ...denied].filter((r) => r.identity === null).length;
  const loading = permissionsQuery.isLoading || identitiesQuery.isLoading;

  return (
    <RightDrawer
      open={open}
      onClose={onClose}
      width={480}
      ariaTitle={resource ? `AWS resource ${resource.name || resource.native_id}` : "AWS resource"}
      ariaDescription="The ARN, type and sensitivity of one discovered AWS resource, and the identities whose permission statements name it."
    >
      {!resource ? null : (
        <>
          <DrawerHeader
            title={resource.name || resource.native_id}
            subtitle={resourceKindLabel(resource.kind)}
            badge={
              // Two independent badges. A resource-policy deny is the more
              // urgent of the two, so it leads.
              <span className="flex flex-wrap items-center gap-1.5">
                {policyHasDeny === true ? (
                  <CloudPill tone="danger" dot={false}>
                    Policy denies
                  </CloudPill>
                ) : null}
                {/* Same idiom as PermissionsTab: a "low" badge says nothing, so
                    it is not rendered at all. */}
                {resource.sensitivity !== "low" ? (
                  <CloudPill tone={SENSITIVITY_TONE[resource.sensitivity]} dot={false}>
                    {SENSITIVITY_LABEL[resource.sensitivity]} sensitivity
                  </CloudPill>
                ) : null}
              </span>
            }
          />

          <DrawerBody>
            <DrawerSection label="Resource">
              <DetailGrid>
                <CopyField label="ARN" value={resource.native_id} />
                <DetailRow label="Type" value={resourceKindLabel(resource.kind)} />
                <DetailRow label="Sensitivity" value={SENSITIVITY_LABEL[resource.sensitivity]} />
                {/* The resource's OWN policy, not the identity-side statements
                    below. An explicit Deny here blocks access no identity-side
                    Allow can restore, which is why it sits in the facts grid
                    rather than in the reach list. */}
                <DetailRow
                  label="Resource policy"
                  value={
                    policyHasDeny === undefined ? (
                      <span className="text-muted-foreground">Not read</span>
                    ) : policyHasDeny ? (
                      <CloudPill tone="danger" dot={false}>
                        Contains an explicit Deny
                      </CloudPill>
                    ) : (
                      "No explicit Deny"
                    )
                  }
                />
                <DetailRow label="Account" value={connector ? accountLabel(connector) : "—"} />
                <DetailRow label="First seen" value={relativeWithTitle(resource.first_seen_at)} />
                <DetailRow label="Last seen" value={relativeWithTitle(resource.last_seen_at)} />
              </DetailGrid>
            </DrawerSection>

            <DrawerSection label="Identities that reach this resource">
              {/* Shown always, NOT conditional on truncation: it describes what
                  the join can see at all, which loading more rows never
                  changes. */}
              <InventoryNotice tone="info" icon={<Info />}>
                Only statements that name this resource directly are counted. An identity with an
                account-wide or prefix grant may also reach it without appearing here — that
                statement names no single resource, by design.
              </InventoryNotice>

              {loading ? (
                <p className="pt-3 text-sm text-muted-foreground">Loading…</p>
              ) : permissionsQuery.isError ? (
                // A failed read is not "nothing names this resource".
                <p className="pt-3 text-sm text-muted-foreground">
                  Could not load the permission statements, so who can reach this resource is unknown — this is not a finding.{" "}
                  <button type="button" className="font-medium text-(--color-primary-text) hover:underline" onClick={() => void permissionsQuery.refetch()}>
                    Retry
                  </button>
                </p>
              ) : reaching.length === 0 ? (
                <div className="pt-3">
                  {/* Three titles, because the same empty list means three
                      different things. Only the last is a finding. */}
                  <DrawerEmpty
                    icon={<ShieldQuestion />}
                    title={
                      permissionsTruncated
                        ? "No match in the statements that loaded"
                        : denied.length > 0
                          ? "Every statement naming this resource is a Deny"
                          : "No discovered statement names this resource"
                    }
                    description={
                      permissionsTruncated
                        ? "This account holds more permission statements than one read collects, so a statement naming this resource may simply not have loaded. This is not a finding."
                        : denied.length > 0
                          ? "The identities below are explicitly denied it. Nothing discovered grants access to this resource by name."
                          : "No granted statement in this account names this resource directly. An identity may still reach it through an account-wide or prefix grant."
                    }
                  />
                </div>
              ) : (
                <div className="space-y-2 pt-3">
                  {reaching.map((reach) => (
                    <ReachRow key={reach.identityId} reach={reach} />
                  ))}
                </div>
              )}

              {/* Two independent shortfalls, reported separately. A truncated
                  PERMISSION read means identities may be missing from this list
                  entirely; a truncated IDENTITY read means they are listed but
                  could not be named. Same symptom, different remedy. */}
              {permissionsQuery.data ? (
                <TruncationLine
                  truncation={truncationOf(permissionsQuery.data)}
                  noun="policy statements"
                />
              ) : null}
              {unresolved > 0 ? (
                <p className="pt-1 text-[11px] text-(--color-warning-text)">
                  {unresolved === 1
                    ? "1 identity could not be named"
                    : `${unresolved} identities could not be named`}
                  {identitiesTruncated
                    ? " — this account holds more identities than one read collects."
                    : " — the statement names an identity that is not in the discovered set, which usually means it was removed since the scan that recorded the grant."}
                </p>
              ) : null}
            </DrawerSection>

            {/* Its own section, not a pill inside the list above. An explicit
                Deny is authoritative in IAM, so these identities are the
                opposite of "reaching" and must not be read as a weaker form of
                it. */}
            {!loading && !permissionsQuery.isError && denied.length > 0 ? (
              <DrawerSection label="Identities explicitly denied this resource">
                <InventoryNotice tone="info" icon={<Info />}>
                  An explicit Deny beats every Allow, from any policy. These identities cannot
                  reach this resource even if another statement grants it.
                </InventoryNotice>
                <div className="space-y-2 pt-3">
                  {denied.map((reach) => (
                    <ReachRow key={reach.identityId} reach={reach} />
                  ))}
                </div>
              </DrawerSection>
            ) : null}
          </DrawerBody>

          <DrawerFooter>
            <span className="text-[11px] text-muted-foreground">
              Discovered because a permission statement named it
            </span>
            {/* An auto margin survives a wrapping footer; a flex-1 spacer would
                eat a row. Same as the identity drawer. */}
            <div className="ml-auto" />
            {showPager ? (
              <DrawerPrevNext
                onPrev={onPrev}
                onNext={onNext}
                hasPrev={index > 0}
                hasNext={index < total - 1}
                currentIndex={index}
                total={total}
              />
            ) : null}
          </DrawerFooter>
        </>
      )}
    </RightDrawer>
  );
}
