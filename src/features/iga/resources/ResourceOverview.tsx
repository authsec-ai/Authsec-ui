/**
 * Resource › Overview: its kind and what we know about it (§2.14.12). An
 * exact reference is never called discovered; a selector is never called a
 * resource; an S3 object selector is never rendered as its bucket.
 */


import type { ResourceDetail } from "@/app/api/igaGraphApi";
import { DecisionBanner, StatusBadge } from "@/components/console/status";

import { RESOURCE_KIND_LABEL, RESOURCE_KIND_NOTE, accountLabel, agoText, dayText, countText } from "../shared/labels";
import { referenceStatusLabel } from "../graph/v2/edgeClass";
import { CopyValue, Fact, Facts, Panel } from "../shared/components/Panel";


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
      {/* Panels flow into two balanced columns on a wide screen. */}
      <div className="gap-4 lg:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
          <Panel title="What it is">
            <Facts>
              <Fact label="Kind">{
                  <span className="flex flex-col gap-1">
                    <span>
                      <StatusBadge tone={r.kind === "external" ? "warning" : "neutral"}>{RESOURCE_KIND_LABEL[r.kind]}</StatusBadge>
                    </span>
                    <span className="text-(--color-text-muted)">{RESOURCE_KIND_NOTE[r.kind]}</span>
                  </span>
                }</Fact>
              {r.reference_status ? (
                <Fact label="Reference status">
                  <StatusBadge tone="neutral">{referenceStatusLabel(r.reference_status)}</StatusBadge>
                </Fact>
              ) : null}
              {r.native_kind ? <Fact label="Native kind" mono>{r.native_kind}</Fact> : null}
              {r.type !== "unknown" ? <Fact label="Type" mono>{r.type}</Fact> : null}
              {r.service ? <Fact label="Service" mono>{r.service}</Fact> : null}
              <Fact label="Account">{
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
                }</Fact>
              <Fact label="Region">{r.region ?? "Region not stated"}</Fact>
              <Fact label="Existence">Not verified. Nothing enumerates resources in this phase.</Fact>
              <Fact label={r.kind === "selector" ? "Pattern" : "ARN"}><CopyValue value={r.text} /></Fact>
            </Facts>
          </Panel>

          <Panel title="Declared access">
            <Facts>
              <Fact label="Named by">{countText(r.named_by_count, "statement", "statements")}</Fact>
              <Fact label="Excluded by">{
                  !r.excluded_by_count || r.excluded_by_count.value === 0
                    ? "No statement"
                    : countText(r.excluded_by_count, "statement (NotResource)", "statements (NotResource)")
                }</Fact>
              <Fact label="Resource policy">{
                  !policy.read
                    ? "Not read. Whether it has its own policy is unknown."
                    : policy.has_deny === true
                      ? "Read. It has a Deny statement, which may block access that identity-side grants declare. Not combined with them."
                      : policy.has_deny === false
                        ? "Read. It has no Deny statement. Its Allow statements are not combined with identity-side grants."
                        : "Read, but whether it has a Deny statement could not be determined."
                }</Fact>
            </Facts>
          </Panel>

          <Panel title="How we know">
            <Facts>
              <Fact label="Last confirmed">{agoText(r.last_confirmed_at)}</Fact>
              <Fact label="Found in">{
                  r.sources.length
                    ? r.sources.map((s) => `${accountLabel(s.account)}${s.state !== "current" ? ` (${s.state})` : ""}`).join(", ")
                    : "No current source"
                }</Fact>
            </Facts>
          </Panel>
      </div>
    </div>
  );
}
