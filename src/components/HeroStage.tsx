import { CloudRain, HelpCircle, Search, Sprout, Thermometer, Satellite, Sigma, Sun } from "lucide-react";

const Star = ({ className = "", style }: { className?: string; style?: React.CSSProperties }) => (
  <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden>
    <path d="M12 0c1.2 6.6 5.4 10.8 12 12-6.6 1.2-10.8 5.4-12 12-1.2-6.6-5.4-10.8-12-12 6.6-1.2 10.8-5.4 12-12z" fill="currentColor" />
  </svg>
);

/**
 * The hero scene: Sleuth stands on a little planet (the 3D bunny is drawn over the #sleuth-stage box
 * by SleuthGuide), with a satellite in orbit and clue stickers floating around.
 */
export default function HeroStage() {
  const chip = "outline-ink absolute grid place-items-center rounded-2xl text-[var(--on-color)] shadow-[3px_3px_0_0_var(--pop)]";
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[360px] sm:max-w-[520px]" aria-hidden>
      {/* sun disc behind the detective */}
      <div className="outline-ink absolute left-[14%] top-[6%] h-[64%] w-[72%] rounded-full bg-[var(--sun)]" />
      <div className="absolute left-[14%] top-[6%] h-[64%] w-[72%] rounded-full dots opacity-60" />

      {/* orbit with a satellite */}
      <div className="spin-slow absolute inset-[2%]">
        <div className="absolute inset-0 rounded-full border-[3px] border-dashed border-[var(--stroke)] opacity-50" />
        <span className={`${chip} -top-4 left-1/2 h-11 w-11 -translate-x-1/2 bg-[var(--aqua)]`}><Satellite className="h-6 w-6" /></span>
        <span className="absolute bottom-[8%] left-[6%] h-4 w-4 rounded-full border-[2.5px] border-[var(--stroke)] bg-[var(--tang)]" />
      </div>

      {/* the planet */}
      <svg viewBox="0 0 520 520" className="absolute inset-0 h-full w-full">
        <defs><clipPath id="planet-clip"><circle cx="260" cy="560" r="230" /></clipPath></defs>
        <circle cx="260" cy="560" r="230" fill="var(--aqua)" stroke="var(--stroke)" strokeWidth="5" />
        <g clipPath="url(#planet-clip)" fill="var(--mint)" stroke="var(--stroke)" strokeWidth="4">
          <path d="M70 430c40-40 90-30 110-5s60 20 70 50-40 60-90 50-110-60-90-95z" />
          <path d="M300 380c30-25 80-20 100 10s70 30 60 70-70 40-110 20-80-70-50-100z" />
          <path d="M210 500c20-10 50 0 50 20s-30 30-50 20-20-30 0-40z" />
        </g>
        <path d="M60 470a230 230 0 0 1 60-80" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" opacity=".6" />
      </svg>

      {/* where the 3D detective stands */}
      <div id="sleuth-stage" className="absolute bottom-[25%] left-[22%] right-[22%] top-[4%]" />

      {/* floating clue stickers */}
      <span className={`${chip} float left-[1%] top-[30%] h-14 w-14 -rotate-12 bg-[var(--coral)]`}><Thermometer className="h-7 w-7" /></span>
      <span className={`${chip} float-slow right-[0%] top-[20%] h-14 w-14 rotate-12 bg-[var(--aqua)]`}><CloudRain className="h-7 w-7" /></span>
      <span className={`${chip} float-fast left-[6%] top-[62%] h-12 w-12 rotate-6 bg-[var(--mint)]`}><Sprout className="h-6 w-6" /></span>
      <span className={`${chip} float right-[3%] top-[56%] h-12 w-12 -rotate-6 bg-[var(--tang)]`}><Sun className="h-6 w-6" /></span>
      <span className={`${chip} float-slow right-[10%] top-[0%] h-10 w-auto rotate-3 gap-1 bg-[var(--panel)] px-3 font-mono text-sm font-bold !text-foreground`} style={{ display: "inline-flex" }}><Sigma className="h-4 w-4" />p &lt; 0.05</span>
      <span className={`${chip} wiggle left-[10%] top-[4%] h-12 w-12 rounded-full bg-[var(--grape)]`}><HelpCircle className="h-7 w-7" /></span>
      <span className={`${chip} wiggle bottom-[20%] right-[12%] h-12 w-12 rounded-full bg-[var(--sun)]`}><Search className="h-6 w-6" /></span>

      <Star className="blink-star absolute left-[30%] top-[-2%] h-6 w-6 text-[var(--coral)]" />
      <Star className="blink-star absolute right-[26%] top-[40%] h-4 w-4 text-[var(--brand)]" style={{ animationDelay: "-0.8s" }} />
      <Star className="blink-star absolute left-[0%] top-[48%] h-5 w-5 text-[var(--brand)]" style={{ animationDelay: "-1.4s" }} />
    </div>
  );
}
