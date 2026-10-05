/**
 * What an old governance bookmark lands on (SPEC-console-revamp.md §Removal
 * contract). It says the screen was retired and that nothing replaces it yet,
 * links to the places that exist, labels the two that are previews as such,
 * renders nothing of the old functionality and calls no API.
 */

import { Link } from "react-router-dom";

import { ConsolePage } from "@/components/console/ConsolePage";
import { Card, CardContent } from "@/components/ui/card";

export default function RetiredPage({ title }: { title: string }) {
  return (
    <ConsolePage title={title} description="This screen was retired and has no replacement yet.">
      <Card>
        <CardContent className="space-y-3 py-5">
          <p className="text-[13px] leading-relaxed text-(--color-text)">
            This screen no longer reads or changes any records, and the console does not show what it showed. Nothing on this page deletes anything.
          </p>
          <ul className="space-y-1.5 text-[13px]">
            <li>
              <Link to="/iga/discovery" className="font-medium text-(--color-primary-text) hover:underline">
                Discovery
              </Link>{" "}
              <span className="text-(--color-text-muted)">— everything found: workloads, identities, resources</span>
            </li>
            <li>
              <Link to="/iga/connections" className="font-medium text-(--color-primary-text) hover:underline">
                Connections
              </Link>{" "}
              <span className="text-(--color-text-muted)">— what is connected and whether it is reporting</span>
            </li>
            <li>
              <Link to="/iga/policy" className="font-medium text-(--color-primary-text) hover:underline">
                Policy
              </Link>{" "}
              <span className="text-(--color-text-muted)">(preview)</span>
              {" · "}
              <Link to="/iga/logs" className="font-medium text-(--color-primary-text) hover:underline">
                Logs
              </Link>{" "}
              <span className="text-(--color-text-muted)">(preview)</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </ConsolePage>
  );
}
