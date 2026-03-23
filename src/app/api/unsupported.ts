export interface UnsupportedApiErrorPayload {
  message: string;
}

export interface UnsupportedApiError {
  status: number;
  data: UnsupportedApiErrorPayload;
}

export const unsupportedApiError = (message: string): UnsupportedApiError => ({
  status: 501,
  data: { message },
});
