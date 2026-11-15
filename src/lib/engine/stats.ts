/**
 * Earth Sleuths statistical engine (deterministic, no AI). Faithful TypeScript port of
 * api/_lib/stats_engine.py: Seasonal Mann-Kendall + Hirsch-Slack (1984) covariance
 * correction + seasonal Sen slope with nonparametric 95% CI, RN01–RN04 rules.
 */
export const ALPHA = 0.05;
const Z_975 = 1.959963984540054;
export const MIN_YEARS = 15.0;
export const MAX_MISSING_PCT = 20.0;
export const MIN_VALID_MONTHS = 144;

export interface MonthlyRecord { date: string; year: number; month: number; value: number | null }

const isNum = (v: number) => !Number.isNaN(v);

/** Python-like round(x, n). */
export const pyRound = (x: number, n: number) => {
  const f = 10 ** n;
  const r = Math.round(Math.abs(x) * f) / f;
  return x < 0 ? -r : r;
};
/** Python f"{x:+.3f}" */
export const fmtSigned = (x: number, d = 3) => {
  const neg = x < 0 || Object.is(x, -0);
  const s = Math.abs(x).toFixed(d);
  return (neg && Number(s) !== 0 ? "-" : neg ? "-" : "+") + s;
};
/** Python str(float) for simple values */
const pyFloatStr = (x: number) => (Number.isInteger(x) ? x.toFixed(1) : String(x));

/** erfc via Numerical Recipes Chebyshev approximation (|rel err| < 1.2e-7). */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
    t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
export const normSfTwoSided = (z: number) => erfc(Math.abs(z) / Math.SQRT2);

function tieTerm(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let s = 0;
  for (const t of counts.values()) if (t > 1) s += t * (t - 1) * (2 * t + 5);
  return s;
}

/** D[i][j] = sgn(x_j - x_i) for i<j; 0 when missing or outside the upper triangle. */
function signMatrix(col: number[]): number[][] {
  const n = col.length;
  const d = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const diff = col[j] - col[i];
      d[i][j] = Number.isNaN(diff) ? 0 : Math.sign(diff);
    }
  return d;
}

export function lag1Autocorrelation(x: number[]): number | null {
  let nPairs = 0;
  for (let i = 0; i < x.length - 1; i++) if (isNum(x[i]) && isNum(x[i + 1])) nPairs++;
  if (nPairs < 24) return null;
  const valid = x.filter(isNum);
  const mu = valid.reduce((a, b) => a + b, 0) / valid.length;
  let num = 0;
  for (let i = 0; i < x.length - 1; i++) if (isNum(x[i]) && isNum(x[i + 1])) num += (x[i] - mu) * (x[i + 1] - mu);
  const den = valid.reduce((a, v) => a + (v - mu) ** 2, 0);
  if (den === 0) return 0;
  return (num / den) * valid.length / nPairs;
}

/** matrix: years × 12 with NaN for gaps. */
export function seasonalMannKendall(matrix: number[][]) {
  const nYears = matrix.length;
  const nSeasons = 12;
  const cols = Array.from({ length: nSeasons }, (_, g) => matrix.map((row) => row[g]));
  const signs = cols.map(signMatrix);
  let sTotal = 0, varIndep = 0, nPairs = 0;
  const nValid: number[] = [];
  const ranks: number[][] = [];
  for (let g = 0; g < nSeasons; g++) {
    const col = cols[g];
    const valid = col.filter(isNum);
    const ng = valid.length;
    nValid.push(ng);
    for (const row of signs[g]) for (const v of row) sTotal += v;
    if (ng >= 2) {
      varIndep += (ng * (ng - 1) * (2 * ng + 5) - tieTerm(valid)) / 18.0;
      nPairs += (ng * (ng - 1)) / 2;
    }
    const r = new Array<number>(nYears);
    for (let i = 0; i < nYears; i++) {
      if (!isNum(col[i])) { r[i] = (ng + 1) / 2; continue; }
      let full = 0;
      for (let j = 0; j < nYears; j++) full += signs[g][i][j] - signs[g][j][i];
      r[i] = (ng + 1 - full) / 2;
    }
    ranks.push(r);
  }
  let covSum = 0;
  for (let g = 0; g < nSeasons; g++)
    for (let h = 0; h < nSeasons; h++) {
      if (g === h) continue;
      let k = 0;
      for (let i = 0; i < nYears; i++) for (let j = i + 1; j < nYears; j++) k += signs[g][i][j] * signs[h][i][j];
      let dot = 0;
      for (let i = 0; i < nYears; i++) dot += ranks[g][i] * ranks[h][i];
      covSum += (k + 4 * dot - nYears * (nValid[g] + 1) * (nValid[h] + 1)) / 3.0;
    }
  const varHs = varIndep + covSum;
  return { s: sTotal, var_indep: varIndep, var_hs: varHs, var_used: Math.max(varIndep, varHs), n_pairs: nPairs };
}

export function seasonalSenSlopes(matrix: number[][], years: number[]): number[] {
  const out: number[] = [];
  for (let g = 0; g < 12; g++) {
    const v: number[] = [], t: number[] = [];
    matrix.forEach((row, i) => { if (isNum(row[g])) { v.push(row[g]); t.push(years[i]); } });
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) out.push((v[j] - v[i]) / (t[j] - t[i]));
  }
  return out;
}

export function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

export function senCi(slopes: number[], varS: number): [number, number, number] {
  const s = [...slopes].sort((a, b) => a - b);
  const n = s.length;
  const med = median(s);
  const c = Z_975 * Math.sqrt(Math.max(varS, 0));
  const m1 = Math.floor((n - c) / 2);
  const m2 = Math.ceil((n + c) / 2) + 1;
  const clamp = (m: number) => Math.min(Math.max(m, 1), n) - 1;
  return [med, s[clamp(m1)], s[clamp(m2)]];
}

export function benjaminiHochberg(p: (number | null)[]): (number | null)[] {
  const idx = p.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
  const m = idx.length;
  const q: (number | null)[] = p.map(() => null);
  if (!m) return q;
  const order = [...idx].sort((a, b) => (p[a] as number) - (p[b] as number));
  let running = 1.0;
  for (let rank = m; rank >= 1; rank--) {
    const i = order[rank - 1];
    running = Math.min(running, ((p[i] as number) * m) / rank);
    q[i] = pyRound(Math.min(running, 1), 6);
  }
  return q;
}

export function analyzeMonthlySeries(recordsIn: MonthlyRecord[], unit: string, lang: "pt" | "en" = "pt") {
  const records = [...recordsIn].sort((a, b) => a.year - b.year || a.month - b.month);
  if (!records.length) throw new Error("Série vazia: a fonte não retornou meses para o período pedido.");
  const y0 = records[0].year;
  const yLast = Math.max(...records.map((r) => r.year));
  const years = Array.from({ length: yLast - y0 + 1 }, (_, i) => y0 + i);
  const matrix = years.map(() => new Array<number>(12).fill(NaN));
  for (const r of records) if (r.value !== null && isNum(r.value)) matrix[r.year - y0][r.month - 1] = r.value;

  const nTotal = records.length;
  let nValid = 0;
  matrix.forEach((row) => row.forEach((v) => { if (isNum(v)) nValid++; }));
  const missingPct = pyRound(((nTotal - nValid) / nTotal) * 100, 2);
  const spanYears = pyRound(nTotal / 12, 1);

  const clim = Array.from({ length: 12 }, (_, g) => {
    const vals = matrix.map((row) => row[g]).filter(isNum);
    return vals.length >= 3 ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
  });
  const anom = matrix.map((row) => row.map((v, g) => v - clim[g]));

  const startDate = records[0].date, endDate = records[records.length - 1].date;
  const period = { start_date: startDate, end_date: endDate, frequency: "monthly", baseline_climatology: `${startDate.slice(0, 4)}–${endDate.slice(0, 4)}` };
  const quality = { n_total: nTotal, n_valid: nValid, percent_ausente: missingPct, span_years: spanYears, passes_quality_gate: true, alert: null as string | null };

  type Trend = { t_mid: number; mid: number; slope: number; lo: number; hi: number };
  const series = (trend: Trend | null) => records.map((r) => {
    const yi = r.year - y0, mi = r.month - 1;
    const val = matrix[yi][mi], an = anom[yi][mi];
    const p = { date: r.date, year: r.year, month: r.month, value: isNum(val) ? pyRound(val, 4) : null, anomaly: isNum(an) ? pyRound(an, 4) : null, trend_line: null as number | null, ci_low_line: null as number | null, ci_high_line: null as number | null };
    if (trend) {
      const dt = yi + mi / 12 - trend.t_mid;
      p.trend_line = pyRound(trend.mid + trend.slope * dt, 4);
      p.ci_low_line = pyRound(trend.mid + trend.lo * dt, 4);
      p.ci_high_line = pyRound(trend.mid + trend.hi * dt, 4);
    }
    return p;
  });

  // RN03
  if (spanYears < MIN_YEARS || missingPct > MAX_MISSING_PCT || nValid < MIN_VALID_MONTHS) {
    const sy = pyFloatStr(spanYears), mp = pyFloatStr(missingPct);
    const msgPt = `Série com ${sy} anos e ${mp}% de meses ausentes. A política do Earth Sleuths exige pelo menos 15 anos, no máximo 20% de lacunas e 144 meses válidos para emitir selo de tendência. Resultado apenas exploratório.`;
    const msgEn = `Series spans ${sy} years with ${mp}% missing months. Earth Sleuths requires at least 15 years, at most 20% gaps and 144 valid months before issuing a trend stamp. Exploratory view only.`;
    quality.passes_quality_gate = false;
    quality.alert = lang === "pt" ? msgPt : msgEn;
    return {
      status: "DADOS_INSUFICIENTES" as const, quality, period,
      statistics: {
        methodology: "Não executado (RN03)", seasonal_adjustment: "Anomalias em relação à climatologia mensal",
        autocorrelation_method: "Não aplicado", autocorrelation_lag1: null, variance_inflation: null,
        slope_per_decade: null, ci95_low: null, ci95_high: null, p_value: null, tau: null, z: null,
        direction: "insufficient" as const, robustness_note: "",
      },
      narrative: quality.alert, series: series(null),
    };
  }

  const mk = seasonalMannKendall(matrix);
  const { s, var_used } = mk;
  const z = var_used > 0 && s !== 0 ? (s - Math.sign(s)) / Math.sqrt(var_used) : 0;
  const pValue = var_used > 0 ? normSfTwoSided(z) : 1.0;
  const tau = mk.n_pairs ? s / mk.n_pairs : 0;
  const inflation = mk.var_indep ? mk.var_used / mk.var_indep : 1;
  const corrected = inflation > 1 + 1e-9;

  const slopes = seasonalSenSlopes(matrix, years);
  const [slopeY, loY, hiY] = senCi(slopes, var_used);
  const slopeDec = pyRound(slopeY * 10, 4), loDec = pyRound(loY * 10, 4), hiDec = pyRound(hiY * 10, 4);
  const ciCrossesZero = loDec <= 0 && 0 <= hiDec;
  const status = pValue < ALPHA && !ciCrossesZero ? ("TENDENCIA_REAL" as const) : ("PODE_SER_RUIDO" as const);
  const direction = slopeDec > 0 ? ("increasing" as const) : slopeDec < 0 ? ("decreasing" as const) : ("flat" as const);

  const rho1 = lag1Autocorrelation(anom.flat().slice(0, nTotal));

  let robustness = "";
  if (spanYears >= 25) {
    const cut = years.length - 20;
    const sub = seasonalSenSlopes(matrix.slice(cut), years.slice(cut));
    if (sub.length) {
      const subDec = median(sub) * 10;
      const same = subDec * slopeDec > 0;
      const ya = years[cut], yb = years[years.length - 1];
      robustness = lang === "pt"
        ? `Teste de robustez (${ya}–${yb}): ${fmtSigned(subDec)} ${unit}/década, ${same ? "mesmo sinal" : "sinal diferente"} da série completa.`
        : `Robustness check (${ya}–${yb}): ${fmtSigned(subDec)} ${unit}/decade, ${same ? "same sign" : "different sign"} than the full series.`;
    }
  }

  const anomValid = anom.flat().filter(isNum);
  const trend: Trend = { t_mid: (years.length - 1) / 2 + 5.5 / 12, mid: anomValid.length ? median(anomValid) : 0, slope: slopeY, lo: loY, hi: hiY };

  const pRound = pyRound(pValue, 6);
  const pTxt = pRound < 0.0001 ? "p < 0.0001" : `p = ${pRound.toFixed(4)}`;
  const rate = `${fmtSigned(slopeDec)} ${unit}`;
  const ci = `[${fmtSigned(loDec)}; ${fmtSigned(hiDec)}]`;
  let narrative: string;
  if (lang === "pt") {
    narrative = status === "TENDENCIA_REAL"
      ? `Os dados sustentam uma tendência monotônica de ${rate} por década (IC 95%: ${ci}; ${pTxt}) no período analisado. Se não houvesse tendência, um resultado tão extremo quanto este seria improvável (${pTxt}). Isso descreve a série; não identifica a causa.`
      : `A taxa estimada é de ${rate} por década (IC 95%: ${ci}; ${pTxt}). Não há evidência estatística suficiente para afirmar uma tendência no período — o que não prova que a mudança não exista.`;
  } else {
    narrative = status === "TENDENCIA_REAL"
      ? `The data support a monotonic trend of ${rate} per decade (95% CI: ${ci}; ${pTxt}) over the period. With no trend, a result this extreme would be unlikely (${pTxt}). This describes the series, not its cause.`
      : `The estimated rate is ${rate} per decade (95% CI: ${ci}; ${pTxt}). There is not enough statistical evidence for a trend in this period — which does not prove that no change exists.`;
  }

  const statistics = {
    methodology: "Seasonal Mann-Kendall + Sen sazonal",
    seasonal_adjustment: "Pareamento intra-mês (MK/Sen) e anomalias da climatologia mensal",
    autocorrelation_method: corrected ? "Hirsch & Slack (1984): covariância entre meses incorporada" : "Hirsch & Slack (1984) avaliado: sem inflação de variância necessária",
    autocorrelation_lag1: rho1 === null ? null : pyRound(rho1, 3),
    variance_inflation: pyRound(inflation, 3),
    slope_per_decade: slopeDec as number | null, ci95_low: loDec as number | null, ci95_high: hiDec as number | null,
    p_value: pRound as number | null, tau: pyRound(tau, 4) as number | null, z: pyRound(z, 4) as number | null,
    direction, robustness_note: robustness, unit,
  };
  const payload = { status, quality, period, statistics, narrative, series: series(trend) };
  validateNarrativeNumbers(narrative, slopeDec, loDec, hiDec, pRound, unit);
  return payload;
}

/** RN04: every number in the narrative must exist in the computed JSON. */
export function validateNarrativeNumbers(narrative: string, slope: number, lo: number, hi: number, p: number, unit?: string) {
  const allowed = new Set(["95", "0.0001", fmtSigned(slope), fmtSigned(lo), fmtSigned(hi), p.toFixed(4)]);
  const text = unit ? narrative.split(unit).join(" ") : narrative;
  for (const tok of text.match(/[+-]?\d+(?:\.\d+)?/g) ?? [])
    if (!allowed.has(tok)) throw new Error(`RN04: número sem lastro na narrativa: '${tok}'`);
}
