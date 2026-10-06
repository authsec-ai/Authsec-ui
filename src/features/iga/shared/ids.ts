/** Identifier formatting shared by the IGA tables and detail pages. */

/** "arn:aws:lambda:us-east-1:4294…:function:rag-agent" — keeps `head` and `tail` characters. */
export function middleTruncate(value: string, max = 42): string {
  if (value.length <= max) return value;
  const tail = Math.ceil((max - 1) * 0.55);
  const head = max - 1 - tail;
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

/** "429418377036" → "4294-1837-7036", the way the AWS console prints an account. */
export function formatAccountId(id: string): string {
  return /^\d{12}$/.test(id) ? `${id.slice(0, 4)}-${id.slice(4, 8)}-${id.slice(8)}` : id;
}
