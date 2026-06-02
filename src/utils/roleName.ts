/**
 * Role-name display helpers.
 *
 * Auto-generated application roles are named `rs-{uuid}:{type}` (e.g.
 * `rs-cad11ac1-8203-41f3-a8e7-e7b502aa9fd9:admin`). Showing that raw UUID
 * everywhere is ugly and meaningless to operators. These helpers turn it into
 * a clean `{App name}` + `{type}` badge when we can resolve the UUID against
 * the known applications, and degrade gracefully otherwise.
 */

const RS_ROLE_RE = /^rs-([0-9a-f-]{36}):(.+)$/i;

export interface FormattedRoleName {
  /** Primary label — application name when resolvable, else the role type. */
  primary: string;
  /** Secondary chip — role type ("admin", "viewer", …) or "App-scoped". */
  badge?: string;
  /** True when this is an auto-generated `rs-…` application role. */
  isAppScoped: boolean;
}

/**
 * @param name   the raw role name from the API
 * @param appMap optional uuid → application-name map (build once per page)
 */
export function formatRoleName(
  name: string,
  appMap?: Map<string, string>
): FormattedRoleName {
  const m = name.match(RS_ROLE_RE);
  if (!m) {
    return { primary: name, isAppScoped: false };
  }
  const [, uuid, type] = m;
  const appName = appMap?.get(uuid);
  if (appName) {
    return { primary: appName, badge: type, isAppScoped: true };
  }
  // UUID not resolvable — at least drop the noise and show the role type.
  return { primary: titleCase(type), badge: "App-scoped", isAppScoped: true };
}

/** Single-line label, e.g. "demo server · admin". */
export function roleDisplayLabel(
  name: string,
  appMap?: Map<string, string>
): string {
  const { primary, badge } = formatRoleName(name, appMap);
  return badge ? `${primary} · ${badge}` : primary;
}

function titleCase(s: string): string {
  return s
    .replace(/[_:-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
