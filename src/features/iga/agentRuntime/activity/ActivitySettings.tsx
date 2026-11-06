/** Retention (GET /activity/settings discovery:read; PUT discovery:admin, 1..400 days). Shown to administrators only. */

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";

import { useGetAgentActivitySettingsQuery, usePutAgentActivitySettingsMutation } from "@/app/api/igaAgentActivityApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/features/iga/shared/components/Panel";
import { getWorkspaceId } from "@/utils/workspace";

import { classifyAr, shortTime } from "../model";
import { ActionError, ReadFailure } from "../parts";
import { useArAction } from "../useArAction";

export function ActivitySettings() {
  const ws = getWorkspaceId() ?? "";
  const q = useGetAgentActivitySettingsQuery({ ws });
  const [put] = usePutAgentActivitySettingsMutation();
  const act = useArAction();
  const s = q.data?.data;
  const [days, setDays] = useState("");
  useEffect(() => {
    if (s) setDays(String(s.retention_days));
  }, [s]);
  const n = Number(days);
  const valid = days.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= 400;
  const failure = classifyAr(q.error);
  const save = async () => {
    const ok = await act.run(() => put({ retention_days: n }));
    if (ok) toast.success("Retention saved. Older events are removed by the next retention run.");
  };
  return (
    <Panel title="Activity settings" description="How long events are kept. Shortening it deletes older events when retention next runs.">
      {failure && !s ? <ReadFailure failure={failure} subject="activity settings" onRetry={() => void q.refetch()} /> : null}
      {s ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="activity-retention" className="text-[13px] font-medium">
              Retention (days)
            </label>
            <Input id="activity-retention" type="number" min={1} max={400} className="h-8 w-24" value={days} aria-invalid={!valid} onChange={(e) => setDays(e.target.value)} />
            <Button className="text-white" size="sm" onClick={() => void save()} disabled={act.pending || !valid || n === s.retention_days}>
              {act.pending ? "Saving…" : "Save"}
            </Button>
          </div>
          <p className="text-xs text-(--color-text-muted)">
            1 to 400 days. {s.updated_at ? `Last changed ${shortTime(s.updated_at)}.` : "Using the default; never changed."}
          </p>
          <ActionError failure={act.failure} />
        </div>
      ) : null}
    </Panel>
  );
}
