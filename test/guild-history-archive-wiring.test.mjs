import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function text(path) { return readFile(new URL(path, root), 'utf8'); }

test('Guild history archive migration exposes only section-scoped service-role RPCs', async () => {
  const sql = await text('supabase/migrations/20260818041000_guild_history_archive.sql');
  assert.match(sql, /create table if not exists public\.guild_history_archives/i);
  assert.match(sql, /read_guild_history_coverage/i);
  assert.match(sql, /read_guild_history_section/i);
  assert.match(sql, /grant execute on function public\.read_guild_history_coverage\(text\) to service_role/i);
  assert.match(sql, /revoke all on table public\.guild_history_archives from anon, authenticated/i);
});

test('Guild history archive documentation locks evidence semantics', async () => {
  const doc = await text('docs/GUILD_HISTORY_ARCHIVE_V1.md');
  assert.match(doc, /666/);
  assert.match(doc, /16/);
  assert.match(doc, /displayedRelic = max\(0, rawRelicTier - 2\)/);
  assert.match(doc, /last observed present -> first observed absent/i);
  assert.match(doc, /Ally Code\/player identity is the membership key/i);
});
