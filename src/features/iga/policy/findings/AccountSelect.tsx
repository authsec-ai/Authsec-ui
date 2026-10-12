/**
 * The AWS account filter of Findings and Readiness. The accounts are the
 * workspace's connected accounts (the pipeline read); a selected account that
 * is not listed stays selectable so the control never says "All" while a
 * filter is applied.
 */

import { useGetGraphPipelineQuery } from "@/app/api/igaGraphApi";

const selectClass =
  "h-9 max-w-[16rem] rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2.5 text-sm text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)";

export function AccountSelect({
  ws,
  value,
  onChange,
  label = "Account",
}: {
  ws: string;
  value: string;
  onChange: (account: string) => void;
  label?: string;
}) {
  const q = useGetGraphPipelineQuery({ ws });
  const seen = new Set<string>();
  const accounts = (q.data?.accounts ?? []).filter((a) => {
    if (!a.account_id || seen.has(a.account_id)) return false;
    seen.add(a.account_id);
    return true;
  });
  const listed = !value || accounts.some((a) => a.account_id === value);
  return (
    <select aria-label={label} className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{accounts.length > 0 ? `All accounts (${accounts.length})` : "All accounts"}</option>
      {accounts.map((a) => (
        <option key={a.account_id} value={a.account_id}>
          {a.label && a.label !== a.account_id ? `${a.label} · ${a.account_id}` : a.account_id}
        </option>
      ))}
      {!listed ? <option value={value}>{value}</option> : null}
    </select>
  );
}
