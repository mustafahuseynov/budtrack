import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://budtrack:budtrack@localhost:55432/budtrack";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

const pool = new pg.Pool({ connectionString, max: 1 });

async function waitForDatabase(attempts = 15) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const client = await pool.connect();
      client.release();
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      console.log(`database not ready (attempt ${attempt}/${attempts}), retrying…`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

try {
  await waitForDatabase();
  await migrate(drizzle(pool), { migrationsFolder });
  console.log("migrations applied");
} finally {
  await pool.end();
}
