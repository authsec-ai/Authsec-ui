/** What an edit page says when its provider could not be loaded. A provider
 *  of another workspace is a 404 like a missing one. */
export function providerLoadError(error: unknown): string {
  const e = error as { status?: number | string; data?: { error?: string; message?: string } } | undefined;
  if (!e || e.status === 404) return "Provider not found";
  if (e.status === 400) return "This link does not name a provider";
  const detail = e.data?.error || e.data?.message;
  return detail ? `Could not load the provider: ${detail}` : "Could not load the provider";
}
