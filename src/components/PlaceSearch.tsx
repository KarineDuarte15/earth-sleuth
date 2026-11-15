import { useEffect, useRef, useState } from "react";
import { MapPin, Search, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findPlaces, type PlaceResult } from "@/lib/places";
import type { ScenePoint } from "@/types/sleuth";

export default function PlaceSearch({ target, focus, onSelect }: { target: "A" | "B"; focus: ScenePoint; onSelect: (target: "A" | "B", point: ScenePoint) => void }) {
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<PlaceResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(-1);
  const version = useRef(0);
  const selected = useRef(false);
  const cache = useRef(new Map<string, PlaceResult[]>());

  useEffect(() => {
    version.current++; selected.current = false;
    setQuery(""); setChoices([]); setOpen(false); setBusy(false); setError(""); setMessage("");
  }, [target]);

  async function lookup(v: number) {
    const key = `${focus.latitude},${focus.longitude}:${query.trim()}`;
    const saved = cache.current.get(key);
    if (saved) { setChoices(saved); setIndex(-1); return saved; }
    setBusy(true); setError("");
    try {
      const results = await findPlaces({ query: query.trim(), latitude: focus.latitude, longitude: focus.longitude });
      if (v !== version.current) return null;
      if (cache.current.size >= 30) cache.current.clear();
      cache.current.set(key, results); setChoices(results); setIndex(-1);
      return results;
    } catch (e) {
      if (v === version.current) { setChoices([]); setError(e instanceof Error ? e.message : "Não foi possível buscar locais."); setOpen(false); }
      return null;
    } finally { if (v === version.current) setBusy(false); }
  }

  // Suggestions while typing, debounced so the free geocoder is not hit on every keystroke.
  useEffect(() => {
    const v = ++version.current;
    if (query.trim().length < 3 || selected.current || !open) { setBusy(false); return; }
    const timer = window.setTimeout(() => void lookup(v), 400);
    return () => clearTimeout(timer);
  }, [query, focus.latitude, focus.longitude, open]); // eslint-disable-line react-hooks/exhaustive-deps

  function choose(choice: PlaceResult) {
    version.current++; selected.current = true;
    onSelect(target, choice.point);
    setQuery(choice.label); setChoices([]); setOpen(false); setBusy(false); setError(""); setMessage(`Local selecionado para a Cena ${target}.`);
  }

  async function broadSearch() {
    if (busy || query.trim().length < 3) return;
    selected.current = false;
    const results = await lookup(++version.current);
    if (results) { setOpen(true); setMessage(results.length ? "" : "Nenhum local encontrado."); }
  }

  return <div className="mb-4 space-y-3">
    <label htmlFor="place-address" className="block text-sm font-semibold text-foreground">Buscar endereço ou local · Cena {target}</label>
    <div className="relative">
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (index >= 0 && choices[index]) choose(choices[index]); else void broadSearch(); }}>
        <div className="relative min-w-0 flex-1">
          <Input id="place-address" role="combobox" aria-autocomplete="list" aria-expanded={open && choices.length > 0} aria-controls="place-results" aria-activedescendant={index >= 0 ? `place-option-${index}` : undefined} autoComplete="off" maxLength={200}
            value={query} placeholder="Cidade, rua, endereço ou lugar"
            className="pr-10" onFocus={() => { if (query.trim().length >= 3) setOpen(true); }}
            onChange={e => { version.current++; selected.current = false; setBusy(false); setQuery(e.target.value); setChoices([]); setIndex(-1); setOpen(true); setMessage(""); }}
            onKeyDown={e => { if (e.key === "Escape") { version.current++; setOpen(false); setBusy(false); } if (e.key === "ArrowDown") { e.preventDefault(); setIndex(i => Math.min(i + 1, choices.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setIndex(i => Math.max(i - 1, 0)); } }} />
          {query && <Button type="button" variant="ghost" size="icon" title="Limpar busca" aria-label="Limpar busca" className="absolute right-0 top-0" onClick={() => { version.current++; selected.current = false; setQuery(""); setChoices([]); setBusy(false); setOpen(false); }}><X /></Button>}
        </div>
        <Button type="submit" size="icon" title="Buscar locais" aria-label="Buscar locais" disabled={busy || query.trim().length < 3}>{busy ? <Loader2 className="animate-spin" /> : <Search />}</Button>
      </form>
      {open && choices.length > 0 && <div id="place-results" role="listbox" aria-label="Locais encontrados" className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-sm">
        {choices.map((choice, i) => <Button key={choice.id} id={`place-option-${i}`} role="option" aria-selected={i === index} variant="ghost" size="content" className={`flex w-full justify-start gap-2 rounded-none px-3 py-3 text-left text-sm ${i === index ? "bg-accent" : ""}`} onClick={() => choose(choice)}><MapPin className="shrink-0 text-primary" /><span className="min-w-0 break-words">{choice.label}</span></Button>)}
        <div className="border-t border-border px-3 py-2 text-right text-xs text-muted-foreground">© OpenStreetMap · Photon</div>
      </div>}
    </div>
    {busy && <p role="status" className="text-sm text-muted-foreground">Buscando local…</p>}
    {message && <p role="status" className="text-sm text-primary">{message}</p>}
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
  </div>;
}
