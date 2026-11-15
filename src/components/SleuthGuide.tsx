import { useEffect, useRef, useState } from "react";
import { MessageCircle, SkipForward, X } from "lucide-react";
import type { Lang } from "@/types/sleuth";

export type GuideMood = "idle" | "talk" | "walk" | "investigate" | "jump";

const MODEL_URL = "/brand/sleuth-bunny.glb";
// Animation names inside the GLB (Bunny Detective by bird, CC BY 4.0 / CC0).
const CLIP: Record<GuideMood, string> = { idle: "Idle", talk: "Talk", walk: "Walk", investigate: "Investigate", jump: "Jump" };

interface Props {
  lang: Lang;
  text: string;
  mood: GuideMood;
  /** Shown during a guided demo so the visitor can jump to the result. */
  onSkip?: () => void;
  /** True while Sleuth has something new to say; on phones the bubble folds away once he is done. */
  active?: boolean;
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

/** The 3D bunny detective. three.js is loaded on demand so it never delays the first paint. */
function BunnyCanvas({ mood, onFail }: { mood: GuideMood; onFail: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const play = useRef<(m: GuideMood) => void>(() => {});
  const moodRef = useRef(mood);
  moodRef.current = mood;

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
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
        model.rotation.y = -0.25;
        scene.add(model);
        const mixer = new THREE.AnimationMixer(model);
        const actions = new Map(gltf.animations.map((c) => [c.name, mixer.clipAction(c)]));
        let current: ReturnType<typeof mixer.clipAction> | undefined;

        play.current = (m: GuideMood) => {
          const next = actions.get(CLIP[m]) ?? actions.get("Idle");
          if (!next || next === current) return;
          next.reset();
          if (m === "jump") { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; } else next.setLoop(THREE.LoopRepeat, Infinity);
          next.fadeIn(0.3).play();
          current?.fadeOut(0.3);
          current = next;
        };
        mixer.addEventListener("finished", () => { if (moodRef.current === "jump") play.current("idle"); });
        play.current(moodRef.current);

        const clock = new THREE.Clock();
        const loop = () => {
          frame = requestAnimationFrame(loop);
          if (document.hidden) return;
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

export default function SleuthGuide({ lang, text, mood, onSkip, active = true }: Props) {
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);
  const reduce = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [open, setOpen] = useState(true);
  const [shown, setShown] = useState(text);
  const [small, setSmall] = useState(false);
  const [peek, setPeek] = useState(false);

  useEffect(() => {
    setWebgl(hasWebGL());
    try { if (localStorage.getItem("es-guide") === "closed") setOpen(false); } catch { /* storage unavailable */ }
    const m = window.matchMedia("(max-width: 639px)");
    setSmall(m.matches);
    const on = () => setSmall(m.matches);
    m.addEventListener("change", on);
    setReady(true);
    return () => m.removeEventListener("change", on);
  }, []);

  // Re-key the bubble on every new line so it pops in again.
  useEffect(() => { setShown(text); setPeek(false); }, [text]);

  const toggle = (v: boolean) => {
    setOpen(v);
    try { localStorage.setItem("es-guide", v ? "open" : "closed"); } catch { /* storage unavailable */ }
  };

  if (!ready) return null;

  if (!open) {
    return (
      <button type="button" onClick={() => toggle(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--primary-foreground)] shadow-[var(--button-shadow)] transition hover:-translate-y-0.5">
        <MessageCircle className="h-4 w-4" aria-hidden /> {t("Chamar o Sleuth", "Call Sleuth")}
      </button>
    );
  }

  const show3d = webgl && !reduce;
  const bubbleVisible = !small || active || peek || !!onSkip;
  return (
    <aside aria-label={t("Sleuth, o guia", "Sleuth, your guide")}
      className="pointer-events-none fixed bottom-2 right-2 z-40 flex w-[min(92vw,380px)] items-end justify-end gap-1 sm:bottom-4 sm:right-4">
      {bubbleVisible && <div key={shown} className="pointer-events-auto relative mb-16 max-w-[230px] origin-bottom-right animate-[bubble_0.35s_cubic-bezier(.2,.9,.3,1.3)_both] rounded-2xl rounded-br-sm border border-[var(--line)] bg-[var(--panel)] p-3.5 text-[13.5px] leading-snug text-foreground shadow-[0_18px_40px_-18px_hsl(var(--shadow-color)/0.55)] sm:max-w-[270px] sm:text-sm">
        <p className="mb-1 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--brand)]">
          Sleuth
          <span className="flex items-center gap-1">
            {onSkip && (
              <button type="button" onClick={onSkip} className="inline-flex h-7 items-center gap-1 rounded-full bg-[var(--panel-2)] px-2 text-[11px] font-semibold normal-case tracking-normal text-foreground hover:text-[var(--brand)]">
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
      </div>}
      <button type="button" onClick={() => setPeek((v) => !v)} tabIndex={small ? 0 : -1}
        aria-label={t("Mostrar o que o Sleuth disse", "Show what Sleuth said")}
        className="pointer-events-auto relative h-[130px] w-[84px] shrink-0 sm:pointer-events-none sm:h-[250px] sm:w-[150px]">
        <span aria-hidden className="absolute bottom-1 left-1/2 h-4 w-20 -translate-x-1/2 rounded-[50%] bg-black/20 blur-md dark:bg-black/50" />
        {show3d ? (
          <BunnyCanvas mood={mood} onFail={() => setWebgl(false)} />
        ) : (
          <div className="absolute inset-x-0 bottom-3 mx-auto grid h-20 w-20 place-items-center rounded-full bg-white shadow-lg ring-1 ring-[var(--line)]">
            <img src="/brand/orbiting-analytics-globe-256.png" alt="" width={64} height={64} className="h-16 w-16 object-contain" />
          </div>
        )}
      </button>
    </aside>
  );
}
