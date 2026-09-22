import { test, expect } from "@playwright/test";
test("terrain interaction, persistence, controls and honest connection setup", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#people")).toHaveText("15");
  await page.locator("#world").click({ position: { x: 640, y: 370 } });
  await expect(page.locator("#event")).toHaveText(
    "A new height rises from the earth.",
  );
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("manyhands-world")),
  );
  expect(state.version).toBeGreaterThan(0);
  await page.reload();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("manyhands-world")).tiles,
    ),
  ).toEqual(state.tiles);
  await page.keyboard.press("3");
  await expect(page.locator('[data-tool="forest"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#share").click();
  await expect(page.locator("#connect-dialog")).toBeVisible();
  await page.locator("#join").click();
  await expect(page.locator("#toast")).toContainText("Supabase");
  await page.keyboard.press("Escape");
  await page.locator("#help").click();
  await expect(page.locator("#help-dialog")).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile controls fit without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  for (const selector of [".tools", ".brand", "#share", ".camera"]) {
    const b = await page.locator(selector).boundingBox();
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(390);
  }
  await page.locator('[data-tool="village"]').click();
  await expect(page.locator('[data-tool="village"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
test("right-click lowers and Space-drag does not sculpt", async ({ page }) => {
  await page.goto("/");
  await page.locator("#world").click({ position: { x: 640, y: 370 } });
  const sum = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("manyhands-world")).tiles.reduce(
        (n, t) => n + t.h,
        0,
      ),
    );
  const before = await sum();
  await page
    .locator("#world")
    .click({ position: { x: 640, y: 360 }, button: "right" });
  expect(await sum()).toBe(before - 1);
  const after = await sum();
  await page.keyboard.down("Space");
  await page.mouse.move(640, 370);
  await page.mouse.down();
  await page.mouse.move(720, 390, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  expect(await sum()).toBe(after);
});
test("two-finger pan and pinch do not accidentally change terrain", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => {
    const c = document.querySelector("canvas");
    const fire = (type, id, x, y) =>
      c.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          pointerType: "touch",
          clientX: x,
          clientY: y,
          bubbles: true,
        }),
      );
    c.setPointerCapture = () => {};
    fire("pointerdown", 1, 170, 400);
    fire("pointerdown", 2, 230, 400);
    fire("pointermove", 1, 130, 390);
    fire("pointermove", 2, 270, 410);
    fire("pointerup", 1, 130, 390);
    fire("pointerup", 2, 270, 410);
  });
  expect(
    await page.evaluate(() => localStorage.getItem("manyhands-world")),
  ).toBeNull();
});
test("top-down map is precise and returns to isometric", async ({ page }) => {
  await page.goto("/");
  // Establish the saved local island before comparing terrain totals.
  await page.locator("#world").click({ position: { x: 640, y: 370 } });
  await page.locator('[data-tool="raise"]').click();
  await page.locator("#view-toggle").click();
  await expect(page.locator("#view-toggle")).toHaveText("3D");
  await expect(page.locator("#view-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#toast")).toContainText("Top-down map");
  // Let the renderer recalculate its square-grid scale before selecting a tile.
  await page.waitForTimeout(100);
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("manyhands-world")).tiles.reduce(
      (sum, tile) => sum + tile.h,
      0,
    ),
  );
  const box = await page.locator("#world").boundingBox();
  await page
    .locator("#world")
    .click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("manyhands-world")).tiles.reduce(
          (sum, tile) => sum + tile.h,
          0,
        ),
      ),
    )
    .not.toBe(before);
  await page.locator("#view-toggle").click();
  await expect(page.locator("#view-toggle")).toHaveText("2D");
  await expect(page.locator("#view-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
test("foyer negotiates actual two-peer WebRTC audio with local signaling", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { createMediaMesh } =
      await import("/node_modules/@jay23606/foyer/dist/index.js");
    const rooms = new Map();
    const client = {
      channel(name, options) {
        const handlers = [];
        const ch = {
          name,
          id: options.config.presence.key,
          on(type, filter, cb) {
            handlers.push({ type, event: filter.event, cb });
            return ch;
          },
          subscribe(cb) {
            const room = rooms.get(name) || new Set();
            room.add(ch);
            rooms.set(name, room);
            queueMicrotask(() => cb("SUBSCRIBED"));
            return ch;
          },
          track() {
            return Promise.resolve();
          },
          presenceState() {
            return Object.fromEntries(
              [...rooms.get(name)].map((c) => [c.id, [{ id: c.id }]]),
            );
          },
          send(msg) {
            for (const other of rooms.get(name) || [])
              if (other !== ch)
                queueMicrotask(() =>
                  other.emit("broadcast", msg.event, { payload: msg.payload }),
                );
            return Promise.resolve("ok");
          },
          emit(type, event, payload) {
            for (const h of handlers)
              if (h.type === type && h.event === event) h.cb(payload);
          },
        };
        return ch;
      },
      removeChannel(ch) {
        rooms.get(ch.name)?.delete(ch);
        for (const other of rooms.get(ch.name) || [])
          other.emit("presence", "leave", { key: ch.id });
        return Promise.resolve();
      },
    };
    window.audioTest = [];
    window.audioContext = new AudioContext();
    await window.audioContext.resume();
    for (const id of ["a", "b"]) {
      const dst = window.audioContext.createMediaStreamDestination(),
        o = window.audioContext.createOscillator();
      o.connect(dst);
      o.start();
      const mesh = createMediaMesh({
        supabase: client,
        roomId: "test",
        playerId: id,
        iceServers: [],
      });
      await mesh.start(dst.stream);
      mesh.setMuted(false);
      window.audioTest.push(mesh);
    }
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => window.audioTest.every((m) => m.peerCount === 1)),
      { timeout: 10000 },
    )
    .toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            [...document.querySelectorAll("audio")].filter((a) =>
              a.srcObject
                ?.getAudioTracks()
                .some((t) => t.readyState === "live"),
            ).length,
        ),
      { timeout: 10000 },
    )
    .toBe(2);
  await page.evaluate(() => {
    window.audioTest.forEach((m) => m.stop());
    window.audioContext.close();
  });
  await expect(page.locator("audio")).toHaveCount(0);
});
