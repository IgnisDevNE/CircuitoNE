import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import LoginRoute, { meta } from "../../src/routes/login";
import LogoutRoute from "../../src/routes/logout";

beforeEach(() =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  ),
);
const page = (data: object, action?: () => object) =>
  render(
    <RouterProvider
      router={createMemoryRouter(
        [{ id: "root", path: "*", loader: () => data, action, Component: LoginRoute }],
        { initialEntries: ["/entrar"], hydrationData: { loaderData: { root: data } } },
      )}
    />,
  );

test("login presents empty credentials, no demo login, one h1 and a link to the real registration", async () => {
  page({});
  expect(await screen.findByRole("button", { name: "Entrar" })).toBeTruthy();
  expect((screen.getByLabelText(/E-mail/) as HTMLInputElement).value).toBe("");
  expect((screen.getByLabelText(/Senha/) as HTMLInputElement).value).toBe("");
  expect(screen.queryByRole("button", { name: /demo/i })).toBeNull();
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Criar conta" }).getAttribute("href")).toBe("/cadastro");
  expect(screen.queryByRole("alert")).toBeNull();
  const form = screen.getByRole("button", { name: "Entrar" }).closest("form");
  expect(form?.getAttribute("method")).toBe("post");
  expect(form?.getAttribute("action")).toBe("/entrar");
  expect(meta()).toEqual([{ title: "Entrar · CIRCUITO NE" }]);
});

test("a service failure from the loader is announced and tied to the form", async () => {
  page({ error: "Serviço temporariamente indisponível. Tente novamente." });
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Serviço temporariamente indisponível");
  expect(screen.getByRole("button", { name: "Entrar" }).closest("form")?.getAttribute("aria-describedby")).toBe(alert.id);
});

test("a rejected login keeps the typed e-mail, never the password, and announces the error", async () => {
  const userEvent = (await import("@testing-library/user-event")).default;
  page({}, () => ({ error: "E-mail ou senha inválidos.", email: "pessoa@example.invalid" }));
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/E-mail/), "pessoa@example.invalid");
  await user.type(screen.getByLabelText(/Senha/), "senha-errada");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  expect((await screen.findByRole("alert")).textContent).toBe("E-mail ou senha inválidos.");
  expect((screen.getByLabelText(/E-mail/) as HTMLInputElement).value).toBe("pessoa@example.invalid");
});

test("logout is only a POST action: the route has no page of its own", () => {
  expect(LogoutRoute()).toBeNull();
});
