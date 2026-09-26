import assert from "node:assert/strict";
import test from "node:test";
import { createTestD1 } from "./d1-test-adapter.mjs";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("admin-test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const database = createTestD1();
globalThis.__MTC_TEST_DB__ = database;

const environment = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const context = { waitUntil() {}, passThroughOnException() {} };

async function request(path, init) {
  return worker.fetch(new Request(`http://localhost${path}`, init), environment, context);
}

async function readJson(response) {
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
  const raw = await response.text();
  assert.doesNotThrow(() => JSON.parse(raw), `Expected valid JSON, received: ${raw.slice(0, 120)}`);
  return JSON.parse(raw);
}

async function getState() {
  const response = await request("/api/state");
  assert.equal(response.status, 200);
  return readJson(response);
}

async function admin(action, payload, expectedStatus = 200) {
  const response = await request("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  assert.equal(response.status, expectedStatus, `${action} returned ${response.status}`);
  return readJson(response);
}

test("all tournament administration operations return JSON and persist correctly", async () => {
  let state = await getState();
  assert.equal(state.players.length, 14);
  assert.equal(state.matches.length, 7);
  assert.equal(state.suggestedPairings.length, 7);
  assert.equal(state.tournament.soundEffects, true);
  const tournamentId = state.tournament.id;

  const deletedPlayer = state.players[0];
  state = await admin("delete_player", { tournamentId, playerId: deletedPlayer.id });
  assert.equal(state.players.length, 13);
  assert.equal(state.players.some((player) => player.id === deletedPlayer.id), false);

  const missingDelete = await admin("delete_player", { tournamentId, playerId: deletedPlayer.id }, 400);
  assert.match(missingDelete.error, /ya no existe/i);

  state = await admin("update_event", {
    tournamentId,
    name: "OP-17 Producción",
    game: "One Piece Card Game",
    format: "Suizo",
    totalRounds: 4,
    roundDuration: 2700,
    ambientMotion: true,
    soundEffects: true,
  });
  assert.equal(state.tournament.name, "OP-17 Producción");
  assert.equal(state.tournament.totalRounds, 4);
  assert.equal(state.tournament.roundDuration, 2700);
  assert.equal(state.tournament.timerRemaining, 2700);
  assert.equal(state.tournament.ambientMotion, true);
  assert.equal(state.tournament.soundEffects, true);

  const renamedPlayer = state.players[0];
  state = await admin("rename_player", { tournamentId, playerId: renamedPlayer.id, name: "Jugador Actualizado" });
  assert.equal(state.players.find((player) => player.id === renamedPlayer.id)?.name, "Jugador Actualizado");

  state = await admin("toggle_player", { tournamentId, playerId: renamedPlayer.id, active: false });
  assert.equal(state.players.find((player) => player.id === renamedPlayer.id)?.active, false);
  state = await admin("toggle_player", { tournamentId, playerId: renamedPlayer.id, active: true });
  assert.equal(state.players.find((player) => player.id === renamedPlayer.id)?.active, true);

  state = await admin("add_player", { tournamentId, name: "Jugador Nuevo" });
  assert.equal(state.players.length, 14);
  assert.equal(state.players.some((player) => player.name === "Jugador Nuevo"), true);

  const capacityError = await admin("add_player", { tournamentId, name: "Jugador Quince" }, 400);
  assert.match(capacityError.error, /14 jugadores/i);

  const capacityPlayer = state.players[0];
  state = await admin("toggle_player", { tournamentId, playerId: capacityPlayer.id, active: false });
  state = await admin("add_player", { tournamentId, name: "Ocupa Plaza Catorce" });
  const activationError = await admin("toggle_player", { tournamentId, playerId: capacityPlayer.id, active: true }, 400);
  assert.match(activationError.error, /activar más de 14/i);
  const temporaryPlayer = state.players.find((player) => player.name === "Ocupa Plaza Catorce");
  state = await admin("delete_player", { tournamentId, playerId: temporaryPlayer.id });
  state = await admin("toggle_player", { tournamentId, playerId: capacityPlayer.id, active: true });

  const duplicatedPairing = await admin("save_pairings", {
    tournamentId,
    roundNumber: 1,
    pairs: [
      { playerAName: state.players[0].name, playerBName: state.players[1].name },
      { playerAName: state.players[0].name, playerBName: state.players[2].name },
    ],
  }, 400);
  assert.match(duplicatedPairing.error, /repetido/i);
  state = await getState();
  assert.equal(state.matches.length, 7, "an invalid pairing must preserve the published round");

  for (const match of state.matches) {
    state = await admin("record_result", { tournamentId, matchId: match.id, result: "1 · 1" });
  }

  state = await admin("save_pairings", {
    tournamentId,
    roundNumber: 2,
    pairs: state.suggestedPairings,
  });
  assert.equal(state.tournament.currentRound, 2);
  assert.equal(state.matches.length, 7);

  const firstWinner = state.matches[0].playerAName;
  const secondWinner = state.matches[1].playerBName;
  const invalidBye = await admin("record_result", { tournamentId, matchId: state.matches[0].id, result: "BYE" }, 400);
  assert.match(invalidBye.error, /segundo jugador/i);
  state = await admin("record_result", { tournamentId, matchId: state.matches[0].id, result: "2 · 1" });
  assert.equal(state.matches[0].result, "2 · 1");
  assert.equal(state.matches[0].status, "reported");
  const invalidResult = await admin("record_result", { tournamentId, matchId: state.matches[0].id, result: "3-0" }, 400);
  assert.match(invalidResult.error, /no es válido/i);
  state = await admin("record_result", { tournamentId, matchId: state.matches[1].id, result: "0 · 2" });
  assert.equal(state.standings[0].matchPoints, 4);
  assert.ok(state.suggestedPairings.some((pair) => {
    const names = new Set([pair.playerAName, pair.playerBName]);
    return names.has(firstWinner) && names.has(secondWinner);
  }), "players with matching winning records should be paired together");

  const prematureRound = await admin("save_pairings", {
    tournamentId,
    roundNumber: 3,
    pairs: state.suggestedPairings,
  }, 400);
  assert.match(prematureRound.error, /todos los resultados/i);
  for (const match of state.matches.slice(2)) {
    state = await admin("record_result", { tournamentId, matchId: match.id, result: "1 · 1" });
  }

  const roundCountError = await admin("update_event", {
    tournamentId,
    name: state.tournament.name,
    game: state.tournament.game,
    format: state.tournament.format,
    totalRounds: 1,
    roundDuration: 2700,
  }, 400);
  assert.match(roundCountError.error, /ronda 2/i);

  state = await admin("set_notice", { tournamentId, notice: "Última ronda en curso", visible: true });
  assert.equal(state.tournament.notice, "Última ronda en curso");
  assert.equal(state.tournament.noticeVisible, true);

  state = await admin("timer", { tournamentId, command: "start" });
  assert.equal(state.tournament.timerRunning, true);
  state = await admin("update_event", {
    tournamentId,
    name: state.tournament.name,
    game: state.tournament.game,
    format: state.tournament.format,
    totalRounds: state.tournament.totalRounds,
    roundDuration: state.tournament.roundDuration,
    ambientMotion: true,
    soundEffects: true,
  });
  assert.equal(state.tournament.timerRunning, true, "saving effect settings must not stop the timer");
  state = await admin("timer", { tournamentId, command: "adjust", delta: 60 });
  assert.ok(state.tournament.timerRemaining >= 2759 && state.tournament.timerRemaining <= 2760);
  state = await admin("timer", { tournamentId, command: "pause" });
  assert.equal(state.tournament.timerRunning, false);
  state = await admin("timer", { tournamentId, command: "reset" });
  assert.equal(state.tournament.timerRemaining, 2700);

  state = await admin("close_round", { tournamentId, roundNumber: 2 });
  assert.equal(state.rounds.find((round) => round.number === 2)?.status, "closed");
  state = await admin("select_round", { tournamentId, roundNumber: 1 });
  assert.equal(state.tournament.currentRound, 1);

  const originalTournamentId = tournamentId;
  state = await admin("create_tournament", {
    name: "Segundo torneo",
    game: "Magic: The Gathering",
    format: "Suizo",
    totalRounds: 3,
    roundDuration: 3000,
  });
  assert.equal(state.tournament.name, "Segundo torneo");
  assert.equal(state.tournament.soundEffects, true);
  assert.equal(state.players.length, 0);
  assert.equal(state.tournaments.length, 2);
  const secondTournamentId = state.tournament.id;

  state = await admin("add_player", { tournamentId: secondTournamentId, name: "Jugador con BYE" });
  assert.deepEqual(state.suggestedPairings, [{ playerAName: "Jugador con BYE", playerBName: "BYE" }]);
  state = await admin("save_pairings", { tournamentId: secondTournamentId, roundNumber: 1, pairs: state.suggestedPairings });
  assert.equal(state.matches[0].result, "BYE");
  assert.equal(state.standings[0].matchPoints, 3);
  assert.equal(state.standings[0].gameWinPercentage, 1);
  const secondRoundId = state.rounds[0].id;

  state = await admin("activate_tournament", { tournamentId: originalTournamentId });
  assert.equal(state.tournament.id, originalTournamentId);
  assert.equal(state.tournament.status, "active");

  const activeDelete = await admin("delete_tournament", { tournamentId: originalTournamentId }, 400);
  assert.match(activeDelete.error, /evento activo/i);
  state = await admin("delete_tournament", { tournamentId: secondTournamentId });
  assert.equal(state.tournaments.length, 1);
  assert.equal(state.tournament.id, originalTournamentId);
  const deletedPlayers = await database.prepare("SELECT COUNT(*) AS count FROM players WHERE tournament_id = ?")
    .bind(secondTournamentId).first();
  assert.equal(deletedPlayers.count, 0);
  const deletedRounds = await database.prepare("SELECT COUNT(*) AS count FROM rounds WHERE tournament_id = ?")
    .bind(secondTournamentId).first();
  assert.equal(deletedRounds.count, 0);
  const deletedMatches = await database.prepare("SELECT COUNT(*) AS count FROM matches WHERE round_id = ?")
    .bind(secondRoundId).first();
  assert.equal(deletedMatches.count, 0);

  const invalid = await admin("not_an_action", { tournamentId: originalTournamentId }, 400);
  assert.match(invalid.error, /desconocida/i);
});

test("1-0 and 0-1 score as full Swiss matches and pair by match points", async () => {
  let state = await admin("create_tournament", {
    name: "Resultados a una partida", game: "TCG", format: "Suizo", totalRounds: 3, roundDuration: 3000,
  });
  const tournamentId = state.tournament.id;
  for (const name of ["A", "B", "C", "D"]) {
    state = await admin("add_player", { tournamentId, name });
  }
  state = await admin("save_pairings", { tournamentId, roundNumber: 1, pairs: state.suggestedPairings });
  assert.deepEqual(state.matches.map((match) => [match.playerAName, match.playerBName]), [["A", "B"], ["C", "D"]]);

  state = await admin("record_result", { tournamentId, matchId: state.matches[0].id, result: "1 · 0" });
  assert.equal(state.matches[0].status, "reported");
  state = await admin("record_result", { tournamentId, matchId: state.matches[1].id, result: "2 · 0" });
  assert.deepEqual(state.standings.map((player) => [player.name, player.matchPoints]), [
    ["A", 3], ["C", 3], ["B", 0], ["D", 0],
  ], "1-0 and 2-0 wins must have identical match weight and game win percentage");
  assert.equal(state.standings[0].gameWinPercentage, 1);
  assert.equal(state.standings[1].gameWinPercentage, 1);
  assert.equal(state.standings[2].gameWinPercentage, 0.33);
  assert.equal(state.standings[3].gameWinPercentage, 0.33);
  assert.deepEqual(state.suggestedPairings, [
    { playerAName: "A", playerBName: "C" },
    { playerAName: "B", playerBName: "D" },
  ], "next-round suggestions must group players by match points, without rematches");

  state = await admin("record_result", { tournamentId, matchId: state.matches[0].id, result: "2 · 1" });
  state = await admin("record_result", { tournamentId, matchId: state.matches[1].id, result: "1 · 0" });
  assert.deepEqual(state.standings.slice(0, 2).map((player) => player.name), ["C", "A"],
    "with equal match points and opponent records, 1-0 (100% games) beats 2-1 (67%)");
  state = await admin("record_result", { tournamentId, matchId: state.matches[0].id, result: "1 · 0" });
  state = await admin("record_result", { tournamentId, matchId: state.matches[1].id, result: "2 · 0" });
  state = await admin("save_pairings", { tournamentId, roundNumber: 2, pairs: state.suggestedPairings });
  state = await admin("record_result", { tournamentId, matchId: state.matches[0].id, result: "0 · 1" });
  assert.equal(state.matches[0].result, "0 · 1");
  const standingsByName = new Map(state.standings.map((player) => [player.name, player]));
  assert.equal(standingsByName.get("A").matchPoints, 3);
  assert.equal(standingsByName.get("A").losses, 1);
  assert.equal(standingsByName.get("A").gameDifferential, 0);
  assert.equal(standingsByName.get("C").matchPoints, 6);
  assert.equal(standingsByName.get("C").wins, 2);
  assert.equal(standingsByName.get("C").gameDifferential, 3);
  assert.equal(standingsByName.get("C").gameWinPercentage, 1);
});

test("admin endpoint always returns a JSON error for malformed input", async () => {
  const response = await request("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{invalid",
  });
  assert.equal(response.status, 400);
  const data = await readJson(response);
  assert.match(data.error, /no es válida/i);
});

test("admin endpoint rejects anonymous production writes with JSON", async () => {
  const response = await worker.fetch(new Request("https://mox.example/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "timer", payload: {} }),
  }), environment, context);
  assert.equal(response.status, 401);
  const data = await readJson(response);
  assert.match(data.error, /iniciar sesión/i);
});

test.after(() => {
  delete globalThis.__MTC_TEST_DB__;
  database.close();
});
