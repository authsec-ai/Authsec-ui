import { useAnnouncement } from "../announce";

/** Mounted once per graph page; see announce.ts. */
export function LiveRegion() {
  const text = useAnnouncement();
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}
