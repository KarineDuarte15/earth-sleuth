import { useEffect, useState } from "react";
import { BookOpen, Menu, Moon, Pin, Play, Search, Stamp, Sun, X, type LucideIcon } from "lucide-react";
import type { Lang } from "@/types/sleuth";

const LOGO_SMALL_SRC = "/brand/orbiting-analytics-globe-256.png";

/** Simplified Brazil flag: green field, yellow rhombus, blue globe. */
function FlagBR({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 20" className={className} aria-hidden>
      <rect width="28" height="20" rx="3" fill="#009c3b" />
      <path d="M14 3 L25 10 L14 17 L3 10 Z" fill="#ffdf00" />
      <circle cx="14" cy="10" r="4.2" fill="#002776" />
      <path d="M10.2 9.2 Q14 7.6 17.8 10.4" stroke="#fff" strokeWidth="0.9" fill="none" />
    </svg>
  );
}

/** Simplified United States flag: red and white stripes, blue canton. */
function FlagUS({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 20" className={className} aria-hidden>
      <clipPath id="us-r"><rect width="28" height="20" rx="3" /></clipPath>
      <g clipPath="url(#us-r)">
        <rect width="28" height="20" fill="#fff" />
        {[0, 2, 4, 6, 8, 10, 12].map((i) => <rect key={i} y={(i * 20) / 13} width="28" height={20 / 13} fill="#b22234" />)}
        <rect width="12" height={(7 * 20) / 13} fill="#3c3b6e" />
        {[2.2, 5.2, 8.2].map((x) => [2.2, 5.2, 8.2].map((y) => <circle key={`${x}-${y}`} cx={x + (y === 5.2 ? 1.5 : 0)} cy={y} r="0.7" fill="#fff" />))}
      </g>
    </svg>
  );
}

type Theme = "light" | "dark";

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

interface Props {
  lang: Lang;
  setLang: (l: Lang) => void;
  boardCount: number;
}

export default function SiteHeader({ lang, setLang, boardCount }: Props) {
  const t = (pt: string, en: string) => (lang === "pt" ? pt : en);
  const [theme, setTheme] = useState<Theme>("light");
  const [active, setActive] = useState("topo");
  const [open, setOpen] = useState(false);

  const links: { id: string; label: string; Icon: LucideIcon; color: string; badge?: number }[] = [
    { id: "casos", label: t("Assistir", "Watch"), Icon: Play, color: "var(--coral)" },
    { id: "q1", label: t("Investigar", "Investigate"), Icon: Search, color: "var(--aqua)" },
    { id: "veredito", label: t("Veredito", "Verdict"), Icon: Stamp, color: "var(--mint)" },
    { id: "caderno", label: t("Caderno", "Notebook"), Icon: BookOpen, color: "var(--sun)" },
    { id: "mural", label: t("Mural", "Board"), Icon: Pin, color: "var(--tang)", badge: boardCount },
  ];

  useEffect(() => setTheme(readTheme()), []);

  // Highlight the section currently in the middle band of the viewport.
  useEffect(() => {
    const ids = ["topo", "casos", "q1", "veredito", "caderno", "mural"];
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try { localStorage.setItem("es-theme", next); } catch { /* storage unavailable: theme still applies for this visit */ }
    setTheme(next);
  };

  const navLink = (l: (typeof links)[number], mobile = false) => {
    const on = active === l.id || (l.id === "q1" && (active === "q2" || active === "q3"));
    return (
      <a key={l.id} href={`#${l.id}`} onClick={() => setOpen(false)} aria-current={on ? "true" : undefined}
        style={on ? { background: l.color } : undefined}
        className={`group inline-flex items-center gap-1.5 rounded-full font-bold transition ${mobile ? "h-12 px-4 text-base" : "h-10 px-3.5 text-sm"} ${on ? "outline-ink text-[var(--on-color)]" : "border-[2.5px] border-transparent text-foreground hover:bg-[var(--panel-2)]"}`}>
        <l.Icon className="group-wiggle h-4 w-4" aria-hidden />
        {l.label}
        {l.badge !== undefined && l.badge > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--ink)] px-1.5 text-[11px] font-extrabold text-[var(--night)]">{l.badge}</span>
        )}
      </a>
    );
  };

  const langButton = (code: Lang) => {
    const on = lang === code;
    const tone = code === "pt" ? "bg-[#1fbf5f] text-[#062b14]" : "bg-[#ff6b6b] text-[#3a0a0a]";
    return (
      <button key={code} type="button" onClick={() => setLang(code)} aria-pressed={on}
        aria-label={code === "pt" ? "Português (Brasil)" : "English (United States)"}
        className={`inline-flex h-9 min-w-10 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-extrabold tracking-wide transition ${on ? `${tone} outline-ink` : "border-[2.5px] border-transparent text-[var(--muted)] hover:text-foreground"}`}>
        {code === "pt" ? <FlagBR className="h-3.5 w-5 rounded-[3px]" /> : <FlagUS className="h-3.5 w-5 rounded-[3px]" />}
        <span className="hidden sm:inline">{code === "pt" ? "PT" : "EN"}</span>
      </button>
    );
  };

  const round = "btn-pop grid h-11 w-11 place-items-center rounded-full text-[var(--on-color)]";
  return (
    <header className="sticky top-0 z-50 px-2 pt-2 sm:px-4 sm:pt-3">
      <div className="pop glass mx-auto flex h-[60px] max-w-6xl items-center gap-2 rounded-full pl-2 pr-2 sm:h-16 sm:gap-3 sm:pr-3">
        <a href="#topo" className="group flex shrink-0 items-center gap-2" aria-label="Earth Sleuth">
          <span className="outline-ink grid h-11 w-11 place-items-center rounded-full bg-white transition group-hover:rotate-[-12deg]">
            <img src={LOGO_SMALL_SRC} alt="" width={34} height={34} className="h-[34px] w-[34px] object-contain" />
          </span>
          <span className="hidden font-serif text-xl font-bold leading-none text-foreground min-[400px]:block">Earth<span className="text-gradient">Sleuth</span></span>
        </a>

        <nav aria-label={t("Seções", "Sections")} className="mx-auto hidden items-center gap-0.5 lg:flex">
          {links.map((l) => navLink(l))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
          <div role="group" aria-label={t("Idioma", "Language")} className="flex items-center gap-0.5 rounded-full bg-[var(--panel-2)] p-0.5">
            {langButton("pt")}
            {langButton("en")}
          </div>
          <button type="button" onClick={toggleTheme}
            aria-label={theme === "dark" ? t("Usar tema claro", "Switch to light theme") : t("Usar tema escuro", "Switch to dark theme")}
            className={`${round} hover-wiggle ${theme === "dark" ? "bg-[var(--sun)]" : "bg-[var(--grape)]"}`}>
            {theme === "dark" ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
          </button>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-nav"
            aria-label={t("Abrir menu", "Open menu")} className={`${round} bg-[var(--aqua)] lg:hidden`}>
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label={t("Seções", "Sections")} className="pop reveal mx-auto mt-2 grid max-w-6xl gap-1 rounded-3xl p-3 lg:hidden">
          {links.map((l) => navLink(l, true))}
        </nav>
      )}
    </header>
  );
}
