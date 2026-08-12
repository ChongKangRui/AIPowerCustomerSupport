import axios from "axios";

// Shared axios instance for client-side requests to our own API routes.
//
// Every route wrapped in withApiHandler (lib/api-handler.ts) returns errors
// as `{ error: string }` JSON. This interceptor unwraps that into a plain
// Error, so callers (useMutation's onError, try/catch, etc.) just get a
// clean `error.message` instead of having to reach into `error.response.data`
// themselves every time.
export const apiClient = axios.create({
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error?.response?.data?.error ?? error?.message ?? "Something went wrong";
    return Promise.reject(new Error(message));
  }
);
