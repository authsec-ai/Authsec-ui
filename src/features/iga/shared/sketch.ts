/** A resource's reference as a short name for a small drawing; the full text stays in the title and the page. */
export function shortResourceName(text: string): string {
  if (!text.startsWith("arn:")) return text;
  const tail = text.split(":").slice(5).join(":");
  return tail || text;
}
