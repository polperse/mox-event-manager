import { getD1 } from "./index";

const DEMO_PLAYERS = [
  "Marc Vidal", "Laia Pujol", "Nil Costa", "Pol Ferrer", "Júlia Roca", "Adrià Serra",
  "Oriol Puig", "Clara Mas", "Alex Martin", "Biel Solé", "Marta Font", "Eric Rius",
  "Jan Torres", "Anna Prat",
];

let initialized = false;

export async function ensureDatabase() {
  if (initialized) return;
  const db = await getD1();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      game TEXT NOT NULL DEFAULT 'TCG',
      format TEXT NOT NULL DEFAULT 'Suizo',
      status TEXT NOT NULL DEFAULT 'draft',
      max_tables INTEGER NOT NULL DEFAULT 8,
      total_rounds INTEGER NOT NULL DEFAULT 4,
      current_round INTEGER NOT NULL DEFAULT 1,
      round_duration INTEGER NOT NULL DEFAULT 3000,
      timer_remaining INTEGER NOT NULL DEFAULT 3000,
      timer_started_at TEXT,
      timer_running INTEGER NOT NULL DEFAULT 0,
      notice TEXT NOT NULL DEFAULT '',
      notice_visible INTEGER NOT NULL DEFAULT 0,
      ambient_motion INTEGER NOT NULL DEFAULT 0,
      sound_effects INTEGER NOT NULL DEFAULT 1,
      viewer_screen TEXT NOT NULL DEFAULT 'pairings',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS tournaments_status_idx ON tournaments (status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY NOT NULL,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS players_tournament_idx ON players (tournament_id)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS players_tournament_name_unique ON players (tournament_id, name)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS rounds (
      id TEXT PRIMARY KEY NOT NULL,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS rounds_tournament_idx ON rounds (tournament_id)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS rounds_tournament_number_unique ON rounds (tournament_id, number)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY NOT NULL,
      round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      table_number INTEGER NOT NULL,
      player_a_id TEXT,
      player_b_id TEXT,
      player_a_name TEXT NOT NULL,
      player_b_name TEXT NOT NULL,
      result TEXT NOT NULL DEFAULT '—',
      status TEXT NOT NULL DEFAULT 'playing',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS matches_round_idx ON matches (round_id)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS matches_round_table_unique ON matches (round_id, table_number)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY NOT NULL,
      tournament_id TEXT REFERENCES tournaments(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL DEFAULT 'local',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS audit_tournament_idx ON audit_log (tournament_id)"),
  ]);

  const columns = await db.prepare("PRAGMA table_info(tournaments)").all<{ name: string }>();
  const columnNames = new Set(columns.results.map((column) => column.name));
  const upgrades: D1PreparedStatement[] = [];
  if (!columnNames.has("ambient_motion")) {
    upgrades.push(db.prepare("ALTER TABLE tournaments ADD COLUMN ambient_motion INTEGER NOT NULL DEFAULT 0"));
  }
  if (!columnNames.has("sound_effects")) {
    upgrades.push(db.prepare("ALTER TABLE tournaments ADD COLUMN sound_effects INTEGER NOT NULL DEFAULT 1"));
  }
  if (!columnNames.has("viewer_screen")) {
    upgrades.push(db.prepare("ALTER TABLE tournaments ADD COLUMN viewer_screen TEXT NOT NULL DEFAULT 'pairings'"));
  }
  if (upgrades.length) await db.batch(upgrades);

  const row = await db.prepare("SELECT COUNT(*) AS count FROM tournaments").first<{ count: number }>();
  if (!row?.count) await seedDemoTournament(db);
  initialized = true;
}

async function seedDemoTournament(db: D1Database) {
  const tournamentId = crypto.randomUUID();
  const roundId = crypto.randomUUID();
  const playerIds = DEMO_PLAYERS.map(() => crypto.randomUUID());
  const now = new Date().toISOString();

  const statements = [
    db.prepare(`INSERT INTO tournaments (
      id, name, game, format, status, max_tables, total_rounds, current_round,
      round_duration, timer_remaining, timer_running, notice, notice_visible, sound_effects, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'active', 8, 5, 1, 3000, 3000, 0, ?, 1, 1, ?, ?)`)
      .bind(tournamentId, "OP-17 PRE-RELEASE", "ONE PIECE CARD GAME", "Suizo", "RESULTADOS EN MOSTRADOR", now, now),
    db.prepare("INSERT INTO rounds (id, tournament_id, number, status, created_at) VALUES (?, ?, 1, 'published', ?)")
      .bind(roundId, tournamentId, now),
  ];

  DEMO_PLAYERS.forEach((name, index) => {
    statements.push(db.prepare("INSERT INTO players (id, tournament_id, name, active, sort_order, created_at) VALUES (?, ?, ?, 1, ?, ?)")
      .bind(playerIds[index], tournamentId, name, index, now));
  });

  for (let index = 0; index < DEMO_PLAYERS.length; index += 2) {
    statements.push(db.prepare(`INSERT INTO matches (
      id, round_id, table_number, player_a_id, player_b_id, player_a_name, player_b_name, result, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, '—', 'playing', ?)`)
      .bind(crypto.randomUUID(), roundId, index / 2 + 1, playerIds[index], playerIds[index + 1], DEMO_PLAYERS[index], DEMO_PLAYERS[index + 1], now));
  }

  await db.batch(statements);
}
