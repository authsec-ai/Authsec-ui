/**
 * "What it can do": a workload's declared access, one line per service —
 * "CloudWatch Logs · Write", with a Broad badge where the grant is not limited
 * to anything named.
 *
 * The same card is the Overview's answer to "what can it reach?" and the
 * Identity tab's "what this identity grants". How the levels are inferred
 * (declared, from action names, not evaluated) is said once, in the title's
 * info tooltip, not under every list.
 */

import { Link } from "react-router-dom";

import { LEVEL_LABEL, LEVEL_MEANING, broadText, countWord, serviceLabel, type AccessLevel, type ServiceAccess } from "../shared/access";
import { IgaBadge } from "../shared/components/IgaBadge";
import { InfoTip } from "../shared/components/InfoTip";
import { Panel } from "../shared/components/Panel";
import type { WorkloadAccess } from "../shared/useWorkloadAccess";

/** "Full access" reads as a sentence; in a "Service · Level" line it is "Full". */
const SHORT_LEVEL: Record<AccessLevel, string> = { ...LEVEL_LABEL, full: "Full" };

const BROAD_MEANING = "Not limited to a named resource (a wildcard over every resource of a type), or every action of the service.";

/** The levels, defined once: the title's tooltip is the card's legend. */
const LEGEND: { term: string; meaning: string }[] = [
  { term: LEVEL_LABEL.read, meaning: LEVEL_MEANING.read },
  { term: LEVEL_LABEL.write, meaning: LEVEL_MEANING.write },
  { term: LEVEL_LABEL.full, meaning: LEVEL_MEANING.full },
  { term: LEVEL_LABEL.other, meaning: LEVEL_MEANING.other },
  { term: "Broad", meaning: BROAD_MEANING },
];

function Row({ s }: { s: ServiceAccess }) {
  const broad = s.broad ? broadText(s) : null;
  return (
    <li className="flex min-h-10 items-center gap-3 px-4 py-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] text-(--color-text)">
          <span className="font-medium">{serviceLabel(s.service)}</span>
          <span aria-hidden="true" className="px-1.5 text-(--color-text-muted)">
            ·
          </span>
          <span className="text-(--color-text-secondary)" title={LEVEL_MEANING[s.level]}>
            {SHORT_LEVEL[s.level]}
          </span>
        </span>
        {/* What "Broad" means here, said rather than left to a badge. */}
        {broad ? <span className="text-xs leading-5 text-(--color-warning-text)">Broad: {broad}</span> : null}
      </span>
      {s.broad ? (
        <IgaBadge tone="warning" title={BROAD_MEANING}>
          Broad
        </IgaBadge>
      ) : null}
      <span className="w-24 shrink-0 text-right text-xs tabular-nums text-(--color-text-muted)">
        {s.resources} {s.resources === 1 ? "resource" : "resources"}
      </span>
    </li>
  );
}

export function AccessSummaryCard({
  title = "What it can do",
  access,
  allAccessTo,
  noIdentity,
}: {
  title?: string;
  access: WorkloadAccess;
  /** The Resources tab, so "View all" keeps the reader's place. */
  allAccessTo?: string;
  /** No execution identity was resolved, so there is nothing to read. */
  noIdentity?: boolean;
}) {
  const { summary, loading, failure } = access;

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-1">
          {title}
          <InfoTip label="What the access levels mean">
            <dl className="space-y-1">
              {LEGEND.map((l) => (
                <div key={l.term}>
                  <dt className="inline font-semibold">{l.term}: </dt>
                  <dd className="inline">{l.meaning}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2">
              Declared in AWS and inferred from action names. Conditions, Deny statements and permissions boundaries are not evaluated.
              {summary?.partial ? " Counts are from the first page, so they are a minimum." : ""}
            </p>
          </InfoTip>
        </span>
      }
      flush
      count={summary ? `${countWord(summary.services.length, summary.partial)} ${summary.services.length === 1 && !summary.partial ? "service" : "services"}` : undefined}
      actions={
        allAccessTo && summary?.services.length ? (
          <Link to={allAccessTo} className="font-medium text-(--color-primary-text) hover:underline">
            View all resources
          </Link>
        ) : undefined
      }
    >
      {loading ? (
        <ul className="divide-y divide-(--color-border-subtle)" aria-busy="true" aria-label="Loading access">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <span className="h-3 w-40 animate-pulse rounded bg-(--color-surface-subtle)" />
              <span className="ml-auto h-3 w-16 animate-pulse rounded bg-(--color-surface-subtle)" />
            </li>
          ))}
        </ul>
      ) : failure ? (
        <p className="px-4 py-3 text-[13px] text-(--color-text-muted)">
          Couldn't load access.{" "}
          <button type="button" onClick={access.retry} className="font-medium text-(--color-primary-text) hover:underline">
            Retry
          </button>
        </p>
      ) : summary && summary.services.length ? (
        <ul className="divide-y divide-(--color-border-subtle)">
          {summary.services.map((s) => (
            <Row key={s.service} s={s} />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3 text-[13px] text-(--color-text-muted)">
          {noIdentity ? "No execution identity resolved, so there is no declared access to show." : "No declared access to any resource."}
        </p>
      )}
    </Panel>
  );
}
