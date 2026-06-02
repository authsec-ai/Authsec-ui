import { useAuth } from "@/auth/context/AuthContext";

/**
 * Personalized greeting (Console Refresh). Time-of-day salutation + the
 * operator's name, with the active workspace surfaced as a quiet tag.
 */
export function DashboardGreeting({ workspaceId }: { workspaceId?: string }) {
  const { user } = useAuth();

  const now = new Date();
  const hour = now.getHours();
  const part =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const name =
    user?.first_name && user?.last_name
      ? user.first_name
      : user?.email
        ? user.email.split("@")[0]
        : null;

  const workspaceShort = workspaceId
    ? workspaceId.length <= 12
      ? workspaceId
      : workspaceId.slice(0, 8)
    : null;

  return (
    <div className="mb-1">
      <p className="text-[12.5px] dash-text-3">
        {part} · {dateLabel}
      </p>
      <h1 className="text-[26px] font-semibold tracking-[-0.02em] dash-text-1">
        {name ? `Welcome back, ${name}` : "Welcome back"}
        {workspaceShort && (
          <>
            <span className="font-medium dash-text-3"> · </span>
            <span style={{ color: "var(--color-primary-text)" }}>
              {workspaceShort}
            </span>{" "}
            workspace
          </>
        )}
      </h1>
    </div>
  );
}
