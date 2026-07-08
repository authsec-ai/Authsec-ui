import { providerMeta } from "./providerMeta";
import { cn } from "@/lib/utils";

export function ConnectorBadge({
  providerKey,
  size = "size-9",
}: {
  providerKey: string;
  size?: string;
}) {
  const meta = providerMeta(providerKey);
  return (
    <span
      className={cn(
        "flex flex-none items-center justify-center rounded-md text-[11px] font-semibold",
        size,
        meta.colorClass,
      )}
    >
      {meta.initial}
    </span>
  );
}
