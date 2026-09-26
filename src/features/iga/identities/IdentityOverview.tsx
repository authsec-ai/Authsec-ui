/** Identity › Overview: what it is, where, and how much we know (§2.14.5). */

import { Link } from "react-router-dom";

import { refId, type GraphRef, type IdentityDetail } from "@/app/api/igaGraphApi";
import { DecisionBanner, StatusBadge } from "@/components/console/status";

import { DIRECT_BINDINGS_LABEL, DIRECT_BINDINGS_MEANING, IDENTITY_KIND_LABEL, accountWithId, agoText, countText, dayText } from "../shared/labels";
import { CopyValue, Fact, Facts, Panel } from "../shared/components/Panel";


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

      {/* Panels flow into two balanced columns on a wide screen. */}
      <div className="gap-4 lg:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
          <Panel title="What it is">
            <Facts>
              <Fact label="Kind">{kind}</Fact>
              <Fact label="Account">{
                  accountWithId(i.account) ?? "Not known"
                }</Fact>
              {attrs.path ? <Fact label="Path" mono>{attrs.path}</Fact> : null}
              <Fact label={DIRECT_BINDINGS_LABEL}>{
                  i.kind === "iam_group" ? (
                    "Groups are not run as"
                  ) : (
                    <span title={DIRECT_BINDINGS_MEANING}>
                      {i.used_by_count.value === 0 ? "None" : countText(i.used_by_count, "workload", "workloads")}
                      <span className="block text-xs text-(--color-text-muted)">{DIRECT_BINDINGS_MEANING}</span>
                    </span>
                  )
                }</Fact>
              <Fact label="ARN"><CopyValue value={i.arn} /></Fact>
            </Facts>
          </Panel>

          {attrs.permissions_boundary_arn || attrs.trust_has_deny || attrs.trust_has_not_principal ? (
            <Panel title="Restrictions (listed, not evaluated)">
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
            </Panel>
          ) : null}

          {i.credentials?.length ? (
            <Panel title="Access keys">
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
            </Panel>
          ) : null}

          <Panel title="How we know"
            actions={
              <Link
                to={connectorId ? `/iga/cloud/identities?account=${encodeURIComponent(connectorId)}` : "/iga/cloud/identities"}
                className="font-medium text-(--color-primary-text) hover:underline"
              >
                Raw inventory
              </Link>
            }
          >
            <Facts>
              <Fact label="First seen">{dayText(i.first_seen_at)}</Fact>
              <Fact label="Last confirmed">{agoText(i.last_confirmed_at)}</Fact>
              <Fact label="Identity continuity">{
                  i.continuity === "immutable"
                    ? `Tracked by the id AWS assigns at creation${i.immutable_key ? ` (${i.immutable_key})` : ""}, so an ${kind} deleted and recreated under the same name is a new identity.`
                    : "Same name only. AWS gives this identity no creation id we can read, so one recreated under this name looks the same to us."
                }</Fact>
              {tags.length ? (
                <Fact label="Tags">{
                    <span className="flex flex-wrap gap-1.5">
                      {tags.map(([k, v]) => (
                        <span key={k} className="rounded bg-(--color-surface-subtle) px-1.5 py-0.5 font-mono text-[11px]">
                          {k}={String(v)}
                        </span>
                      ))}
                    </span>
                  }</Fact>
              ) : null}
            </Facts>
          </Panel>
      </div>
    </div>
  );
}
