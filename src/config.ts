// src/config.ts
declare global {
  interface Window {
    ENV?: {
      VITE_API_URL?: string;
      VITE_OAUTH_BASE_URL?: string;
    };
  }
}

const config = {
  VITE_API_URL:
    window.ENV?.VITE_API_URL ||
    import.meta.env.VITE_API_URL ||
    "http://localhost:7468",
  VITE_OAUTH_BASE_URL:
    window.ENV?.VITE_OAUTH_BASE_URL ||
    import.meta.env.VITE_OAUTH_BASE_URL ||
    "http://localhost:4444",
};

export default config;
