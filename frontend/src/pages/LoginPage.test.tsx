import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LoginPage from "./LoginPage";
import { api } from "../lib/api";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { ...actual.api, post: vi.fn() } };
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/login"]}>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.post).mockReset();
});

afterEach(cleanup);

describe("LoginPage", () => {
  it("renders the sign-in form and toggles to register mode", async () => {
    renderPage();
    expect(screen.getByText("Sign in to continue")).toBeInTheDocument();
    await userEvent.click(screen.getByText("No account? Register"));
    expect(screen.getByText("Create an account")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /register & sign in/i })).toBeInTheDocument();
  });

  it("maps LOGIN_BAD_CREDENTIALS to a friendly message", async () => {
    vi.mocked(api.post).mockRejectedValue({
      response: { data: { detail: "LOGIN_BAD_CREDENTIALS" } },
    });
    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), "a@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "wrongpass1");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() =>
      expect(screen.getByText("Wrong email or password.")).toBeInTheDocument(),
    );
  });

  it("shows the generic message only when there is no API detail", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Network Error"));
    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), "a@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "somepass1");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText("Request failed")).toBeInTheDocument());
  });
});
