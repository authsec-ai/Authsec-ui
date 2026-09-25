import { toast } from "react-hot-toast";

/**
 * Copies `value` and says what actually happened: "Copied" only once the
 * browser has accepted the write, and a failure (no permission, an insecure
 * context, no clipboard API) says so and how to recover — never a success
 * toast for a copy that did not happen.
 */
export async function copyToClipboard(
  value: string,
  what = "Value",
  /** false: the control shows its own "Copied" state; only a failure toasts. */
  { toastSuccess = true }: { toastSuccess?: boolean } = {},
): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(value);
    if (toastSuccess) toast.success(`${what} copied`);
    return true;
  } catch {
    toast.error(`Could not copy the ${what.toLowerCase()}. Select it and copy it by hand.`);
    return false;
  }
}
