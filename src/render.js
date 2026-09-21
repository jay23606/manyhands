import { SIZE, noise, housing, getFollowerName } from "./world.js";
export class Renderer {
  constructor(canvas, getWorld, onPick) {
    this.canvas = canvas;
    this.c = canvas.getContext("2d");
    this.getWorld = getWorld;
    this.onPick = onPick;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.rotation = 0;
    this.hover = -1;
    this.particles = [];
    this.pointer = { x: 0, y: 0 };
    this.drag = null;
    this.moved = false;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resize = () => {
      this.w = canvas.clientWidth;
      this.h = canvas.clientHeight;
      this.dpr = Math.min(devicePixelRatio, 2);
      canvas.width = this.w * this.dpr;
      canvas.height = this.h * this.dpr;
    };
    this.resize();
    window.addEventListener("resize", this.resize);
    this.pointers = new Map();
    this.space = false;
    this.lastPaint = -1;
    this.lastPaintAt = 0;
    const paint = (e) => {
      const i = this.pick(e.clientX, e.clientY);
      if (
        i < 0 ||
        i === this.lastPaint ||
        performance.now() - this.lastPaintAt < 140
      )
        return;
      this.lastPaint = i;
      this.lastPaintAt = performance.now();
      this.onPick(i, this.drag?.lower ? "lower" : null);
    };
    const gesture = () => {
      const [a, b] = [...this.pointers.values()];
      return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        d: Math.hypot(a.x - b.x, a.y - b.y),
      };
    };
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => {
      if (
        e.code === "Space" &&
        !["INPUT", "TEXTAREA", "BUTTON"].includes(e.target.tagName)
      ) {
        e.preventDefault();
        this.space = true;
        canvas.style.cursor = "grab";
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        this.space = false;
        canvas.style.cursor = "crosshair";
      }
    });
    window.addEventListener("blur", () => {
      this.space = false;
      this.drag = null;
      this.pointers.clear();
    });
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.lastPaint = -1;
      this.lastPaintAt = 0;
      if (this.pointers.size === 2) {
        this.pinch = {
          ...gesture(),
          zoom: this.zoom,
          px: this.pan.x,
          py: this.pan.y,
        };
        this.drag = null;
        return;
      }
      this.drag = {
        x: e.clientX,
        y: e.clientY,
        px: this.pan.x,
        py: this.pan.y,
        pan: this.space || e.button === 1,
        lower: e.button === 2,
        touch: e.pointerType === "touch",
        moved: false,
      };
      if (!this.drag.touch && !this.drag.pan) paint(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      this.pointer = { x: e.clientX, y: e.clientY };
      this.hover = this.pick(e.clientX, e.clientY);
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size >= 2 && this.pinch) {
        const g = gesture();
        this.zoom = Math.max(
          0.55,
          Math.min(2.5, (this.pinch.zoom * g.d) / Math.max(1, this.pinch.d)),
        );
        this.pan.x = this.pinch.px + g.x - this.pinch.x;
        this.pan.y = this.pinch.py + g.y - this.pinch.y;
        return;
      }
      if (!this.drag) return;
      const d = this.drag;
      d.moved ||= Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5;
      if (d.pan) {
        this.pan.x = d.px + e.clientX - d.x;
        this.pan.y = d.py + e.clientY - d.y;
      } else if (d.moved) paint(e);
    });
    const end = (e, cancel = false) => {
      if (
        !cancel &&
        this.drag?.touch &&
        !this.drag.moved &&
        this.pointers.size === 1 &&
        !this.pinch
      )
        paint(e);
      this.pointers.delete(e.pointerId);
      this.drag = null;
      if (!this.pointers.size) this.pinch = null;
    };
    canvas.addEventListener("pointerup", (e) => end(e));
    canvas.addEventListener("pointercancel", (e) => end(e, true));
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom = Math.max(
          0.55,
          Math.min(2.5, this.zoom * Math.exp(-e.deltaY * 0.001)),
        );
      },
      { passive: false },
    );
    this.frame = (t) => {
      this.draw(t / 1000);
      this.raf = requestAnimationFrame(this.frame);
    };
    this.raf = requestAnimationFrame(this.frame);
  }
  project(x, y, h = 0) {
    const cx = SIZE / 2, cy = SIZE / 2;
    const dx = x - cx, dy = y - cy;
    const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
    const rx = cx + dx * cos - dy * sin;
    const ry = cy + dx * sin + dy * cos;
    return {
      x: this.w / 2 + ((rx - ry) * this.tw) / 2 + this.pan.x,
      y:
        this.h * 0.48 +
        ((rx + ry - SIZE + 1) * this.th) / 2 -
        h * this.elev +
        this.pan.y,
    };
  }
  polygon(points, fill, stroke) {
    const c = this.c;
    c.beginPath();
    points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 0.7;
      c.stroke();
    }
  }
  diamond(x, y, w, h, fill, stroke) {
    this.polygon(
      [
        { x, y: y - h / 2 },
        { x: x + w / 2, y },
        { x, y: y + h / 2 },
        { x: x - w / 2, y },
      ],
      fill,
      stroke,
    );
  }
  pick(x, y) {
    if (!this.tw) return -1;
    const world = this.getWorld();
    for (let i = world.tiles.length - 1; i >= 0; i--) {
      const t = world.tiles[i],
        p = this.project(i % SIZE, Math.floor(i / SIZE), t.h);
      if (
        Math.abs(x - p.x) / (this.tw / 2) + Math.abs(y - p.y) / (this.th / 2) <
        1
      )
        return i;
    }
    return -1;
  }
  burst(i, color = "#d4edac", type = "spell") {
    const p = this.project(
      i % SIZE,
      Math.floor(i / SIZE),
      this.getWorld().tiles[i].h,
    );
    if (type === "rain") {
      // Rain falls downward in a gentle shower
      const radius = this.tw * 1.5;
      for (let n = 0; n < 24; n++) {
        const angle = (Math.random() * Math.PI * 2);
        this.particles.push({
          x: p.x + Math.cos(angle) * radius * Math.random(),
          y: p.y - this.th * Math.random() * 2,
          vx: (Math.random() - 0.5) * 0.5,
          vy: Math.random() * 1.5 + 0.5, // Falls down
          life: 1,
          color,
          size: 0.5 + Math.random() * 0.5,
        });
      }
    } else {
      // Regular explosion burst (outward and upward)
      for (let n = 0; n < 16; n++)
        this.particles.push({
          x: p.x,
          y: p.y,
          vx: (Math.random() - 0.5) * 2,
          vy: -Math.random() * 2 - 1,
          life: 1,
          color,
        });
    }
  }
  tree(p, scale, seed, time) {
    const c = this.c;
    let s = scale;
    let sway = this.reduced ? 0 : Math.sin(time * 1.2 + seed) * s * 0.3;
    c.fillStyle = "#214e46";
    c.fillRect(p.x - s * 0.8, p.y - 8 * s, s * 1.6, 10 * s);
    this.diamond(p.x + 3 * s, p.y + 2 * s, 13 * s, 5 * s, "#143e3b55");
    for (let k = 0; k < 3; k++) {
      const yy = p.y - (7 + k * 5) * s;
      this.polygon(
        [
          { x: p.x - 7 * s + k * s + sway, y: yy },
          { x: p.x + sway, y: yy - 12 * s },
          { x: p.x + 7 * s - k * s + sway, y: yy },
        ],
        ["#286650", "#39856a", "#58a17a"][k],
      );
    }
  }
  house(p, s, t, time, tier = 1) {
    const c = this.c;
    if (tier === 0) {
      this.diamond(p.x + 2 * s, p.y + 2 * s, 18 * s, 8 * s, "#173e4144");
      c.fillStyle = "#ac9d78";
      c.fillRect(p.x - 5 * s, p.y - 8 * s, 10 * s, 10 * s);
      this.polygon(
        [
          { x: p.x - 8 * s, y: p.y - 6 * s },
          { x: p.x, y: p.y - 19 * s },
          { x: p.x + 8 * s, y: p.y - 6 * s },
          { x: p.x, y: p.y - 3 * s },
        ],
        "#c5ad69",
      );
      this.polygon(
        [
          { x: p.x, y: p.y - 19 * s },
          { x: p.x + 8 * s, y: p.y - 6 * s },
          { x: p.x, y: p.y - 3 * s },
        ],
        "#aa914e",
      );
      c.fillStyle = "#514a37";
      c.fillRect(p.x - s, p.y - 4 * s, 3 * s, 6 * s);
      return;
    }
    if (tier === 3) {
      this.diamond(p.x, p.y + 2 * s, 30 * s, 15 * s, "#173e4144");
      this.polygon(
        [
          { x: p.x - 12 * s, y: p.y - 15 * s },
          { x: p.x, y: p.y - 9 * s },
          { x: p.x, y: p.y + 5 * s },
          { x: p.x - 12 * s, y: p.y - 1 * s },
        ],
        "#c6c9b5",
      );
      this.polygon(
        [
          { x: p.x, y: p.y - 9 * s },
          { x: p.x + 12 * s, y: p.y - 15 * s },
          { x: p.x + 12 * s, y: p.y - 1 * s },
          { x: p.x, y: p.y + 5 * s },
        ],
        "#8eaaa0",
      );
      this.diamond(p.x, p.y - 15 * s, 25 * s, 13 * s, "#dce0c8");
      for (const dx of [-10, 9]) {
        c.fillStyle = dx < 0 ? "#cdd3bd" : "#adc1ac";
        c.fillRect(p.x + (dx - 3) * s, p.y - 26 * s, 6 * s, 24 * s);
        c.fillStyle = "#e0e2c8";
        for (let k = 0; k < 3; k++)
          c.fillRect(
            p.x + (dx - 3 + k * 2.2) * s,
            p.y - 29 * s,
            1.5 * s,
            4 * s,
          );
        c.fillStyle = "#4b716b";
        c.fillRect(p.x + (dx - 1) * s, p.y - 21 * s, 2 * s, 4 * s);
      }
      c.fillStyle = "#315652";
      c.fillRect(p.x - 2 * s, p.y - 4 * s, 4 * s, 8 * s);
      c.strokeStyle = "#ddce96";
      c.lineWidth = s;
      c.beginPath();
      c.moveTo(p.x, p.y - 17 * s);
      c.lineTo(p.x, p.y - 36 * s);
      c.stroke();
      this.polygon(
        [
          { x: p.x, y: p.y - 36 * s },
          { x: p.x + 8 * s, y: p.y - 34 * s + Math.sin(time * 2) * s },
          { x: p.x, y: p.y - 30 * s },
        ],
        "#dca26c",
      );
      return;
    }
    if (tier === 2) {
      this.house({ x: p.x - 6 * s, y: p.y - 4 * s }, s * 0.85, t, time, 1);
      this.house({ x: p.x + 6 * s, y: p.y + 1 * s }, s, t, time, 1);
      c.fillStyle = "#c9c6a7";
      c.fillRect(p.x - 2 * s, p.y - 24 * s, 4 * s, 12 * s);
      this.polygon(
        [
          { x: p.x - 4 * s, y: p.y - 24 * s },
          { x: p.x, y: p.y - 30 * s },
          { x: p.x + 4 * s, y: p.y - 24 * s },
        ],
        "#ba7557",
      );
      return;
    }
    this.diamond(p.x + 3 * s, p.y + 4 * s, 23 * s, 10 * s, "#173e4144");
    this.polygon(
      [
        { x: p.x - 7 * s, y: p.y - 9 * s },
        { x: p.x, y: p.y - 5 * s },
        { x: p.x, y: p.y + 4 * s },
        { x: p.x - 7 * s, y: p.y },
      ],
      "#d0c9a5",
    );
    this.polygon(
      [
        { x: p.x, y: p.y - 5 * s },
        { x: p.x + 9 * s, y: p.y - 10 * s },
        { x: p.x + 9 * s, y: p.y - 1 * s },
        { x: p.x, y: p.y + 4 * s },
      ],
      "#a79d7c",
    );
    this.polygon(
      [
        { x: p.x - 9 * s, y: p.y - 9 * s },
        { x: p.x - 1 * s, y: p.y - 19 * s },
        { x: p.x + 10 * s, y: p.y - 12 * s },
        { x: p.x + 1 * s, y: p.y - 3 * s },
      ],
      "#b56b4e",
    );
    this.polygon(
      [
        { x: p.x - 1 * s, y: p.y - 19 * s },
        { x: p.x + 5 * s, y: p.y - 22 * s },
        { x: p.x + 12 * s, y: p.y - 12 * s },
        { x: p.x + 10 * s, y: p.y - 12 * s },
      ],
      "#d89268",
    );
    c.fillStyle = "#f7da92";
    c.fillRect(p.x + 4 * s, p.y - 7 * s, 2 * s, 3 * s);
    c.fillStyle = "#61564b";
    c.fillRect(p.x - 4 * s, p.y - 5 * s, 2 * s, 5 * s);
    if (t.p > 10) {
      c.fillStyle = "#d8ba6e";
      for (let a = 0; a < 4; a++)
        c.fillRect(p.x - 14 * s + a * 2 * s, p.y + 4 * s, 1 * s, 4 * s);
    }
    if (!this.reduced)
      for (let k = 0; k < 2; k++) {
        const f = (time * 0.15 + k * 0.5) % 1;
        c.beginPath();
        c.fillStyle = `rgba(229,236,214,${(1 - f) * 0.25})`;
        c.ellipse(
          p.x + 3 * s + f * 9 * s,
          p.y - 20 * s - f * 20 * s,
          (2 + f * 4) * s,
          (1 + f * 3) * s,
          0,
          0,
          7,
        );
        c.fill();
      }
  }
  villager(x, y, s, seed, time) {
    const c = this.c,
      walk = this.reduced ? 0 : Math.sin(time * 5 + seed),
      face = Math.cos(time * 0.25 + seed) > 0 ? 1 : -1;
    const skin = ["#e7b48a", "#c48b64", "#8d5f46"][Math.floor(seed * 3) % 3],
      shirt = ["#e4b45d", "#a4d1c1", "#cd8062", "#ded3b5"][
        Math.floor(seed * 5) % 4
      ];
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.fillStyle = "#153e3b55";
    c.beginPath();
    c.ellipse(0, 1, 3.4, 1.3, 0, 0, 7);
    c.fill();
    // Separated boots and swinging arms make the silhouette human at game scale.
    c.strokeStyle = "#413e38";
    c.lineWidth = 1.35;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(-1, -3.1);
    c.lineTo(-1 + walk * 0.85, 0);
    c.moveTo(1, -3.1);
    c.lineTo(1 - walk * 0.85, 0);
    c.stroke();
    c.fillStyle = shirt;
    c.beginPath();
    c.moveTo(-1.6, -7.8);
    c.lineTo(1.5, -7.8);
    c.lineTo(2, -3);
    c.lineTo(-2, -3);
    c.closePath();
    c.fill();
    c.strokeStyle = skin;
    c.lineWidth = 1.15;
    c.beginPath();
    c.moveTo(-1.7, -6.8);
    c.lineTo(-2.7, -4.2 + walk * 0.6);
    c.moveTo(1.6, -6.8);
    c.lineTo(2.6, -4.2 - walk * 0.6);
    c.stroke();
    c.fillStyle = "#685d46";
    c.fillRect(-1.8, -3.8, 3.5, 0.8);
    c.fillStyle = skin;
    c.beginPath();
    c.arc(0, -9.2, 1.95, 0, 7);
    c.fill();
    c.fillStyle = "#4b3e34";
    c.beginPath();
    c.arc(-0.15, -9.8, 1.85, Math.PI, Math.PI * 2);
    c.fill();
    c.fillRect(-face * 1.5 - 0.3, -9.7, 0.8, 1.6);
    c.fillStyle = "#343e36";
    c.fillRect(face * 0.8, -9.2, 0.55, 0.55);
    if (Math.floor(seed) % 3 === 0) {
      c.fillStyle = "#debc76";
      c.fillRect(-2.9, -10.3, 5.8, 0.7);
      c.fillRect(-1.5, -11.7, 3, 1.6);
    }
    if (Math.floor(seed) % 3 === 1) {
      c.strokeStyle = "#8b6945";
      c.lineWidth = 0.85;
      c.beginPath();
      c.moveTo(3, -1);
      c.lineTo(3, -8);
      c.stroke();
      c.strokeStyle = "#b5c5b6";
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(1.7, -8);
      c.lineTo(4.4, -8);
      c.stroke();
    }
    c.restore();
  }
  shrine(p, s, time) {
    const c = this.c;
    // Animated halo around shrine
    const haloPhase = time * 0.5;
    const haloRadius = 25 * s + Math.sin(haloPhase) * 2 * s;
    const haloPulse = 0.3 + Math.sin(haloPhase * 2) * 0.2;
    c.strokeStyle = `rgba(255, 223, 139, ${haloPulse * 0.4})`;
    c.lineWidth = 1.5 * s;
    c.beginPath();
    c.arc(p.x, p.y - 3 * s, haloRadius, 0, Math.PI * 2);
    c.stroke();

    this.diamond(p.x, p.y, 22 * s, 11 * s, "#779797");
    this.diamond(p.x, p.y - 3 * s, 16 * s, 8 * s, "#b1c8b6");
    c.fillStyle = "#668f85";
    c.fillRect(p.x - 3 * s, p.y - 24 * s, 6 * s, 20 * s);
    this.polygon(
      [
        { x: p.x - 3 * s, y: p.y - 24 * s },
        { x: p.x + 3 * s, y: p.y - 24 * s },
        { x: p.x + 1 * s, y: p.y - 4 * s },
        { x: p.x - 3 * s, y: p.y - 4 * s },
      ],
      "#d0d6b6",
    );
    c.save();
    c.shadowBlur = 16 * s;
    c.shadowColor = "#ffdf8b";
    this.diamond(p.x, p.y - 29 * s, 8 * s, 12 * s, "#f4e2a3");
    c.restore();
    c.strokeStyle = "#eddf9e55";
    c.beginPath();
    c.ellipse(p.x, p.y - 29 * s, 10 * s, 4 * s, 0, 0, Math.PI * 2);
    c.stroke();
  }
  draw(time) {
    const c = this.c,
      w = this.w,
      h = this.h,
      world = this.getWorld();
    if (!world) return;
    if (this.lastAge !== world.age) {
      this.lastAge = world.age;
      this.tickStarted = time;
    }
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const g = c.createRadialGradient(
      w * 0.5,
      h * 0.4,
      0,
      w * 0.5,
      h * 0.5,
      w * 0.75,
    );
    g.addColorStop(0, "#17434b");
    g.addColorStop(0.6, "#102f3c");
    g.addColorStop(1, "#071d2b");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // Enable smoothing for softer, less blocky appearance
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    // Very steep top-down angle for terrain precision + micro-tiles for targeting
    this.tw = Math.min(w / (w < 600 ? 22 : 35), h / 20, 22) * this.zoom;
    this.th = this.tw * 0.5;
    this.elev = this.tw * 0.50; // Steep bird's-eye perspective (from 0.36)
    const s = this.tw / 32;
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const i = y * SIZE + x,
          t = world.tiles[i],
          p = this.project(x, y, t.h),
          base = this.project(x, y, 0),
          n = noise(x, y);
        if (t.h === 0) {
          const a =
            0.05 + (Math.sin(time * 0.6 + x * 0.6 + y * 0.3) + 1) * 0.018;
          this.diamond(p.x, p.y, this.tw, this.th, `rgba(86,169,173,${a})`);
          if (n > 0.88) {
            c.strokeStyle = "#8fc6bb30";
            c.beginPath();
            c.moveTo(p.x - 3 * s, p.y + Math.sin(time + x) * s);
            c.lineTo(p.x + 3 * s, p.y + Math.sin(time + x) * s);
            c.stroke();
          }
          continue;
        }
        const left = [
          { x: p.x - this.tw / 2, y: p.y },
          { x: p.x, y: p.y + this.th / 2 },
          { x: base.x, y: base.y + this.th / 2 },
          { x: base.x - this.tw / 2, y: base.y },
        ];
        const right = [
          { x: p.x, y: p.y + this.th / 2 },
          { x: p.x + this.tw / 2, y: p.y },
          { x: base.x + this.tw / 2, y: base.y },
          { x: base.x, y: base.y + this.th / 2 },
        ];
        this.polygon(left, t.h === 1 ? "#817e5b" : "#486d55");
        this.polygon(right, t.h === 1 ? "#696e53" : "#345847");
        let color =
          t.h === 1
            ? `hsl(48 27% ${57 + n * 6}%)`
            : t.h >= 5
              ? `hsl(116 16% ${51 + n * 8}%)`
              : `hsl(${139 - n * 10} ${27 + n * 5}% ${39 + t.h * 2 + n * 7}%)`;
        this.diamond(p.x, p.y, this.tw, this.th, color, "#bdd1a310");
        if (t.h === 1) {
          c.strokeStyle = "#9cdac444";
          c.beginPath();
          c.moveTo(base.x - this.tw / 2, base.y + 1);
          c.lineTo(base.x, base.y + this.th / 2 + 1);
          c.lineTo(base.x + this.tw / 2, base.y + 1);
          c.stroke();
        }
        if (n > 0.83 && !t.tree && !t.b) {
          c.fillStyle = "#d3dca766";
          c.fillRect(p.x - 2 * s, p.y - s, s, s);
          c.fillRect(p.x + 3 * s, p.y + 2 * s, s, s);
        }
        if (t.tree) this.tree(p, s, n * 20, time);
        if (t.b === "village") {
          this.house(p, s, t, time, housing(world, i).tier);
          for (let k = 0; k < Math.min(4, Math.ceil(t.p / 4)); k++) {
            let phase = this.reduced ? k : time * 0.25 + k * 2 + n * 6;
            let px = p.x + Math.cos(phase) * this.tw * 0.34,
              py = p.y + Math.sin(phase) * this.th * 0.24 + 4 * s;
            this.villager(px, py, s * 0.85, n * 20 + k * 7, time);
          }
          // Glow effect based on population (life energy)
          if (t.p > 0 && !this.reduced) {
            const glow = Math.min(1, t.p / 40) * (0.5 + Math.sin(time * 0.7) * 0.2);
            c.save();
            c.globalAlpha = glow * 0.3;
            c.fillStyle = "#add49b";
            c.beginPath();
            c.arc(p.x, p.y, this.tw * 0.4 + Math.sin(time * 0.9) * 0.2 * this.tw, 0, Math.PI * 2);
            c.fill();
            c.restore();
          }
        }
        if (t.b === "shrine") this.shrine(p, s, time);
        for (const walker of world.walkers || []) {
          if (walker.at !== i) continue;
          const from = world.tiles[walker.from],
            a = this.project(
              walker.from % SIZE,
              Math.floor(walker.from / SIZE),
              from.h,
            );
          const f = this.reduced
            ? 1
            : Math.min(1, (time - this.tickStarted) / 3.5);
          const wx = a.x + (p.x - a.x) * f,
            wy = a.y + (p.y - a.y) * f;
          this.villager(wx, wy, s, walker.home * 0.71, time);

          // Show settler name above the migrating group (Phase 2)
          // Generate name deterministically from walker identity
          if (!this.reduced) {
            const name = getFollowerName(world.age, walker.home, walker.from);
            c.font = `${Math.round(s * 3)}px DM Sans`;
            c.fillStyle = "#c9e4ca99";
            c.textAlign = "center";
            c.textBaseline = "bottom";
            c.fillText(name, wx, wy - s * 4);
          }

          c.strokeStyle = "#dbd89e";
          c.lineWidth = s;
          c.beginPath();
          c.moveTo(wx + 4 * s, wy);
          c.lineTo(wx + 4 * s, wy - 16 * s);
          c.stroke();
        }
        if (i === this.hover) {
          c.save();
          c.globalAlpha = 0.55;
          this.diamond(
            p.x,
            p.y,
            this.tw - 1,
            this.th - 1,
            "#e7f2c833",
            "#f6f0ce",
          );
          c.restore();
        }
      }
    // Moving cloud shadows and sunlit airborne motes keep the world quietly alive.
    if (!this.reduced) {
      for (let k = 0; k < 18; k++) {
        const x = (noise(k, 3) * w + time * (2 + noise(k, 4) * 3)) % w,
          y = noise(k, 7) * h;
        c.fillStyle = `rgba(224,227,174,${0.15 + Math.sin(time + k) * 0.1})`;
        c.beginPath();
        c.arc(x, y, noise(k, 2) + 0.4, 0, 7);
        c.fill();
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.025;
      p.life -= 0.025;
      c.globalAlpha = Math.max(0, p.life);
      c.fillStyle = p.color;
      const size = (p.size || 1) * 3; // Rain drops can have custom size
      c.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    c.globalAlpha = 1;
    const vg = c.createRadialGradient(
      w / 2,
      h * 0.48,
      h * 0.25,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.68,
    );
    vg.addColorStop(0, "#071b2700");
    vg.addColorStop(1, "#04152299");
    c.fillStyle = vg;
    c.fillRect(0, 0, w, h);
  }
  reset() {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
  }
}
