import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://budtrack:budtrack@localhost:55432/budtrack";

declare global {
  var __budtrackPool: pg.Pool | undefined;
  var __budtrackDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

const pool = global.__budtrackPool ?? new pg.Pool({ connectionString, max: 10 });

if (process.env.NODE_ENV !== "production") {
  global.__budtrackPool = pool;
}

export const db = global.__budtrackDb ?? drizzle(pool, { schema });

if (process.env.NODE_ENV !== "production") {
  global.__budtrackDb = db;
}

export { schema };
