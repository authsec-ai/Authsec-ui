// src/config.ts
declare global {
  interface Window {
    ENV?: {
      VITE_API_URL?: string;
      VITE_AMPLITUDE_API_KEY?: string;
      VITE_CLARITY_PROJECT_ID?: string;
      VITE_OTEL_ENDPOINT?: string;
    };
  }
}

const config = {
  VITE_API_URL:
    window.ENV?.VITE_API_URL ||
    import.meta.env.VITE_API_URL ||
    "http://localhost:3000",
  VITE_AMPLITUDE_API_KEY:
    window.ENV?.VITE_AMPLITUDE_API_KEY ||
    import.meta.env.VITE_AMPLITUDE_API_KEY ||
    "",
  VITE_CLARITY_PROJECT_ID:
    window.ENV?.VITE_CLARITY_PROJECT_ID ||
    import.meta.env.VITE_CLARITY_PROJECT_ID ||
    "",
  VITE_OTEL_ENDPOINT:
    window.ENV?.VITE_OTEL_ENDPOINT || import.meta.env.VITE_OTEL_ENDPOINT || "",
};

export default config;
