/** A row of tabs kept in the URL by the page (so a tab can be linked to and survives reload). */

export function TabBar<K extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly { key: K; label: string }[];
  active: K;
  onChange: (key: K) => void;
}) {
  return (
    <div
      role="tablist"
      className="flex gap-1 border-b border-(--color-border-subtle)"
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === active}
          onClick={() => onChange(t.key)}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${
            t.key === active
              ? "border-(--color-primary) font-medium text-(--color-text)"
              : "border-transparent text-(--color-text-muted) hover:text-(--color-text)"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
