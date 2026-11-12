// Combines supabase/migrations/*.sql into one file to paste into the Supabase SQL Editor.
//   node tools/build-setup-sql.mjs            -> supabase/setup_all_in_one.sql (new projects)
//   node tools/build-setup-sql.mjs --from 8   -> supabase/setup_update.sql (only migrations 8 and later)
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'supabase', 'migrations')
const { values } = parseArgs({ options: { from: { type: 'string' } } })
const from = values.from ? Number(values.from) : 1

const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort()
  .filter((name) => Number(name.split('_')[0].slice(-2)) >= from)

const parts = ['-- Revenue Recovery database setup. Paste into the Supabase SQL Editor and click Run.',
  '-- Generated from supabase/migrations/ by tools/build-setup-sql.mjs; runs as one transaction.', 'begin;']
for (const name of files) parts.push('', `-- ===== ${name} =====`, await readFile(join(dir, name), 'utf8'))
parts.push('', 'commit;', '')

const out = join(root, 'supabase', from > 1 ? 'setup_update.sql' : 'setup_all_in_one.sql')
await writeFile(out, parts.join('\n'))
console.log(`wrote ${out} (${files.join(', ')})`)
