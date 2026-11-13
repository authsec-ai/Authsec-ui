/** Words and formatting shared by the model provider screens. */

export const PROVIDER_TEXT: Record<string, string> = { openai: "OpenAI", anthropic: "Anthropic" };
export const providerText = (p: string): string => PROVIDER_TEXT[p] ?? p;

export const fmtInt = (n: number | null | undefined): string => (n === null || n === undefined ? "n/a" : n.toLocaleString());
