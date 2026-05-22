function titleCasePart(part: string): string {
  return part
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

export function formatApplicationRoleName(roleName?: string | null): string {
  if (!roleName) return "(none)";

  const rsScopedMatch = /^rs-[0-9a-f-]+:(.+)$/i.exec(roleName);
  const rawName = rsScopedMatch?.[1] ?? roleName;

  if (rawName === "viewer") return "Viewer";
  if (rawName === "readonly") return "Readonly";
  if (rawName === "admin") return "Admin";
  if (rawName === "user") return "User";

  return rawName
    .split(":")
    .map((part) => titleCasePart(part))
    .join(" / ");
}
