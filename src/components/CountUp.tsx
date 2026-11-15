
import { useEffect, useState } from "react";

/** Número que "rola" até o valor final (respeita redução de movimento). */
export default function CountUp({ value, decimals = 3, signed = true }: { value: number; decimals?: number; signed?: boolean }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 900);
      setShown(value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const txt = shown.toFixed(decimals);
  return <>{signed && value > 0 ? "+" : ""}{txt}</>;
}
