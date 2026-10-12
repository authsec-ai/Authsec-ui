/** What the four steps of the new-policy flow share. */

import type { GovConsumerView, GovRightSizeIntent, GovSubject, GovTargetView } from "@/app/api/igaPolicyAuthoringApi";
import type { GovResolvedTarget } from "@/app/api/igaPolicyReadsApi";

import { arnTail } from "../plans/planCopy";
import type { DraftSession } from "./useDraftSession";

/** One role of the draft, with what the server resolved about it now. */
export interface RoleInfo {
  subject: GovSubject;
  name: string;
  arn: string;
  target: GovTargetView | undefined;
  resolved: GovResolvedTarget | null;
  consumers: GovConsumerView[];
  /** The AWS connection the role's evidence came from, when the server said. */
  connectorId: string | null;
}

export interface StepProps {
  ws: string;
  session: DraftSession;
  intent: GovRightSizeIntent;
  onIntent: (next: GovRightSizeIntent) => void;
  roles: RoleInfo[];
  rolesLoading: boolean;
  /** Version 1's intent, so an owner keep can be undone. */
  baseline: GovRightSizeIntent | null;
}

export function buildRoles(session: DraftSession, intent: GovRightSizeIntent, resolved: GovResolvedTarget[] | undefined): RoleInfo[] {
  const rec = session.snapshot?.recommendation;
  return intent.subjects.map((subject) => {
    const r = resolved?.find((t) => t.identity?.role_id === subject.role_id) ?? null;
    const target = session.targets.find((t) => t.role_id === subject.role_id);
    const arn = r?.identity?.arn ?? target?.role_arn ?? "";
    return {
      subject,
      name: r?.identity?.name || arnTail(arn) || subject.role_id,
      arn,
      target,
      resolved: r,
      // The proposal lists the consumers of every selected role together; with one role they are that role's.
      consumers: r ? r.consumers : intent.subjects.length === 1 ? (rec?.consumers ?? []) : [],
      connectorId: r?.evidence?.connector_id ?? null,
    };
  });
}

export const roleNames = (roles: readonly RoleInfo[]): string =>
  roles.length === 0 ? "" : roles.length <= 2 ? roles.map((r) => r.name).join(" and ") : `${roles[0].name} and ${roles.length - 1} more`;
