import { ensureDatabase } from "./initialize";
import { getD1 } from "./index";

export type TournamentSummary = {
  id: string;
  name: string;
  game: string;
  format: string;
  status: string;
  updatedAt: string;
};

export type PlayerRecord = {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
};

export type StandingRecord = {
  playerId: string;
  name: string;
  matchPoints: number;
  opponentMatchPoints: number;
  opponentMatchWinPercentage: number;
  gameWinPercentage: number;
  opponentGameWinPercentage: number;
  wins: number;
  draws: number;
  losses: number;
  gameDifferential: number;
  byes: number;
};

export type StandingsStatus = "provisional" | "complete" | "final";

export type StandingsSnapshot = {
  tournament: { id: string; name: string; status: string; totalRounds: number };
  roundNumber: number;
  rounds: number[];
  status: StandingsStatus;
  completedMatches: number;
  totalMatches: number;
  standings: StandingRecord[];
};

export type SuggestedPairing = {
  playerAName: string;
  playerBName: string;
};

export type MatchRecord = {
  id: string;
  table: number;
  playerAId: string | null;
  playerBId: string | null;
  playerAName: string;
  playerBName: string;
  result: string;
  status: string;
};

export type TournamentState = {
  serverNow: string;
  tournament: {
    id: string;
    name: string;
    game: string;
    format: string;
    status: string;
    maxTables: number;
    totalRounds: number;
    currentRound: number;
    roundDuration: number;
    timerRemaining: number;
    timerRunning: boolean;
    timerStartedAt: string | null;
    notice: string;
    noticeVisible: boolean;
    ambientMotion: boolean;
    soundEffects: boolean;
    viewerScreen: "pairings" | "standings";
  };
  players: PlayerRecord[];
  standings: StandingRecord[];
  standingsRound: number;
  standingsStatus: StandingsStatus;
  suggestedPairings: SuggestedPairing[];
  matches: MatchRecord[];
  rounds: Array<{ id: string; number: number; status: string; closedAt: string | null }>;
  tournaments: TournamentSummary[];
  audit: Array<{ id: string; action: string; details: string; actor: string; createdAt: string }>;
};

type TournamentRow = {
  id: string;
  name: string;
  game: string;
  format: string;
  status: string;
  max_tables: number;
  total_rounds: number;
  current_round: number;
  round_duration: number;
  timer_remaining: number;
  timer_started_at: string | null;
  timer_running: number;
  notice: string;
  notice_visible: number;
  ambient_motion: number;
  sound_effects: number;
  viewer_screen: string;
  updated_at: string;
};

type TournamentLimits = {
  id: string;
  name: string;
  status: string;
  total_rounds: number;
  current_round: number;
  max_tables: number;
  round_duration: number;
  timer_remaining: number;
  timer_started_at: string | null;
  timer_running: number;
  ambient_motion: number;
  sound_effects: number;
};

type HistoricalMatchRow = {
  player_a_id: string | null;
  player_b_id: string | null;
  player_a_name: string;
  player_b_name: string;
  round_number: number;
  result: string;
};

type PlayerRow = { id: string; name: string; active: number; sort_order: number };

type StandingAccumulator = StandingRecord & {
  active: boolean;
  sortOrder: number;
  matchesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  opponents: string[];
};

const VALID_RESULTS = new Set(["—", "2 · 0", "2 · 1", "1 · 0", "1 · 1", "1 · 2", "0 · 1", "0 · 2", "BYE"]);

export async function getTournamentState(requestedTournamentId?: string | null): Promise<TournamentState> {
  await ensureDatabase();
  const db = await getD1();
  const tournament = requestedTournamentId
    ? await db.prepare("SELECT * FROM tournaments WHERE id = ?").bind(requestedTournamentId).first<TournamentRow>()
    : await db.prepare("SELECT * FROM tournaments WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1").first<TournamentRow>();

  const selected = tournament ?? await db.prepare("SELECT * FROM tournaments ORDER BY updated_at DESC LIMIT 1").first<TournamentRow>();
  if (!selected) throw new Error("No tournament is available");

  const [playersResult, roundsResult, tournamentsResult, auditResult, historyResult] = await Promise.all([
    db.prepare("SELECT id, name, active, sort_order FROM players WHERE tournament_id = ? ORDER BY sort_order, name").bind(selected.id).all(),
    db.prepare("SELECT id, number, status, closed_at FROM rounds WHERE tournament_id = ? ORDER BY number").bind(selected.id).all(),
    db.prepare("SELECT id, name, game, format, status, updated_at FROM tournaments ORDER BY updated_at DESC").all(),
    db.prepare("SELECT id, action, details, actor, created_at FROM audit_log WHERE tournament_id = ? ORDER BY created_at DESC LIMIT 12").bind(selected.id).all(),
    db.prepare(`SELECT m.player_a_id, m.player_b_id, m.player_a_name, m.player_b_name, m.result, r.number AS round_number
      FROM matches m INNER JOIN rounds r ON r.id = m.round_id
      WHERE r.tournament_id = ? ORDER BY r.number, m.table_number`).bind(selected.id).all(),
  ]);

  const currentRound = (roundsResult.results as Array<{ id: string; number: number }>).find((round) => round.number === selected.current_round);
  const matchesResult = currentRound
    ? await db.prepare("SELECT * FROM matches WHERE round_id = ? ORDER BY table_number").bind(currentRound.id).all()
    : { results: [] };

  const remaining = calculateRemaining(selected);
  const effectiveRunning = Boolean(selected.timer_running) && remaining > 0;
  const playerRows = playersResult.results as PlayerRow[];
  const rounds = roundsResult.results as Array<{ id: string; number: number; status: string; closed_at: string | null }>;
  const history = historyResult.results as HistoricalMatchRow[];
  const standingsRound = rounds.at(-1)?.number ?? 0;
  const { standings, suggestedPairings } = calculateStandingsAndPairings(
    playerRows,
    history,
  );

  return {
    serverNow: new Date().toISOString(),
    tournament: {
      id: selected.id,
      name: selected.name,
      game: selected.game,
      format: selected.format,
      status: selected.status,
      maxTables: selected.max_tables,
      totalRounds: selected.total_rounds,
      currentRound: selected.current_round,
      roundDuration: selected.round_duration,
      timerRemaining: remaining,
      timerRunning: effectiveRunning,
      timerStartedAt: effectiveRunning ? selected.timer_started_at : null,
      notice: selected.notice,
      noticeVisible: Boolean(selected.notice_visible),
      ambientMotion: Boolean(selected.ambient_motion),
      soundEffects: Boolean(selected.sound_effects),
      viewerScreen: selected.viewer_screen === "standings" ? "standings" : "pairings",
    },
    players: playerRows.map((player) => ({
      id: player.id, name: player.name, active: Boolean(player.active), sortOrder: player.sort_order,
    })),
    standings,
    standingsRound,
    standingsStatus: getStandingsStatus(standingsRound, selected.total_rounds, rounds.length, history),
    suggestedPairings,
    matches: (matchesResult.results as Array<Record<string, unknown>>).map((match) => ({
      id: String(match.id),
      table: Number(match.table_number),
      playerAId: match.player_a_id ? String(match.player_a_id) : null,
      playerBId: match.player_b_id ? String(match.player_b_id) : null,
      playerAName: String(match.player_a_name),
      playerBName: String(match.player_b_name),
      result: String(match.result),
      status: String(match.status),
    })),
    rounds: rounds.map((round) => ({
      id: round.id, number: round.number, status: round.status, closedAt: round.closed_at,
    })),
    tournaments: (tournamentsResult.results as Array<{ id: string; name: string; game: string; format: string; status: string; updated_at: string }>).map((item) => ({
      id: item.id, name: item.name, game: item.game, format: item.format, status: item.status, updatedAt: item.updated_at,
    })),
    audit: (auditResult.results as Array<{ id: string; action: string; details: string; actor: string; created_at: string }>).map((item) => ({
      id: item.id, action: item.action, details: item.details, actor: item.actor, createdAt: item.created_at,
    })),
  };
}

export async function getStandingsSnapshot(tournamentId: string, requestedRound?: number): Promise<StandingsSnapshot> {
  await ensureDatabase();
  const db = await getD1();
  const tournament = await db.prepare("SELECT id, name, status, total_rounds FROM tournaments WHERE id = ?")
    .bind(tournamentId).first<{ id: string; name: string; status: string; total_rounds: number }>();
  if (!tournament) throw new Error("El evento seleccionado ya no existe.");

  const [playersResult, roundsResult, matchesResult] = await Promise.all([
    db.prepare("SELECT id, name, active, sort_order FROM players WHERE tournament_id = ? ORDER BY sort_order, name").bind(tournamentId).all(),
    db.prepare("SELECT number FROM rounds WHERE tournament_id = ? ORDER BY number").bind(tournamentId).all(),
    db.prepare(`SELECT m.player_a_id, m.player_b_id, m.player_a_name, m.player_b_name, m.result, r.number AS round_number
      FROM matches m INNER JOIN rounds r ON r.id = m.round_id
      WHERE r.tournament_id = ? ORDER BY r.number, m.table_number`).bind(tournamentId).all(),
  ]);
  const rounds = (roundsResult.results as Array<{ number: number }>).map((round) => round.number);
  const roundNumber = requestedRound ?? rounds.at(-1) ?? 0;
  if (requestedRound !== undefined && !rounds.includes(requestedRound)) {
    throw new Error("Esa ronda todavía no tiene pairings publicados.");
  }
  const matches = (matchesResult.results as HistoricalMatchRow[]).filter((match) => match.round_number <= roundNumber);
  const { standings } = calculateStandingsAndPairings(playersResult.results as PlayerRow[], matches, requestedRound === undefined);
  return {
    tournament: { id: tournament.id, name: tournament.name, status: tournament.status, totalRounds: tournament.total_rounds },
    roundNumber,
    rounds,
    status: getStandingsStatus(roundNumber, tournament.total_rounds, rounds.length, matches),
    completedMatches: matches.filter((match) => match.result !== "—").length,
    totalMatches: matches.length,
    standings,
  };
}

function getStandingsStatus(roundNumber: number, totalRounds: number, publishedRounds: number, matches: HistoricalMatchRow[]): StandingsStatus {
  if (!matches.length || matches.some((match) => match.result === "—")) return "provisional";
  return roundNumber === totalRounds && publishedRounds === totalRounds ? "final" : "complete";
}

export async function executeAdminAction(action: string, payload: Record<string, unknown>, actor: string) {
  await ensureDatabase();
  const db = await getD1();
  const tournamentId = String(payload.tournamentId ?? "");
  const now = new Date().toISOString();

  if (action === "create_tournament") {
    const id = crypto.randomUUID();
    const name = cleanText(payload.name, 80);
    if (!name) throw new Error("El nombre del torneo es obligatorio.");
    const game = cleanText(payload.game, 60) || "TCG";
    const format = cleanText(payload.format, 40) || "Suizo";
    const totalRounds = clampNumber(payload.totalRounds, 1, 9, 4);
    const duration = clampNumber(payload.roundDuration, 300, 7200, 3000);
    await db.batch([
      db.prepare("UPDATE tournaments SET status = 'archived', updated_at = ? WHERE status = 'active'").bind(now),
      db.prepare(`INSERT INTO tournaments (
        id, name, game, format, status, max_tables, total_rounds, current_round,
        round_duration, timer_remaining, timer_running, notice, notice_visible, sound_effects, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'active', 8, ?, 1, ?, ?, 0, '', 0, 1, ?, ?)`)
        .bind(id, name, game, format, totalRounds, duration, duration, now, now),
    ]);
    await addAudit(id, action, `Creado: ${name}`, actor);
    return { tournamentId: id };
  }

  if (!tournamentId) throw new Error("Falta identificar el torneo.");
  const tournament = await db.prepare(`SELECT id, name, status, total_rounds, current_round, max_tables,
    round_duration, timer_remaining, timer_started_at, timer_running, ambient_motion, sound_effects
    FROM tournaments WHERE id = ?`)
    .bind(tournamentId).first<TournamentLimits>();
  if (!tournament) throw new Error("El torneo seleccionado ya no existe.");

  if (action === "delete_tournament") {
    if (tournament.status === "active") throw new Error("No podés eliminar el evento activo. Activá otro evento primero.");
    const activeTournament = await db.prepare("SELECT id FROM tournaments WHERE status = 'active' LIMIT 1").first<{ id: string }>();
    if (!activeTournament) throw new Error("No hay otro evento activo al que volver después del borrado.");
    const [, deletion] = await db.batch([
      db.prepare("DELETE FROM audit_log WHERE tournament_id = ?").bind(tournamentId),
      db.prepare("DELETE FROM tournaments WHERE id = ? AND status != 'active'").bind(tournamentId),
    ]);
    assertChanged(deletion, "El evento ya no existe o volvió a estar activo.");
    return { tournamentId: activeTournament.id };
  } else if (action === "activate_tournament") {
    await db.batch([
      db.prepare("UPDATE tournaments SET status = 'archived', updated_at = ? WHERE status = 'active'").bind(now),
      db.prepare("UPDATE tournaments SET status = 'active', updated_at = ? WHERE id = ?").bind(now, tournamentId),
    ]);
  } else if (action === "update_event") {
    const name = cleanText(payload.name, 80);
    const game = cleanText(payload.game, 60);
    const format = cleanText(payload.format, 40);
    const totalRounds = clampNumber(payload.totalRounds, 1, 9, 4);
    const duration = clampNumber(payload.roundDuration, 300, 7200, 3000);
    const ambientMotion = payload.ambientMotion === undefined ? tournament.ambient_motion : payload.ambientMotion ? 1 : 0;
    const soundEffects = payload.soundEffects === undefined ? tournament.sound_effects : payload.soundEffects ? 1 : 0;
    const durationChanged = duration !== tournament.round_duration;
    if (!name || !game || !format) throw new Error("Completá nombre, juego y formato.");
    if (totalRounds < tournament.current_round) {
      throw new Error(`El evento ya está en la ronda ${tournament.current_round}; no puede tener menos rondas.`);
    }
    const result = await db.prepare(`UPDATE tournaments SET name = ?, game = ?, format = ?, total_rounds = ?,
      round_duration = ?, timer_remaining = ?, timer_started_at = ?, timer_running = ?,
      ambient_motion = ?, sound_effects = ?, updated_at = ? WHERE id = ?`)
      .bind(
        name, game, format, totalRounds, duration,
        durationChanged ? duration : tournament.timer_remaining,
        durationChanged ? null : tournament.timer_started_at,
        durationChanged ? 0 : tournament.timer_running,
        ambientMotion, soundEffects, now, tournamentId,
      ).run();
    assertChanged(result, "No se encontró el torneo que intentabas actualizar.");
  } else if (action === "add_player") {
    const name = cleanText(payload.name, 60);
    if (!name) throw new Error("Ingresá el nombre del jugador.");
    const count = await db.prepare("SELECT COUNT(*) AS count FROM players WHERE tournament_id = ? AND active = 1").bind(tournamentId).first<{ count: number }>();
    if ((count?.count ?? 0) >= 14) throw new Error("La capacidad local es de 14 jugadores.");
    const order = await db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM players WHERE tournament_id = ?").bind(tournamentId).first<{ next_order: number }>();
    await db.prepare("INSERT INTO players (id, tournament_id, name, active, sort_order, created_at) VALUES (?, ?, ?, 1, ?, ?)")
      .bind(crypto.randomUUID(), tournamentId, name, order?.next_order ?? 0, now).run();
  } else if (action === "rename_player") {
    const playerId = String(payload.playerId ?? "");
    const name = cleanText(payload.name, 60);
    if (!playerId || !name) throw new Error("Datos del jugador incompletos.");
    const result = await db.prepare("UPDATE players SET name = ? WHERE id = ? AND tournament_id = ?").bind(name, playerId, tournamentId).run();
    assertChanged(result, "El jugador ya no existe o pertenece a otro torneo.");
  } else if (action === "toggle_player") {
    const playerId = String(payload.playerId ?? "");
    const active = payload.active ? 1 : 0;
    const player = await db.prepare("SELECT active FROM players WHERE id = ? AND tournament_id = ?").bind(playerId, tournamentId).first<{ active: number }>();
    if (!player) throw new Error("El jugador ya no existe o pertenece a otro torneo.");
    if (active && !player.active) {
      const count = await db.prepare("SELECT COUNT(*) AS count FROM players WHERE tournament_id = ? AND active = 1").bind(tournamentId).first<{ count: number }>();
      if ((count?.count ?? 0) >= 14) throw new Error("No podés activar más de 14 jugadores.");
    }
    const result = await db.prepare("UPDATE players SET active = ? WHERE id = ? AND tournament_id = ?").bind(active, playerId, tournamentId).run();
    assertChanged(result, "No se pudo cambiar el estado del jugador.");
  } else if (action === "delete_player") {
    const playerId = String(payload.playerId ?? "");
    if (!playerId) throw new Error("Falta identificar al jugador que querés eliminar.");
    const result = await db.prepare("DELETE FROM players WHERE id = ? AND tournament_id = ?").bind(playerId, tournamentId).run();
    assertChanged(result, "El jugador ya no existe o pertenece a otro torneo.");
  } else if (action === "save_pairings") {
    const roundNumber = requireInteger(payload.roundNumber, 1, tournament.total_rounds, "La ronda indicada no es válida.");
    if (roundNumber > tournament.current_round + 1) throw new Error("Publicá las rondas en orden, sin saltear números.");
    if (roundNumber > tournament.current_round) {
      const completion = await db.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN m.result = '—' THEN 1 ELSE 0 END) AS pending
        FROM matches m INNER JOIN rounds r ON r.id = m.round_id
        WHERE r.tournament_id = ? AND r.number = ?`)
        .bind(tournamentId, tournament.current_round).first<{ total: number; pending: number | null }>();
      if (!completion?.total) throw new Error("Publicá primero los pairings de la ronda actual.");
      if ((completion.pending ?? 0) > 0) throw new Error("Completá todos los resultados antes de publicar la siguiente ronda.");
    }
    const pairs = Array.isArray(payload.pairs) ? payload.pairs as Array<Record<string, unknown>> : [];
    if (!pairs.length) throw new Error("Cargá al menos un pairing.");
    if (pairs.length > tournament.max_tables) throw new Error(`El máximo es de ${tournament.max_tables} mesas por ronda.`);
    const playerRows = await db.prepare("SELECT id, name FROM players WHERE tournament_id = ? AND active = 1").bind(tournamentId).all();
    const activePlayers = playerRows.results as Array<{ id: string; name: string }>;
    const expectedTables = Math.ceil(activePlayers.length / 2);
    const idByName = new Map(activePlayers.map((player) => [player.name.toLocaleLowerCase(), player.id]));
    const pairedPlayers = new Set<string>();
    let byeCount = 0;
    const validatedPairs = pairs.map((pair, index) => {
      const playerAName = cleanText(pair.playerAName, 60);
      const playerBName = cleanText(pair.playerBName, 60) || "BYE";
      if (!playerAName) throw new Error(`Falta el jugador A de la mesa ${index + 1}.`);
      const playerAKey = playerAName.toLocaleLowerCase();
      const playerBKey = playerBName.toLocaleLowerCase();
      const playerAId = idByName.get(playerAKey);
      const isBye = playerBKey === "bye";
      const playerBId = isBye ? null : idByName.get(playerBKey);
      if (!playerAId) throw new Error(`${playerAName} no figura como jugador activo.`);
      if (!isBye && !playerBId) throw new Error(`${playerBName} no figura como jugador activo.`);
      if (pairedPlayers.has(playerAKey) || (!isBye && pairedPlayers.has(playerBKey))) {
        throw new Error(`Hay un jugador repetido en los pairings de la mesa ${index + 1}.`);
      }
      if (playerAKey === playerBKey) throw new Error(`Un jugador no puede enfrentarse a sí mismo en la mesa ${index + 1}.`);
      if (isBye && ++byeCount > 1) throw new Error("Solo puede haber un BYE por ronda.");
      pairedPlayers.add(playerAKey);
      if (!isBye) pairedPlayers.add(playerBKey);
      return { playerAName, playerBName, playerAId, playerBId, isBye };
    });
    if (pairs.length !== expectedTables) throw new Error(`La ronda debe incluir a todos los jugadores activos en ${expectedTables} mesas.`);
    const expectedByes = activePlayers.length % 2;
    if (byeCount !== expectedByes) {
      throw new Error(expectedByes ? "La ronda necesita exactamente un BYE." : "No corresponde asignar un BYE con una cantidad par de jugadores.");
    }
    const missingPlayers = activePlayers.filter((player) => !pairedPlayers.has(player.name.toLocaleLowerCase()));
    if (missingPlayers.length) throw new Error(`Faltan jugadores activos: ${missingPlayers.map((player) => player.name).join(", ")}.`);

    let round = await db.prepare("SELECT id FROM rounds WHERE tournament_id = ? AND number = ?").bind(tournamentId, roundNumber).first<{ id: string }>();
    const statements: D1PreparedStatement[] = [];
    if (!round) {
      round = { id: crypto.randomUUID() };
      statements.push(db.prepare("INSERT INTO rounds (id, tournament_id, number, status, created_at) VALUES (?, ?, ?, 'published', ?)")
        .bind(round.id, tournamentId, roundNumber, now));
    } else {
      statements.push(db.prepare("DELETE FROM matches WHERE round_id = ?").bind(round.id));
      statements.push(db.prepare("UPDATE rounds SET status = 'published', closed_at = NULL WHERE id = ?").bind(round.id));
    }
    validatedPairs.forEach(({ playerAName, playerBName, playerAId, playerBId, isBye }, index) => {
      statements.push(db.prepare(`INSERT INTO matches (
        id, round_id, table_number, player_a_id, player_b_id, player_a_name, player_b_name, result, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          crypto.randomUUID(), round.id, index + 1,
          playerAId,
          playerBId,
          playerAName, playerBName,
          isBye ? "BYE" : "—",
          isBye ? "reported" : "playing", now,
        ));
    });
    statements.push(db.prepare(`UPDATE tournaments SET current_round = ?, timer_remaining = round_duration,
      timer_started_at = NULL, timer_running = 0, updated_at = ? WHERE id = ?`).bind(roundNumber, now, tournamentId));
    await db.batch(statements);
  } else if (action === "record_result") {
    const matchId = String(payload.matchId ?? "");
    const result = cleanText(payload.result, 12) || "—";
    if (!matchId) throw new Error("Falta identificar la mesa.");
    if (!VALID_RESULTS.has(result)) throw new Error("El resultado indicado no es válido.");
    const match = await db.prepare(`SELECT m.player_b_id FROM matches m
      INNER JOIN rounds r ON r.id = m.round_id WHERE m.id = ? AND r.tournament_id = ?`)
      .bind(matchId, tournamentId).first<{ player_b_id: string | null }>();
    if (!match) throw new Error("La mesa ya no existe o pertenece a otro torneo.");
    if (result === "BYE" && match.player_b_id) throw new Error("BYE solo es válido para una mesa sin segundo jugador.");
    const status = result === "—" ? "playing" : "reported";
    const updateResult = await db.prepare(`UPDATE matches SET result = ?, status = ?, updated_at = ?
      WHERE id = ? AND round_id IN (SELECT id FROM rounds WHERE tournament_id = ?)`)
      .bind(result, status, now, matchId, tournamentId).run();
    assertChanged(updateResult, "La mesa ya no existe o pertenece a otro torneo.");
  } else if (action === "timer") {
    await updateTimer(tournamentId, String(payload.command ?? ""), Number(payload.delta ?? 0));
  } else if (action === "set_notice") {
    const notice = cleanText(payload.notice, 90);
    const visible = payload.visible ? 1 : 0;
    const result = await db.prepare("UPDATE tournaments SET notice = ?, notice_visible = ?, updated_at = ? WHERE id = ?")
      .bind(notice, visible, now, tournamentId).run();
    assertChanged(result, "No se pudo actualizar el mensaje público.");
  } else if (action === "set_viewer_screen") {
    if (tournament.status !== "active") throw new Error("Solo podés cambiar el visor del evento activo.");
    const screen = payload.screen;
    if (screen !== "pairings" && screen !== "standings") throw new Error("La pantalla seleccionada no es válida.");
    const result = await db.prepare("UPDATE tournaments SET viewer_screen = ?, updated_at = ? WHERE id = ?")
      .bind(screen, now, tournamentId).run();
    assertChanged(result, "No se pudo cambiar la pantalla del visor.");
  } else if (action === "select_round") {
    const roundNumber = requireInteger(payload.roundNumber, 1, tournament.total_rounds, "La ronda indicada no es válida.");
    const exists = await db.prepare("SELECT id FROM rounds WHERE tournament_id = ? AND number = ?").bind(tournamentId, roundNumber).first();
    if (!exists) throw new Error("Esa ronda todavía no tiene pairings publicados.");
    await db.prepare(`UPDATE tournaments SET current_round = ?, timer_remaining = round_duration,
      timer_started_at = NULL, timer_running = 0, updated_at = ? WHERE id = ?`).bind(roundNumber, now, tournamentId).run();
  } else if (action === "close_round") {
    const roundNumber = requireInteger(payload.roundNumber, 1, tournament.total_rounds, "La ronda indicada no es válida.");
    const result = await db.prepare("UPDATE rounds SET status = 'closed', closed_at = ? WHERE tournament_id = ? AND number = ?")
      .bind(now, tournamentId, roundNumber).run();
    assertChanged(result, "La ronda que intentabas cerrar todavía no está publicada.");
  } else {
    throw new Error("Acción administrativa desconocida.");
  }

  await addAudit(tournamentId, action, cleanText(payload.details, 160), actor);
  return { tournamentId };
}

async function updateTimer(tournamentId: string, command: string, delta: number) {
  const db = await getD1();
  const row = await db.prepare("SELECT * FROM tournaments WHERE id = ?").bind(tournamentId).first<TournamentRow>();
  if (!row) throw new Error("Torneo no encontrado.");
  const now = new Date().toISOString();
  const remaining = calculateRemaining(row);

  if (command === "start") {
    if (remaining <= 0) throw new Error("Reiniciá el temporizador antes de iniciarlo.");
    await db.prepare("UPDATE tournaments SET timer_remaining = ?, timer_started_at = ?, timer_running = 1, updated_at = ? WHERE id = ?")
      .bind(remaining, now, now, tournamentId).run();
  } else if (command === "pause") {
    await db.prepare("UPDATE tournaments SET timer_remaining = ?, timer_started_at = NULL, timer_running = 0, updated_at = ? WHERE id = ?")
      .bind(remaining, now, tournamentId).run();
  } else if (command === "reset") {
    await db.prepare("UPDATE tournaments SET timer_remaining = round_duration, timer_started_at = NULL, timer_running = 0, updated_at = ? WHERE id = ?")
      .bind(now, tournamentId).run();
  } else if (command === "finish") {
    await db.prepare("UPDATE tournaments SET timer_remaining = 0, timer_started_at = NULL, timer_running = 0, updated_at = ? WHERE id = ?")
      .bind(now, tournamentId).run();
  } else if (command === "adjust") {
    const next = Math.max(0, Math.min(row.round_duration + 3600, remaining + Math.trunc(delta)));
    await db.prepare("UPDATE tournaments SET timer_remaining = ?, timer_started_at = ?, timer_running = ?, updated_at = ? WHERE id = ?")
      .bind(next, row.timer_running ? now : null, row.timer_running, now, tournamentId).run();
  } else {
    throw new Error("Comando de temporizador desconocido.");
  }
}

function calculateRemaining(row: TournamentRow) {
  if (!row.timer_running || !row.timer_started_at) return Math.max(0, row.timer_remaining);
  const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(row.timer_started_at)) / 1000));
  return Math.max(0, row.timer_remaining - elapsed);
}

function calculateStandingsAndPairings(
  players: PlayerRow[],
  matches: HistoricalMatchRow[],
  includeUnpairedActive = true,
) {
  const standingsById = new Map<string, StandingAccumulator>();
  const participants = new Set<string>();
  const registeredIds = new Set(players.map((player) => player.id));
  players.forEach((player) => standingsById.set(player.id, {
    playerId: player.id,
    name: player.name,
    active: Boolean(player.active),
    sortOrder: player.sort_order,
    matchPoints: 0,
    opponentMatchPoints: 0,
    opponentMatchWinPercentage: 0,
    gameWinPercentage: 0,
    opponentGameWinPercentage: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    matchesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    gameDifferential: 0,
    byes: 0,
    opponents: [],
  }));

  matches.forEach((match) => {
    for (const [id, name] of [[match.player_a_id, match.player_a_name], [match.player_b_id, match.player_b_name]] as const) {
      if (!id) continue;
      participants.add(id);
      const player = standingsById.get(id);
      if (!player) {
        // Matches keep player IDs and names even when a player was deleted later.
        standingsById.set(id, {
          playerId: id, name, active: false, sortOrder: standingsById.size,
          matchPoints: 0, opponentMatchPoints: 0, opponentMatchWinPercentage: 0,
          gameWinPercentage: 0, opponentGameWinPercentage: 0, wins: 0, draws: 0, losses: 0,
          matchesPlayed: 0, gamesWon: 0, gamesLost: 0, gameDifferential: 0, byes: 0, opponents: [],
        });
      } else if (!registeredIds.has(id)) {
        player.name = name;
      }
    }
    const playerA = match.player_a_id ? standingsById.get(match.player_a_id) : undefined;
    const playerB = match.player_b_id ? standingsById.get(match.player_b_id) : undefined;
    if (match.result === "—") return;

    if (match.result === "BYE") {
      if (playerA) {
        playerA.matchPoints += 3;
        playerA.wins += 1;
        playerA.byes += 1;
        playerA.matchesPlayed += 1;
        playerA.gamesWon += 2;
      }
      return;
    }

    const score = match.result.match(/^(\d+)\s*·\s*(\d+)$/);
    if (!score) return;
    if (playerA && match.player_b_id) playerA.opponents.push(match.player_b_id);
    if (playerB && match.player_a_id) playerB.opponents.push(match.player_a_id);
    const gamesA = Number(score[1]);
    const gamesB = Number(score[2]);
    if (playerA) {
      playerA.matchesPlayed += 1;
      playerA.gamesWon += gamesA;
      playerA.gamesLost += gamesB;
    }
    if (playerB) {
      playerB.matchesPlayed += 1;
      playerB.gamesWon += gamesB;
      playerB.gamesLost += gamesA;
    }

    if (gamesA > gamesB) {
      if (playerA) { playerA.matchPoints += 3; playerA.wins += 1; }
      if (playerB) playerB.losses += 1;
    } else if (gamesB > gamesA) {
      if (playerB) { playerB.matchPoints += 3; playerB.wins += 1; }
      if (playerA) playerA.losses += 1;
    } else {
      if (playerA) { playerA.matchPoints += 1; playerA.draws += 1; }
      if (playerB) { playerB.matchPoints += 1; playerB.draws += 1; }
    }
  });

  standingsById.forEach((standing) => {
    standing.gameDifferential = standing.gamesWon - standing.gamesLost;
    // Un 1-0 y un 2-0 valen lo mismo como match; los juegos solo desempatan por porcentaje.
    standing.gameWinPercentage = winPercentage(standing.gamesWon, standing.gamesWon + standing.gamesLost);
  });
  standingsById.forEach((standing) => {
    standing.opponentMatchPoints = Array.from(standing.opponents).reduce(
      (total, opponentId) => total + (standingsById.get(opponentId)?.matchPoints ?? 0),
      0,
    );
    const opponents = standing.opponents.map((id) => standingsById.get(id)).filter((opponent) => opponent !== undefined);
    if (opponents.length) {
      standing.opponentMatchWinPercentage = opponents.reduce(
        (total, opponent) => total + winPercentage(opponent.matchPoints, opponent.matchesPlayed * 3), 0,
      ) / opponents.length;
      standing.opponentGameWinPercentage = opponents.reduce(
        (total, opponent) => total + opponent.gameWinPercentage, 0,
      ) / opponents.length;
    }
  });

  const ranked = Array.from(standingsById.values())
    .filter((standing) => participants.has(standing.playerId) || (includeUnpairedActive && standing.active))
    .sort((left, right) =>
      right.matchPoints - left.matchPoints
      || right.opponentMatchWinPercentage - left.opponentMatchWinPercentage
      || right.gameWinPercentage - left.gameWinPercentage
      || right.opponentGameWinPercentage - left.opponentGameWinPercentage
      || right.wins - left.wins
      || left.sortOrder - right.sortOrder
      || left.name.localeCompare(right.name, "es"),
    );

  const standings: StandingRecord[] = ranked.map((standing) => ({
    playerId: standing.playerId,
    name: standing.name,
    matchPoints: standing.matchPoints,
    opponentMatchPoints: standing.opponentMatchPoints,
    opponentMatchWinPercentage: standing.opponentMatchWinPercentage,
    gameWinPercentage: standing.gameWinPercentage,
    opponentGameWinPercentage: standing.opponentGameWinPercentage,
    wins: standing.wins,
    draws: standing.draws,
    losses: standing.losses,
    gameDifferential: standing.gameDifferential,
    byes: standing.byes,
  }));

  return { standings, suggestedPairings: pairRankedPlayers(ranked.filter((standing) => standing.active)) };
}

function winPercentage(points: number, possiblePoints: number) {
  // Desempates MTR: piso de 33 % para limitar el peso de rivales con pocas victorias.
  return possiblePoints ? Math.max(0.33, points / possiblePoints) : 0.33;
}

function pairRankedPlayers(rankedPlayers: StandingAccumulator[]): SuggestedPairing[] {
  const pool = [...rankedPlayers];
  let bye: StandingAccumulator | undefined;
  if (pool.length % 2 === 1) {
    const fewestByes = Math.min(...pool.map((player) => player.byes));
    let byeIndex = pool.length - 1;
    for (let index = pool.length - 1; index >= 0; index -= 1) {
      if (pool[index].byes === fewestByes) {
        byeIndex = index;
        break;
      }
    }
    [bye] = pool.splice(byeIndex, 1);
  }

  type PairingSolution = { cost: number; pairs: Array<[number, number]> };
  const memo = new Map<number, PairingSolution>();
  const solve = (mask: number): PairingSolution => {
    if (mask === 0) return { cost: 0, pairs: [] };
    const cached = memo.get(mask);
    if (cached) return cached;

    let first = 0;
    while ((mask & (1 << first)) === 0) first += 1;
    let best: PairingSolution | undefined;
    for (let second = first + 1; second < pool.length; second += 1) {
      if ((mask & (1 << second)) === 0) continue;
      const remainingMask = mask & ~(1 << first) & ~(1 << second);
      const remaining = solve(remainingMask);
      const isRematch = pool[first].opponents.includes(pool[second].playerId);
      const pointGap = Math.abs(pool[first].matchPoints - pool[second].matchPoints);
      const pairCost = (isRematch ? 1_000_000_000 : 0) + pointGap * 10_000 + (second - first) * 10;
      const candidate = {
        cost: pairCost + remaining.cost,
        pairs: [[first, second] as [number, number], ...remaining.pairs],
      };
      if (!best || candidate.cost < best.cost) best = candidate;
    }
    const solution = best ?? { cost: 0, pairs: [] };
    memo.set(mask, solution);
    return solution;
  };

  const solution = solve((1 << pool.length) - 1);
  const pairings = solution.pairs.map(([playerA, playerB]) => ({
    playerAName: pool[playerA].name,
    playerBName: pool[playerB].name,
  }));
  if (bye) pairings.push({ playerAName: bye.name, playerBName: "BYE" });
  return pairings;
}

async function addAudit(tournamentId: string | null, action: string, details: string, actor: string) {
  const db = await getD1();
  await db.prepare("INSERT INTO audit_log (id, tournament_id, action, details, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), tournamentId, action, details, actor || "local", new Date().toISOString()).run();
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function requireInteger(value: unknown, min: number, max: number, message: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(message);
  return number;
}

function assertChanged(result: D1Result, message: string) {
  if ((result.meta?.changes ?? 0) < 1) throw new Error(message);
}
