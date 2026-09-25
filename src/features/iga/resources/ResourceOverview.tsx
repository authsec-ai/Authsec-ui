/**
 * Resource › Overview: its kind and what we know about it (§2.14.12). An
 * exact reference is never called discovered; a selector is never called a
 * resource; an S3 object selector is never rendered as its bucket.
 */


import type { ResourceDetail } from "@/app/api/igaGraphApi";
import { CopyField, DetailGrid, DetailRow, DrawerSection } from "@/components/console/detail";
import { DecisionBanner, StatusBadge } from "@/components/console/status";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";

import { RESOURCE_KIND_LABEL, RESOURCE_KIND_NOTE, accountLabel, agoText, dayText, countText } from "../shared/labels";


export function ResourceOverview({ resource: r }: { resource: ResourceDetail }) {
  const policy = r.resource_policy;
  return (
    <div className="space-y-4">
      {r.lifecycle === "retired" ? (
        <DecisionBanner
          tone="neutral"
          title="No longer named by any current statement"
          body={`It was last confirmed ${dayText(r.last_confirmed_at)}.`}
        />
      ) : null}
      <TableCard>
        <CardContent className="space-y-6">
          <DrawerSection label="What it is">
            <DetailGrid>
              <DetailRow
                full
                label="Kind"
                value={
                  <span className="flex flex-col gap-1">
                    <span>
                      <StatusBadge tone={r.kind === "external" ? "warning" : "neutral"}>{RESOURCE_KIND_LABEL[r.kind]}</StatusBadge>
                    </span>
                    <span className="text-(--color-text-muted)">{RESOURCE_KIND_NOTE[r.kind]}</span>
                  </span>
                }
              />
              {r.type !== "unknown" ? <DetailRow label="Type" value={r.type} mono /> : null}
              {r.service ? <DetailRow label="Service" value={r.service} mono /> : null}
              <DetailRow
                label="Account"
                value={
                  r.account ? (
                    <>
                      {accountLabel(r.account)}
                      <span className="ml-1 font-mono text-xs text-(--color-text-muted)">{r.account.id}</span>
                      {!r.account.connected ? <span className="block text-xs text-(--color-warning-text)">Not a connected account</span> : null}
                    </>
                  ) : (
                    <>
                      Unknown account
                      <span className="block text-xs text-(--color-text-muted)">
                        The ARN states no account. It is not assumed to be the grantor's.
                      </span>
                    </>
                  )
                }
              />
              <DetailRow label="Region" value={r.region ?? "Region not stated"} />
              <DetailRow label="Existence" value="Not verified. Nothing enumerates resources in this phase." />
              <CopyField label={r.kind === "selector" ? "Pattern" : "ARN"} value={r.text} />
            </DetailGrid>
          </DrawerSection>

          <DrawerSection label="Declared access">
            <DetailGrid>
              <DetailRow label="Named by" value={countText(r.named_by_count, "statement", "statements")} />
              <DetailRow
                label="Excluded by"
                value={r.excluded_by_count?.value ? countText(r.excluded_by_count, "statement (NotResource)", "statements (NotResource)") : "No statement"}
              />
              <DetailRow
                full
                label="Resource policy"
                value={
                  !policy.read
                    ? "Not read. Whether it has its own policy is unknown."
                    : policy.has_deny === true
                      ? "Read. It has a Deny statement, which may block access that identity-side grants declare. Not combined with them."
                      : policy.has_deny === false
                        ? "Read. It has no Deny statement. Its Allow statements are not combined with identity-side grants."
                        : "Read, but whether it has a Deny statement could not be determined."
                }
              />
            </DetailGrid>
          </DrawerSection>

          <DrawerSection label="How we know">
            <DetailGrid>
              <DetailRow label="Last confirmed" value={agoText(r.last_confirmed_at)} />
              <DetailRow
                full
                label="Found in"
                value={
                  r.sources.length
                    ? r.sources.map((s) => `${accountLabel(s.account)}${s.state !== "current" ? ` (${s.state})` : ""}`).join(", ")
                    : "No current source"
                }
              />
            </DetailGrid>
          </DrawerSection>
        </CardContent>
      </TableCard>
    </div>
  );
}
