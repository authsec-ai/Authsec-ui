import { WRAP_ID_CLASS, wrapId } from "./wrapText";

/** A provider id that wraps at `:` and `/`. See `wrapText.tsx`. */
export function WrapId({ children, className }: { children: string; className?: string }) {
  return <span className={className ? `${WRAP_ID_CLASS} ${className}` : WRAP_ID_CLASS}>{wrapId(children)}</span>;
}
