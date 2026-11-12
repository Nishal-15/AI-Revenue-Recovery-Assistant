// Throwaway Postgres for engine integration tests: PGlite (Postgres compiled to WASM) behind a
// TCP socket, with the Supabase pieces our migrations depend on stubbed in.
//
//   node tools/test-db.mjs [--port 54329] [--seed]
//
// Then: TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/postgres
// PGlite is single-connection; the socket server accepts one client at a time, so test pools
// must use max_size=1.

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(repoRoot, 'supabase', 'migrations')
const seedFile = join(repoRoot, 'supabase', 'seed.sql')

// Just enough of Supabase for the migrations: the API roles and auth.users / auth.uid().
const SUPABASE_STANDINS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;
`

const parseOptions = () => {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', default: process.env.TEST_DB_PORT ?? '54329' },
      host: { type: 'string', default: '127.0.0.1' },
      seed: { type: 'boolean', default: false },
    },
  })
  return { port: Number(values.port), host: values.host, seed: values.seed }
}

const applyMigrations = async (db) => {
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort()
  for (const name of files) {
    await db.exec(await readFile(join(migrationsDir, name), 'utf8'))
    console.log(`applied ${name}`)
  }
}

const main = async () => {
  const { port, host, seed } = parseOptions()
  const db = await PGlite.create()
  await db.exec(SUPABASE_STANDINS)
  await applyMigrations(db)
  if (seed) {
    await db.exec(await readFile(seedFile, 'utf8'))
    console.log('applied seed.sql')
  }

  const server = new PGLiteSocketServer({ db, port, host, maxConnections: 1 })
  await server.start()
  console.log(`test database ready: postgresql://postgres:postgres@${host}:${port}/postgres`)

  const shutdown = async () => {
    await server.stop()
    await db.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
