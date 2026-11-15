// A small animated scene for each climate clue, drawn in SVG and moved with CSS (see "clue scenes" in styles.css).
const INK = "#1b1440";
const line = { stroke: INK, strokeWidth: 2.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

const SKY: Record<string, string> = {
  T2M: "linear-gradient(#ffd98a, #ff9f7a)",
  T2M_MIN: "linear-gradient(#1b1440, #4a3aff)",
  T2M_MAX: "linear-gradient(#fff3a8, #ffb347)",
  PRECTOTCORR: "linear-gradient(#8fb8e8, #cfe6ff)",
  GWETROOT: "linear-gradient(#bdeeff, #e9fbff)",
  EVPTRNS: "linear-gradient(#c9f5e3, #fff6c9)",
};

function Scene({ id }: { id: string }) {
  switch (id) {
    case "T2M": // a thermometer filling up while heat rises
      return (
        <>
          <circle className="scene-pulse" cx="250" cy="34" r="20" fill="#ffc93c" {...line} />
          {[60, 100, 190, 225].map((x, i) => (
            <path key={x} className="scene-rise" style={{ animationDelay: `${-i * 0.7}s` }} d={`M${x} 92c-7-8 7-14 0-22s7-14 0-22`} fill="none" stroke="#ff6b98" strokeWidth="3.5" strokeLinecap="round" />
          ))}
          <rect x="138" y="10" width="24" height="64" rx="12" fill="#fff" {...line} />
          <rect className="scene-mercury" x="145" y="18" width="10" height="56" rx="5" fill="#ff6b98" />
          <circle cx="150" cy="78" r="15" fill="#ff6b98" {...line} />
        </>
      );
    case "T2M_MIN": // a warm night: moon, stars, a lit window
      return (
        <>
          {[[30, 20], [80, 42], [120, 14], [205, 28], [270, 16], [240, 52]].map(([x, y], i) => (
            <circle key={i} className="blink-star" style={{ animationDelay: `${-i * 0.45}s`, transformOrigin: `${x}px ${y}px` }} cx={x} cy={y} r="2.6" fill="#fff" />
          ))}
          <g className="float-slow"><circle cx="168" cy="34" r="19" fill="#ffe9b8" {...line} /><circle cx="177" cy="28" r="15" fill="#2b2170" /></g>
          <path d="M0 100V78q40-14 80 0t80-4 80 2 60-2v26z" fill="#150f3d" />
          <path d="M40 82V60l18-14 18 14v22z" fill="#2b2170" {...line} />
          <rect className="scene-window" x="52" y="62" width="12" height="12" rx="2" fill="#ffc93c" stroke={INK} strokeWidth="2" />
        </>
      );
    case "T2M_MAX": // a blazing sun over the desert
      return (
        <>
          <g className="spin-mid" style={{ transformOrigin: "232px 36px" }}>
            {Array.from({ length: 10 }, (_, i) => (
              <path key={i} d="M232 4v10" transform={`rotate(${i * 36} 232 36)`} stroke={INK} strokeWidth="4" strokeLinecap="round" />
            ))}
          </g>
          <circle className="scene-pulse" cx="232" cy="36" r="19" fill="#ff9248" {...line} />
          <path d="M0 100V80q50-18 110-4t100-6 90 6v24z" fill="#f4c56a" {...line} />
          <path d="M70 80V46m0 18h-12V52m12 20h12V58" fill="none" stroke="#2fae7c" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          {[120, 150, 180].map((x, i) => (
            <path key={x} className="scene-rise" style={{ animationDelay: `${-i * 0.8}s` }} d={`M${x} 74c-6-7 6-12 0-19s6-12 0-19`} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
          ))}
        </>
      );
    case "PRECTOTCORR": // rain falling from a drifting cloud
      return (
        <>
          <path d="M0 100V88h300v12z" fill="#3fd4ff" {...line} />
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} className="scene-rain" style={{ animationDelay: `${-((i * 37) % 100) / 100}s` }} d={`M${72 + i * 14} 44l-4 12`} stroke="#1f7fe0" strokeWidth="3.5" strokeLinecap="round" />
          ))}
          <g className="scene-drift">
            <path d="M88 46a17 17 0 0 1 6-33 24 24 0 0 1 45-6 20 20 0 0 1 36 10 15 15 0 0 1 3 29z" fill="#fff" {...line} />
          </g>
          {[100, 170, 215].map((x, i) => (
            <ellipse key={x} className="scene-ripple" style={{ animationDelay: `${-i * 0.5}s`, transformOrigin: `${x}px 92px` }} cx={x} cy="92" rx="11" ry="3" fill="none" stroke="#fff" strokeWidth="2.5" />
          ))}
        </>
      );
    case "GWETROOT": // water sinking into the soil while a sprout grows
      return (
        <>
          <path d="M0 100V54h300v46z" fill="#b97a3a" {...line} />
          <path d="M0 100V78h300v22z" fill="#8a5a2b" />
          <path className="scene-water" d="M0 100V70q40-8 80 0t80 0 80 0 60 0v30z" fill="#3fd4ff" opacity="0.6" />
          {[60, 110, 200, 250].map((x, i) => (
            <path key={x} className="scene-sink" style={{ animationDelay: `${-i * 0.6}s` }} d={`M${x} 56c-4 6-5 9 0 12 5-3 4-6 0-12z`} fill="#3fd4ff" stroke={INK} strokeWidth="1.8" />
          ))}
          <g className="scene-grow" style={{ transformOrigin: "155px 54px" }}>
            <path d="M155 54V26" stroke="#2fae7c" strokeWidth="5" strokeLinecap="round" />
            <path d="M155 36c-16 2-22-8-22-16 12-2 22 6 22 16zm0-8c14 2 20-6 20-14-12-2-20 4-20 14z" fill="#3fe0ae" {...line} />
          </g>
          <path d="M155 56c-8 8-4 18-14 22m14-22c8 8 2 16 12 24m-12-24v30" fill="none" stroke="#f4e3c8" strokeWidth="2.2" strokeLinecap="round" />
        </>
      );
    default: // EVPTRNS: water leaving the ground and the leaves as vapour
      return (
        <>
          <circle className="scene-pulse" cx="262" cy="26" r="16" fill="#ffc93c" {...line} />
          <path d="M0 100V78q40-10 80 0t80 0 80 0 60 0v22z" fill="#3fd4ff" {...line} />
          <path d="M200 80c-4-30 10-48 40-52 4 30-10 48-40 52z" fill="#3fe0ae" {...line} />
          <path d="M204 76c8-20 18-32 32-44" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          {[40, 78, 116, 154, 215, 240].map((x, i) => (
            <g key={x} className="scene-steam" style={{ animationDelay: `${-i * 0.55}s` }}>
              <circle cx={x} cy="66" r="7" fill="#fff" stroke={INK} strokeWidth="2" />
              <circle cx={x + 8} cy="60" r="5" fill="#fff" stroke={INK} strokeWidth="2" />
            </g>
          ))}
        </>
      );
  }
}

export default function ClueScene({ id }: { id: string }) {
  return (
    <span aria-hidden className="block h-24 overflow-hidden rounded-t-[21px] border-b-[2.5px] border-[var(--stroke)]" style={{ background: SKY[id] ?? SKY.EVPTRNS }}>
      <svg viewBox="0 0 300 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full"><Scene id={id} /></svg>
    </span>
  );
}
