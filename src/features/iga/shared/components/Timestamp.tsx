/**
 * A short relative time ("3h ago") with the exact time and timezone one
 * hover or one screen-reader phrase away — for narrow rows where a
 * relative-plus-absolute pair would crowd the value it qualifies.
 */

import { format, formatDistanceToNowStrict } from "date-fns";

function exactTime(iso: string): string {
  return format(new Date(iso), "d MMM yyyy, HH:mm:ss 'GMT'xxx");
}

export function Timestamp({ iso, missing = "not known" }: { iso: string | null | undefined; missing?: string }) {
  if (!iso) return <span>{missing}</span>;
  const exact = exactTime(iso);
  return (
    <time dateTime={iso} title={exact} className="tabular-nums">
      {formatDistanceToNowStrict(new Date(iso), { addSuffix: true })}
      <span className="sr-only"> ({exact})</span>
    </time>
  );
}
