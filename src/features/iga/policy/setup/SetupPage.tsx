/**
 * Policy › Setup (SPEC-iga-phase3-policy.md §9.3 S9) at `/iga/policy/setup/:section?`:
 * six sections, each its own address so a link opens it directly. Enforcement
 * (the AWS account's separate write role and its self-test), IaC sources (the
 * repositories AuthSec edits for pull requests), Notifications (Slack, email,
 * webhook), Owner rules (owners from an AWS tag), Finding rules (review dates and unused windows) and Settings (mode
 * and deadlines). With no section it shows
 * Enforcement. An address that names another section goes there too.
 *
 * Slack sends the browser back to `notifications` with a result or a link token
 * in the query. That is read here, before the section mounts or the policy gate
 * answers, so the token leaves the address bar at once.
 */

import { Link, Navigate, useParams } from "react-router-dom";

import { cn } from "@/lib/utils";

import { PolicyShell } from "../shared";
import EnforcementSection from "./EnforcementSection";
import FindingRulesSection from "./FindingRulesSection";
import IacSection from "./IacSection";
import NotificationsSection from "./NotificationsSection";
import OwnerRulesSection from "./OwnerRulesSection";
import SettingsSection from "./SettingsSection";
import { useSlackReturn } from "./slackModel";

const SECTIONS = [
  { key: "enforcement", label: "Enforcement" },
  { key: "iac", label: "IaC sources" },
  { key: "notifications", label: "Notifications" },
  { key: "owner-rules", label: "Owner rules" },
  { key: "rules", label: "Finding rules" },
  { key: "settings", label: "Settings" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

const isSection = (v: string | undefined): v is SectionKey => SECTIONS.some((s) => s.key === v);

export default function SetupPage() {
  const { section } = useParams<{ section?: string }>();
  const slack = useSlackReturn();

  if (section !== undefined && !isSection(section)) return <Navigate to="/iga/policy/setup/enforcement" replace />;
  const current: SectionKey = isSection(section) ? section : "enforcement";

  return (
    <PolicyShell title="Setup" description="Connect AuthSec to your AWS accounts and tools, and choose how policy behaves in this workspace.">
      <nav aria-label="Setup sections" className="-mt-2 flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <Link
            key={s.key}
            to={`/iga/policy/setup/${s.key}`}
            aria-current={s.key === current ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-md border px-3 text-[13px] font-medium transition-colors",
              s.key === current
                ? "border-transparent bg-(--color-primary-soft) text-(--color-primary-text)"
                : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)",
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      {current === "enforcement" ? <EnforcementSection /> : null}
      {current === "iac" ? <IacSection /> : null}
      {current === "notifications" ? (
        <NotificationsSection slackReturn={slack.value} onHandled={slack.consume} />
      ) : null}
      {current === "owner-rules" ? <OwnerRulesSection /> : null}
      {current === "rules" ? <FindingRulesSection /> : null}
      {current === "settings" ? <SettingsSection /> : null}
    </PolicyShell>
  );
}
