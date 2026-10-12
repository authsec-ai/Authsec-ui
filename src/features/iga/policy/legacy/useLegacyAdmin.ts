/**
 * Pause and Remove of a legacy agent policy need `governance:enforce` and
 * nothing else; `governance:admin` alone is refused
 * (controllers/platform/legacy_agent_policy_compat_controller.go, "Permissions"
 * note; workspace admins hold enforce through migration 055). The shared store
 * remembers a refused permission for the session, so a 403 hides the two buttons.
 */

import type { PolicyPermission } from "../shared";

export const LEGACY_ADMIN: PolicyPermission = "governance:enforce";
