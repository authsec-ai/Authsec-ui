/**
 * Email and webhook targets (SPEC-iga-phase3-policy.md §7.8, §9.3 S9
 * "notifications"): the `notifications` block of the workspace settings. The
 * webhook secret is write-only: the server says only whether one is set, so the
 * form never shows a stored secret; typing a new one replaces it, and Remove
 * deletes it. The webhook address must be https. Only the fields that changed
 * are sent.
 */

import { useId, useState } from "react";
import { toast } from "react-hot-toast";

import {
  useGetGovSettingsQuery,
  usePutGovSettingsMutation,
  type GovNotificationsPatch,
  type GovNotificationSettings,
  type GovSettings,
  type GovSettingsPatch,
} from "@/app/api/igaPolicyReadsApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";
import { getWorkspaceId } from "@/utils/workspace";

import { PolicyLoadFailure, classifyPolicyError, usePolicyAction, usePolicyPermission } from "../shared";
import { SettingsFailure } from "./SettingsFailure";

function webhookProblem(url: string): string | null {
  const v = url.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && v.startsWith("https://") ? null : "The address must start with https://.";
  } catch {
    return "Enter a full address, starting with https://.";
  }
}

function TargetsForm({ settings, onReload }: { settings: GovSettings; onReload: () => void }) {
  const id = useId();
  const n: GovNotificationSettings = settings.notifications;
  const enforce = usePolicyPermission("governance:enforce");
  const [put] = usePutGovSettingsMutation();
  const action = usePolicyAction("governance:enforce");

  const [email, setEmail] = useState(n.email_enabled);
  const [url, setUrl] = useState(n.webhook_url);
  const [secret, setSecret] = useState("");
  const [removeSecret, setRemoveSecret] = useState(false);
  const [touched, setTouched] = useState(false);

  const canChange = !enforce.refused && n.available;
  const urlProblem = touched ? webhookProblem(url) : null;
  const urlChanged = url.trim() !== n.webhook_url;
  // A secret only makes sense with an address; clearing the address drops the stored one on the server.
  const hasUrl = !!url.trim();

  const patch: GovNotificationsPatch = {
    ...(email !== n.email_enabled ? { email_enabled: email } : {}),
    ...(urlChanged ? { webhook_url: url.trim() } : {}),
    ...(hasUrl && secret !== "" ? { webhook_secret: secret } : hasUrl && removeSecret && n.webhook_secret_set ? { webhook_secret: "" } : {}),
  };
  const dirty = Object.keys(patch).length > 0;

  async function save() {
    setTouched(true);
    if (webhookProblem(url) || !dirty) return;
    const body: GovSettingsPatch = {
      notifications: patch,
      // The row's version, only when a row exists (an unsaved workspace has none to conflict with).
      ...(settings.saved ? { expected_updated_at: settings.updated_at } : {}),
    };
    const res = await action.run(() => put(body));
    if (res) {
      setSecret("");
      setRemoveSecret(false);
      toast.success("Notification targets saved");
    }
  }

  return (
    <div className="space-y-5">
      {!n.available ? (
        <p role="status" className="rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-[13px] text-(--color-warning-text)">
          Email and webhook targets cannot be changed on this server{n.reason ? `: ${n.reason}` : ""}.
        </p>
      ) : null}
      {n.source === "legacy_copy" ? (
        <p className="text-xs text-(--color-text-muted)">
          These were copied from your previous governance settings{n.copied_from_legacy_at ? <> on <Timestamp iso={n.copied_from_legacy_at} /></> : ""}. A
          webhook secret is not copied: set one again if the receiver checks it.
        </p>
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label htmlFor={`${id}-email`} className="text-[13px] font-medium text-(--color-text)">
            Email owners
          </label>
          <p className="text-xs text-(--color-text-muted)">Email an owner when AuthSec asks them to review a change.</p>
        </div>
        <Switch id={`${id}-email`} checked={email} onCheckedChange={setEmail} disabled={!canChange || action.pending} />
      </div>

      <div className="space-y-3 border-t border-(--color-border-subtle) pt-4">
        <div className="space-y-1">
          <label htmlFor={`${id}-url`} className="text-[13px] font-medium text-(--color-text)">
            Webhook address
          </label>
          <Input
            id={`${id}-url`}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.example.com/authsec"
            disabled={!canChange || action.pending}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!urlProblem}
            aria-describedby={`${id}-url-hint`}
          />
          <p id={`${id}-url-hint`} className={urlProblem ? "text-xs text-(--color-danger-text)" : "text-xs text-(--color-text-muted)"}>
            {urlProblem ?? "AuthSec posts owner reviews and approval requests here. https only. Leave empty for no webhook."}
          </p>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-secret`} className="text-[13px] font-medium text-(--color-text)">
            Signing secret
          </label>
          <Input
            id={`${id}-secret`}
            type="password"
            value={secret}
            onChange={(e) => {
              setSecret(e.target.value);
              if (e.target.value) setRemoveSecret(false);
            }}
            placeholder={n.webhook_secret_set ? "A secret is set. Type a new one to replace it." : "No secret set"}
            disabled={!canChange || action.pending || !hasUrl}
            autoComplete="new-password"
            spellCheck={false}
            aria-describedby={`${id}-secret-hint`}
          />
          <div id={`${id}-secret-hint`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--color-text-muted)">
            <span>
              {n.webhook_secret_set ? "A signing secret is stored. It is never shown again." : "The receiver can check requests with a signing secret."}
            </span>
            {canChange && n.webhook_secret_set && hasUrl ? (
              <button
                type="button"
                className="font-medium text-(--color-primary-text) hover:underline"
                onClick={() => {
                  setRemoveSecret(!removeSecret);
                  setSecret("");
                }}
              >
                {removeSecret ? "Keep the stored secret" : "Remove the stored secret"}
              </button>
            ) : null}
          </div>
          {removeSecret ? <p className="text-xs text-(--color-warning-text)">The stored secret will be removed when you save.</p> : null}
        </div>
      </div>

      {canChange ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void save()} disabled={!dirty || action.pending || (touched && !!webhookProblem(url))}>
              {action.pending ? "Saving…" : "Save targets"}
            </Button>
            {dirty && !action.pending ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEmail(n.email_enabled);
                  setUrl(n.webhook_url);
                  setSecret("");
                  setRemoveSecret(false);
                  setTouched(false);
                  action.clear();
                }}
              >
                Discard changes
              </Button>
            ) : null}
          </div>
          <SettingsFailure failure={action.failure} onReload={onReload} />
        </div>
      ) : n.available ? (
        <p className="text-xs text-(--color-text-muted)">Your role cannot change notification targets. Ask a workspace administrator.</p>
      ) : null}
    </div>
  );
}

export function DeliveryTargetsPanel() {
  const ws = getWorkspaceId() ?? "";
  const q = useGetGovSettingsQuery({ ws });
  const failure = classifyPolicyError(q.error);
  const s = q.data;

  return (
    <Panel title="Email and webhook" description="Where owner reviews and approval requests are sent besides Slack.">
      {q.isLoading ? (
        <p role="status" className="text-[13px] text-(--color-text-muted)">
          Loading…
        </p>
      ) : failure && !s ? (
        failure.kind === "forbidden" ? (
          <p className="text-[13px] text-(--color-text-muted)">Your role cannot see notification settings.</p>
        ) : (
          <PolicyLoadFailure failure={failure} subject="notification settings" onRetry={() => void q.refetch()} />
        )
      ) : s ? (
        // A new key after each save or reload starts the form from what the server holds.
        <TargetsForm key={`${s.saved}-${s.updated_at}-${s.notifications.email_enabled}-${s.notifications.webhook_url}-${s.notifications.webhook_secret_set}`} settings={s} onReload={() => void q.refetch()} />
      ) : null}
    </Panel>
  );
}
