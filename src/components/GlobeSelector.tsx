import { useEffect, useRef, useState } from "react";
import type { ScenePoint } from "@/types/sleuth";

// Country outlines: Natural Earth 1:50m (public domain), stored as flat [lon, lat, lon, lat...] rings.
interface Country { n: string; p: number[][][] }
let worldReady: Promise<Country[]> | undefined;
function loadWorld(): Promise<Country[]> {
  worldReady ??= fetch("/brand/world-50m.json")
    .then((r) => { if (!r.ok) throw new Error("world outlines unavailable"); return r.json() as Promise<Country[]>; })
    .catch((e) => { worldReady = undefined; throw e; });
  return worldReady;
}

const INK = "#1b1440";
const LAND = ["#3fe0ae", "#8ff0c8", "#bff3d9", "#ffe9b8", "#7fe3b0"];
const NEAR = 1.2, FAR = 4.4;
// The data square is drawn at least this many pixels wide, so it never vanishes when zoomed out.
const MIN_SQUARE_PX = 16;

/** Paints the comic-style Earth: flat sticker colours, bold country outlines, country names. */
function paintEarth(world: Country[], width: number): HTMLCanvasElement {
  const W = width, H = width / 2, k = width / 4096;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const X = (lon: number) => ((lon + 180) / 360) * W, Y = (lat: number) => ((90 - lat) / 180) * H;
  g.fillStyle = "#3fd4ff";
  g.fillRect(0, 0, W, H);
  // lighter ocean bands, so the sea is not one flat colour
  g.fillStyle = "rgba(255,255,255,0.10)";
  for (let lat = -75; lat < 90; lat += 30) g.fillRect(0, Y(lat + 15), W, Y(lat) - Y(lat + 15));
  g.lineJoin = "round";
  world.forEach((country, i) => {
    g.beginPath();
    for (const poly of country.p) for (const ring of poly) {
      g.moveTo(X(ring[0]), Y(ring[1]));
      for (let j = 2; j < ring.length; j += 2) g.lineTo(X(ring[j]), Y(ring[j + 1]));
      g.closePath();
    }
    g.fillStyle = country.n === "Antarctica" ? "#f4fbff" : LAND[i % LAND.length];
    g.fill("evenodd");
    g.strokeStyle = INK;
    g.lineWidth = 2.4 * k;
    g.stroke();
  });
  // graticule
  g.strokeStyle = "rgba(27,20,64,0.16)";
  g.lineWidth = 1.2 * k;
  g.setLineDash([10 * k, 12 * k]);
  for (let lon = -150; lon < 180; lon += 30) { g.beginPath(); g.moveTo(X(lon), 0); g.lineTo(X(lon), H); g.stroke(); }
  for (let lat = -60; lat < 90; lat += 30) { g.beginPath(); g.moveTo(0, Y(lat)); g.lineTo(W, Y(lat)); g.stroke(); }
  g.setLineDash([]);
  // names of the larger countries
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  for (const country of world) {
    let best: number[] | null = null, area = 0, bx = 0, by = 0, narrow = 0;
    for (const poly of country.p) {
      const ring = poly[0];
      let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
      for (let j = 0; j < ring.length; j += 2) { x0 = Math.min(x0, ring[j]); x1 = Math.max(x1, ring[j]); y0 = Math.min(y0, ring[j + 1]); y1 = Math.max(y1, ring[j + 1]); }
      const a = (x1 - x0) * (y1 - y0);
      if (a > area && x1 - x0 < 170) { area = a; best = ring; bx = (x0 + x1) / 2; by = (y0 + y1) / 2; narrow = Math.min(x1 - x0, y1 - y0); }
    }
    if (!best || area < 30 || Math.abs(by) > 72) continue;
    const size = Math.max(14, Math.min(40, narrow * 1.7)) * k;
    g.font = `800 ${size}px Nunito, system-ui, sans-serif`;
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = size * 0.28;
    g.strokeText(country.n, X(bx), Y(by));
    g.fillStyle = INK;
    g.fillText(country.n, X(bx), Y(by));
  }
  return c;
}

function paintClouds(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(255,255,255,0.92)";
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 22; i++) {
    const x = rnd() * 1024, y = 90 + rnd() * 330, s = 9 + rnd() * 13;
    for (let j = 0; j < 4; j++) { g.beginPath(); g.ellipse(x + (j - 1.5) * s * 1.1, y + (j % 2) * s * 0.35, s * (1.1 + (j % 2) * 0.5), s * 0.75, 0, 0, Math.PI * 2); g.fill(); }
  }
  return c;
}

/** Which country a point falls in (ray casting on the outline rings); undefined over the sea. */
function countryAt(world: Country[], lat: number, lon: number): string | undefined {
  for (const country of world) for (const poly of country.p) {
    let inside = false;
    poly.forEach((ring, h) => {
      let hit = false;
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
      }
      if (h === 0) inside = hit; else if (hit) inside = false;
    });
    if (inside) return country.n;
  }
  return undefined;
}

interface Props {
  sceneA: ScenePoint;
  sceneB: ScenePoint | null;
  activeTarget: "A" | "B";
  latStep: number;
  lonStep: number;
  /** `country` is the English country name under the point, or undefined over the sea. */
  onSelectPoint: (target: "A" | "B", lat: number, lon: number, country?: string) => void;
  onFail: () => void;
  lang?: "pt" | "en";
}

export default function GlobeSelector(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false);
  const api = useRef<{ sync: () => void; zoom: (f: number) => void } | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const [THREE, world] = await Promise.all([import("three"), loadWorld()]);
        const el = canvas.current;
        if (!el || disposed) return;
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const renderer = new THREE.WebGLRenderer({ canvas: el, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(32, 2, 0.05, 60);
        scene.add(camera);
        scene.add(new THREE.AmbientLight(0xffffff, 2.3));
        const sun = new THREE.DirectionalLight(0xffffff, 1.5);
        sun.position.set(-1.6, 1.8, 2.4);
        camera.add(sun);

        const at = (lat: number, lon: number, r = 1) => {
          const phi = ((90 - lat) * Math.PI) / 180, theta = ((lon + 180) * Math.PI) / 180;
          return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
        };

        const big = renderer.capabilities.maxTextureSize >= 8192 && window.innerWidth >= 900;
        const earthTex = new THREE.CanvasTexture(paintEarth(world, big ? 8192 : 4096));
        earthTex.colorSpace = THREE.SRGBColorSpace;
        earthTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 80), new THREE.MeshLambertMaterial({ map: earthTex }));
        scene.add(globe);
        // comic ink outline and a soft halo behind the planet
        scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.014, 96, 64), new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide })));
        scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.09, 64, 48), new THREE.MeshBasicMaterial({ color: 0x3fd4ff, side: THREE.BackSide, transparent: true, opacity: 0.22 })));

        const cloudTex = new THREE.CanvasTexture(paintClouds());
        cloudTex.colorSpace = THREE.SRGBColorSpace;
        const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.8, depthWrite: false });
        const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.04, 64, 48), cloudMat);
        scene.add(clouds);

        // a little satellite in orbit
        const orbit = new THREE.Group();
        orbit.rotation.set(0.5, 0, 0.35);
        const sat = new THREE.Group();
        sat.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.07), new THREE.MeshLambertMaterial({ color: 0xf7f2ff })));
        for (const s of [-1, 1]) {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.006, 0.05), new THREE.MeshLambertMaterial({ color: 0x4a3aff }));
          panel.position.x = s * 0.075;
          sat.add(panel);
        }
        sat.position.set(1.38, 0, 0);
        orbit.add(sat);
        scene.add(orbit);

        const up = new THREE.Vector3(0, 1, 0), front = new THREE.Vector3(0, 0, 1);
        const cssColor = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

        // A push pin: steel needle, coloured body turned on a lathe, ink outline. The tip sits at the origin.
        const pinProfile = [[0, 0.05], [0.034, 0.053], [0.036, 0.064], [0.017, 0.071], [0.014, 0.104], [0.031, 0.111], [0.034, 0.122], [0.022, 0.13], [0, 0.132]]
          .map(([r, y]) => new THREE.Vector2(r, y));
        const makePin = (color: string, opacity = 1) => {
          const group = new THREE.Group();
          const ghost = opacity < 1;
          const needle = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.06, 12), new THREE.MeshLambertMaterial({ color: 0xcfd6ea, transparent: ghost, opacity }));
          needle.rotation.x = Math.PI;
          needle.position.y = 0.03;
          const body = new THREE.Mesh(new THREE.LatheGeometry(pinProfile, 32), new THREE.MeshLambertMaterial({ color, transparent: ghost, opacity }));
          const ink = new THREE.Mesh(new THREE.LatheGeometry(pinProfile, 32), new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide, transparent: ghost, opacity }));
          ink.scale.set(1.16, 1.05, 1.16);
          ink.position.y = -0.0045;
          const shine = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 * opacity }));
          shine.position.set(-0.014, 0.119, 0.02);
          group.add(needle, ink, body, shine);
          return group;
        };
        // The pin leans towards the north-east, so its body shows when the camera looks straight down at it.
        const lean = (normal: InstanceType<typeof THREE.Vector3>) => {
          const north = up.clone().addScaledVector(normal, -up.dot(normal)).normalize();
          const east = new THREE.Vector3().crossVectors(north, normal);
          return normal.clone().multiplyScalar(Math.cos(0.72)).addScaledVector(north, Math.sin(0.72) * 0.8).addScaledVector(east, Math.sin(0.72) * 0.6).normalize();
        };

        // one marker per scene: pin, pulsing ring and the NASA data square on the ground
        interface Marker { root: InstanceType<typeof THREE.Group>; square: InstanceType<typeof THREE.Group>; pin: InstanceType<typeof THREE.Group>; shade: InstanceType<typeof THREE.Mesh>; ring: InstanceType<typeof THREE.Mesh>; normal: InstanceType<typeof THREE.Vector3>; born: number; key: string }
        const markers: Partial<Record<"A" | "B", Marker>> = {};
        const drop = (root: InstanceType<typeof THREE.Object3D>) => root.traverse((o) => {
          const m = o as InstanceType<typeof THREE.Mesh>;
          if (m.geometry) m.geometry.dispose();
          const mat = (m as unknown as { material?: { map?: { dispose: () => void }; dispose: () => void } }).material;
          if (mat) { mat.map?.dispose(); mat.dispose(); }
        });
        const place = (which: "A" | "B", point: ScenePoint | null, color: string) => {
          const key = point ? `${point.latitude},${point.longitude},${latest.current.latStep},${latest.current.lonStep}` : "";
          const old = markers[which];
          if (old && old.key === key) return;
          if (old) { scene.remove(old.root); drop(old.root); delete markers[which]; }
          if (!point) return;
          const normal = at(point.latitude, point.longitude).normalize();
          const root = new THREE.Group();
          const pin = makePin(color);
          pin.quaternion.setFromUnitVectors(up, lean(normal));
          // its shadow on the ground
          const shade = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.28, depthWrite: false }));
          shade.quaternion.setFromUnitVectors(front, normal);
          shade.position.copy(normal).multiplyScalar(1.0035);
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
          ring.quaternion.setFromUnitVectors(front, normal);
          ring.position.copy(normal).multiplyScalar(1.004);
          const { latStep, lonStep } = latest.current;
          const corners = [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([a, b]) => at(point.latitude + (a * latStep) / 2, point.longitude + (b * lonStep) / 2, 1.003));
          const square = new THREE.Group();
          square.add(new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([corners[0], corners[1], corners[2], corners[0], corners[2], corners[3]]),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })));
          square.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), new THREE.LineBasicMaterial({ color: INK })));
          root.add(square);
          root.add(pin, ring, shade);
          scene.add(root);
          markers[which] = { root, square, pin, shade, ring, normal, born: performance.now(), key };
        };

        // the dashed flight path between the two places
        let arc: { root: InstanceType<typeof THREE.Group>; curve: InstanceType<typeof THREE.CatmullRomCurve3>; dot: InstanceType<typeof THREE.Mesh>; key: string } | null = null;
        const link = (a: ScenePoint, b: ScenePoint | null) => {
          const key = b ? `${a.latitude},${a.longitude},${b.latitude},${b.longitude}` : "";
          if (arc && arc.key === key) return;
          if (arc) { scene.remove(arc.root); drop(arc.root); arc = null; }
          if (!b) return;
          const pa = at(a.latitude, a.longitude), pb = at(b.latitude, b.longitude);
          const lift = 0.12 + pa.angleTo(pb) * 0.16;
          const pts = Array.from({ length: 33 }, (_, i) => {
            const t = i / 32;
            return pa.clone().lerp(pb, t).normalize().multiplyScalar(1.01 + Math.sin(Math.PI * t) * lift);
          });
          const curve = new THREE.CatmullRomCurve3(pts);
          const root = new THREE.Group();
          root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.006, 8), new THREE.MeshBasicMaterial({ color: 0xffc93c })));
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff6b98 }));
          root.add(dot);
          scene.add(root);
          arc = { root, curve, dot, key };
        };

        // The pointer over the planet is the pin itself, with the square it would select under its tip.
        const ghost = makePin("#ffc93c", 0.92);
        const ghostGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 6 }, () => new THREE.Vector3()));
        const ghostLine = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 4 }, () => new THREE.Vector3()));
        const ghostSquare = new THREE.Group();
        ghostSquare.add(new THREE.Mesh(ghostGeo, new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false })));
        ghostSquare.add(new THREE.LineLoop(ghostLine, new THREE.LineBasicMaterial({ color: INK })));
        const ghostAt = new THREE.Vector3();
        // its corners are rewritten on every move, so the stale bounds must not cull it
        ghostSquare.children.forEach((o) => { o.frustumCulled = false; });
        ghost.visible = ghostSquare.visible = false;
        scene.add(ghost, ghostSquare);
        const toLatLon = (n: InstanceType<typeof THREE.Vector3>) => {
          let lon = (Math.atan2(n.z, -n.x) * 180) / Math.PI - 180;
          if (lon < -180) lon += 360;
          return { lat: 90 - (Math.acos(n.y) * 180) / Math.PI, lon };
        };
        // Grow a square around its own centre: scale it and shift it back so the centre stays put.
        const grow = (g: InstanceType<typeof THREE.Group>, centre: InstanceType<typeof THREE.Vector3>, f: number) => { g.scale.setScalar(f); g.position.copy(centre).multiplyScalar(1.003 * (1 - f)); };

        // camera: it orbits the planet and always looks at its centre
        const focusOf = () => { const p = latest.current; return p.activeTarget === "B" && p.sceneB ? p.sceneB : p.sceneA; };
        const first = focusOf();
        const cam = { lat: 25, lon: first.longitude + 150, dist: 7 };
        const goal = { lat: first.latitude, lon: first.longitude, dist: 2.5 };
        if (still) Object.assign(cam, goal);
        let lastFocus = "";
        const sync = () => {
          const p = latest.current;
          place("A", p.sceneA, cssColor("--brand", "#4a3aff"));
          place("B", p.sceneB, cssColor("--orange", "#ff9248"));
          link(p.sceneA, p.sceneB);
          const f = focusOf(), key = `${p.activeTarget}${f.latitude},${f.longitude}`;
          if (key !== lastFocus) { lastFocus = key; goal.lat = f.latitude; goal.lon = f.longitude; if (goal.dist > 3.2) goal.dist = 2.5; }
        };
        sync();
        api.current = { sync, zoom: (f) => { goal.dist = Math.max(NEAR, Math.min(FAR, goal.dist * f)); } };

        const resize = () => {
          const w = el.clientWidth, h = el.clientHeight;
          if (!w || !h) return;
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(el);

        // pointer: drag to spin, click to drop the pin, hover to preview where it lands
        const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
        const pick = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
          ray.setFromCamera(ndc, camera);
          return ray.intersectObject(globe)[0]?.point ?? null;
        };
        let down: { x: number; y: number; moved: boolean } | null = null;
        const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, moved: false }; el.setPointerCapture(e.pointerId); };
        const onMove = (e: PointerEvent) => {
          if (down) {
            const dx = e.clientX - down.x, dy = e.clientY - down.y;
            if (!down.moved && Math.hypot(dx, dy) < 5) return;
            down.moved = true;
            down.x = e.clientX; down.y = e.clientY;
            const k = (cam.dist - 1) * 0.11;
            goal.lon = cam.lon = cam.lon - dx * k;
            goal.lat = cam.lat = Math.max(-80, Math.min(80, cam.lat + dy * k));
            ghost.visible = ghostSquare.visible = false;
            el.style.cursor = "grabbing";
            return;
          }
          const p = e.pointerType === "mouse" ? pick(e) : null;
          ghost.visible = ghostSquare.visible = !!p;
          el.style.cursor = p ? "none" : "grab";
          if (!p) return;
          const n = p.clone().normalize();
          ghostAt.copy(n);
          ghost.position.copy(n).multiplyScalar(1.004);
          ghost.quaternion.setFromUnitVectors(up, lean(n));
          const { lat, lon } = toLatLon(n), { latStep, lonStep } = latest.current;
          const c = [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([a, b]) => at(lat + (a * latStep) / 2, lon + (b * lonStep) / 2, 1.003));
          ghostGeo.setFromPoints([c[0], c[1], c[2], c[0], c[2], c[3]]);
          ghostLine.setFromPoints(c);
        };
        const onUp = (e: PointerEvent) => {
          const d = down;
          down = null;
          el.style.cursor = "grab";
          if (!d || d.moved || e.type === "pointercancel") return;
          const p = pick(e);
          if (!p) return;
          const n = p.clone().normalize();
          const { lat, lon } = toLatLon(n);
          const la = Number(lat.toFixed(4)), lo = Number(lon.toFixed(4));
          latest.current.onSelectPoint(latest.current.activeTarget, la, lo, countryAt(world, la, lo));
        };
        const onLeave = () => { ghost.visible = ghostSquare.visible = false; };
        // Over the planet the wheel zooms instead of scrolling the page.
        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          goal.dist = Math.max(NEAR, Math.min(FAR, goal.dist * (e.deltaY > 0 ? 1.14 : 0.88)));
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        el.style.cursor = "grab";
        el.addEventListener("pointerdown", onDown);
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerup", onUp);
        el.addEventListener("pointercancel", onUp);
        el.addEventListener("pointerleave", onLeave);

        const bounce = (t: number) => {
          const n = 7.5625, d = 2.75;
          if (t < 1 / d) return n * t * t;
          if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
          if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
          return n * (t -= 2.625 / d) * t + 0.984375;
        };

        let frame = 0;
        const loop = (now: number) => {
          frame = requestAnimationFrame(loop);
          if (document.hidden) return;
          const ease = still ? 1 : 0.07;
          let dl = goal.lon - cam.lon;
          dl = ((((dl + 180) % 360) + 360) % 360) - 180;
          cam.lon += dl * ease;
          cam.lat += (goal.lat - cam.lat) * ease;
          cam.dist += (goal.dist - cam.dist) * ease;
          camera.position.copy(at(cam.lat, cam.lon, cam.dist));
          camera.lookAt(0, 0, 0);
          const size = ((cam.dist - 1) / 1.5) * 0.6;
          // how much to enlarge a data square so it stays MIN_SQUARE_PX wide on screen
          const pxUnit = (0.5735 * (cam.dist - 1)) / (el.clientHeight || 500);
          const big = Math.max(1, (MIN_SQUARE_PX * pxUnit) / ((latest.current.latStep * Math.PI) / 180));
          for (const m of Object.values(markers)) {
            if (!m) continue;
            const t = still ? 1 : Math.min(1, (now - m.born) / 850);
            const height = (1 - bounce(t)) * 0.9;
            m.pin.position.copy(m.normal).multiplyScalar(1 + height);
            m.pin.scale.setScalar(size);
            grow(m.square, m.normal, big);
            m.shade.scale.setScalar(0.03 * size * (1 - height * 0.6));
            const k = still ? 0.5 : ((now - m.born) % 1700) / 1700;
            m.ring.scale.setScalar(size * (0.05 + k * 0.22));
            (m.ring.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = t < 1 ? 0 : 0.85 * (1 - k);
          }
          ghost.scale.setScalar(size);
          grow(ghostSquare, ghostAt, big);
          if (arc) arc.dot.position.copy(arc.curve.getPoint(still ? 0.5 : (now % 2600) / 2600));
          if (!still) { clouds.rotation.y = now * 0.000012; orbit.rotation.y = now * 0.00035; sat.rotation.y = now * 0.001; }
          orbit.visible = cam.dist > 3.2;
          cloudMat.opacity = Math.max(0, Math.min(0.75, (cam.dist - 2.9) * 0.8));
          renderer.render(scene, camera);
        };
        frame = requestAnimationFrame(loop);
        setReady(true);

        cleanup = () => {
          cancelAnimationFrame(frame);
          ro.disconnect();
          el.removeEventListener("pointerdown", onDown);
          el.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerup", onUp);
          el.removeEventListener("pointercancel", onUp);
          el.removeEventListener("pointerleave", onLeave);
          el.removeEventListener("wheel", onWheel);
          api.current = null;
          drop(scene);
          renderer.dispose();
        };
      } catch {
        if (!disposed) latest.current.onFail();
      }
    })();
    return () => { disposed = true; cleanup(); };
  }, []);

  useEffect(() => { api.current?.sync(); }, [props.sceneA, props.sceneB, props.activeTarget, props.latStep, props.lonStep, ready]);

  const pt = props.lang === "pt";
  const ctl = "btn-pop grid h-11 w-11 place-items-center rounded-full bg-[var(--panel)] font-serif text-2xl font-bold leading-none text-foreground";
  return (
    <div className="space relative h-[380px] w-full overflow-hidden sm:h-[clamp(260px,calc(100vh-520px),540px)]">
      <canvas ref={canvas} className="h-full w-full touch-pan-y" aria-label={pt ? "Globo 3D: gire e clique para escolher o lugar" : "3D globe: spin and click to choose the place"} />
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 font-serif text-lg font-bold text-white" role="status">
          <div className="radar h-28 w-28 border-[2.5px] border-white/70" aria-hidden />
          {pt ? "Preparando o planeta…" : "Getting the planet ready…"}
        </div>
      )}
      {ready && (
        <>
          <p className="outline-ink pointer-events-none absolute left-3 top-3 -rotate-1 rounded-full bg-[var(--sun)] px-3.5 py-1.5 text-sm font-extrabold text-[var(--on-color)] shadow-[3px_3px_0_0_var(--pop)]">
            📌 {pt ? "Gire o planeta e clique para cravar o alfinete" : "Spin the planet and click to drop the"}
            {props.sceneB ? (props.activeTarget === "A" ? (pt ? " azul" : " blue pin") : (pt ? " laranja" : " orange pin")) : (pt ? "" : " pin")}
          </p>
          <p className="outline-ink pointer-events-none absolute bottom-3 left-3 rounded-full bg-[var(--panel)] px-3 py-1 font-mono text-[11px] font-semibold text-foreground">
            {pt ? "cada quadrado de dado tem ~55 km" : "each data square is ~55 km"}
          </p>
          <div className="absolute bottom-3 right-3 flex flex-col gap-2">
            <button type="button" onClick={() => api.current?.zoom(0.78)} aria-label={pt ? "Aproximar" : "Zoom in"} className={ctl}>+</button>
            <button type="button" onClick={() => api.current?.zoom(1.28)} aria-label={pt ? "Afastar" : "Zoom out"} className={ctl}>−</button>
          </div>
        </>
      )}
    </div>
  );
}
