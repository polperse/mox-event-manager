import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

async function getRuntimeEnv() {
  const testDatabase = (globalThis as typeof globalThis & { __MTC_TEST_DB__?: D1Database }).__MTC_TEST_DB__;
  if (testDatabase) return { DB: testDatabase };
  const { env } = await import("cloudflare:workers");
  return env as unknown as { DB?: D1Database };
}

export async function getDb() {
  const runtimeEnv = await getRuntimeEnv();
  if (!runtimeEnv.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(runtimeEnv.DB, { schema });
}

export async function getD1(): Promise<D1Database> {
  const runtimeEnv = await getRuntimeEnv();
  if (!runtimeEnv.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }
  return runtimeEnv.DB;
}
