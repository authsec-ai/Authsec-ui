// src/types/window.d.ts
export {};

declare global {
  interface Window {
    ENV?: {
      VITE_API_URL: string;
      VITE_OAUTH_BASE_URL: string;
    };
  }
}
