/** "token_issued" / "role.create" → "Token issued" / "Role create". */
export function humanize(value: string): string {
  const s = value.replace(/[._-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : value;
}

/** The actor realm a log row carries, in plain words when it is a known one. */
export function realmLabel(realm?: string): string | undefined {
  if (!realm) return undefined;
  const r = realm.toLowerCase();
  if (r === "admin") return "Team member";
  if (r === "enduser" || r === "end_user" || r === "end-user") return "End user";
  return realm;
}

/** Save `text` as a file named `filename`. */
export function downloadText(text: string, type: string, filename: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Download rows as a JSON file, one object per entry. */
export function downloadJson(rows: unknown[], name: string) {
  const text = rows.map((r) => JSON.stringify(r, null, 2)).join("\n\n");
  downloadText(text, "application/json", `${name}-${new Date().toISOString()}.json`);
}
