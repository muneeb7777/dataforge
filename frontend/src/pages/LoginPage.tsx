import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuth((s) => s.setAuth);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      if (mode === "register") {
        await api.post("/api/auth/register", { email, password });
      }
      const form = new URLSearchParams({ username: email, password });
      const { data } = await api.post("/api/auth/jwt/login", form, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      return data as { access_token: string };
    },
    onSuccess: ({ access_token }) => {
      setAuth(access_token, email);
      navigate("/", { replace: true });
    },
  });

  const error = submit.isError
    ? (() => {
        const detail = (
          submit.error as { response?: { data?: { detail?: unknown } } }
        ).response?.data?.detail;
        if (typeof detail === "string")
          return detail === "LOGIN_BAD_CREDENTIALS"
            ? "Wrong email or password."
            : detail === "REGISTER_USER_ALREADY_EXISTS"
              ? "That email is already registered."
              : detail;
        if (Array.isArray(detail)) return (detail[0] as { msg?: string })?.msg ?? "Invalid input";
        return "Request failed";
      })()
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
        className="w-80 rounded-xl border border-slate-800 p-6"
      >
        <h1 className="text-2xl font-bold tracking-tight">DataForge</h1>
        <p className="mb-5 text-sm text-slate-500">
          {mode === "login" ? "Sign in to continue" : "Create an account"}
        </p>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-slate-400">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-slate-200 outline-none focus:border-indigo-700"
          />
        </label>
        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-slate-400">Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-slate-200 outline-none focus:border-indigo-700"
          />
        </label>

        {error && (
          <div className="mb-3 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submit.isPending}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          {submit.isPending ? "…" : mode === "login" ? "Sign in" : "Register & sign in"}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-300"
        >
          {mode === "login" ? "No account? Register" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
