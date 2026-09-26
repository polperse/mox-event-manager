"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { PlayerRecord, StandingsSnapshot, TournamentState } from "../../db/tournament";
import { FramePanel, LoadingScreen, WallClock, formatTime, toggleFullscreen, useAdminAction, useStageScale, useTournamentState } from "../components/lcars";
import { StandingsBoard } from "../components/standings-board";

type Section = "panel" | "players" | "pairings" | "results" | "standings" | "events";
const RESULTS = ["—", "2 · 0", "2 · 1", "1 · 0", "1 · 1", "1 · 2", "0 · 1", "0 · 2", "BYE"];

export default function ControlClient() {
  const stageStyle = useStageScale();
  const { state, seconds, error, setState } = useTournamentState(null, 1200);
  const { run, busy, message } = useAdminAction(setState);
  const [section, setSection] = useState<Section>("panel");
  if (!state) return <LoadingScreen error={error} />;

  const tournament = state.tournament;
  const activePlayers = state.players.filter((player) => player.active);
  const completed = state.matches.filter((match) => match.result !== "—").length;
  const isCritical = seconds <= 5 * 60;

  const timerCommand = (command: string, delta = 0) => run("timer", { tournamentId: tournament.id, command, delta });

  return (
    <main className="viewport">
      <div className={`lcars-stage ${isCritical ? "critical" : ""}`} style={stageStyle}>
        <section className="lcars-screen control-screen" aria-label="Consola de control del torneo">
          <div className="master-elbow master-elbow-tl" />
          <div className="master-elbow master-elbow-bl" />
          <header className="top-arm"><span className="system-code">MTC-1701 · OPERADOR</span><strong>CONSOLA DE CONTROL · {tournament.name}</strong></header>
          <div className="top-hand"><WallClock /></div>

          <nav className="side-fingers control-fingers" aria-label="Secciones de control">
            <NavButton label="Panel" code="01" active={section === "panel"} onClick={() => setSection("panel")} />
            <NavButton label="Jugadores" code={String(activePlayers.length).padStart(2, "0")} active={section === "players"} onClick={() => setSection("players")} />
            <NavButton label="Pairings" code={String(state.matches.length).padStart(2, "0")} active={section === "pairings"} onClick={() => setSection("pairings")} />
            <NavButton label="Resultados" code={`${completed}/${state.matches.length}`} active={section === "results"} onClick={() => setSection("results")} />
            <NavButton label="Standings" code="RANK" active={section === "standings"} onClick={() => setSection("standings")} />
            <NavButton label="Eventos" code={String(state.tournaments.length).padStart(2, "0")} active={section === "events"} onClick={() => setSection("events")} context />
          </nav>

          {section === "panel" || section === "results" ? (
            <Dashboard key={tournament.id} state={state} seconds={seconds} run={run} timerCommand={timerCommand} resultsOnly={section === "results"} />
          ) : section === "players" ? (
            <PlayersManager state={state} run={run} busy={busy} />
          ) : section === "pairings" ? (
            <PairingsManager key={`${tournament.id}-${tournament.currentRound}`} state={state} run={run} busy={busy} />
          ) : section === "standings" ? (
            <StandingsManager state={state} run={run} busy={busy} />
          ) : (
            <EventsManager key={tournament.id} state={state} run={run} busy={busy} />
          )}

          <footer className="bottom-arm control-bottom-arm">
            <Link href="/">F1 · Abrir Visor Público</Link>
            <button onClick={() => timerCommand(tournament.timerRunning ? "pause" : "start")}>F2 · {tournament.timerRunning ? "Pausar Ronda" : "Iniciar Ronda"}</button>
            <button onClick={() => timerCommand("finish")}>F3 · Finalizar Tiempo</button>
            <button onClick={toggleFullscreen}>F4 · Pantalla Completa</button>
            <div className={`bottom-status ${message && !message.includes("GUARDADO") ? "status-error" : ""}`}>{busy ? "Procesando…" : message || (error ? "Reconectando" : "Sistema · En Línea")}</div>
          </footer>
        </section>
      </div>
    </main>
  );
}

function NavButton({ label, code, active, context, onClick }: { label: string; code: string; active: boolean; context?: boolean; onClick: () => void }) {
  return <button className={`finger ${active ? "active-finger" : ""} ${context ? "context-finger" : ""}`} onClick={onClick}><span>{label}</span><b>{code}</b></button>;
}

function Dashboard({ state, seconds, run, timerCommand, resultsOnly }: {
  state: TournamentState;
  seconds: number;
  run: (action: string, payload: Record<string, unknown>) => Promise<TournamentState | null>;
  timerCommand: (command: string, delta?: number) => Promise<TournamentState | null>;
  resultsOnly: boolean;
}) {
  const t = state.tournament;
  const [notice, setNotice] = useState(t.notice);

  return (
    <div className={`screen-content operator-content ${resultsOnly ? "results-focus" : ""}`}>
      <div className="operator-strip">
        <FramePanel title="Control de Ronda" refText={`${String(t.currentRound).padStart(2, "0")}/${String(t.totalRounds).padStart(2, "0")}`} tone={seconds <= 300 ? "alert" : "live"} className="operator-timer-frame">
          <div className="operator-clock">{formatTime(seconds)}</div>
          <div className="operator-actions">
            <button className="action-main" onClick={() => timerCommand(t.timerRunning ? "pause" : "start")}>{t.timerRunning ? "Pausar" : "Iniciar"}</button>
            <button onClick={() => timerCommand("adjust", 60)}>+ 01 Min</button>
            <button onClick={() => timerCommand("adjust", -60)}>− 01 Min</button>
            <button className="alert-action" onClick={() => timerCommand("reset")}>Reiniciar</button>
          </div>
        </FramePanel>

        <FramePanel title="Estado del Evento" refText={t.game.slice(0, 9)} tone="context" className="config-frame">
          <dl className="key-values dashboard-values"><dt>Jugadores activos</dt><dd>{state.players.filter((p) => p.active).length}</dd><dt>Mesas publicadas</dt><dd>{state.matches.length}</dd><dt>Resultados</dt><dd>{state.matches.filter((m) => m.result !== "—").length}/{state.matches.length}</dd><dt>Formato</dt><dd>{t.format}</dd></dl>
        </FramePanel>

        <FramePanel title="Rondas Publicadas" refText="RND" tone="structure" className="round-frame">
          <div className="round-history">
            {state.rounds.length ? state.rounds.map((round) => <button className={round.number === t.currentRound ? "selected" : ""} key={round.id} onClick={() => run("select_round", { tournamentId: t.id, roundNumber: round.number })}>{String(round.number).padStart(2, "0")}</button>) : <span>Sin rondas</span>}
          </div>
          <span className="round-caption">Seleccioná para volver a mostrarla</span>
        </FramePanel>
      </div>

      <div className="operator-lower">
        <FramePanel title={`Captura de Resultados · Ronda ${String(t.currentRound).padStart(2, "0")}`} refText={`${state.matches.filter((m) => m.result !== "—").length}/${state.matches.length} Reportados`} tone="structure" className="results-frame">
          <div className="operator-results">
            {state.matches.length ? state.matches.map((match) => (
              <div className={`operator-result ${match.result !== "—" ? "result-done" : ""}`} key={match.id}>
                <span className="result-table">{String(match.table).padStart(2, "0")}</span>
                <span className="result-names"><b>{match.playerAName}</b><i>vs</i><b>{match.playerBName}</b></span>
                <select aria-label={`Resultado de la mesa ${match.table}`} value={match.result} onChange={(event) => run("record_result", { tournamentId: t.id, matchId: match.id, result: event.target.value })}>{RESULTS.map((result) => <option key={result}>{result}</option>)}</select>
              </div>
            )) : <div className="empty-state">PUBLICÁ LOS PAIRINGS PARA CARGAR RESULTADOS</div>}
          </div>
        </FramePanel>

        <div className="operator-side-stack">
          <FramePanel title="Mensaje Público" refText={t.noticeVisible ? "Transmitiendo" : "Oculto"} tone={t.noticeVisible ? "action" : "context"} className="message-frame">
            <label htmlFor="public-message">Texto del visor</label>
            <textarea id="public-message" maxLength={90} value={notice} onChange={(event) => setNotice(event.target.value)} />
            <div className="message-actions"><button onClick={() => run("set_notice", { tournamentId: t.id, notice, visible: true })}>Publicar</button><button onClick={() => run("set_notice", { tournamentId: t.id, notice, visible: false })}>Ocultar</button><span>{notice.length}/90</span></div>
          </FramePanel>
          <FramePanel title="Operaciones de Ronda" refText="OPS" tone="context" className="system-frame">
            <div className="round-operations"><button onClick={() => run("close_round", { tournamentId: t.id, roundNumber: t.currentRound })}>Cerrar ronda actual</button><span>El cierre conserva pairings y resultados en el historial.</span></div>
          </FramePanel>
        </div>
      </div>
    </div>
  );
}

function PlayersManager({ state, run, busy }: { state: TournamentState; run: (action: string, payload: Record<string, unknown>) => Promise<TournamentState | null>; busy: boolean }) {
  const [name, setName] = useState("");
  const t = state.tournament;
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!name.trim()) return; const result = await run("add_player", { tournamentId: t.id, name }); if (result) setName(""); };
  return (
    <div className="screen-content management-content">
      <FramePanel title="Registro de Jugadores" refText={`${state.players.filter((p) => p.active).length}/14 Activos`} tone="live" className="management-panel">
        <div className="management-layout">
          <div className="player-list">{state.players.map((player, index) => <PlayerRow key={player.id} player={player} index={index} tournamentId={t.id} run={run} busy={busy} />)}</div>
          <aside className="management-sidebar"><h3>Agregar jugador</h3><form onSubmit={submit}><label htmlFor="new-player">Nombre completo</label><input id="new-player" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="NOMBRE DEL JUGADOR" /><button disabled={busy || state.players.filter((p) => p.active).length >= 14}>Registrar</button></form><div className="management-help"><b>Capacidad local</b><strong>{state.players.filter((p) => p.active).length} / 14</strong><span>Los jugadores inactivos se conservan en el historial, pero no cuentan para nuevas rondas.</span></div></aside>
        </div>
      </FramePanel>
    </div>
  );
}

function PlayerRow({ player, index, tournamentId, run, busy }: { player: PlayerRecord; index: number; tournamentId: string; run: (action: string, payload: Record<string, unknown>) => Promise<TournamentState | null>; busy: boolean }) {
  const [name, setName] = useState(player.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const cleanName = name.trim();
  const nameChanged = Boolean(cleanName) && cleanName !== player.name;

  return <div className={`player-row ${!player.active ? "inactive" : ""}`}>
    <span>{String(index + 1).padStart(2, "0")}</span>
    <input aria-label={`Nombre de ${player.name}`} value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setConfirmingDelete(false); }} />
    <button className="save-player-button" disabled={busy || !nameChanged} onClick={() => run("rename_player", { tournamentId, playerId: player.id, name: cleanName })}>Guardar</button>
    <button disabled={busy} onClick={() => { setConfirmingDelete(false); run("toggle_player", { tournamentId, playerId: player.id, active: !player.active }); }}>{player.active ? "Activo" : "Inactivo"}</button>
    <button disabled={busy} className={`delete-button ${confirmingDelete ? "confirm-delete" : ""}`} onClick={async () => {
      if (!confirmingDelete) {
        setConfirmingDelete(true);
        return;
      }
      const result = await run("delete_player", { tournamentId, playerId: player.id });
      if (!result) setConfirmingDelete(false);
    }}>{confirmingDelete ? "Confirmar" : "Eliminar"}</button>
  </div>;
}

function PairingsManager({ state, run, busy }: { state: TournamentState; run: (action: string, payload: Record<string, unknown>) => Promise<TournamentState | null>; busy: boolean }) {
  const t = state.tournament;
  const initialRoundNumber = Math.min(t.totalRounds, t.currentRound + (state.matches.length ? 1 : 0));
  const [roundNumber, setRoundNumber] = useState(initialRoundNumber);
  const [text, setText] = useState(() => initialRoundNumber === t.currentRound
    ? state.matches.map((match) => `${match.playerAName} | ${match.playerBName}`).join("\n")
    : "");
  const pairs = useMemo(() => parsePairings(text).slice(0, 8), [text]);
  const hasPendingResults = state.matches.some((match) => match.result === "—");
  const advancingWithPendingResults = roundNumber > t.currentRound && hasPendingResults;
  const publish = () => run("save_pairings", { tournamentId: t.id, roundNumber, pairs });
  const fillPlayers = () => setText(
    state.suggestedPairings.map((pair) => `${pair.playerAName} | ${pair.playerBName}`).join("\n"),
  );

  return (
    <div className="screen-content management-content">
      <FramePanel title="Publicación de Emparejamientos" refText={`Máximo 08 Mesas`} tone="structure" className="management-panel pairings-manager">
        <div className="pairings-editor">
          <div className="pairings-input">
            <div className="pairings-toolbar">
              <label>Ronda <input type="number" min="1" max={t.totalRounds} value={roundNumber} onChange={(e) => setRoundNumber(Number(e.target.value))} /></label>
              <button disabled={busy || hasPendingResults} title={hasPendingResults ? "Completá todos los resultados de la ronda actual" : undefined} onClick={fillPlayers}>Cargar jugadores en orden</button>
            </div>
            <label htmlFor="pairings-text">Una mesa por línea · Jugadores separados por |</label>
            <span className={`pairing-editor-note ${hasPendingResults ? "pending" : ""}`}>
              {hasPendingResults ? "Faltan resultados de la ronda actual" : "Ordenados por resultados acumulados · Podés editar el texto antes de publicar"}
            </span>
            <textarea id="pairings-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={"JUGADOR A | JUGADOR B\nJUGADOR C | JUGADOR D"} />
            <button className="publish-pairings" disabled={busy || !pairs.length || advancingWithPendingResults} onClick={publish}>Publicar ronda {String(roundNumber).padStart(2, "0")}</button>
          </div>
          <div className="pairings-preview">
            <h3>Vista previa · {pairs.length} mesas</h3>
            {pairs.map((pair, index) => <div className="pairing-preview-row" key={`${pair.playerAName}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><b>{pair.playerAName}</b><i>vs</i><b>{pair.playerBName || "BYE"}</b></div>)}
            {!pairs.length && <div className="empty-state">PEGÁ O CARGÁ LOS EMPAREJAMIENTOS</div>}
          </div>
        </div>
      </FramePanel>
    </div>
  );
}

function StandingsManager({ state, run, busy }: { state: TournamentState; run: (action: string, payload: Record<string, unknown>) => Promise<TournamentState | null>; busy: boolean }) {
  const [eventId, setEventId] = useState(state.tournament.id);
  const [round, setRound] = useState<number | "live">("live");
  const [snapshot, setSnapshot] = useState<StandingsSnapshot | null>(null);
  const [loadError, setLoadError] = useState("");
  const selectedId = state.tournaments.some((item) => item.id === eventId) ? eventId : state.tournament.id;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const query = new URLSearchParams({ tournamentId: selectedId });
        if (round !== "live") query.set("round", String(round));
        const response = await fetch(`/api/standings?${query}`, { cache: "no-store" });
        const data = await response.json() as StandingsSnapshot & { error?: string };
        if (!response.ok) throw new Error(data.error || "No se pudo cargar la clasificación.");
        if (!cancelled) { setSnapshot(data); setLoadError(""); }
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "No se pudo cargar la clasificación.");
      }
    };
    const initial = window.setTimeout(load, 0);
    const interval = window.setInterval(load, 4000);
    return () => { cancelled = true; window.clearTimeout(initial); window.clearInterval(interval); };
  }, [selectedId, round]);

  const current = snapshot?.tournament.id === selectedId && (round === "live" || snapshot.roundNumber === round) ? snapshot : null;
  const isActive = selectedId === state.tournament.id && state.tournament.status === "active";
  const viewerShowingStandings = state.tournament.viewerScreen === "standings";

  return (
    <div className="screen-content management-content">
      <FramePanel title="Clasificación del Torneo" refText={current?.status === "final" ? "FINAL" : current?.status === "complete" ? "COMPLETA" : "PROVISIONAL"} tone={current?.status === "final" ? "live" : "structure"} className="management-panel standings-manager">
        <div className="standings-layout">
          <div className="standings-toolbar">
            <label>Evento
              <select aria-label="Evento para clasificación" value={selectedId} onChange={(event) => { setEventId(event.target.value); setRound("live"); setSnapshot(null); setLoadError(""); }}>
                {state.tournaments.map((event) => <option value={event.id} key={event.id}>{event.name} · {event.status === "active" ? "Activo" : "Archivado"}</option>)}
              </select>
            </label>
            <label>Acumulado
              <select aria-label="Ronda para clasificación" value={round} onChange={(event) => { setRound(event.target.value === "live" ? "live" : Number(event.target.value)); setSnapshot(null); setLoadError(""); }}>
                <option value="live">Última ronda · en directo</option>
                {current?.rounds.map((number) => <option value={number} key={number}>Hasta ronda {String(number).padStart(2, "0")}</option>)}
              </select>
            </label>
            <div className="standings-viewer-actions">
              <span>{!isActive ? "Consulta histórica · visor sin cambios" : round !== "live" ? "Volvé a última ronda para publicar" : "Pantalla del local"}</span>
              <button disabled={busy || !isActive || round !== "live" || viewerShowingStandings} className={viewerShowingStandings && isActive ? "selected" : ""} onClick={() => run("set_viewer_screen", { tournamentId: selectedId, screen: "standings" })}>Mostrar standings</button>
              <button disabled={busy || !isActive || !viewerShowingStandings} onClick={() => run("set_viewer_screen", { tournamentId: selectedId, screen: "pairings" })}>Mostrar pairings</button>
            </div>
          </div>
          <div className="standings-summary">
            <b>{current ? `${current.tournament.name} · ${current.roundNumber ? `Hasta ronda ${String(current.roundNumber).padStart(2, "0")}` : "Sin rondas"}` : "Sincronizando clasificación…"}</b>
            <span>{loadError || (current ? current.status === "final" ? "Clasificación final" : current.status === "complete" ? "Ronda completa" : `Provisional · ${current.completedMatches}/${current.totalMatches} mesas reportadas` : "Esperando datos")}</span>
          </div>
          {current ? <StandingsBoard standings={current.standings} /> : <div className="empty-state">{loadError || "CARGANDO STANDINGS…"}</div>}
          <div className="standings-legend">PTS · 3 victoria / 1 empate / 0 derrota <span>Desempates: OMW % · GW % · OGW %</span></div>
        </div>
      </FramePanel>
    </div>
  );
}

function EventsManager({ state, run, busy }: { state: TournamentState; run: (action: string, payload: Record<string, unknown>) => Promise<TournamentState | null>; busy: boolean }) {
  const t = state.tournament;
  const [form, setForm] = useState({
    name: t.name,
    game: t.game,
    format: t.format,
    totalRounds: t.totalRounds,
    roundDuration: t.roundDuration / 60,
    ambientMotion: t.ambientMotion,
    soundEffects: t.soundEffects,
  });
  const [newName, setNewName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const update = (key: string, value: string | number | boolean) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="screen-content management-content">
      <FramePanel title="Gestión de Eventos" refText={`${state.tournaments.length} Registrados`} tone="context" className="management-panel">
        <div className="events-layout">
          <section className="event-settings">
            <h3>Evento activo</h3>
            <label>Nombre<input value={form.name} onChange={(e) => update("name", e.target.value)} /></label>
            <label>Juego<input value={form.game} onChange={(e) => update("game", e.target.value)} /></label>
            <label>Formato<input value={form.format} onChange={(e) => update("format", e.target.value)} /></label>
            <div className="split-fields">
              <label>Rondas<input type="number" min="1" max="9" value={form.totalRounds} onChange={(e) => update("totalRounds", Number(e.target.value))} /></label>
              <label>Minutos por ronda<input type="number" min="5" max="120" value={form.roundDuration} onChange={(e) => update("roundDuration", Number(e.target.value))} /></label>
            </div>
            <div className="event-effects-settings">
              <button className={form.ambientMotion ? "enabled" : ""} onClick={() => update("ambientMotion", !form.ambientMotion)}><b>Ambientación visual</b><span>{form.ambientMotion ? "Activa" : "Inactiva"}</span></button>
              <button className={form.soundEffects ? "enabled" : ""} onClick={() => update("soundEffects", !form.soundEffects)}><b>Sonidos del visor</b><span>{form.soundEffects ? "Activos" : "Inactivos"}</span></button>
            </div>
            <button disabled={busy} onClick={() => run("update_event", { tournamentId: t.id, ...form, roundDuration: Number(form.roundDuration) * 60 })}>Guardar configuración</button>
          </section>
          <section className="event-archive">
            <h3>Historial de torneos</h3>
            {state.tournaments.map((item) => {
              const isCurrent = item.id === t.id;
              const isConfirmingDelete = confirmingDelete === item.id;
              return (
                <div className="event-history-row" key={item.id}>
                  <button className={`event-select ${isCurrent ? "current-event" : ""}`} disabled={busy || isCurrent} onClick={() => {
                    setConfirmingDelete(null);
                    run("activate_tournament", { tournamentId: item.id });
                  }}>
                    <b>{item.name}</b>
                    <span>{item.game} · {item.status}</span>
                  </button>
                  {!isCurrent && <button className={`event-delete ${isConfirmingDelete ? "confirm-delete" : ""}`} disabled={busy} onClick={async () => {
                    if (!isConfirmingDelete) {
                      setConfirmingDelete(item.id);
                      return;
                    }
                    const result = await run("delete_tournament", { tournamentId: item.id });
                    if (result) setConfirmingDelete(null);
                  }}>{isConfirmingDelete ? "Confirmar borrado" : "Eliminar"}</button>}
                </div>
              );
            })}
            <div className="new-event">
              <label>Nuevo torneo<input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="NOMBRE DEL EVENTO" /></label>
              <button disabled={busy || !newName.trim()} onClick={async () => {
                const result = await run("create_tournament", { name: newName, game: "TCG", format: "Suizo", totalRounds: 4, roundDuration: 3000 });
                if (result) setNewName("");
              }}>Crear y activar</button>
            </div>
          </section>
        </div>
      </FramePanel>
    </div>
  );
}

function parsePairings(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/\s*(?:\||\t|;)\s*/).map((part) => part.trim());
    return { playerAName: parts[0] ?? "", playerBName: parts[1] || "BYE" };
  }).filter((pair) => pair.playerAName);
}
