import axios from "axios";

// Shared axios instance for client requests to our own API routes.
//
// Every route wrapped in withApiHandler (lib/api-handler.ts) sends errors
// as `{ error: string }` JSON. This interceptor turns that JSON into a
// plain Error. Callers (useMutation's onError, try/catch, etc.) then read
// a clean `error.message`. They do not need to reach into
// `error.response.data` each time.
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
