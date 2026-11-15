import { useEffect, useRef, useState } from "react";
import { MessageCircle, SkipForward, X } from "lucide-react";
import type { Lang } from "@/types/sleuth";

export type GuideMood = "idle" | "talk" | "walk" | "investigate" | "jump" | "climb";
/** Where Sleuth stands: on the hero planet, or in a bottom corner of the screen. */
export type GuideSpot = "hero" | "left" | "right";

const MODEL_URL = "/brand/sleuth-bunny.glb";
// Animation names inside the GLB (Bunny Detective by bird, CC BY 4.0 / CC0).
const CLIP: Record<GuideMood, string> = { idle: "Idle", talk: "Talk", walk: "Walk", investigate: "Investigate", jump: "Jump", climb: "Climb" };
const WALK_MS = 1700;
// Going back to the planet: walk under it, then climb the rope.
const APPROACH_MS = 1100;
const CLIMB_MS = 1500;
const HERO_ANCHOR = "sleuth-stage";

interface Box { x: number; y: number; w: number; h: number }

interface Props {
  lang: Lang;
  text: string;
  mood: GuideMood;
  spot: GuideSpot;
  /** Shown during a guided demo so the visitor can jump to the result. */
  onSkip?: () => void;
  /** True while Sleuth has something new to say; on phones the bubble folds away once he is done. */
  active?: boolean;
  /** Bump this number to make him jump for joy (a clue picked, a case pinned...). */
  cheer?: number;
}

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(m.matches);
    const on = () => setReduce(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduce;
}

/** Size of the 3D canvas. It never changes while he walks: resizing a WebGL canvas clears it and makes him flicker. */
function baseSize(vw: number) {
  const small = vw < 640;
  return { w: small ? 96 : vw < 1280 ? 156 : 184, h: small ? 156 : vw < 1280 ? 256 : 300 };
}

function targetBox(spot: GuideSpot): Box {
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  if (spot === "hero") {
    const r = document.getElementById(HERO_ANCHOR)?.getBoundingClientRect();
    if (r && r.width > 0) return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  const small = vw < 640;
  const w = small ? 96 : vw < 1280 ? 156 : 184;
  const h = small ? 156 : vw < 1280 ? 256 : 300;
  const m = small ? 2 : 16;
  return { x: spot === "left" ? m : vw - w - m, y: vh - h - (small ? 2 : 8), w, h };
}

/** The 3D bunny detective. three.js is loaded on demand so it never delays the first paint. */
function BunnyCanvas({ mood, facing, onFail }: { mood: GuideMood; facing: number; onFail: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const play = useRef<(m: GuideMood) => void>(() => {});
  const moodRef = useRef(mood);
  const facingRef = useRef(facing);
  moodRef.current = mood;
  facingRef.current = facing;

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let cleanup = () => {};
    (async () => {
      try {
        const THREE = await import("three");
        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        const el = canvas.current;
        if (!el || disposed) return;
        const renderer = new THREE.WebGLRenderer({ canvas: el, alpha: true, antialias: true, powerPreference: "low-power" });
        // Rendered above screen density because the canvas is scaled up on the hero planet.
        renderer.setPixelRatio(Math.min(window.devicePixelRatio * 2, 3));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
        camera.position.set(0, 1.55, 7.2);
        camera.lookAt(0, 1.35, 0);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x334466, 2.2));

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

        const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
        if (disposed) { renderer.dispose(); ro.disconnect(); return; }
        const model = gltf.scene;
        model.rotation.y = -0.2;
        scene.add(model);
        const mixer = new THREE.AnimationMixer(model);
        const actions = new Map(gltf.animations.map((c) => [c.name, mixer.clipAction(c)]));
        let current: ReturnType<typeof mixer.clipAction> | undefined;

        play.current = (m: GuideMood) => {
          const next = actions.get(CLIP[m]) ?? actions.get("Idle");
          if (!next || next === current) return;
          next.reset();
          if (m === "jump") { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; } else next.setLoop(THREE.LoopRepeat, Infinity);
          next.fadeIn(0.25).play();
          current?.fadeOut(0.25);
          current = next;
        };
        mixer.addEventListener("finished", () => { if (moodRef.current === "jump") { current = undefined; play.current("idle"); } });
        play.current(moodRef.current);

        const clock = new THREE.Clock();
        const loop = () => {
          frame = requestAnimationFrame(loop);
          if (document.hidden) return;
          // Turn towards the walking direction, then back to the visitor.
          // facing: 0 = towards the visitor, 1 / -1 = walking right / left, 2 = back turned (climbing the rope).
          const want = facingRef.current === 0 ? -0.2 : facingRef.current === 2 ? Math.PI : facingRef.current * 1.35;
          model.rotation.y += (want - model.rotation.y) * 0.14;
          mixer.update(Math.min(clock.getDelta(), 0.05));
          renderer.render(scene, camera);
        };
        loop();
        cleanup = () => { ro.disconnect(); mixer.stopAllAction(); renderer.dispose(); };
      } catch {
        if (!disposed) onFail();
      }
    })();
    return () => { disposed = true; cancelAnimationFrame(frame); cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { play.current(mood); }, [mood]);

  return <canvas ref={canvas} className="h-full w-full" aria-hidden />;
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

export default function SleuthGuide({ lang, text, mood, spot, onSkip, active = true, cheer = 0 }: Props) {
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);
  const reduce = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [open, setOpen] = useState(true);
  const [shown, setShown] = useState(text);
  const [vw, setVw] = useState(1280);
  const [peek, setPeek] = useState(false);
  const [poke, setPoke] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [walking, setWalking] = useState(false);
  const [facing, setFacing] = useState(0);
  const [climbing, setClimbing] = useState(false);
  const [fidget, setFidget] = useState(false);
  const boxRef = useRef<Box | null>(null);
  const walkingRef = useRef(false);
  boxRef.current = box;
  walkingRef.current = walking;
  const climbingRef = useRef(false);
  climbingRef.current = climbing;
  const [moveMs, setMoveMs] = useState(WALK_MS);

  useEffect(() => {
    setWebgl(hasWebGL());
    try { if (localStorage.getItem("es-guide") === "closed") setOpen(false); } catch { /* storage unavailable */ }
    setVw(document.documentElement.clientWidth);
    setReady(true);
  }, []);

  useEffect(() => { setShown(text); setPeek(false); }, [text]);

  // Walk to the new spot whenever the page section changes.
  useEffect(() => {
    if (!ready || !open) return;
    const next = targetBox(spot);
    const cur = boxRef.current;
    if (!cur || reduce) { setBox(next); return; }
    const dx = next.x + next.w / 2 - (cur.x + cur.w / 2);
    const dy = next.y - cur.y;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24 && Math.abs(next.w - cur.w) < 8) { setBox(next); return; }
    if (spot === "hero") {
      // 1) walk along the bottom until he is under the planet, 2) climb the rope that hangs from it.
      const under: Box = { x: next.x + next.w / 2 - cur.w / 2, y: cur.y, w: cur.w, h: cur.h };
      const adx = under.x - cur.x;
      setClimbing(false);
      setMoveMs(APPROACH_MS);
      setFacing(adx > 24 ? 1 : adx < -24 ? -1 : 0);
      setWalking(true);
      setBox(under);
      const t1 = setTimeout(() => { setClimbing(true); setFacing(2); setMoveMs(CLIMB_MS); setBox(targetBox("hero")); }, APPROACH_MS);
      const t2 = setTimeout(() => { setWalking(false); setClimbing(false); setFacing(0); setBox(targetBox("hero")); }, APPROACH_MS + CLIMB_MS);
      return () => { clearTimeout(t1); clearTimeout(t2); setWalking(false); setClimbing(false); setFacing(0); };
    }
    setClimbing(false);
    setMoveMs(WALK_MS);
    setFacing(dx > 24 ? 1 : dx < -24 ? -1 : 0);
    setWalking(true);
    setBox(next);
    const id = setTimeout(() => { setWalking(false); setFacing(0); setBox(targetBox(spot)); }, WALK_MS);
    return () => { clearTimeout(id); setWalking(false); setFacing(0); };
  }, [spot, ready, open, reduce]);

  // On the hero planet he follows the page as it scrolls; in a corner he only reacts to resizes.
  useEffect(() => {
    if (!ready || !open) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setVw(document.documentElement.clientWidth);
        // Walking back to the planet: keep chasing it while the page scrolls, so he lands on it.
        if (!walkingRef.current || climbingRef.current) setBox(targetBox(spot));
      });
    };
    window.addEventListener("resize", update);
    if (spot === "hero") window.addEventListener("scroll", update, { passive: true });
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", update); window.removeEventListener("scroll", update); };
  }, [spot, ready, open]);

  const toggle = (v: boolean) => {
    setOpen(v);
    if (!v) setBox(null);
    try { localStorage.setItem("es-guide", v ? "open" : "closed"); } catch { /* storage unavailable */ }
  };

  // A cheer from the page: jump once.
  const firstCheer = useRef(true);
  useEffect(() => {
    if (firstCheer.current) { firstCheer.current = false; return; }
    setPoke(true);
    const id = setTimeout(() => setPoke(false), 1300);
    return () => clearTimeout(id);
  }, [cheer]);

  // When he has been standing still for a while, he takes a look around with the magnifying glass.
  useEffect(() => {
    if (mood !== "idle" || walking) { setFidget(false); return; }
    let off = 0;
    const on = setInterval(() => { setFidget(true); off = window.setTimeout(() => setFidget(false), 2800); }, 9000);
    return () => { clearInterval(on); clearTimeout(off); };
  }, [mood, walking]);

  const onPoke = () => {
    setPeek((v) => !v);
    setPoke(true);
    setTimeout(() => setPoke(false), 1300);
  };

  if (!ready) return null;

  if (!open) {
    return (
      <button type="button" onClick={() => toggle(true)}
        className="btn-pop fixed bottom-4 right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-[var(--sun)] px-4 text-sm font-extrabold text-[var(--on-color)]">
        <MessageCircle className="h-4 w-4" aria-hidden /> {t("Chamar o Sleuth", "Call Sleuth")}
      </button>
    );
  }
  if (!box) return null;

  const small = vw < 640;
  const inHero = spot === "hero" && !walking;
  const onRight = box.x + box.w / 2 > vw / 2;
  const show3d = webgl && !reduce;
  // Free space beside the 1152px content column. The bubble sits above him, inside that margin;
  // when the margin is too narrow to hold it, the bubble folds away once he has finished talking.
  const margin = Math.max(0, (vw - 1152) / 2);
  const tight = small || margin < 250;
  const bubbleVisible = !walking && (!tight || active || peek || !!onSkip || inHero);
  const effMood: GuideMood = poke ? "jump" : walking ? (climbing ? "climb" : "walk") : fidget ? "investigate" : mood;

  const base = baseSize(vw);
  const scale = box.h / base.h;
  const move = walking ? `${moveMs}ms cubic-bezier(.45,.05,.35,1)` : "";

  const bubbleStyle: React.CSSProperties = inHero
    ? small ? { left: "50%", bottom: "100%", translate: "-50% 0", width: "min(78vw, 280px)" } : { left: "66%", top: "-7%", width: 215 }
    : small
      ? onRight ? { right: "calc(100% - 14px)", bottom: "34%", width: Math.min(230, vw - box.w - 8) } : { left: "calc(100% - 14px)", bottom: "34%", width: Math.min(230, vw - box.w - 8) }
      : { [onRight ? "right" : "left"]: 0, bottom: "102%", width: Math.max(200, Math.min(260, margin - 28)) };

  // The little tail of the speech bubble always points at him.
  const tailSide: "down" | "left" | "right" = inHero ? (small ? "down" : "left") : small ? (onRight ? "right" : "left") : "down";
  const tailStyle: React.CSSProperties =
    tailSide === "down"
      ? { top: "calc(100% - 3px)", ...(inHero ? { left: "50%", translate: "-50% 0" } : onRight ? { right: box.w / 2 - 16 } : { left: box.w / 2 - 16 }) }
      : tailSide === "left"
        ? { right: "calc(100% - 9px)", top: inHero ? "58%" : "55%", rotate: "90deg" }
        : { left: "calc(100% - 9px)", top: "55%", rotate: "-90deg" };

  return (
    <>
    {climbing && (
      // The rope hangs from the planet down to the bottom of the screen; he climbs in front of it.
      <span aria-hidden className="reveal pointer-events-none fixed z-[39] w-2 rounded-full border-2 border-[var(--stroke)]"
        style={{ left: box.x + box.w / 2 - 4, top: box.y + box.h * 0.3, bottom: 0,
          backgroundImage: "repeating-linear-gradient(45deg, #e8b46a 0 6px, #b97a3a 6px 12px)" }} />
    )}
    <aside aria-label={t("Sleuth, o guia", "Sleuth, your guide")} className="pointer-events-none fixed left-0 top-0 z-40"
      style={{
        width: box.w, height: box.h, transform: `translate3d(${box.x}px, ${box.y}px, 0)`,
        transition: walking ? `transform ${move}, width ${move}, height ${move}` : "none",
      }}>
      {bubbleVisible && (
        <div key={shown} style={bubbleStyle}
          className="pop-sm pointer-events-auto absolute z-10 animate-[bubble_0.4s_cubic-bezier(.2,.9,.3,1.4)_both] rounded-3xl bg-[var(--panel)] p-3.5 text-[13.5px] font-semibold leading-snug text-foreground sm:text-[15px]">
          <p className="mb-1 flex items-center justify-between gap-2">
            <span className="rounded-full bg-[var(--sun)] px-2 py-0.5 font-serif text-[11px] font-bold uppercase tracking-wider text-[var(--on-color)]">Sleuth</span>
            <span className="flex items-center gap-1">
              {onSkip && (
                <button type="button" onClick={onSkip} className="inline-flex h-7 items-center gap-1 rounded-full bg-[var(--coral)] px-2.5 text-[11px] font-extrabold text-[var(--on-color)]">
                  <SkipForward className="h-3 w-3" aria-hidden /> {t("Pular", "Skip")}
                </button>
              )}
              <button type="button" onClick={() => toggle(false)} aria-label={t("Esconder o guia", "Hide the guide")}
                className="grid h-7 w-7 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-foreground">
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </span>
          </p>
          <p role="status" aria-live="polite">{shown}</p>
          <svg aria-hidden viewBox="0 0 32 22" className="absolute h-[22px] w-8" style={tailStyle}>
            <path d="M3 0 L16 19 L29 0" fill="var(--panel)" stroke="var(--stroke)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            <path d="M4.5 0 L27.5 0" stroke="var(--panel)" strokeWidth="4" />
          </svg>
        </div>
      )}
      <button type="button" onClick={onPoke} aria-label={t("Cutucar o Sleuth", "Poke Sleuth")} className="pointer-events-auto absolute left-0 top-0 block cursor-pointer"
        style={{ width: base.w, height: base.h, transformOrigin: "0 0", transform: `translate(${(box.w - base.w * scale) / 2}px, 0) scale(${scale})`, transition: walking ? `transform ${move}` : "none" }}>
        <span aria-hidden className="absolute bottom-[3%] left-1/2 h-[7%] w-[60%] -translate-x-1/2 rounded-[50%] bg-black/25 blur-md dark:bg-black/60" />
        {show3d ? (
          <BunnyCanvas mood={effMood} facing={facing} onFail={() => setWebgl(false)} />
        ) : (
          <span className="pop-sm absolute inset-x-0 bottom-3 mx-auto grid h-20 w-20 place-items-center rounded-full bg-white">
            <img src="/brand/orbiting-analytics-globe-256.png" alt="" width={64} height={64} className="h-16 w-16 object-contain" />
          </span>
        )}
      </button>
    </aside>
    </>
  );
}
