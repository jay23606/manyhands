export const SIZE = 28;
export const COST = {
  raise: 1,
  lower: 1,
  forest: 4,
  village: 15,
  shrine: 20,
  rain: 10,
};

// Phase 2: Follower names (deterministic, persists across saves)
const FIRST_NAMES = [
  "Aela", "Beran", "Cade", "Dalia", "Emyr", "Faye", "Gavin", "Hera",
  "Ione", "Joren", "Kess", "Lena", "Maren", "Noel", "Orrin", "Piper",
  "Quin", "Rune", "Sara", "Tor", "Una", "Vale", "Wren", "Xander",
  "Yara", "Zephyr",
];

/**
 * Get follower name from deterministic seed (same across reloads)
 * Used for settlers: getFollowerName(worldAge, tileIndex, positionInTile)
 */
export function getFollowerName(worldAge, index1, index2 = 0) {
  const seed = (worldAge * 73 + index1 * 97 + index2 * 37) * 43758.5453;
  return FIRST_NAMES[Math.abs(Math.floor(seed)) % FIRST_NAMES.length];
}

export function noise(x, y) {
  return (((Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1) + 1) % 1;
}
export function makeWorld() {
  const tiles = [];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const d = Math.hypot((x - 13.2) / 12, (y - 13.8) / 10.5);
      let h = Math.max(
        0,
        Math.min(
          6,
          Math.floor(
            (1 - d) * 6 + Math.sin(x * 0.55) * 0.65 + Math.cos(y * 0.6) * 0.6,
          ),
        ),
      );
      tiles.push({
        h,
        tree: h > 1 && h < 5 && noise(x, y) > 0.65,
        b: null,
        p: 0,
      });
    }
  for (const [x, y] of [
    [11, 15],
    [16, 12],
    [13, 10],
  ]) {
    let t = tiles[y * SIZE + x];
    t.h = 3;
    t.tree = false;
    t.b = "village";
    t.p = 5;
  }
  return {
    tiles,
    mana: 80,
    age: 0,
    version: 0,
    walkers: [],
    events: [{ text: "Three settlements look to the sky.", age: 0 }],
  };
}
export function applyAction(world, type, index) {
  const t = world.tiles[index];
  if (!t || !(type in COST)) return "Choose a place on the island.";
  if (world.mana < COST[type]) return "Faith is returning. Give it a moment.";
  if (type === "raise" && t.h >= 7) return "This peak is high enough.";
  if (type === "lower" && t.h === 0) return "You have reached the seabed.";
  if (
    ["forest", "village", "shrine"].includes(type) &&
    (t.h < 2 || t.b || t.tree)
  )
    return "Choose clear land above the shore.";
  if (type === "rain" && t.h < 1) return "Bring rain to the land.";
  if (type === "raise") t.h++;
  if (type === "lower") {
    t.h--;
    if (t.h < 2) t.tree = false;
    if (t.h === 0) {
      t.b = null;
      t.p = 0;
    }
  }
  if (type === "forest") t.tree = true;
  if (type === "village") {
    t.b = "village";
    t.p = 3;
  }
  if (type === "shrine") t.b = "shrine";
  if (type === "rain")
    for (let j = 0; j < world.tiles.length; j++) {
      const q = world.tiles[j];
      if (
        Math.abs((j % SIZE) - (index % SIZE)) <= 2 &&
        Math.abs(Math.floor(j / SIZE) - Math.floor(index / SIZE)) <= 2 &&
        q.b === "village"
      )
        q.p = Math.min(housing(world, j).capacity, q.p + 2);
    }
  world.mana -= COST[type];
  world.version++;
  const names = {
    raise: "A new height rises from the earth.",
    lower: "The landscape opens.",
    forest: "A grove takes root.",
    village: "A new settlement begins.",
    shrine: "A shrine catches the light.",
    rain: "Gentle rain blesses the fields.",
  };
  world.events = [{ text: names[type], age: world.age }, ...world.events].slice(
    0,
    12,
  );
  return null;
}
export function stepWorld(world) {
  world.age++;
  world.version++;
  world.mana = Math.min(
    120,
    world.mana +
      2 +
      Math.floor(stats(world).people / 12) +
      world.tiles.filter((t) => t.b === "shrine").length * 2,
  );
  world.walkers ??= [];
  world.walkers = world.walkers.filter((w) => {
    const next = w.path[0],
      current = world.tiles[w.at];
    if (next === undefined) return false;
    const target = world.tiles[next];
    if (target.h === 0 || Math.abs(target.h - current.h) > 1) {
      w.wait = (w.wait || 0) + 1;
      return w.wait < 15;
    }
    w.from = w.at;
    w.at = next;
    w.path.shift();
    w.wait = 0;
    if (w.path.length) return true;
    if (!target.b && !target.tree && target.h >= 2) {
      target.b = "village";
      target.p = w.p;
      world.events = [
        { text: "Settlers found a new home.", age: world.age },
        ...world.events,
      ].slice(0, 12);
    } else {
      const home = world.tiles[w.home];
      if (home.b === "village") home.p += w.p;
    }
    return false;
  });
  if (world.age % 3 === 0)
    world.tiles.forEach((t, i) => {
      if (t.b !== "village") return;
      const home = housing(world, i);
      t.p = Math.min(home.capacity, t.p + home.tier + 1);
      if (t.p >= home.capacity) {
        const path = settlementPath(world, i);
        if (path) {
          t.p -= 4;
          world.walkers.push({ at: i, from: i, home: i, path, p: 4, wait: 0 });
        }
      }
    });
}
export function settlementPath(world, start) {
  const queue = [[start, []]],
    visited = new Set([start]);
  for (let head = 0; head < queue.length; head++) {
    const [at, path] = queue[head],
      x = at % SIZE,
      y = Math.floor(at / SIZE),
      tile = world.tiles[at];
    if (
      path.length >= 2 &&
      !tile.b &&
      !tile.tree &&
      tile.h >= 2 &&
      !world.walkers?.some((w) => w.path.at(-1) === at)
    ) {
      let close = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (
            x + dx >= 0 &&
            x + dx < SIZE &&
            y + dy >= 0 &&
            y + dy < SIZE &&
            world.tiles[(y + dy) * SIZE + x + dx].b === "village"
          )
            close = true;
      if (!close && housing(world, at).near >= 5) return path;
    }
    if (path.length >= 6) continue;
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ]) {
      if (x + dx < 0 || x + dx >= SIZE || y + dy < 0 || y + dy >= SIZE)
        continue;
      const n = (y + dy) * SIZE + x + dx,
        q = world.tiles[n];
      if (!visited.has(n) && q.h > 0 && Math.abs(q.h - tile.h) <= 1) {
        visited.add(n);
        queue.push([n, [...path, n]]);
      }
    }
  }
  return null;
}
export function housing(world, index) {
  const t = world.tiles[index],
    x = index % SIZE,
    y = Math.floor(index / SIZE);
  let near = 0,
    wide = 0;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      if (x + dx < 0 || x + dx >= SIZE || y + dy < 0 || y + dy >= SIZE)
        continue;
      const q = world.tiles[(y + dy) * SIZE + x + dx];
      if (q.h > 0 && q.h === t.h) {
        wide++;
        if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) near++;
      }
    }
  const tier =
    near === 9 && wide >= 21 ? 3 : near === 9 ? 2 : near >= 5 ? 1 : 0;
  return {
    tier,
    name: ["Hut", "Cottage", "Manor", "Citadel"][tier],
    capacity: [8, 18, 40, 80][tier],
    near,
    wide,
  };
}
export function stats(w) {
  return {
    people:
      w.tiles.reduce((n, t) => n + t.p, 0) +
      (w.walkers || []).reduce((n, t) => n + t.p, 0),
    villages: w.tiles.filter((t) => t.b === "village").length,
    trees: w.tiles.filter((t) => t.tree).length,
  };
}
