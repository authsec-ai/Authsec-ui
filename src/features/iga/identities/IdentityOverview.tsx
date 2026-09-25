/** Identity › Overview: what it is, where, and how much we know (§2.14.5). */

import { Link } from "react-router-dom";

import { refId, type GraphRef, type IdentityDetail } from "@/app/api/igaGraphApi";
import { CopyField, DetailGrid, DetailRow, DrawerSection } from "@/components/console/detail";
import { DecisionBanner, StatusBadge } from "@/components/console/status";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";

import { IDENTITY_KIND_LABEL, accountLabel, agoText, countText, dayText } from "../shared/labels";


export function IdentityOverview({ identity: i }: { identity: IdentityDetail }) {
  const kind = IDENTITY_KIND_LABEL[i.kind];
  const attrs = i.provider_attrs;
  const connector = i.sources[0]?.integration;
  const connectorId = connector ? refId(connector as GraphRef) : null;
  const tags = Object.entries(attrs.tags ?? {});

  return (
    <div className="space-y-4">
      {i.lifecycle === "retired" ? (
        <DecisionBanner
          tone="neutral"
          title={`${i.name} is no longer in the latest scan`}
          body={`It was last confirmed ${dayText(i.last_confirmed_at)}.${i.retired_reason ? ` Reason: ${i.retired_reason.replace(/_/g, " ")}.` : ""}`}
        />
      ) : i.state === "stale" ? (
        <DecisionBanner
          tone="warning"
          title={`Last confirmed ${agoText(i.last_confirmed_at)}`}
          body="The latest scan did not reconfirm this identity. What is shown is what was last collected."
        />
      ) : null}

      <TableCard>
        <CardContent className="space-y-6">
          <DrawerSection label="What it is">
            <DetailGrid>
              <DetailRow label="Kind" value={kind} />
              <DetailRow
                label="Account"
                value={
                  <>
                    {accountLabel(i.account)}
                    {i.account ? <span className="ml-1 font-mono text-xs text-(--color-text-muted)">{i.account.id}</span> : null}
                  </>
                }
              />
              {attrs.path ? <DetailRow label="Path" value={attrs.path} mono /> : null}
              <DetailRow
                label="Run as by"
                value={
                  i.kind === "iam_group"
                    ? "Groups are not run as"
                    : i.used_by_count.value === 0
                      ? "No workload is configured to run as it"
                      : countText(i.used_by_count, "workload", "workloads")
                }
              />
              <CopyField label="ARN" value={i.arn} />
            </DetailGrid>
          </DrawerSection>

          {attrs.permissions_boundary_arn || attrs.trust_has_deny || attrs.trust_has_not_principal ? (
            <DrawerSection label="Restrictions (listed, not evaluated)">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {attrs.permissions_boundary_arn ? (
                  <li>
                    Permissions boundary <span className="break-all font-mono text-xs">{attrs.permissions_boundary_arn}</span>{" "}
                    may limit what its policies grant.
                  </li>
                ) : null}
                {attrs.trust_has_deny ? <li>Its trust policy has a Deny statement, which may exclude some principals.</li> : null}
                {attrs.trust_has_not_principal ? (
                  <li>Its trust policy uses NotPrincipal, so who it admits could not be resolved.</li>
                ) : null}
              </ul>
            </DrawerSection>
          ) : null}

          {i.credentials?.length ? (
            <DrawerSection label="Access keys">
              <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
                {i.credentials.map((c) => (
                  <li key={c.key_id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                    <span className="font-mono text-xs">{c.key_id}</span>
                    <StatusBadge tone={c.status === "Active" ? "neutral" : "warning"}>{c.status}</StatusBadge>
                    <span className="text-xs text-(--color-text-muted)">Created {dayText(c.created_at)}</span>
                    <span className="ml-auto text-xs text-(--color-text-muted)">
                      {c.last_used_at
                        ? `Last authenticated attempt ${agoText(c.last_used_at)}`
                        : "No attempt reported in the available tracking period"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-(--color-text-muted)">Key ids only. Secrets are never collected.</p>
            </DrawerSection>
          ) : null}

          <DrawerSection
            label="How we know"
            action={
              <Link
                to={connectorId ? `/iga/cloud/identities?account=${encodeURIComponent(connectorId)}` : "/iga/cloud/identities"}
                className="text-xs font-semibold text-(--color-primary-text) hover:underline"
              >
                Raw inventory
              </Link>
            }
          >
            <DetailGrid>
              <DetailRow label="First seen" value={dayText(i.first_seen_at)} />
              <DetailRow label="Last confirmed" value={agoText(i.last_confirmed_at)} />
              <DetailRow
                full
                label="Identity continuity"
                value={
                  i.continuity === "immutable"
                    ? `Tracked by the id AWS assigns at creation${i.immutable_key ? ` (${i.immutable_key})` : ""}, so an ${kind} deleted and recreated under the same name is a new identity.`
                    : "Same name only. AWS gives this identity no creation id we can read, so one recreated under this name looks the same to us."
                }
              />
              {tags.length ? (
                <DetailRow
                  full
                  label="Tags"
                  value={
                    <span className="flex flex-wrap gap-1.5">
                      {tags.map(([k, v]) => (
                        <span key={k} className="rounded bg-(--color-surface-subtle) px-1.5 py-0.5 font-mono text-[11px]">
                          {k}={String(v)}
                        </span>
                      ))}
                    </span>
                  }
                />
              ) : null}
            </DetailGrid>
          </DrawerSection>
        </CardContent>
      </TableCard>
    </div>
  );
}
