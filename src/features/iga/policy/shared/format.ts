/** Small formatters the policy screens share. Pure. */

import { formatDistanceToNowStrict, isValid, parseISO } from "date-fns";

/** `sha256:ab12…ef90` → `ab12…ef90`: enough to compare, short enough to read. */
export function shortHash(h: string | null | undefined, keep = 8): string {
  if (!h) return "";
  const bare = h.startsWith("sha256:") ? h.slice(7) : h;
  return bare.length <= keep * 2 + 1 ? bare : `${bare.slice(0, keep)}…${bare.slice(-4)}`;
}

/** "2 hours ago" / "in 3 days"; empty for a missing or unparseable time. */
export function relTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseISO(iso);
  if (!isValid(d)) return "";
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

/** "ec2 · sqs · sns · +6" from the first `max` items. */
export function serviceList(items: readonly string[] | null | undefined, max = 5): string {
  if (!items || items.length === 0) return "none";
  const head = items.slice(0, max).join(" · ");
  return items.length > max ? `${head} · +${items.length - max}` : head;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The role name out of an ARN: `arn:aws:iam::1234:role/team/Name` → `Name`. */
export function roleNameOf(arn: string | null | undefined): string {
  if (!arn) return "";
  const i = arn.lastIndexOf("/");
  return i >= 0 ? arn.slice(i + 1) : arn;
}
