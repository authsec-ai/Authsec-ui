/**
 * Slack in Policy › Setup › Notifications (SPEC-iga-phase3-policy.md §7.11, §9.3
 * S9). Status is the Slack block of the settings read: the team, the approvals
 * channel and a COUNT of linked members. No route lists which members are linked,
 * so none is shown. The install is a mutation that answers with Slack's
 * authorize URL; the browser goes there only when the URL is Slack's own.
 * `bot_token_ref`, `workspace_id` and `installed_by` are never shown.
 */

import { useEffect, useId, useState } from "react";
import { toast } from "react-hot-toast";

import {
  isSlackAuthorizeUrl,
  useDisconnectSlackMutation,
  useGetSlackStatusQuery,
  useStartSlackInstallMutation,
  useUpdateSlackSettingsMutation,
  type SlackStatusView,
} from "@/app/api/igaPolicySetupApi";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Fact, Facts, Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";
import { getWorkspaceId } from "@/utils/workspace";

import {
  PolicyActionError,
  PolicyLoadFailure,
  classifyPolicyError,
  plural,
  usePolicyAction,
  usePolicyCapabilities,
  usePolicyPermission,
} from "../shared";
import { ActionDialog } from "./ActionDialog";
import { SLACK_UNAVAILABLE, channelProblem } from "./slackModel";

function ApprovalsChannel({ status, canChange }: { status: SlackStatusView; canChange: boolean }) {
  const id = useId();
  const current = status.approvals_channel_id ?? "";
  const [value, setValue] = useState(current);
  const [touched, setTouched] = useState(false);
  const [update] = useUpdateSlackSettingsMutation();
  const action = usePolicyAction("governance:enforce");

  // The channel the server holds is the starting point again after a save or a reload.
  useEffect(() => {
    setValue(current);
    setTouched(false);
  }, [current]);

  const problem = touched ? channelProblem(value) : null;
  const dirty = value.trim() !== current;

  async function save(next: string) {
    setTouched(true);
    if (channelProblem(next)) return;
    const res = await action.run(() => update({ approvals_channel_id: next }));
    if (res) toast.success(next ? "Approvals channel saved" : "Approvals channel cleared");
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-xs font-medium text-(--color-text)">
        Approvals channel ID
      </label>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 basis-56 space-y-1">
          <Input
            id={id}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="C0123ABCD"
            disabled={!canChange || action.pending}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!problem}
            aria-describedby={`${id}-hint`}
          />
          <p id={`${id}-hint`} className={problem ? "text-xs text-(--color-danger-text)" : "text-xs text-(--color-text-muted)"}>
            {problem ?? "Approval requests are posted here. Use the channel's ID from its details in Slack, and add the AuthSec app to the channel."}
          </p>
        </div>
        {canChange ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save(value.trim())} disabled={!dirty || action.pending}>
              {action.pending ? "Saving…" : "Save"}
            </Button>
            {current ? (
              <Button size="sm" variant="outline" onClick={() => void save("")} disabled={action.pending}>
                Clear
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <PolicyActionError failure={action.failure} />
    </div>
  );
}

function DisconnectDialog({ open, onOpenChange, team }: { open: boolean; onOpenChange: (o: boolean) => void; team: string }) {
  const [disconnect] = useDisconnectSlackMutation();
  const action = usePolicyAction("governance:enforce");

  async function confirm() {
    const res = await action.run(() => disconnect());
    if (res) {
      toast.success("Slack disconnected");
      onOpenChange(false);
    }
  }

  return (
    <ActionDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) action.clear();
        onOpenChange(o);
      }}
      title="Disconnect Slack"
      description={team ? `Slack workspace ${team}` : "Slack"}
      confirmLabel="Disconnect Slack"
      busyLabel="Disconnecting…"
      destructive
      pending={action.pending}
      failure={action.failure}
      onConfirm={() => void confirm()}
    >
      <p>AuthSec stops posting to Slack and revokes its access to the Slack workspace.</p>
      <p>
        Every link between a Slack account and a workspace member is deleted. Members cannot approve or respond from Slack until Slack is
        connected again and they link their accounts again.
      </p>
      <p className="text-(--color-text-muted)">Email and webhook notifications are not affected.</p>
    </ActionDialog>
  );
}

export function SlackPanel() {
  const ws = getWorkspaceId() ?? "";
  const caps = usePolicyCapabilities(ws);
  const enforce = usePolicyPermission("governance:enforce");
  const status = useGetSlackStatusQuery({ ws });
  const failure = classifyPolicyError(status.error);
  const [install] = useStartSlackInstallMutation();
  const installer = usePolicyAction("governance:enforce");
  const [leaving, setLeaving] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  // Coming back from Slack with the back button restores this page from the browser cache with the flag still set.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setRedirecting(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
  const [badUrl, setBadUrl] = useState(false);

  const a = status.data;
  const slack = a?.status;
  const connected = !!a?.available && !!slack?.connected;
  const canChange = !enforce.refused;

  async function connect() {
    setBadUrl(false);
    const res = await installer.run(() => install());
    if (!res) return;
    if (!isSlackAuthorizeUrl(res.authorize_url)) {
      // Never navigate to anything but Slack's own authorize endpoint.
      setBadUrl(true);
      return;
    }
    setRedirecting(true);
    window.location.assign(res.authorize_url);
  }

  return (
    <Panel
      title="Slack"
      description="Approval requests and owner reviews can be answered in Slack. Members link their Slack account to their AuthSec login."
      actions={connected ? <StatusBadge tone="success">Connected</StatusBadge> : a?.available ? <StatusBadge tone="neutral">Not connected</StatusBadge> : null}
    >
      {status.isLoading ? (
        <p role="status" className="text-[13px] text-(--color-text-muted)">
          Loading…
        </p>
      ) : failure && !a ? (
        failure.kind === "forbidden" ? (
          <p className="text-[13px] text-(--color-text-muted)">Your role cannot see the Slack connection.</p>
        ) : (
          <PolicyLoadFailure failure={failure} subject="the Slack connection" onRetry={() => void status.refetch()} />
        )
      ) : a && !a.available ? (
        <p className="text-[13px] text-(--color-text-muted)">
          {SLACK_UNAVAILABLE}
        </p>
      ) : !connected ? (
        <div className="space-y-3">
          <p className="text-[13px] text-(--color-text-muted)">
            Slack is not connected. Connecting sends you to Slack to install the AuthSec app in your Slack workspace, then brings you back here.
          </p>
          {!caps.feature("slack") && caps.featureReason("slack") ? (
            <p className="text-[13px] text-(--color-warning-text)">Slack is not set up on this server: {caps.featureReason("slack")}</p>
          ) : null}
          {canChange ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={() => void connect()} disabled={installer.pending || redirecting}>
                {installer.pending ? "Starting…" : redirecting ? "Opening Slack…" : "Connect Slack"}
              </Button>
              {redirecting ? (
                <span role="status" className="text-xs text-(--color-text-muted)">
                  Taking you to Slack…
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-(--color-text-muted)">Your role cannot connect Slack. Ask a workspace administrator.</p>
          )}
          <PolicyActionError failure={installer.failure} />
          {badUrl ? (
            <p role="alert" className="text-[13px] text-(--color-danger-text)">
              AuthSec returned an install address that is not Slack&apos;s, so it was not opened. Try again, and tell an administrator if it
              repeats.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <Facts>
            <Fact label="Slack workspace">{slack?.team_name || "Not named"}</Fact>
            <Fact label="Approvals channel">
              {slack?.approvals_channel_id ? <span className="font-mono text-xs">{slack.approvals_channel_id}</span> : "Not set. Requests are not posted to a channel."}
            </Fact>
            <Fact label="Linked members">
              {plural(slack?.linked_users ?? 0, "member")}
              {(slack?.linked_users ?? 0) === 0 ? " have linked their Slack account" : ""}
            </Fact>
            {slack?.installed_at ? (
              <Fact label="Connected">
                <Timestamp iso={slack.installed_at} />
              </Fact>
            ) : null}
          </Facts>
          <p className="text-xs text-(--color-text-muted)">
            A member links their account from the Link button in a message AuthSec sends them in Slack, then confirms it here. AuthSec shows how
            many are linked, not who.
          </p>
          {slack ? <ApprovalsChannel status={slack} canChange={canChange} /> : null}
          {canChange ? (
            <div className="border-t border-(--color-border-subtle) pt-3">
              <Button size="sm" variant="outline" onClick={() => setLeaving(true)}>
                Disconnect Slack
              </Button>
            </div>
          ) : (
            <p className="text-xs text-(--color-text-muted)">Your role cannot change the Slack connection.</p>
          )}
        </div>
      )}
      <DisconnectDialog open={leaving} onOpenChange={setLeaving} team={slack?.team_name ?? ""} />
    </Panel>
  );
}
