import test from "node:test";
import assert from "node:assert/strict";
import {
  makeWorld,
  applyAction,
  stepWorld,
  stats,
  housing,
  rally,
} from "../src/world.js";
test("terrain costs faith and can move or flood occupied tiles", () => {
  const w = makeWorld();
  assert.equal(w.tiles.length, 784);
  assert.equal(stats(w).people, 15);
  const i = w.tiles.findIndex((t) => t.h > 1 && !t.b);
  const h = w.tiles[i].h;
  assert.equal(applyAction(w, "raise", i), null);
  assert.equal(w.tiles[i].h, h + 1);
  assert.equal(w.mana, 79);
  const village = w.tiles.findIndex((t) => t.b);
  assert.equal(applyAction(w, "lower", village), null);
  assert.equal(w.tiles[village].h, 2);
  assert.equal(w.tiles[village].b, "village");
  applyAction(w, "lower", village);
  applyAction(w, "lower", village);
  assert.equal(w.tiles[village].h, 0);
  assert.equal(w.tiles[village].b, null);
  assert.equal(w.tiles[village].p, 0);
});
test("growth only occurs through explicit ticks and faith stays bounded", () => {
  const w = makeWorld();
  for (let i = 0; i < 200; i++) stepWorld(w);
  assert.equal(w.age, 200);
  assert.equal(w.mana, 120);
  assert.ok(stats(w).people > 15);
  assert.ok(stats(w).villages > 3);
});
test("level land upgrades houses and crowded homes send settlers", () => {
  const w = makeWorld(),
    i = 15 * 28 + 11;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const t = w.tiles[i + dy * 28 + dx];
      t.h = 3;
      t.tree = false;
    }
  assert.equal(housing(w, i).name, "Citadel");
  w.tiles[i + 1].h = 4;
  assert.ok(housing(w, i).tier < 3);
  const original = stats(w).villages;
  for (let n = 0; n < 90; n++) stepWorld(w);
  assert.ok(stats(w).villages > original);
});
test("invalid construction and insufficient faith do not mutate state", () => {
  const w = makeWorld();
  const before = structuredClone(w);
  assert.ok(applyAction(w, "village", 0));
  assert.deepEqual(w, before);
  w.mana = 0;
  assert.ok(applyAction(w, "raise", 0));
  assert.equal(w.tiles[0].h, 0);
});
test("a rallied force can take an enemy settlement and end a citadel war", () => {
  const w = makeWorld();
  const source = 15 * 28 + 11;
  const target = source + 1;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const t = w.tiles[source + dy * 28 + dx];
    t.h = 3;
    t.tree = false;
  }
  w.tiles[source].p = 16;
  w.tiles[target] = { h: 3, tree: false, b: "village", p: 5, owner: "rival" };
  assert.equal(rally(w, source, target), true);
  stepWorld(w);
  assert.equal(w.tiles[target].owner, "hands");
  assert.equal(w.winner, "hands");
});
