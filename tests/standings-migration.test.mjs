import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createTestD1 } from "./d1-test-adapter.mjs";

test("existing tournaments keep their data when the viewer preference is added", async () => {
  const database = createTestD1();
  try {
    for (const name of ["0000_cynical_overlord", "0001_pink_kitty_pryde", "0002_bright_squadron_sinister"]) {
      const migration = await readFile(new URL(`../drizzle/${name}.sql`, import.meta.url), "utf8");
      for (const statement of migration.split(/\s*--> statement-breakpoint\s*/).filter(Boolean)) {
        await database.prepare(statement).run();
      }
    }
    await database.prepare("INSERT INTO tournaments (id, name, status) VALUES ('old-event', 'Torneo anterior', 'active')").run();
    await database.prepare("INSERT INTO players (id, tournament_id, name) VALUES ('old-player', 'old-event', 'Jugador anterior')").run();
    globalThis.__MTC_TEST_DB__ = database;
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("migration-test", `${process.pid}-${Date.now()}`);
    const { default: worker } = await import(workerUrl.href);
    const response = await worker.fetch(new Request("http://localhost/api/state"), {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    }, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(response.status, 200);
    const state = await response.json();
    assert.equal(state.tournament.id, "old-event");
    assert.equal(state.tournament.viewerScreen, "pairings");
    assert.equal(state.players[0].name, "Jugador anterior");
    const columns = await database.prepare("PRAGMA table_info(tournaments)").all();
    assert.ok(columns.results.some((column) => column.name === "viewer_screen"));
  } finally {
    delete globalThis.__MTC_TEST_DB__;
    database.close();
  }
});
