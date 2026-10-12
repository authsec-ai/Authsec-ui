/**
 * What the Slack panel says about the browser's return from Slack
 * (SPEC-iga-phase3-policy.md §7.11, §9.3 S9 "notifications") and how it checks a
 * channel id. The OAuth callback and a Slack "Link" message send the person back
 * to Setup with `?slack=connected`, `?slack_error=<code>` or `?slack_link=<signed
 * token>`. The token is a credential: `useSlackReturn` takes it out of the
 * address bar (and the history entry) the moment the page mounts and hands it on
 * once, in memory.
 */

import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { parseSlackReturn, type SlackReturn } from "@/app/api/igaPolicySetupApi";

/** Slack channel ids: `C…` (public) or `G…` (private), as the server checks (`slackChannelRe`). */
export function channelProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return /^[CG][A-Z0-9]{2,30}$/.test(v) ? null : "A Slack channel ID starts with C or G (for example C0123ABCD), not the channel name.";
}

const RETURN_WORDS: Record<string, string> = {
  slack_state_invalid: "The install link expired or was already used. Choose Connect Slack to start again.",
  slack_team_bound_elsewhere: "That Slack workspace is already connected to another AuthSec workspace.",
  slack_install_failed: "Slack did not complete the install. Try again in a moment.",
  slack_not_configured: "Slack is not set up on this AuthSec server.",
  invalid_parameter: "The install was cancelled or refused in Slack.",
};

/** Words for a `slack_error` code. An unknown code is shown as a code, only when it looks like one. */
export function slackReturnWords(code: string): { text: string; code?: string } {
  const known = RETURN_WORDS[code];
  if (known) return { text: known };
  return { text: "Slack could not be connected.", code: /^[a-z][a-z0-9_]{0,47}$/.test(code) ? code : undefined };
}

const PARAMS = ["slack", "slack_error", "slack_link"];

/**
 * Reads the Slack return parameters, removes them from the address bar at once
 * (replacing the history entry) and holds what they said until `consume`.
 */
export function useSlackReturn(): { value: SlackReturn | null; consume: () => void } {
  const { search, pathname } = useLocation();
  const navigate = useNavigate();
  const [value, setValue] = useState<SlackReturn | null>(null);

  useEffect(() => {
    const ret = parseSlackReturn(search);
    if (!ret.connected && !ret.error && !ret.linkToken) return;
    const q = new URLSearchParams(search);
    for (const p of PARAMS) q.delete(p);
    const rest = q.toString();
    navigate({ pathname, search: rest ? `?${rest}` : "" }, { replace: true });
    setValue((prev) => ({
      connected: ret.connected || !!prev?.connected,
      error: ret.error ?? prev?.error ?? null,
      linkToken: ret.linkToken ?? prev?.linkToken ?? null,
    }));
  }, [search, pathname, navigate]);

  const consume = useCallback(() => setValue(null), []);
  return { value, consume };
}
