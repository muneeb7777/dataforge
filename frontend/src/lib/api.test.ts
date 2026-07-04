/**
 * Regression tests for the production incident where a UTF-8 BOM in
 * VITE_API_URL made axios treat the base URL as relative and post auth
 * requests to the frontend host instead of the API.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const BOM = String.fromCharCode(0xfeff);

async function apiUrlWithEnv(value: string | undefined): Promise<string> {
  vi.resetModules();
  if (value === undefined) {
    vi.stubEnv("VITE_API_URL", "");
  } else {
    vi.stubEnv("VITE_API_URL", value);
  }
  const mod = await import("./api");
  return mod.API_URL;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("API_URL sanitization", () => {
  it("strips a leading BOM from the env var", async () => {
    expect(await apiUrlWithEnv(`${BOM}https://api.example.com`)).toBe(
      "https://api.example.com",
    );
  });

  it("strips surrounding whitespace", async () => {
    expect(await apiUrlWithEnv("  https://api.example.com \n")).toBe(
      "https://api.example.com",
    );
  });

  it("uses the env var verbatim when clean", async () => {
    expect(await apiUrlWithEnv("https://api.example.com")).toBe("https://api.example.com");
  });

  it("falls back to localhost in dev when the env var is empty", async () => {
    // vitest runs with PROD=false, so the dev fallback applies
    expect(await apiUrlWithEnv("")).toBe("http://localhost:8000");
  });

  it("falls back instead of using a BOM-only value", async () => {
    expect(await apiUrlWithEnv(BOM)).toBe("http://localhost:8000");
  });

  it("always yields an absolute http(s) URL", async () => {
    for (const raw of [`${BOM}https://x.example`, " https://x.example", "", BOM]) {
      expect(await apiUrlWithEnv(raw)).toMatch(/^https?:\/\//);
    }
  });
});
