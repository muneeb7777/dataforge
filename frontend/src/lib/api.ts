import axios from "axios";
import { useAuth } from "./auth";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = useAuth.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Expired/invalid token: drop credentials and send the user to login.
    if (error.response?.status === 401 && useAuth.getState().token) {
      useAuth.getState().clear();
      window.location.assign("/login");
    }
    return Promise.reject(error);
  },
);

/** Fetch a protected file and trigger a browser download. */
export async function downloadFile(path: string, filename: string) {
  const response = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
