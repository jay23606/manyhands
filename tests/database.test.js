import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { makeWorld, applyAction, stepWorld } from "../src/world.js";
test("database permissions, actions, tick rate and no offline catch-up", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated;`,
  );
  await db.exec(await readFile("supabase/schema.sql", "utf8"));
  const call = async (sql) => (await db.query(sql)).rows[0].s;
  await assert.rejects(
    () => call(`select public.mh_enter_world('test') s`),
    /Sign in/,
  );
  await db.exec(
    `set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'; set role authenticated;`,
  );
  let s = await call(`select public.mh_enter_world('test') s`);
  assert.deepEqual(s, makeWorld());
  await assert.rejects(
    () => db.query("select * from public.mh_worlds"),
    /permission denied/,
  );
  await assert.rejects(
    () => db.query("update public.mh_worlds set state='{}'"),
    /permission denied/,
  );
  await assert.rejects(
    () => call(`select public.mh_edit_world('test','raise',999) s`),
    /valid/,
  );
  const local = makeWorld();
  applyAction(local, "raise", 0);
  s = await call(`select public.mh_edit_world('test','raise',0) s`);
  assert.deepEqual(s, local);
  const same = await call(`select public.mh_step_world('test') s`);
  assert.equal(same.age, 0);
  await db.exec(
    `reset role; update public.mh_worlds set last_tick=now()-interval '20 days'; set role authenticated;`,
  );
  s = await call(`select public.mh_step_world('test') s`);
  stepWorld(local);
  assert.deepEqual(s, local);
  assert.equal(s.age, 1);
  const again = await call(`select public.mh_step_world('test') s`);
  assert.equal(again.age, 1);
  await db.exec(
    `reset role; update public.mh_visitors set last_edit='1970-01-01'; set role authenticated;`,
  );
  const village = local.tiles.findIndex((t) => t.b);
  s = await call(`select public.mh_edit_world('test','lower',${village}) s`);
  applyAction(local, "lower", village);
  assert.deepEqual(s, local);
  // Cross-check both implementations through growth, automatic migration and founding.
  for (let n = 0; n < 65; n++) {
    await db.exec(
      `reset role; update public.mh_worlds set last_tick=now()-interval '5 seconds'; set role authenticated;`,
    );
    s = await call(`select public.mh_step_world('test') s`);
    stepWorld(local);
    assert.deepEqual(s, local, `tick ${n}`);
  }
  const source = s.tiles.findIndex(
    (t) => t.b === "village" && (t.owner || "hands") === "hands" && t.p > 1,
  );
  const target = s.tiles.findIndex((t) => !t.b && !t.tree && t.h >= 2);
  s = await call(`select public.mh_rally_world('test',${source},${target}) s`);
  assert.ok(s.walkers.some((w) => w.rally && w.owner === "hands"));
  await db.exec(
    `reset role; set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'; set role authenticated;`,
  );
  await assert.rejects(
    () => call(`select public.mh_edit_world('test','raise',0) s`),
    /Enter/,
  );
  s = await call(`select public.mh_enter_world('test') s`);
  assert.equal(s.tiles[0].h, 1);
  await db.close();
});
