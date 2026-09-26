import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tournaments = sqliteTable("tournaments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  game: text("game").notNull().default("TCG"),
  format: text("format").notNull().default("Suizo"),
  status: text("status").notNull().default("draft"),
  maxTables: integer("max_tables").notNull().default(8),
  totalRounds: integer("total_rounds").notNull().default(4),
  currentRound: integer("current_round").notNull().default(1),
  roundDuration: integer("round_duration").notNull().default(3000),
  timerRemaining: integer("timer_remaining").notNull().default(3000),
  timerStartedAt: text("timer_started_at"),
  timerRunning: integer("timer_running", { mode: "boolean" }).notNull().default(false),
  notice: text("notice").notNull().default(""),
  noticeVisible: integer("notice_visible", { mode: "boolean" }).notNull().default(false),
  ambientMotion: integer("ambient_motion", { mode: "boolean" }).notNull().default(false),
  soundEffects: integer("sound_effects", { mode: "boolean" }).notNull().default(true),
  viewerScreen: text("viewer_screen").notNull().default("pairings"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("tournaments_status_idx").on(table.status)]);

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  tournamentId: text("tournament_id").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("players_tournament_idx").on(table.tournamentId),
  uniqueIndex("players_tournament_name_unique").on(table.tournamentId, table.name),
]);

export const rounds = sqliteTable("rounds", {
  id: text("id").primaryKey(),
  tournamentId: text("tournament_id").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  status: text("status").notNull().default("published"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  closedAt: text("closed_at"),
}, (table) => [
  index("rounds_tournament_idx").on(table.tournamentId),
  uniqueIndex("rounds_tournament_number_unique").on(table.tournamentId, table.number),
]);

export const matches = sqliteTable("matches", {
  id: text("id").primaryKey(),
  roundId: text("round_id").notNull().references(() => rounds.id, { onDelete: "cascade" }),
  tableNumber: integer("table_number").notNull(),
  playerAId: text("player_a_id"),
  playerBId: text("player_b_id"),
  playerAName: text("player_a_name").notNull(),
  playerBName: text("player_b_name").notNull(),
  result: text("result").notNull().default("—"),
  status: text("status").notNull().default("playing"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("matches_round_idx").on(table.roundId),
  uniqueIndex("matches_round_table_unique").on(table.roundId, table.tableNumber),
]);

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  tournamentId: text("tournament_id").references(() => tournaments.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  details: text("details").notNull().default(""),
  actor: text("actor").notNull().default("local"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("audit_tournament_idx").on(table.tournamentId)]);
