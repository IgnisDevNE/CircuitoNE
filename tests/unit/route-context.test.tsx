import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import App from "../../src/App"
import { artistas, coletivos, demoUser } from "../../src/data/mock"

const originalAtuacoes = demoUser.atuacoes
const originalLitoralMembers = coletivos[0].membros
const originalMembers = coletivos[1].membros
const originalElementScrollTo = HTMLElement.prototype.scrollTo

afterEach(() => {
  demoUser.atuacoes = originalAtuacoes
  coletivos[0].membros = originalLitoralMembers
  coletivos[1].membros = originalMembers
  if (originalElementScrollTo)
    HTMLElement.prototype.scrollTo = originalElementScrollTo
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo")
})

function go(path: string) {
  window.history.pushState({}, "", path)
  fireEvent(window, new PopStateEvent("popstate"))
}

async function login() {
  const user = userEvent.setup()
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
  HTMLElement.prototype.scrollTo = vi.fn()
  window.history.replaceState({}, "", "/entrar")
  render(<App />)
  await user.click(
    screen.getByRole("button", { name: "[demo] entrar como Ana" }),
  )
  return user
}

describe("troca de identidade da rota sem desmontar a sessão demo", () => {
  it("não trata visitante ou ex-membro como membro nível zero", async () => {
    coletivos[0].membros = originalLitoralMembers.filter((m) => m.userId !== "u-demo")
    await login()

    go("/coletivo/col-litoral/painel")
    expect(screen.getByText(/sem vínculo com este coletivo/i)).toBeTruthy()
    expect(screen.queryByRole("navigation", { name: "Seções do coletivo" })).toBeNull()

    go("/coletivo/col-litoral/editar")
    expect(screen.getByText(/sem vínculo com este coletivo/i)).toBeTruthy()
    expect(screen.queryByRole("textbox", { name: /Nome/ })).toBeNull()
  })

  it("mantém acesso ao painel para membro real de nível zero", async () => {
    coletivos[0].membros = originalLitoralMembers.map((m) =>
      m.userId === "u-demo" ? { ...m, cargoId: "c-membro" } : m,
    )
    await login()
    go("/coletivo/col-litoral/painel")

    expect(screen.getByRole("navigation", { name: "Seções do coletivo" })).toBeTruthy()
    expect(screen.getByText("Membro · nível 0")).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Criar Evento" })).toBeNull()
  })

  it("descarta o rascunho da atuação anterior", async () => {
    demoUser.atuacoes = [...originalAtuacoes, artistas[1]]
    const user = await login()
    go("/painel/perfil/art-anerie")
    const nome = screen.getByRole("textbox", {
      name: /Nome artístico/,
    }) as HTMLInputElement
    await user.clear(nome)
    await user.type(nome, "Rascunho de A")

    go("/painel/perfil/art-boitata")
    expect(
      (screen.getByRole("textbox", {
        name: /Nome artístico/,
      }) as HTMLInputElement).value,
    ).toBe("BOITATÁ SYSTEM")
    go("/painel/perfil/art-anerie")
    expect(
      (screen.getByRole("textbox", {
        name: /Nome artístico/,
      }) as HTMLInputElement).value,
    ).toBe("ANERIE")
  })

  it("carrega dados e cargos do coletivo atual", async () => {
    coletivos[1].membros = originalMembers.map((m) =>
      m.userId === "u-demo" ? { ...m, cargoId: "u-admin" } : m,
    )
    const user = await login()
    go("/coletivo/col-litoral/editar")
    const nome = screen.getAllByRole("textbox", {
      name: /Nome/,
    })[0] as HTMLInputElement
    await user.clear(nome)
    await user.type(nome, "Rascunho Litoral")

    go("/coletivo/col-usina/editar")
    expect(
      (screen.getAllByRole("textbox", { name: /Nome/ })[0] as HTMLInputElement)
        .value,
    ).toBe("USINA PRODUÇÕES")
    expect(screen.getByText("Diretoria")).toBeTruthy()
    expect(screen.queryByText("Administração")).toBeNull()
  })

  it("não exibe conversa do coletivo anterior", async () => {
    const user = await login()
    go("/coletivo/col-litoral/mensagens")
    expect(screen.getByText(/Cartaz do Porto Noturno/)).toBeTruthy()
    await user.type(screen.getByRole("textbox", { name: /Mensagem para Litoral/ }), "Rascunho privado de A")

    go("/coletivo/col-usina/mensagens")
    expect(screen.getByText(/Estrutura de palco confirmada/)).toBeTruthy()
    expect(screen.queryByText(/Cartaz do Porto Noturno/)).toBeNull()
    expect((screen.getByRole("textbox", { name: /Mensagem para Usina/ }) as HTMLInputElement).value).toBe("")
  })

  it("não marca como lida uma conversa sem permissão", async () => {
    coletivos[1].membros = originalMembers.map((m) =>
      m.userId === "u-demo" ? { ...m, cargoId: "u-membro" } : m,
    )
    await login()
    expect(screen.getAllByRole("link", { name: "Mensagens (3)" }).length).toBeGreaterThan(0)

    go("/coletivo/col-usina/mensagens")
    expect(screen.getByText(/não tem permissão para ver as mensagens/)).toBeTruthy()
    expect(screen.getAllByRole("link", { name: "Mensagens (3)" }).length).toBeGreaterThan(0)
  })
})
