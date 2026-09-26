"use client";

import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TournamentState } from "../../db/tournament";

const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

export function useStageScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return { transform: `scale(${scale})` } as CSSProperties;
}

export function useTournamentState(tournamentId?: string | null, pollMs = 1000) {
  const [state, setState] = useState<TournamentState | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [receivedAt, setReceivedAt] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const query = tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : "";
      const response = await fetch(`/api/state${query}`, { cache: "no-store" });
      const data = await readJsonResponse<TournamentState & { error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "No se pudo cargar el torneo.");
      setState(data);
      setSeconds(data.tournament.timerRemaining);
      setReceivedAt(Date.now());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Conexión interrumpida.");
    }
  }, [tournamentId]);

  useEffect(() => {
    const initial = window.setTimeout(refresh, 0);
    const id = window.setInterval(refresh, pollMs);
    return () => { window.clearTimeout(initial); window.clearInterval(id); };
  }, [refresh, pollMs]);

  useEffect(() => {
    if (!state?.tournament.timerRunning) return;
    const id = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - receivedAt) / 1000);
      setSeconds(Math.max(0, state.tournament.timerRemaining - elapsed));
    }, 250);
    return () => window.clearInterval(id);
  }, [state, receivedAt]);

  return { state, seconds, error, refresh, setState };
}

export function useAdminAction(setState: (state: TournamentState) => void) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);

  const run = useCallback(async (action: string, payload: Record<string, unknown>) => {
    if (inFlight.current) {
      setMessage("ESPERÁ A QUE TERMINE LA OPERACIÓN ACTUAL");
      return null;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      if (response.status === 401) {
        router.push(`/signin-with-chatgpt?return_to=${encodeURIComponent("/control")}`);
        return null;
      }
      const data = await readJsonResponse<TournamentState & { error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "La operación no pudo completarse.");
      setState(data);
      setMessage("CAMBIO GUARDADO");
      return data;
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message.toUpperCase() : "ERROR INESPERADO");
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [router, setState]);

  return { run, busy, message, setMessage };
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (!body.trim()) {
    throw new Error(`El servidor respondió sin datos (código ${response.status}).`);
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    if (contentType.includes("text/html") || body.trimStart().startsWith("<")) {
      throw new Error("La sesión o el servidor interrumpieron la operación. Recargá el panel e intentá nuevamente.");
    }
    throw new Error("El servidor devolvió una respuesta inválida. Recargá el panel e intentá nuevamente.");
  }
}

export function WallClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const initial = window.setTimeout(() => setNow(new Date()), 0);
    const id = window.setInterval(() => setNow(new Date()), 10_000);
    return () => { window.clearTimeout(initial); window.clearInterval(id); };
  }, []);
  if (!now) return <>--:-- · -- ---</>;
  return <>{String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")} · {String(now.getDate()).padStart(2, "0")} {MONTHS[now.getMonth()]}</>;
}

export function FramePanel({ title, refText, tone = "structure", className = "", children }: {
  title: string;
  refText: string;
  tone?: "structure" | "live" | "context" | "alert" | "action";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`frame-panel tone-${tone} ${className}`}>
      <div className="frame-panel-head"><span>{title}</span><span>{refText}</span></div>
      <div className="frame-panel-body">{children}</div>
    </section>
  );
}

export function LoadingScreen({ error }: { error?: string }) {
  return (
    <main className="viewport">
      <div className="system-loader">
        <strong>{error ? "ENLACE INTERRUMPIDO" : "INICIALIZANDO MTC"}</strong>
        <span>{error || "CARGANDO BASE DE DATOS Y ESTADO DEL TORNEO…"}</span>
      </div>
    </main>
  );
}

export function formatTime(totalSeconds: number) {
  const safe = Math.max(0, Math.trunc(totalSeconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}
