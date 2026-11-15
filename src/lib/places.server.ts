import { placeResult } from "./places";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
export async function mapsRequest(path: string, mask: string, body?: object) {
  const key = process.env['GOOGLE_MAPS_API_KEY'];
  const auth = process.env['LOVABLE_API_KEY'];
  if (!key || !auth) throw new Error("A conexão Google Maps não está disponível.");
  const response = await fetch(`${GATEWAY_URL}${path}`, {
    method: body ? "POST" : "GET", signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${auth}`, "X-Connection-Api-Key": key, "Content-Type": "application/json", "X-Goog-FieldMask": mask },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    console.error(`Google Maps [${response.status}]: ${text}`);
    if (response.status === 403) {
      let reason: string | undefined;
      try { reason = JSON.parse(text).error?.details?.find((d: { reason?: string }) => d.reason)?.reason; } catch { /* Keep original status below. */ }
      if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") throw new Error('Google Maps [403]: ajuste a restrição da chave de servidor para “None” ou “IP addresses” no Google Cloud Console.');
      if (reason === "API_KEY_SERVICE_BLOCKED") throw new Error('Google Maps [403]: habilite Places API (New) nas APIs permitidas da chave de servidor no Google Cloud Console.');
    }
    throw new Error(`Google Maps [${response.status}]: ${text}`);
  }
  return response.json();
}
export { placeResult };