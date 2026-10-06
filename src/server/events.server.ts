import {
  mapEventDetail,
  mapEventList,
  type EventListData,
  type EventPageData,
} from "./mappers/events";
import { HttpError, unwrap, type SupabaseServerClient } from "./supabase.server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new HttpError(404, "Evento não encontrado.");

/** Agenda pública: eventos em andamento e futuros (o banco já filtra rascunhos, cancelados e coletivos não aprovados). */
export async function loadEventList(client: SupabaseServerClient): Promise<EventListData> {
  const [ongoing, future] = await Promise.all([
    client.rpc("list_events", { period: "ongoing" }),
    client.rpc("list_events", { period: "future" }),
  ]);
  return { ongoing: mapEventList(unwrap(ongoing)), future: mapEventList(unwrap(future)) };
}

/** Detalhe público: `get_event` + nome/cor do coletivo. UUID inválido ou evento invisível => 404. */
export async function loadEventPage(client: SupabaseServerClient, id: string): Promise<EventPageData> {
  if (!uuid.test(id)) throw notFound();
  const row = unwrap(await client.rpc("get_event", { target: id }));
  if (row === null) throw notFound();
  const detail = mapEventDetail(row);
  // RLS só devolve coletivos aprovados; sem linha, a página omite o link "por <coletivo>".
  const collective = unwrap(
    await client
      .from("collectives")
      .select("id,name,color")
      .eq("id", detail.evento.coletivoId)
      .maybeSingle(),
  );
  return {
    ...detail,
    coletivo: collective
      ? { id: collective.id, nome: collective.name, cor: collective.color }
      : null,
  };
}
