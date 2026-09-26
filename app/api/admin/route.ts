import { executeAdminAction, getTournamentState } from "../../../db/tournament";

export const dynamic = "force-dynamic";

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Necesitás iniciar sesión para modificar el torneo." }, { status: 401, headers: JSON_HEADERS });
  }

  try {
    const body = await readRequestBody(request);
    const action = String(body.action ?? "");
    const payload = body.payload ?? {};
    const actor = request.headers.get("oai-authenticated-user-email") ?? "local-admin";
    const outcome = await executeAdminAction(action, payload, actor);
    const state = await getTournamentState(outcome.tournamentId);
    return Response.json(state, { headers: JSON_HEADERS });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "No se pudo completar la operación.";
    const message = raw.includes("UNIQUE constraint failed")
      ? "Ya existe un jugador con ese nombre en el torneo."
      : raw;
    return Response.json({ error: message }, { status: 400, headers: JSON_HEADERS });
  }
}

async function readRequestBody(request: Request) {
  try {
    return await request.json() as { action?: string; payload?: Record<string, unknown> };
  } catch {
    throw new Error("La solicitud enviada al servidor no es válida. Recargá el panel e intentá nuevamente.");
  }
}

function isAuthorized(request: Request) {
  const url = new URL(request.url);
  const isLocal = ["localhost", "127.0.0.1", "terminal.local"].includes(url.hostname);
  return isLocal || Boolean(request.headers.get("oai-authenticated-user-email"));
}
