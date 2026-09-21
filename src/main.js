import { setupPWA } from "./pwa.js";
import "./style.css";
import {
  createIcons,
  Mountain,
  ArrowDownToLine,
  Trees,
  House,
  Sun,
  CloudRain,
  Hand,
  Mic,
  MicOff,
  Users,
  Plus,
  Minus,
  Maximize,
  Volume2,
  VolumeX,
  HelpCircle,
  X,
  Link,
  Globe,
  ChevronRight,
  Leaf,
  Flag,
} from "lucide";
import {
  makeWorld,
  applyAction,
  stepWorld,
  stats,
  housing,
  COST,
  checkDisasters,
  rally,
} from "./world.js";
import { Renderer } from "./render.js";
import { Network } from "./network.js";
const icons = {
  Mountain,
  ArrowDownToLine,
  Trees,
  House,
  Sun,
  CloudRain,
  Hand,
  Mic,
  MicOff,
  Users,
  Plus,
  Minus,
  Maximize,
  Volume2,
  VolumeX,
  HelpCircle,
  X,
  Link,
  Globe,
  ChevronRight,
  Leaf,
  Flag,
};
const $ = (s) => document.querySelector(s);
const icon = (name) =>
  `<i data-lucide="${name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}"></i>`;
let world;
try {
  const saved = JSON.parse(localStorage.getItem("manyhands-world"));
  world = saved?.tiles?.length === 784 ? saved : makeWorld();
} catch {
  world = makeWorld();
}
let tool = "raise",
  online = false,
  joining = false,
  acting = false,
  sound = null,
  soundOn = false,
  selected = -1;
const tools = [
  ["raise", "Mountain", "Raise", 1],
  ["lower", "ArrowDownToLine", "Lower", 1],
  ["forest", "Trees", "Forest", 4],
  ["village", "House", "Settle", 15],
  ["shrine", "Sun", "Shrine", 20],
  ["rain", "CloudRain", "Bless", 10],
];
$("#app").innerHTML =
  `<canvas id="world" aria-label="Isometric island. Select a power then click a tile to shape it. Left drag paints. Right drag lowers. Space drag pans. On touch, two fingers pan and pinch zoom."></canvas>
<header><a class="brand" href="#" aria-label="Manyhands home">${icon("Hand")}<span>manyhands<span class="brand-dot">.</span></span></a><button id="island" class="island-button">${icon("Globe")}<span id="room-label">First light</span><span class="divider"></span><span id="mode">Your island</span>${icon("ChevronRight")}</button><div class="header-actions"><button id="help" class="icon-button" aria-label="How to play">${icon("HelpCircle")}</button><button id="share" class="pill">${icon("Users")}<span>Play together</span></button></div></header>
<section class="world-title"><div class="eyebrow">A WORLD IN YOUR HANDS</div><h1>Something small.<br>Something alive.</h1><p id="intro">Raise the earth. Make room for life.</p><div class="live-line"><span class="pulse"></span><span id="presence">Just you, for now</span><span class="dot">·</span><span id="age">Day 1</span></div></section>
<aside class="stats" aria-label="Island statistics"><div>${icon("Users")}<strong id="people">15</strong><span>people</span></div><div>${icon("House")}<strong id="villages">3</strong><span>settlements</span></div><div>${icon("Leaf")}<strong id="trees">0</strong><span>trees</span></div></aside>
<div class="tile-info" id="tile-info" hidden></div><div class="world-note"><span class="small-star">✧</span><span id="event">Three settlements look to the sky.</span></div>
<div class="camera"><button id="zoom-in" class="icon-button" aria-label="Zoom in">${icon("Plus")}</button><button id="zoom-out" class="icon-button" aria-label="Zoom out">${icon("Minus")}</button><span></span><button id="rotate-left" class="icon-button" aria-label="Rotate left">⟲</button><button id="recenter" class="icon-button" aria-label="Recenter island">${icon("Maximize")}</button><button id="rotate-right" class="icon-button" aria-label="Rotate right">⟳</button><span></span><button id="rally-toggle" class="icon-button" aria-label="Rally mode" aria-pressed="false">${icon("Flag")}</button></div>
<footer><div class="bottom-left"><button id="voice" class="pill subdued" aria-label="Enable island voice" aria-pressed="false">${icon("MicOff")}<span>Voice off</span></button><button id="sound" class="icon-button" aria-label="Enable sound effects" aria-pressed="false">${icon("VolumeX")}</button></div><div class="tool-wrap"><div class="faith"><span>✧</span><span id="mana">80</span><span class="faith-label">faith</span><div class="faith-track"><div id="faith-fill"></div></div></div><nav class="tools" aria-label="Divine powers">${tools.map(([id, i, label, cost], n) => `<button data-tool="${id}" class="tool ${id === tool ? "active" : ""}" aria-label="${label}, ${cost} faith, shortcut ${n + 1}" aria-pressed="${id === tool}"><span class="key">${n + 1}</span>${icon(i)}<span>${label}</span><small>${cost} ✧</small></button>`).join("")}</nav><p class="hint" id="hint">Click to raise land <span>·</span> Space + drag to pan <span>·</span> Scroll to zoom</p></div><div class="save-state" id="save-state">Saved on this device</div></footer>
<div id="toast" role="status"></div>
<dialog id="connect-dialog"><button class="close icon-button" data-close aria-label="Close">${icon("X")}</button><div class="eyebrow">MANY HANDS. ONE WORLD.</div><h2>A place to meet.</h2><p>Share an island name. Shape the same land, and talk as you play. The world rests when everyone leaves.</p><form id="connect-form"><label>Island name<input id="room-input" required pattern="[a-z0-9-]{1,40}" maxlength="40" value="first-light" placeholder="first-light"></label><details id="connection-settings"><summary>Connection settings</summary><label>Supabase project URL<input id="url-input" type="url" placeholder="https://your-project.supabase.co"></label><label>Publishable / anon key<input id="key-input" placeholder="sb_publishable_…" autocomplete="off"></label><p class="fine">Run the included database setup and enable anonymous sign-ins first. Never enter a service-role key.</p></details><p id="connection-state" class="fine">No project yet? Your own island is ready to play.</p><button class="primary" id="join" type="submit">Enter shared island ${icon("ChevronRight")}</button></form><button class="text-button" id="local">Return to my island</button></dialog>
<dialog id="help-dialog"><button class="close icon-button" data-close aria-label="Close">${icon("X")}</button><div class="eyebrow">A LITTLE GUIDANCE</div><h2>Let the world grow.</h2><p>You shape the land. Your people find their own way.</p><div class="guide-row">${icon("Mountain")}<div><strong>Make room</strong><p>Raise the sea into land. Flat land upgrades homes: hut → cottage → manor → citadel. You can sculpt beneath buildings; lowering them into the sea floods them.</p></div></div><div class="guide-row">${icon("House")}<div><strong>Give life a home</strong><p>Full homes send settlers to suitable nearby land. Make clear, level ground and gentle routes for them. Larger homes grow faster.</p></div></div><div class="guide-row">${icon("Sun")}<div><strong>Gather faith</strong><p>More followers mean more faith. Shrines replenish it faster. Bless an area to help its people grow.</p></div></div><div class="guide-row">${icon("Users")}<div><strong>Leave your mark</strong><p>Shared islands keep changing while anyone is present. Voice is optional. Everyone with voice enabled on the same island can hear each other.</p></div></div><p class="fine">Left-click or drag uses your selected power. Right-click or drag lowers land. Hold Space and drag to pan. On mobile, select a power and paint with one finger; use two fingers to pan and pinch to zoom. Keys 1–6 choose a power. + / − zoom. 0 centers the island. Escape closes a window. Local islands pause when their tab is hidden.</p><button class="primary" data-close>Back to the island</button></dialog>`;
const refreshIcons = () => createIcons({ icons });
refreshIcons();
let lastEventAge = -1;
let rallyMode = null;
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 4200);
}
function persist() {
  if (!online && !joining)
    try {
      localStorage.setItem("manyhands-world", JSON.stringify(world));
    } catch {
      $("#save-state").textContent = "Storage full — progress not saved";
    }
}
function update() {
  const s = stats(world);
  $("#people").textContent = s.people;
  $("#villages").textContent = s.villages;
  $("#trees").textContent = s.trees;
  $("#mana").textContent = Math.floor(world.mana);
  $("#faith-fill").style.width = (world.mana / 120) * 100 + "%";
  $("#age").textContent = "Day " + (world.age + 1);
  $("#event").textContent = world.events[0]?.text || "The island is waking.";
  if (world.events[0]?.age !== lastEventAge && /☄️|🦠|🏜️/.test(world.events[0]?.text)) {
    chime("disaster");
    lastEventAge = world.events[0]?.age;
  }
  const homes = world.tiles
    .map((t, i) => (t.b === "village" ? housing(world, i) : null))
    .filter(Boolean);
  const goals = [
    {
      done: homes.some((h) => h.tier >= 2),
      phase: "growth",
      title: "Make room to grow.",
      text: "Your followers build cottages. A civilization awakens.",
    },
    {
      done: s.people >= 40,
      phase: "growth",
      title: "A people, growing.",
      text: `Grow to 40 followers · ${s.people} / 40`,
    },
    {
      done: s.villages >= 6,
      phase: "established",
      title: "Beyond the doorstep.",
      text: `Full homes send settlers to new ground · ${s.villages} / 6 homes`,
    },
    {
      done: homes.some((h) => h.tier === 3),
      phase: "established",
      title: "Build something lasting.",
      text: "Manors rise on the horizon. Your influence spreads.",
    },
    {
      done: homes.some((h) => h.tier === 4),
      phase: "ascendant",
      title: "Citadels of faith.",
      text: "The greatest monuments to your vision stand complete.",
    },
    {
      done: s.people >= 100,
      phase: "ascendant",
      title: "A hundred small lives.",
      text: `Make room for 100 followers · ${s.people} / 100`,
    },
  ];
  const goal = goals.find((g) => !g.done) || {
    phase: "ascendant",
    title: "A world of your making.",
    text: "Your people are flourishing. Keep shaping their story.",
  };

  // Determine progression phase for title styling
  let phase = "emerging";
  if (goals.some((g) => g.done && g.phase === "ascendant")) phase = "ascendant";
  else if (goals.some((g) => g.done && g.phase === "established")) phase = "established";
  else if (goals.some((g) => g.done && g.phase === "growth")) phase = "growth";

  $(".world-title").className = `world-title phase-${phase}`;
  $(".world-title h1").textContent = goal.title;
  $("#intro").textContent = goal.text;
  document
    .querySelectorAll("[data-tool]")
    .forEach((b) =>
      b.classList.toggle("unaffordable", world.mana < COST[b.dataset.tool]),
    );
}
const network = new Network(
  (w) => {
    if (!world || !online || w.version >= world.version) {
      world = w;
      update();
    }
  },
  (peers) => {
    $("#presence").textContent = peers.length
      ? `${peers.length + 1} hands shaping this world`
      : "Just you, for now";
  },
  toast,
);
async function act(index, override) {
  if (index < 0 || acting || joining) return;

  // Handle rally mode
  if (rallyMode === true) {
    const source = world.tiles[index];
    if (source?.b !== "village" || source.p <= 1) {
      toast("Select a settlement with people to rally");
      return;
    }
    rallyMode = index;
    toast("Rally target: click empty flat land");
    renderer.burst(index, "#ff6b6b", "rally");
    selected = index;
    network.setPosition(index % 28, Math.floor(index / 28));
    return;
  }

  if (typeof rallyMode === "number") {
    const dest = world.tiles[index];
    if (!dest || dest.h < 0 || dest.b === "village" || dest.tree) {
      toast("Rally to flat, empty ground only");
      return;
    }
    selected = index;
    network.setPosition(index % 28, Math.floor(index / 28));
    acting = true;
    try {
      rally(world, rallyMode, index);
      renderer.burst(index, "#ffb84d", "rally");
      chime("success");
      rallyMode = null;
      update();
      persist();
    } catch (e) {
      toast(e.message);
    } finally {
      acting = false;
    }
    return;
  }

  const power = override || tool;
  selected = index;
  network.setPosition(index % 28, Math.floor(index / 28));
  acting = true;
  try {
    if (online) await network.act(power, index);
    else {
      const error = applyAction(world, power, index);
      if (error) throw new Error(error);
      persist();
    }
    renderer.burst(index, power === "rain" ? "#8bc6ed" : "#e1e6a6", power);
    chime();
    update();
  } catch (e) {
    toast(e.message);
  } finally {
    acting = false;
  }
}
const renderer = new Renderer($("#world"), () => world, act);
update();
function setTool(id) {
  tool = id;
  document.querySelectorAll("[data-tool]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === id);
    b.setAttribute("aria-pressed", b.dataset.tool === id);
  });
  const labels = {
    raise: "Click to raise land",
    lower: "Click to lower land",
    forest: "Plant on clear land",
    village: "Found a settlement on clear land",
    shrine: "Build a shrine on clear land",
    rain: "Bless settlements near a tile",
  };
  $("#hint").innerHTML = matchMedia("(pointer: coarse)").matches
    ? "One finger paints <span>·</span> Two fingers move & zoom"
    : labels[id] +
      " <span>·</span> Right-click lowers <span>·</span> Space-drag pans <span>·</span> Arrow keys rotate";
}
document
  .querySelectorAll("[data-tool]")
  .forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
$("#zoom-in").onclick = () =>
  (renderer.zoom = Math.min(2.5, renderer.zoom * 1.2));
$("#zoom-out").onclick = () =>
  (renderer.zoom = Math.max(0.55, renderer.zoom / 1.2));
$("#recenter").onclick = () => renderer.reset();
$("#rotate-left").onclick = () => (renderer.rotation -= 0.2);
$("#rotate-right").onclick = () => (renderer.rotation += 0.2);
$("#rally-toggle").onclick = () => {
  rallyMode = rallyMode ? null : true;
  $("#rally-toggle").setAttribute("aria-pressed", rallyMode ? "true" : "false");
  toast(rallyMode ? "Rally mode: click a settlement to send settlers" : "Rally cancelled");
};
$(".brand").onclick = (e) => {
  e.preventDefault();
  renderer.reset();
};
$("#help").onclick = () => $("#help-dialog").showModal();
for (const id of ["share", "island"])
  $("#" + id).onclick = () => $("#connect-dialog").showModal();
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
window.addEventListener("keydown", (e) => {
  if (
    ["INPUT", "TEXTAREA"].includes(e.target.tagName) ||
    document.querySelector("dialog[open]")
  )
    return;
  if (+e.key >= 1 && +e.key <= 6) setTool(tools[+e.key - 1][0]);
  if (e.key === "+" || e.key === "=") $("#zoom-in").click();
  if (e.key === "-") $("#zoom-out").click();
  if (e.key === "0") renderer.reset();
  if (e.key === "r" || e.key === "R") {
    rallyMode = rallyMode ? null : true;
    toast(rallyMode ? "Rally mode: click a settlement to send settlers" : "Rally cancelled");
  }
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A")
    renderer.rotation -= 0.1;
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D")
    renderer.rotation += 0.1;
  if (e.key === "ArrowUp" || e.key === "w" || e.key === "W")
    renderer.rotation = 0;
});
setInterval(() => {
  if (!online && !joining && !document.hidden) {
    stepWorld(world);
    checkDisasters(world);
    update();
    persist();
  }
}, 4000);
let connection = {};
try {
  connection = JSON.parse(localStorage.getItem("manyhands-connection") || "{}");
} catch {}
$("#url-input").value =
  import.meta.env.VITE_SUPABASE_URL || connection.url || "";
$("#key-input").value =
  import.meta.env.VITE_SUPABASE_ANON_KEY || connection.key || "";
$("#room-input").value =
  new URLSearchParams(location.search).get("island") || "first-light";
if (!$("#url-input").value) $("#connection-settings").open = true;
$("#connect-form").onsubmit = async (e) => {
  e.preventDefault();
  const url = $("#url-input").value.trim(),
    key = $("#key-input").value.trim(),
    room = $("#room-input").value.trim();
  if (!url || !key) {
    $("#connection-settings").open = true;
    toast("Add your Supabase URL and publishable key to connect.");
    return;
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) {
    toast("Use your https://project.supabase.co project URL.");
    return;
  }
  if (key.startsWith("sb_secret_")) {
    toast("Use a publishable key, never a secret key.");
    return;
  }
  try {
    const payload = JSON.parse(atob(key.split(".")[1] || ""));
    if (payload.role === "service_role") {
      toast("Service-role keys must never be used in a browser.");
      return;
    }
  } catch {}
  $("#join").disabled = true;
  $("#join").textContent = "Entering…";
  persist();
  joining = true;
  try {
    online = false;
    await network.connect(url, key, room);
    online = true;
    localStorage.setItem("manyhands-connection", JSON.stringify({ url, key }));
    $("#room-label").textContent = room.replaceAll("-", " ");
    $("#mode").textContent = "Shared island";
    $("#save-state").textContent = "Shared world · connected";
    history.replaceState(null, "", "?island=" + encodeURIComponent(room));
    $("#connect-dialog").close();
    toast("You have arrived. This world is shared.");
  } catch (err) {
    await network.disconnect();
    online = false;
    toast(err.message);
    loadLocal();
  } finally {
    joining = false;
    $("#join").disabled = false;
    $("#join").innerHTML = "Enter shared island " + icon("ChevronRight");
    refreshIcons();
  }
};
function loadLocal() {
  try {
    world = JSON.parse(localStorage.getItem("manyhands-world")) || makeWorld();
  } catch {
    world = makeWorld();
  }
  update();
}
$("#local").onclick = async () => {
  await network.disconnect();
  online = false;
  loadLocal();
  $("#room-label").textContent = "First light";
  $("#mode").textContent = "Your island";
  $("#save-state").textContent = "Saved on this device";
  voiceUI(false);
  history.replaceState(null, "", location.pathname);
  $("#connect-dialog").close();
};
function voiceUI(active) {
  $("#voice").innerHTML =
    icon(active ? "Mic" : "MicOff") +
    `<span>${active ? "Voice on" : "Voice off"}</span>`;
  $("#voice").classList.toggle("enabled", active);
  $("#voice").setAttribute("aria-pressed", active);
  $("#voice").setAttribute(
    "aria-label",
    active ? "Disable island voice" : "Enable island voice",
  );
  refreshIcons();
}
$("#voice").onclick = async () => {
  if (!online) {
    $("#connect-dialog").showModal();
    toast("Voice is available on shared islands.");
    return;
  }
  try {
    voiceUI(await network.toggleVoice());
  } catch (e) {
    toast(
      e.name === "NotAllowedError"
        ? "Microphone access was declined. You can keep playing without voice."
        : e.message,
    );
  }
};
function playTone(frequency, duration = 0.3, volume = 0.035) {
  if (!soundOn || !sound) return;
  const o = sound.createOscillator(),
    g = sound.createGain();
  o.type = "sine";
  o.frequency.value = frequency;
  g.gain.setValueAtTime(volume, sound.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, sound.currentTime + duration);
  o.connect(g).connect(sound.destination);
  o.start();
  o.stop(sound.currentTime + duration);
}

function chime(type = "action") {
  if (!soundOn || !sound) return;
  // Different audio feedback for different game events
  const tones = {
    action: [261.63, 329.63, 392, 523.25], // C, E, G, high G (uplifting)
    settle: [196, 246.94, 293.66, 349.23], // G3, B3, D4, F#4 (settlement)
    success: [523.25, 659.25, 783.99], // high G, E, G (victory)
    level: [329.63, 392, 493.88], // E, G, B (level up)
    disaster: [130.81, 146.83], // C3, D3 (ominous warning)
  };
  const freqs = tones[type] || tones.action;
  const duration = type === "disaster" ? 0.4 : 0.2;
  const volume = type === "disaster" ? 0.05 : 0.035;
  playTone(freqs[Math.floor(Math.random() * freqs.length)], duration, volume);
}
$("#sound").onclick = async () => {
  sound ??= new AudioContext();
  await sound.resume();
  soundOn = !soundOn;
  $("#sound").innerHTML = icon(soundOn ? "Volume2" : "VolumeX");
  $("#sound").setAttribute("aria-pressed", soundOn);
  $("#sound").setAttribute(
    "aria-label",
    soundOn ? "Disable sound effects" : "Enable sound effects",
  );
  refreshIcons();
  chime();
};
window.addEventListener("pagehide", () => {
  persist();
  network.disconnect();
});
if (new URLSearchParams(location.search).has("island"))
  $("#connect-dialog").showModal();

setupPWA(toast);

setTool(tool);

setInterval(() => {
  const i = renderer.hover >= 0 ? renderer.hover : selected,
    t = world.tiles[i],
    el = $("#tile-info");
  if (!t || t.b !== "village") {
    el.hidden = true;
    return;
  }
  const home = housing(world, i);
  el.hidden = false;
  el.textContent =
    home.name +
    " · " +
    t.p +
    " / " +
    home.capacity +
    " people · " +
    home.near +
    "/9 level tiles";
}, 150);
