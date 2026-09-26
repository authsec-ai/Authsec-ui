/**
 * TRD 2 edge classes (S9.5, S12d, S4.1b).
 *
 * Observed access is not a grant. Directory backing is not Kerberos and not
 * "uses". A Kubernetes grant's calculation_state and effective_conclusion are
 * the stored facts — a traversal does not turn them into effective access.
 *
 * Shapes follow authsec experimental 6a7becc (`labelV2Edge`, `fillGrantHonesty`).
 */

export type EdgeAccessClass = "declared" | "observed" | "directory_backing";

export type ObservedOutcome = "success" | "denied" | "attempt" | "other";

export interface ClassifiableEdge {
  kind: string;
  access_class?: string;
  meaning?: string;
  outcome?: string;
  calculation_state?: string;
  effective_conclusion?: string;
}

export const OUTCOME_LABEL: Record<ObservedOutcome, string> = {
  success: "Success",
  denied: "Denied",
  attempt: "Attempt",
  other: "Other",
};

/** Legend order. Every observed edge names one of these outcomes. */
export const OUTCOME_LEGEND: { outcome: ObservedOutcome; label: string; meaning: string }[] = [
  { outcome: "success", label: "Success", meaning: "The observation recorded a successful action." },
  { outcome: "denied", label: "Denied", meaning: "The observation recorded a denied action. A denied read is an attempt, not a grant." },
  { outcome: "attempt", label: "Attempt", meaning: "The observation recorded an attempt. It is not a declared grant." },
];

export function outcomeClass(outcome: string | undefined): ObservedOutcome {
  const value = (outcome ?? "").trim().toLowerCase();
  if (value === "success" || value === "succeeded" || value === "ok") return "success";
  if (value === "denied" || value === "deny" || value === "denied_open") return "denied";
  if (value === "attempt" || value === "attempted") return "attempt";
  return "other";
}

export function outcomeLabel(outcome: string | undefined): string {
  if (!outcome) return "outcome not stated";
  const mapped = outcomeClass(outcome);
  return mapped === "other" ? outcome.replace(/_/g, " ") : OUTCOME_LABEL[mapped];
}

/**
 * Directory backing wins over the edge's access_class. The server marks
 * backed_by_directory as access_class "declared" and meaning "directory_backing".
 */
export function classifyEdge(edge: ClassifiableEdge): EdgeAccessClass {
  if (edge.kind === "backed_by_directory" || edge.meaning === "directory_backing") return "directory_backing";
  if (edge.kind === "observed_access" || edge.access_class === "observed") return "observed";
  return "declared";
}

export const ACCESS_CLASS_LABEL: Record<EdgeAccessClass, string> = {
  declared: "Declared",
  observed: "Observed",
  directory_backing: "directory backing",
};

/** The words drawn on the line. Directory backing never says Kerberos or "uses". */
export function edgeClassLabel(edge: ClassifiableEdge): string {
  const cls = classifyEdge(edge);
  if (cls === "directory_backing") return ACCESS_CLASS_LABEL.directory_backing;
  if (cls === "observed") return `Observed · ${outcomeLabel(edge.outcome)}`;
  const honesty = grantHonestyText(edge);
  return honesty ? `Declared · ${honesty}` : "Declared";
}

/**
 * Stored grant columns, shown as written. "partial / unknown" for the usual
 * Kubernetes grant. This is not a traversal's conclusion.
 */
export function grantHonestyText(edge: Pick<ClassifiableEdge, "calculation_state" | "effective_conclusion">): string | null {
  const parts = [edge.calculation_state, edge.effective_conclusion].map((p) => p?.trim()).filter((p): p is string => !!p);
  if (!parts.length) return null;
  return parts.join(" / ");
}

export const REFERENCE_STATUS_LABEL = {
  referenced: "Referenced",
  observed: "Observed",
  inventoried: "Inventoried",
} as const;

export type ReferenceStatus = keyof typeof REFERENCE_STATUS_LABEL;

export function referenceStatusLabel(status: string): string {
  return REFERENCE_STATUS_LABEL[status as ReferenceStatus] ?? status.replace(/_/g, " ");
}

/** SQL rows are shown only when the server returned them (database or broker evidence). */
export function isSqlAction(action: string): boolean {
  return action === "sql" || action === "query" || action === "db_query";
}

export function sqlEvidenceLabel(attribution: string): string | null {
  if (attribution === "database") return "Database evidence";
  if (attribution === "broker") return "Broker evidence";
  return null;
}
