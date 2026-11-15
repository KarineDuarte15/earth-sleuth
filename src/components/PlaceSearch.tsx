import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, Search, X, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { searchPlaces, selectPlace, suggestPlaces } from "@/lib/places.functions";
import type { PlaceResult } from "@/lib/places";
import type { ScenePoint } from "@/types/sleuth";
import "@lovable.dev/cloud-auth-js/styles.css";

type Choice = { id: string; label: string; point?: ScenePoint };
export default function PlaceSearch({ target, focus, onSelect }: { target: "A" | "B"; focus: ScenePoint; onSelect: (target: "A" | "B", point: ScenePoint) => void }) {
  const suggest = useServerFn(suggestPlaces);
  const search = useServerFn(searchPlaces);
  const details = useServerFn(selectPlace);
  const [signedIn, setSignedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup" | "reset" | "recovery">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<Choice[]>([]);
  const [busy, setBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(-1);
  const token = useRef<string | undefined>(undefined);
  const version = useRef(0);
  const selecting = useRef(false);
  const cache = useRef(new Map<string, Choice[]>());
  const current = useRef({ target, onSelect });
  current.current = { target, onSelect };

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) { setSignedIn(!!data.session); setAuthReady(true); } });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setSignedIn(!!session); setAuthReady(true);
      if (session) setAuthOpen(false);
      if (event === "PASSWORD_RECOVERY") { setAuthOpen(true); setAuthMode("recovery"); }
      if (event === "SIGNED_OUT") { version.current++; token.current = undefined; cache.current.clear(); setChoices([]); setBusy(false); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    version.current++; token.current = undefined; selecting.current = false;
    setQuery(""); setChoices([]); setOpen(false); setBusy(false); setError(""); setMessage("");
  }, [target]);

  useEffect(() => {
    const v = ++version.current;
    if (!signedIn || query.trim().length < 3 || selecting.current || !open) { setBusy(false); return; }
    const timer = window.setTimeout(async () => {
      const key = `${focus.latitude},${focus.longitude}:${query.trim()}`;
      const saved = cache.current.get(key);
      if (saved) { setChoices(saved); return; }
      token.current ??= crypto.randomUUID();
      setBusy(true); setError("");
      try {
        const results = await suggest({ data: { query: query.trim(), sessionToken: token.current, latitude: focus.latitude, longitude: focus.longitude } });
        if (v !== version.current) return;
        if (cache.current.size >= 30) cache.current.clear();
        cache.current.set(key, results); setChoices(results); setIndex(-1);
      } catch (e) { if (v === version.current) { setChoices([]); setError(e instanceof Error ? e.message : "Não foi possível buscar locais."); setOpen(false); } }
      finally { if (v === version.current) setBusy(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, signedIn, focus.latitude, focus.longitude, open, suggest]);

  async function choose(choice: Choice) {
    if (busy || selecting.current) return;
    const selectedTarget = target;
    const v = ++version.current;
    selecting.current = true; setBusy(true); setError("");
    try {
      const result: PlaceResult | Choice = choice.point ? choice : await details({ data: { placeId: choice.id, sessionToken: token.current } });
      if (v !== version.current || current.current.target !== selectedTarget || !result.point) return;
      current.current.onSelect(selectedTarget, result.point);
      setQuery(result.label); setChoices([]); setOpen(false); setMessage(`Local selecionado para a Cena ${selectedTarget}.`);
    } catch (e) { if (v === version.current) setError(e instanceof Error ? e.message : "Não foi possível selecionar este local."); }
    finally { if (v === version.current) { token.current = undefined; selecting.current = false; setBusy(false); } }
  }

  async function broadSearch() {
    if (busy || query.trim().length < 3) return;
    const v = ++version.current;
    selecting.current = true; setBusy(true); setError(""); token.current ??= crypto.randomUUID();
    try {
      const results = await search({ data: { query: query.trim(), sessionToken: token.current, latitude: focus.latitude, longitude: focus.longitude } });
      if (v === version.current) { setChoices(results); setOpen(true); setIndex(-1); setMessage(results.length ? "" : "Nenhum local encontrado."); }
    } catch (e) { if (v === version.current) setError(e instanceof Error ? e.message : "Não foi possível buscar locais."); }
    finally { if (v === version.current) { selecting.current = false; setBusy(false); } }
  }

  async function authAction() {
    setAuthBusy(true); setError(""); setMessage("");
    try {
      const redirect = window.location.origin + window.location.pathname + window.location.search;
      const result = authMode === "signup" ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } })
        : authMode === "reset" ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect })
        : authMode === "recovery" ? await supabase.auth.updateUser({ password })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setPassword("");
      if (authMode === "signup" || authMode === "reset") setMessage("Confira seu e-mail para continuar.");
      else { setAuthOpen(false); setMessage("Entrada concluída."); }
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível entrar."); }
    finally { setAuthBusy(false); }
  }

  async function social(provider: "google" | "lovable") {
    setAuthBusy(true); setError("");
    try {
      const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin + window.location.pathname + window.location.search });
      if (result.error) throw result.error;
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível entrar."); }
    finally { setAuthBusy(false); }
  }

  return <div className="mb-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label htmlFor="place-address" className="text-sm font-semibold text-foreground">Buscar endereço ou local · Cena {target}</label>
      {signedIn ? <Button variant="ghost" size="sm" onClick={async () => { const { error } = await supabase.auth.signOut(); if (error) setError(error.message); }}><LogOut aria-hidden />Sair</Button>
        : <Button variant="outline" size="sm" disabled={!authReady} onClick={() => setAuthOpen(!authOpen)}>Entrar para buscar</Button>}
    </div>
    <div className="relative">
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (index >= 0 && choices[index]) void choose(choices[index]); else void broadSearch(); }}>
        <div className="relative min-w-0 flex-1">
          <Input id="place-address" role="combobox" aria-autocomplete="list" aria-expanded={open && choices.length > 0} aria-controls="place-results" aria-activedescendant={index >= 0 ? `place-option-${index}` : undefined} autoComplete="off" maxLength={200}
            value={query} disabled={!signedIn || selecting.current} placeholder="Cidade, rua, endereço ou lugar"
            className="pr-10" onFocus={() => { if (query.trim().length >= 3) setOpen(true); }}
            onChange={e => { version.current++; setBusy(false); setQuery(e.target.value); setChoices([]); setIndex(-1); setOpen(true); setMessage(""); }}
            onKeyDown={e => { if (e.key === "Escape") { version.current++; setOpen(false); setBusy(false); } if (e.key === "ArrowDown") { e.preventDefault(); setIndex(i => Math.min(i + 1, choices.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setIndex(i => Math.max(i - 1, 0)); } }} />
          {query && <Button type="button" variant="ghost" size="icon" title="Limpar busca" aria-label="Limpar busca" className="absolute right-0 top-0" onClick={() => { version.current++; setQuery(""); setChoices([]); setBusy(false); setOpen(false); token.current = undefined; }}><X /></Button>}
        </div>
        <Button type="submit" size="icon" title="Buscar locais" aria-label="Buscar locais" disabled={!signedIn || busy || query.trim().length < 3}>{busy ? <Loader2 className="animate-spin" /> : <Search />}</Button>
      </form>
      {open && choices.length > 0 && <div id="place-results" role="listbox" aria-label="Locais encontrados" className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-sm">
        {choices.map((choice, i) => <Button key={choice.id} id={`place-option-${i}`} role="option" aria-selected={i === index} variant="ghost" size="content" disabled={busy} className={`flex w-full justify-start gap-2 rounded-none px-3 py-3 text-left text-sm ${i === index ? "bg-accent" : ""}`} onClick={() => void choose(choice)}><MapPin className="shrink-0 text-primary" /><span className="min-w-0 break-words">{choice.label}</span></Button>)}
        <div className="border-t border-border px-3 py-2 text-right text-xs text-muted-foreground">Google Maps</div>
      </div>}
    </div>
    {authOpen && <div className="space-y-3 border-y border-border py-4">
      <h3 className="font-semibold text-foreground">{authMode === "signup" ? "Criar conta" : authMode === "reset" ? "Recuperar senha" : authMode === "recovery" ? "Nova senha" : "Entrar"}</h3>
      {authMode !== "recovery" && <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={authBusy} onClick={() => void social("google")}><svg aria-hidden="true" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>Continuar com Google</Button>
        <Button variant="plain" className="lovable-auth-button" disabled={authBusy} onClick={() => void social("lovable")}>Continuar com Lovable</Button>
      </div>}
      <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); void authAction(); }}>
        {authMode !== "recovery" && <label className="min-w-0 flex-1 text-sm">E-mail<Input aria-label="E-mail" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>}
        {authMode !== "reset" && <label className="min-w-0 flex-1 text-sm">Senha<Input aria-label="Senha" type="password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} autoComplete={authMode === "login" ? "current-password" : "new-password"} /></label>}
        <Button disabled={authBusy} type="submit">{authBusy ? "Aguarde…" : authMode === "signup" ? "Criar conta" : authMode === "reset" ? "Enviar link" : authMode === "recovery" ? "Salvar senha" : "Entrar"}</Button>
      </form>
      {authMode !== "recovery" && <div className="flex flex-wrap gap-2"><Button variant="link" size="sm" onClick={() => { setAuthMode(authMode === "signup" ? "login" : "signup"); setError(""); }}>{authMode === "signup" ? "Já tenho conta" : "Criar conta"}</Button><Button variant="link" size="sm" onClick={() => setAuthMode("reset")}>Esqueci minha senha</Button></div>}
    </div>}
    {busy && <p role="status" className="text-sm text-muted-foreground">Buscando local…</p>}
    {message && <p role="status" className="text-sm text-primary">{message}</p>}
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
  </div>;
}