/**
 * Legend for v2 edge classes. Observed access names its outcome. Directory
 * backing is labelled exactly "directory backing". A Kubernetes grant shows
 * the stored calculation state. None of this is called effective access.
 */

import { ACCESS_CLASS_LABEL, OUTCOME_LEGEND, classifyEdge, grantHonestyText, type ClassifiableEdge } from "./edgeClass";

export function EdgeClassLegend({ edges }: { edges: ClassifiableEdge[] }) {
  const classes = new Set(edges.map(classifyEdge));
  const observed = classes.has("observed");
  const backing = classes.has("directory_backing");
  const honesty = edges.map(grantHonestyText).find((text): text is string => !!text);
  const declared = classes.has("declared") || edges.some((e) => classifyEdge(e) === "declared");
  if (!observed && !backing && !honesty && !edges.some((e) => e.access_class || e.meaning)) return null;

  return (
    <ul aria-label="Edge classes" data-testid="edge-class-legend" className="flex flex-wrap items-center gap-3 text-[11px] text-(--color-text-muted)">
      {declared ? (
        <li title="Configuration or a policy statement. A traversal of these lines is not a decision about whether a request would succeed.">
          {ACCESS_CLASS_LABEL.declared}
        </li>
      ) : null}
      {observed
        ? OUTCOME_LEGEND.map((item) => (
            <li key={item.outcome} title={item.meaning}>
              Observed · {item.label}
            </li>
          ))
        : null}
      {backing ? <li title="A local identity and a directory identity, kept as two objects.">directory backing</li> : null}
      {honesty ? <li title="Stored on the grant. Not computed by walking the graph.">{honesty}</li> : null}
    </ul>
  );
}
