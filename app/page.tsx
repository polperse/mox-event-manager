"use client";

import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { TournamentState } from "../db/tournament";
import { FramePanel, LoadingScreen, WallClock, formatTime, toggleFullscreen, useStageScale, useTournamentState } from "./components/lcars";

type ViewerSound = "pairings" | "result" | "five-minute" | "timeout";
type ViewerEffect = ViewerSound | null;

const SOUNDS: Record<ViewerSound, { src: string; volume: number }> = {
  pairings: { src: "/sounds/load-pairing-chip.mp3", volume: 0.45 },
  result: { src: "/sounds/load-result.mp3", volume: 0.25 },
  "five-minute": { src: "/sounds/5-min-alarm.mp3", volume: 0.3 },
  timeout: { src: "/sounds/time-out-alarm.mp3", volume: 0.65 },
};

export default function DisplayPage() {
  const stageStyle = useStageScale();
  const { state, seconds, error } = useTournamentState(null, 1000);
  const viewerEffects = useViewerEffects(state, seconds);
  if (!state) return <LoadingScreen error={error} />;

  const tournament = state.tournament;
  const players = state.players.filter((player) => player.active);
  const matches = state.matches.slice(0, tournament.maxTables);
  const completed = matches.filter((match) => match.result !== "—").length;
  const isCritical = seconds <= 5 * 60;
  const segments = Math.max(10, Math.min(60, Math.ceil(tournament.roundDuration / 60)));
  const gaugeRemaining = Math.max(0, Math.min(segments, seconds / 60));

  return (
    <main className="viewport">
      <div className={`lcars-stage ${isCritical ? "critical" : ""} ${tournament.ambientMotion ? "motion-enabled" : ""} ${viewerEffects.effect ? `effect-${viewerEffects.effect}` : ""}`} style={stageStyle}>
        <section className="lcars-screen public-screen" aria-label="Visor público del torneo">
          <div className="master-elbow master-elbow-tl" />
          <div className="master-elbow master-elbow-bl" />

          <header className="top-arm">
            <span className="system-code">MTC-1701 · SEC 04-A</span>
            <strong>{tournament.name} · MOX TCG</strong>
          </header>
          <div className="top-hand"><WallClock /></div>

          <aside className="side-fingers public-fingers" aria-label="Estado del evento">
            <div className="finger active-finger"><span>Ronda</span><b>{String(tournament.currentRound).padStart(2, "0")} / {String(tournament.totalRounds).padStart(2, "0")}</b></div>
            <div className="finger"><span>Jugadores</span><b>{String(players.length).padStart(2, "0")}</b></div>
            <div className="finger"><span>Mesas</span><b>{String(matches.length).padStart(2, "0")}</b></div>
            <div className="finger context-finger"><span>Resultados</span><b>{completed} / {matches.length}</b></div>
            <div className={`finger ${error ? "alert-finger" : "live-finger"}`}><span>Enlace</span><b>{error ? "Error" : "Activo"}</b></div>
          </aside>

          <div className="screen-content public-content">
            <div className="public-strip">
              <FramePanel title="Tiempo de Ronda" refText={`${String(tournament.currentRound).padStart(2, "0")}/${String(tournament.totalRounds).padStart(2, "0")}`} tone={isCritical ? "alert" : "live"} className="timer-frame">
                <div className={`clock-number ${isCritical ? "clock-critical" : ""}`}>{formatTime(seconds)}</div>
                <div className="clock-caption">{seconds === 0 ? "Tiempo agotado · Completar turnos extra" : tournament.timerRunning ? "Restante · Ronda en curso" : "Temporizador pausado"}</div>
                <div className="segment-gauge" aria-hidden="true">
                  {Array.from({ length: segments }, (_, index) => {
                    const fill = Math.max(0, Math.min(1, gaugeRemaining - index));
                    return <i key={index}><span style={{ transform: `scaleX(${fill})` }} /></i>;
                  })}
                </div>
              </FramePanel>

              <FramePanel title="Estado del Evento" refText={tournament.game.slice(0, 10)} tone="context" className="event-frame">
                <dl className="key-values">
                  <dt>Inscritos</dt><dd>{String(players.length).padStart(2, "0")}</dd>
                  <dt>Mesas activas</dt><dd>{String(matches.length).padStart(2, "0")}</dd>
                  <dt>Resultados</dt><dd>{completed} / {matches.length}</dd>
                  <dt>Formato</dt><dd>{tournament.format}</dd>
                </dl>
              </FramePanel>

              <FramePanel title="Protocolo de Ronda" refText={error ? "LINK-ERR" : "SYS-OK"} tone={isCritical || error ? "alert" : "structure"} className="protocol-frame">
                <div className="protocol-copy">
                  <b>{seconds === 0 ? "TIEMPO FINALIZADO" : tournament.timerRunning ? "RONDA EN CURSO" : "RONDA EN PAUSA"}</b>
                  <span>{seconds === 0 ? "Finalizad el turno actual y proceded con los turnos adicionales." : "Reportad el resultado al organizador al terminar la partida."}</span>
                  {tournament.ambientMotion && <TelemetryCascade />}
                </div>
              </FramePanel>
            </div>

            <FramePanel title={`Emparejamientos · Ronda ${String(tournament.currentRound).padStart(2, "0")}`} refText={`${String(matches.length).padStart(2, "0")} Mesas`} tone="structure" className="pairings-frame">
              <div className={`public-tables table-count-${matches.length}`}>
                {matches.length ? matches.map((match) => (
                  <article className={`public-table ${match.result !== "—" ? "table-done" : ""} ${viewerEffects.highlightedMatches.includes(match.id) ? "table-new-result" : ""}`} key={match.id}>
                    <div className="public-table-no"><small>Mesa</small>{String(match.table).padStart(2, "0")}</div>
                    <div className="public-table-players">
                      <strong>{match.playerAName}</strong>
                      <strong>{match.playerBName}</strong>
                      <span>{match.result === "—" ? "En juego" : match.result === "BYE" ? "Bye otorgado" : `${match.result} · Reportado`}</span>
                    </div>
                  </article>
                )) : <div className="empty-state">ESPERANDO PUBLICACIÓN DE EMPAREJAMIENTOS</div>}
              </div>
            </FramePanel>
          </div>

          <footer className="bottom-arm public-bottom-arm">
            <div className="bottom-message"><b>{tournament.noticeVisible ? "Aviso" : "Sistema"}</b><span>{tournament.noticeVisible ? tournament.notice : "SIN MENSAJES ACTIVOS"}</span></div>
            <Link href="/control">Control</Link>
            <button className={`audio-toggle ${viewerEffects.audioReady ? "audio-enabled" : ""}`} disabled={!tournament.soundEffects} onClick={viewerEffects.toggleAudio}>{tournament.soundEffects ? !viewerEffects.audioEnabled ? "Activar audio" : viewerEffects.audioReady ? "Silenciar audio" : "Audio pendiente" : "Audio desactivado"}</button>
            <button onClick={toggleFullscreen}>Pantalla completa</button>
            <div className="bottom-status">Visor Público · {error ? "Reconectando" : "En Línea"}</div>
          </footer>
        </section>
      </div>
    </main>
  );
}

function TelemetryCascade() {
  const rows = [
    ["1701", "04-A", "7109", "SYS"],
    ["0426", "88", "MTC", "1966"],
    ["SEC", "1209", "05", "READY"],
  ];
  return <div className="telemetry-cascade" aria-hidden="true">{rows.map((row, rowIndex) => <div key={rowIndex}>{row.map((value) => <i key={value}>{value}</i>)}</div>)}</div>;
}

function useViewerEffects(state: TournamentState | null, seconds: number) {
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  const [effect, setEffect] = useState<ViewerEffect>(null);
  const [highlightedMatches, setHighlightedMatches] = useState<string[]>([]);
  const audioContext = useRef<AudioContext | null>(null);
  const audioBuffers = useRef<Partial<Record<ViewerSound, AudioBuffer>>>({});
  const activeSources = useRef(new Set<AudioBufferSourceNode>());
  const seenAuditIds = useRef(new Set<string>());
  const previousState = useRef<{ tournamentId: string; round: number; results: Map<string, string> } | null>(null);
  const previousTimer = useRef<{ tournamentId: string; round: number; seconds: number } | null>(null);
  const firedTimerAlerts = useRef(new Set<string>());
  const effectTimer = useRef<number | null>(null);

  useEffect(() => {
    const sources = activeSources.current;
    return () => {
      sources.forEach((source) => source.stop());
      if (audioContext.current) void audioContext.current.close();
      if (effectTimer.current !== null) window.clearTimeout(effectTimer.current);
    };
  }, []);

  const startSound = useCallback((sound: ViewerSound, volume = SOUNDS[sound].volume) => {
    const context = audioContext.current;
    const buffer = audioBuffers.current[sound];
    if (!context || context.state !== "running" || !buffer) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(context.destination);
    activeSources.current.add(source);
    source.onended = () => activeSources.current.delete(source);
    source.start();
  }, []);

  const prepareAudio = useCallback(async (playConfirmation = false) => {
    const context = audioContext.current ?? new AudioContext();
    audioContext.current = context;
    await context.resume();
    if (context.state !== "running") throw new Error("El navegador todavía no permitió reproducir audio.");
    if (Object.keys(audioBuffers.current).length !== Object.keys(SOUNDS).length) {
      const entries = await Promise.all(Object.entries(SOUNDS).map(async ([name, config]) => {
        const response = await fetch(config.src);
        if (!response.ok) throw new Error(`No se pudo cargar ${config.src}`);
        return [name, await context.decodeAudioData(await response.arrayBuffer())] as const;
      }));
      audioBuffers.current = Object.fromEntries(entries) as Record<ViewerSound, AudioBuffer>;
    }
    setAudioReady(true);
    if (playConfirmation) startSound("result", 0.12);
  }, [startSound]);

  useEffect(() => {
    if (!state?.tournament.soundEffects || !audioEnabled || audioReady) return;
    const attempt = window.setTimeout(() => void prepareAudio().catch(() => undefined), 0);
    const unlock = () => void prepareAudio().catch(() => undefined);
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.clearTimeout(attempt);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [audioEnabled, audioReady, prepareAudio, state?.tournament.soundEffects]);

  const playSound = useEffectEvent((sound: ViewerSound) => {
    if (!state?.tournament.soundEffects || !audioEnabled) return;
    startSound(sound);
  });

  const showEffect = useEffectEvent((nextEffect: Exclude<ViewerEffect, null>, matchIds: string[] = []) => {
    if (!state?.tournament.ambientMotion) return;
    setEffect(nextEffect);
    setHighlightedMatches(matchIds);
    if (effectTimer.current !== null) window.clearTimeout(effectTimer.current);
    effectTimer.current = window.setTimeout(() => {
      setEffect(null);
      setHighlightedMatches([]);
    }, nextEffect === "pairings" ? 2200 : 1500);
  });

  useEffect(() => {
    if (!state) return;
    const current = {
      tournamentId: state.tournament.id,
      round: state.tournament.currentRound,
      results: new Map(state.matches.map((match) => [match.id, match.result])),
    };
    const previous = previousState.current;
    if (previous?.tournamentId === current.tournamentId) {
      const newAudits = state.audit.filter((entry) => !seenAuditIds.current.has(entry.id));
      const pairingsPublished = newAudits.some((entry) => entry.action === "save_pairings");
      if (pairingsPublished && state.matches.length) {
        showEffect("pairings");
        playSound("pairings");
      } else if (newAudits.some((entry) => entry.action === "record_result") && previous.round === current.round) {
        const changedResults = state.matches
          .filter((match) => match.result !== "—" && previous.results.get(match.id) !== match.result)
          .map((match) => match.id);
        if (changedResults.length) {
          showEffect("result", changedResults);
          playSound("result");
        }
      }
    } else {
      seenAuditIds.current.clear();
    }
    state.audit.forEach((entry) => seenAuditIds.current.add(entry.id));
    previousState.current = current;
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const timer = previousTimer.current;
    const contextMatches = timer?.tournamentId === state.tournament.id && timer.round === state.tournament.currentRound;
    const contextKey = `${state.tournament.id}:${state.tournament.currentRound}`;
    const fiveMinuteKey = `${contextKey}:five-minute`;
    const timeoutKey = `${contextKey}:timeout`;

    if (seconds > 300) firedTimerAlerts.current.delete(fiveMinuteKey);
    if (seconds > 0) firedTimerAlerts.current.delete(timeoutKey);
    if (contextMatches && timer.seconds > 300 && seconds <= 300 && seconds > 0 && !firedTimerAlerts.current.has(fiveMinuteKey)) {
      firedTimerAlerts.current.add(fiveMinuteKey);
      showEffect("five-minute");
      playSound("five-minute");
    }
    if (contextMatches && timer.seconds > 0 && seconds === 0 && !firedTimerAlerts.current.has(timeoutKey)) {
      firedTimerAlerts.current.add(timeoutKey);
      showEffect("timeout");
      playSound("timeout");
    }
    previousTimer.current = { tournamentId: state.tournament.id, round: state.tournament.currentRound, seconds };
  }, [seconds, state]);

  const toggleAudio = async () => {
    if (!state?.tournament.soundEffects) return;
    if (audioEnabled && audioReady) {
      activeSources.current.forEach((source) => source.stop());
      if (audioContext.current) await audioContext.current.suspend();
      setAudioEnabled(false);
      setAudioReady(false);
      return;
    }
    try {
      setAudioEnabled(true);
      await prepareAudio(true);
    } catch {
      setAudioEnabled(false);
      setAudioReady(false);
    }
  };

  return { audioEnabled, audioReady, effect, highlightedMatches, toggleAudio };
}
