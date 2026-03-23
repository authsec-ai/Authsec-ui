// src/config.ts
declare global {
  interface Window {
    ENV?: {
      VITE_API_URL?: string;
    };
  }
}

const LOCAL_HOST_PATTERN = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.)/i;

function isLocalHost(hostname: string): boolean {
  return LOCAL_HOST_PATTERN.test(hostname);
}

function defaultApiUrl(): string {
  if (typeof window !== "undefined" && isLocalHost(window.location.hostname)) {
    return "http://localhost:7468/authsec";
  }

  if (typeof window !== "undefined") {
    return `${window.location.origin.replace(/\/+$/, "")}/authsec`;
  }

  return "http://localhost:7468/authsec";
}

function normalizeApiUrl(rawUrl?: string): string {
  const candidate = rawUrl?.trim() || defaultApiUrl();

  try {
    const url = new URL(candidate, typeof window !== "undefined" ? window.location.origin : undefined);
    const hasExplicitPath = url.pathname && url.pathname !== "/";

    if (isLocalHost(url.hostname) && !hasExplicitPath) {
      url.pathname = "/authsec";
    }

    return url.toString().replace(/\/+$/, "");
  } catch {
    const trimmed = candidate.replace(/\/+$/, "");
    if (trimmed.endsWith("/authsec")) {
      return trimmed;
    }

    if (LOCAL_HOST_PATTERN.test(trimmed)) {
      return `${trimmed}/authsec`;
    }

    return trimmed;
  }
}

const config = {
  VITE_API_URL: normalizeApiUrl(
    window.ENV?.VITE_API_URL || import.meta.env.VITE_API_URL,
  ),
};

export default config;
