/**
 * Policy › Setup › Notifications (SPEC-iga-phase3-policy.md §7.11, §9.3 S9):
 * Slack, then the email and webhook targets. It also finishes what Slack sends
 * the browser back with: a connected notice, an install error, or a link token
 * that is posted once to confirm a member's Slack account (the page, not this
 * section, has already taken the token out of the address bar).
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";

import { useConfirmSlackLinkMutation, type SlackReturn } from "@/app/api/igaPolicySetupApi";

import { PolicyActionError, usePolicyAction } from "../shared";
import { DeliveryTargetsPanel } from "./DeliveryTargetsPanel";
import { SlackPanel } from "./SlackPanel";
import { slackReturnWords } from "./slackModel";

type Notice = { tone: "success" | "danger"; text: string; code?: string } | null;

export default function NotificationsSection({ slackReturn, onHandled }: { slackReturn: SlackReturn | null; onHandled: () => void }) {
  const [confirmLink] = useConfirmSlackLinkMutation();
  // Confirming a link needs only a signed-in member, so it does not mark a permission refused.
  const linker = usePolicyAction();
  const [notice, setNotice] = useState<Notice>(null);
  // A token is posted once, however many times this effect runs (development double-mount, re-renders).
  const posted = useRef<string | null>(null);
  const run = linker.run;

  useEffect(() => {
    if (!slackReturn) return;
    if (slackReturn.error) {
      const w = slackReturnWords(slackReturn.error);
      setNotice({ tone: "danger", text: w.text, code: w.code });
    } else if (slackReturn.connected) {
      setNotice({ tone: "success", text: "Slack is connected. Set the approvals channel below." });
    }
    const token = slackReturn.linkToken;
    if (token && posted.current !== token) {
      posted.current = token;
      void (async () => {
        const res = await run(() => confirmLink({ token }));
        if (res) {
          setNotice({ tone: "success", text: "Your Slack account is linked to your AuthSec login. You can respond from Slack now." });
          toast.success("Slack account linked");
        }
      })();
    }
    onHandled();
  }, [slackReturn, onHandled, run, confirmLink]);

  return (
    <div className="space-y-4">
      {linker.pending ? (
        <p role="status" className="text-[13px] text-(--color-text-muted)">
          Confirming your Slack account…
        </p>
      ) : null}
      {notice ? (
        <p
          role={notice.tone === "danger" ? "alert" : "status"}
          className={
            notice.tone === "danger"
              ? "rounded-md border border-(--color-danger) bg-(--color-danger-soft) px-3 py-2 text-[13px] text-(--color-danger-text)"
              : "rounded-md border border-(--color-success) bg-(--color-success-soft) px-3 py-2 text-[13px] text-(--color-success-text)"
          }
        >
          {notice.text}
          {notice.code ? <span className="ml-2 font-mono text-xs">{notice.code}</span> : null}{" "}
          <button type="button" className="font-medium underline" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </p>
      ) : null}
      <PolicyActionError failure={linker.failure} />
      <SlackPanel />
      <DeliveryTargetsPanel />
    </div>
  );
}
