import { getStandingsSnapshot } from "../../../db/tournament";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tournamentId = url.searchParams.get("tournamentId");
    if (!tournamentId) throw new Error("Falta identificar el evento.");
    const round = url.searchParams.get("round");
    if (round !== null && !/^[1-9]\d*$/.test(round)) throw new Error("La ronda indicada no es válida.");
    const snapshot = await getStandingsSnapshot(tournamentId, round === null ? undefined : Number(round));
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo cargar la clasificación." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
