/**
 * AWS, Published: the §5.3 graph lists — what AuthSec concluded from the scans,
 * pinned to one publication (SPEC-console-revamp.md *Control contract*).
 *
 * Search is the server's `q` over name, full ARN and account id. Source, Region,
 * Lifecycle, Classification, Runtime, Kind, Representation and External are the
 * server's filters; their counts are the server's facets, which reflect every
 * other filter. Paging is a signed keyset cursor kept in history state, so Back
 * restores the page, and sort is the server's.
 *
 * The three types differ only in their query, their filters and their columns,
 * so each has its own file (`PublishedWorkloads`, `PublishedIdentities`,
 * `PublishedResources`); the frame, the states, the preview and the
 * investigation context are shared (`PublishedBody`).
 */

import PublishedIdentities from "./PublishedIdentities";
import PublishedResources from "./PublishedResources";
import PublishedWorkloads from "./PublishedWorkloads";
import type { ScreenProps } from "./screenTypes";

export default function PublishedScreen(p: ScreenProps) {
  if (p.type === "workloads") return <PublishedWorkloads {...p} />;
  if (p.type === "identities") return <PublishedIdentities {...p} />;
  return <PublishedResources {...p} />;
}
