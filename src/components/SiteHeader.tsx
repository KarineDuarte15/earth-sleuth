import { useEffect, useState } from "react";
import { Menu, Moon, Sun, X } from "lucide-react";
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
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("topo");
  const [open, setOpen] = useState(false);

  const links = [
    { id: "casos", label: t("Demo", "Demo") },
    { id: "q1", label: t("Investigar", "Investigate") },
    { id: "veredito", label: t("Veredito", "Verdict") },
    { id: "caderno", label: t("Caderno", "Notebook") },
    { id: "mural", label: t("Mural", "Board"), badge: boardCount },
  ];

  useEffect(() => setTheme(readTheme()), []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Highlight the section currently in the middle band of the viewport.
  useEffect(() => {
    const ids = ["topo", "casos", "q1", "q2", "q3", "veredito", "ods", "caderno", "mural"];
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
        className={mobile
          ? `flex items-center justify-between rounded-xl px-4 py-3 text-base font-medium ${on ? "bg-[var(--panel-2)] text-foreground" : "text-[var(--muted)]"}`
          : `relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${on ? "bg-[var(--panel)] text-foreground shadow-sm" : "text-[var(--muted)] hover:text-foreground"}`}>
        {l.label}
        {l.badge !== undefined && l.badge > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--orange)] px-1.5 text-[11px] font-bold text-white">{l.badge}</span>
        )}
      </a>
    );
  };

  const langButton = (code: Lang) => {
    const on = lang === code;
    const tone = code === "pt"
      ? "bg-[#009c3b]/12 text-[#00843a] ring-1 ring-[#009c3b]/40 dark:bg-[#009c3b]/20 dark:text-[#4ade80]"
      : "bg-[#b22234]/10 text-[#b22234] ring-1 ring-[#b22234]/35 dark:bg-[#b22234]/22 dark:text-[#fca5a5]";
    return (
      <button key={code} type="button" onClick={() => setLang(code)} aria-pressed={on}
        aria-label={code === "pt" ? "Português (Brasil)" : "English (United States)"}
        className={`inline-flex h-9 min-w-10 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-bold tracking-wide transition ${on ? tone : "text-[var(--muted)] hover:text-foreground"}`}>
        {code === "pt" ? <FlagBR className="h-3.5 w-5 rounded-[3px] shadow-sm" /> : <FlagUS className="h-3.5 w-5 rounded-[3px] shadow-sm" />}
        <span className="hidden sm:inline">{code === "pt" ? "PT-BR" : "EN"}</span>
      </button>
    );
  };

  return (
    <header className={`glass sticky top-0 z-50 border-b transition-shadow ${scrolled ? "border-[var(--line)] shadow-[0_8px_30px_-18px_hsl(var(--shadow-color)/0.45)]" : "border-transparent"}`}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-3">
        <a href="#topo" className="group flex shrink-0 items-center gap-2.5" aria-label="Earth Sleuth">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-[var(--line)] transition group-hover:rotate-[-6deg]">
            <img src={LOGO_SMALL_SRC} alt="" width={36} height={36} className="h-9 w-9 object-contain" />
          </span>
          <span className="leading-tight">
            <span className="block font-serif text-[17px] font-bold text-foreground">Earth <span className="text-gradient">Sleuth</span></span>
            <span className="hidden text-[11px] font-medium text-[var(--muted)] sm:block">{t("Detetives de tendências da Terra", "Earth System Trend Detectives")}</span>
          </span>
        </a>

        <nav aria-label={t("Seções", "Sections")} className="mx-auto hidden items-center gap-0.5 rounded-full border border-[var(--line)] bg-[var(--panel-2)]/70 p-1 lg:flex">
          {links.map((l) => navLink(l))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
          <div role="group" aria-label={t("Idioma", "Language")} className="flex items-center gap-0.5 rounded-full border border-[var(--line)] bg-[var(--panel)] p-0.5">
            {langButton("pt")}
            {langButton("en")}
          </div>
          <button type="button" onClick={toggleTheme}
            aria-label={theme === "dark" ? t("Usar tema claro", "Switch to light theme") : t("Usar tema escuro", "Switch to dark theme")}
            className="grid h-10 w-10 place-items-center rounded-full border border-[var(--line)] bg-[var(--panel)] text-foreground transition hover:border-[var(--brand)] hover:text-[var(--brand)]">
            {theme === "dark" ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
          </button>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-nav"
            aria-label={t("Abrir menu", "Open menu")}
            className="grid h-10 w-10 place-items-center rounded-full border border-[var(--line)] bg-[var(--panel)] text-foreground lg:hidden">
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label={t("Seções", "Sections")} className="reveal border-t border-[var(--line)] px-4 pb-4 pt-2 lg:hidden">
          <div className="mx-auto grid max-w-6xl gap-1">{links.map((l) => navLink(l, true))}</div>
        </nav>
      )}
    </header>
  );
}
