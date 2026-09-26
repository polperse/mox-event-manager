import { getTournamentState } from "../../../db/tournament";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const state = await getTournamentState(url.searchParams.get("tournamentId"));
    return Response.json(state, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo cargar el torneo." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
