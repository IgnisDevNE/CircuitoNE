import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import IdentityPage from "../../src/routes/identity";

beforeEach(() =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  ),
);
const page = (path: string, data: object) =>
  render(
    <RouterProvider
      router={createMemoryRouter(
        [{ id: "root", path: "*", loader: () => data, Component: IdentityPage }],
        { initialEntries: [path], hydrationData: { loaderData: { root: data } } },
      )}
    />,
  );
test("real login presents empty credentials and no demo or unfinished registration link", async () => {
  page("/entrar", {});
  expect(await screen.findByRole("button", { name: "Entrar" })).toBeTruthy();
  expect((screen.getByLabelText(/E-mail/) as HTMLInputElement).value).toBe("");
  expect((screen.getByLabelText(/Senha/) as HTMLInputElement).value).toBe("");
  expect(screen.queryByRole("button", { name: /demo/i })).toBeNull();
  expect(screen.queryByRole("link", { name: /cadastre/i })).toBeNull();
});
test("account page shows only its verified identity and a POST logout", async () => {
  page("/painel", {
    account: { id: "A", name: "Pessoa A sintética", state: "active", reason: null },
  });
  expect(await screen.findByText("Pessoa A sintética")).toBeTruthy();
  const button = screen.getByRole("button", { name: "Sair" });
  expect(button.closest("form")?.getAttribute("method")).toBe("post");
  expect(button.closest("form")?.getAttribute("action")).toBe("/sair");
  expect(screen.queryByText(/Ana Ribeiro/)).toBeNull();
});
test("suspended account exposes reason and support, with no operational menus", async () => {
  page("/painel", {
    account: {
      id: "A",
      name: "Pessoa A sintética",
      state: "suspended",
      reason: "Revisão sintética",
    },
  });
  expect(await screen.findByText("Revisão sintética")).toBeTruthy();
  expect(screen.getByRole("link", { name: /suporte/i }).getAttribute("href")).toBe(
    "mailto:ignisdev@magalz.space",
  );
  expect(screen.queryByRole("link", { name: /mensagens|coletivos|explorar/i })).toBeNull();
});
