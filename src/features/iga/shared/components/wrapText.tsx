import type { ReactNode } from "react";

/**
 * Long provider ids — ARNs, resource patterns, action names — in a narrow box.
 *
 * `break-all` lets the browser cut anywhere, which produced
 * `arn:aws:iam::429418377036:r` / `ole/acme-lab-eks…`: hard to read and harder
 * to copy correctly. This offers the break points a person would choose — after
 * a `:` or a `/` — with `<wbr>`, and keeps `overflow-wrap:anywhere` only as the
 * last resort for a single segment that is wider than the box on its own.
 *
 * The text is unchanged: `<wbr>` is not a character, so selecting and copying
 * the value still yields the original string.
 *
 * Kept apart from the `WrapId` component so that file exports only a component
 * (fast refresh).
 */
export const WRAP_ID_CLASS = "[overflow-wrap:anywhere]";

export function wrapId(text: string): ReactNode {
  const parts = text.split(/([:/])/);
  return parts.map((p, i) =>
    p === ":" || p === "/" ? (
      <span key={i}>
        {p}
        <wbr />
      </span>
    ) : (
      p
    ),
  );
}
