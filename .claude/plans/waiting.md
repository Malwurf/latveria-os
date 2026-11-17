# „Czeka na Ciebie” — Dock, klikalny licznik, dymki macOS

Design: `../GEM/.claude/designs/latveria-os-waiting.md` · OpenSpec: `openspec/changes/add-waiting-alerts/`
(proposal, spec `waiting-alerts`, design.md, tasks.md). Gałąź: `feat/waiting-alerts` w zwykłym checkoutcie.

## Ustalenia, które kształtują plan (17.11)

- **Toast przekazuje, pasek czeka.** Spike w drugim oknie Herdra: obietnica z `init` overlaya rozwiązuje się, póki
  overlay jest otwarty, i **nigdy po `closeOverlay`**. Efekty uboczne w `render` nie są wiarygodne (część się nie
  wykonała, a jedna utworzyła kartę w prawdziwej przestrzeni). Dlatego `latveria-toast` przy nieaktywnym oknie
  tylko dopisuje notkę do `shared("latveria.notes")` i zamyka się, a długowieczny `latveria-status` (timer 1 s,
  sam odczyt `shared`, bez exec) uruchamia `terminal-notifier` w swoim `cx.spawn`.
- **Najpierw znaczniki w stdout, potem kod wyjścia.** `@TIMEOUT`/`@CLOSED` = zignorowany (niezależnie od kodu:
  pomoc 3.1.0 mówi „exits 6”, a mój pomiar „exit 0” był błędny, bo `$?` czytałem po `$(date)`); kod 0 bez znacznika =
  klik (spike: klik → pusty stdout, exit 0); wszystko inne = porażka.
- **`herdr-app check` uruchamia `init` naprawdę** (`herdr.d.ts:22-24`): `init` obu modów kończy się
  `if (checking()) return;` przed timerami, kolejką i `closeOverlay`.
- **Powrót do okna bez pętli:** notka, z której nie będzie dymka (brak programu/zgody albo 5 czekających), wraca
  przez `notify()` po dopisaniu `title + body` do `shared("latveria.direct")`; toast, który się tam znajdzie, rysuje
  w oknie. Brak programu ustawia też `latveria.notifier = {missing: true, at}` na 10 min.
- **Testy:** atrapa `herdr` dostaje `setBadge`, `notify`, `window().active`, `checking()`; testy timerów łapią `cx.timer.every`
  w `Map` po interwale (wzór z `test/status.test.mjs:137`).
- **Bez decyzji poziomu 3.** `terminal-notifier` (MIT, opcjonalny) = poziom 2 → „Czeka na Ciebie” w PR.

## Faza A — Dock i licznik (efekt: liczba na ikonie Herdra, klik w licznik pokazuje czekającego)

**Kształt:** `~ test/fake/herdr.mjs`, `~ test/fake.test.mjs`, `~ mods/latveria-status/main.js`, `~ test/status.test.mjs`.

### A1: atrapa — `setBadge`, `notify`, `window().active`, `checking`

**Files:** `~ test/fake/herdr.mjs`, `~ test/fake.test.mjs`
**Tests (najpierw):** w `fake.test.mjs`: `setBadge("2")` → `fake.badges` = `["2"]`; `notify({title:"x"})` → `fake.notes`
= `[{title:"x"}]`, zwraca `"n1"`; `window().active` = `fake.active` (domyślnie `true`); `checking()` = `fake.checking`
(domyślnie `false`).
**Code:** w `blank()` dopisz `badges: [], notes: [], active: true, checking: false`; eksporty:
```js
export const window = () => ({ platform: "macos", active: fake.active });
export const setBadge = (text) => { fake.badges.push(text); return null; };
export const notify = (n) => { fake.notes.push(n); return `n${fake.notes.length}`; };
export const checking = () => fake.checking;
```
**Verify:** `node --test test/fake.test.mjs` · **Done when:** zielone, reszta `npm test` bez zmian.

### A2: plakietka w Docku tylko przy zmianie

**Files:** `~ mods/latveria-status/main.js`, `~ test/status.test.mjs`
**Tests (najpierw):** po `init` z dwoma `blocked` → `fake.badges` = `["2"]`; drugi tik timera 1000 bez zmian →
nadal jedna pozycja; agenci bez `blocked` po tiku → ostatnia pozycja `null`. Timer 1000 ms zarejestrowany.
`fake.checking = true` → `init` nie ustawia plakietki ani timerów. `close()` → ostatnia pozycja `null`.
**Code:** na początku `init`: `this.badge = undefined; this.waiting = 0; this.since = new Map();
if (checking()) return;`, a na końcu `init`: `this.tick(cx); cx.timer.every(1000, (cx) => this.tick(cx));`.
Plus `async close() { setBadge(null); }` (plakietka znika po zmianie layoutu i przy wyjściu).
```js
// Once a second, no exec: the Dock badge and (phase B) the notes the toast handed over.
tick(cx) {
  const n = agents().filter((a) => a.status === "blocked").length;
  const badge = n ? String(n) : null;
  if (badge !== this.badge) { this.badge = badge; setBadge(badge); }
}
```
(import `setBadge`, `checking` z `herdr`). Uwaga: `if (checking()) return;` wyłącza też dzisiejsze odczyty limitów
pod `check` — zamierzone (exec podczas checku i tak nic nie wnosi); istniejące testy mają `checking = false`.
**Verify:** `node --test test/status.test.mjs` · **Done when:** nowe przypadki zielone, stare bez zmian.

### A3: klik w licznik → czekający najdłużej

**Files:** `~ mods/latveria-status/main.js`, `~ test/status.test.mjs`
**Tests (najpierw):** `Date.now` podmieniony (t=1000, potem t=2000): `t2` blocked od pierwszego tiku, `t3` dochodzi
przy drugim, przy czym w `fake.agents` **`t3` stoi przed `t2`** (kolejność tablicy nie może wygrać) → klik w węzeł `id` `needs-you`
→ `fake.runs` = `[["agent.focus", {terminal: "t2"}]]`; po odblokowaniu `t2` klik → `t3`; agenci, których pasek
jeszcze nie widział (bez tiku) → najniższe `seq`.
**Code:** w `tick` utrzymuj `this.since` (Map adres → ms pierwszego zobaczenia `blocked`; usuwaj, gdy przestaje być
blocked). Licznik:
```js
.when(needs > 0, el => el.child(div().id("needs-you").cursor_pointer().text_color(t.blocked)
  .on_click(() => { const a = this.longestWaiting(); if (a) run("agent.focus", { terminal: a.address }); })
  .child(`· ${needs} needs you`)))
```
```js
longestWaiting() {
  const waiting = agents().filter((a) => a.status === "blocked");
  const at = (a) => this.since.get(a.address) ?? Number.MAX_SAFE_INTEGER; // not Infinity: Infinity - Infinity is NaN
  return waiting.sort((x, y) => at(x) - at(y) || (x.seq ?? 0) - (y.seq ?? 0))[0] ?? null;
}
```
**Verify:** `node --test test/status.test.mjs` · **Done when:** zielone.

**Checkpoint A:** `npm run lint && npm test && npm run privacy` (exit 0 każda); `herdr-app check mods/latveria-status`;
**na żywo:** `node install.mjs`, po ≤ 1 s Dock pokazuje liczbę czekających (albo nic), klik w licznik pokazuje agenta.

## Faza B — dymki (efekt: przy nieaktywnym oknie dymek pod zegarem, klik → Herdr + agent)

**Kształt:**
```
+ mods/latveria-toast/{main.js,mod.json}   + mods/latveria-status/notifier.js   + upstream/toast-0.1.16/main.js
~ mods/latveria-status/main.js   ~ layouts/latveria.json   ~ test/{rules,layout,status}.test.mjs
+ test/{notifier,toast}.test.mjs
```

### B1: `notifier.js` — czyste funkcje

**Files:** `+ mods/latveria-status/notifier.js`, `+ test/notifier.test.mjs` (w pasku, bo to on uruchamia program, a mod nie importuje plików innego modu — spike M3)
**Tests (najpierw):** `clean` usuwa `\u0000-\u001f\u007f-\u009f`, przycina; `notifierArgs({title, body, action:{args:{terminal:"t7"}}})`
= `["-title", t, "-message", body, "-group", "latveria-t7", "-activate", "dev.herdr.app", "-action", "Show", "-timeout", "540"]`;
pusty body → `-message` = tytuł; tytuł 300 znaków → 120; tytuł z `"; rm -rf ~ \u001b[2J` → jeden argument bez `\u001b`;
`groupKey` bez terminala → `latveria-` + 8 znaków hex z tytułu (stabilne); `outcome({code:0, stdout:""})` = `"clicked"`,
`{code:6, stdout:"@TIMEOUT\n"}` = `"ignored"`, `{code:0, stdout:"@TIMEOUT"}` = `"ignored"`, `{code:0, stdout:"@CLOSED"}` =
`"ignored"`, `{code:3, stdout:""}` = `"failed"`, `{code:1, stdout:"x"}` = `"failed"`, `Error` = `"failed"`,
`{code:0, stdout:"Show"}` = `"clicked"`.
**Code:**
```js
// Banner arguments for terminal-notifier and what its exit means. Pure, so tests need no app.
export const WAIT_S = 540;
export const EXEC_TIMEOUT_MS = 600_000;
export const MAX_WAITING = 5;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
export const clean = (s, max) => String(s ?? "").replace(CONTROL, "").slice(0, max);
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0; return h.toString(16).padStart(8, "0"); };
const SAFE_ID = /^[A-Za-z0-9_./-]{1,64}$/;
export function groupKey(p) {
  const t = p?.action?.args?.terminal;
  return `latveria-${typeof t === "string" && SAFE_ID.test(t) ? t : hash(clean(p?.title, 120))}`;
}
export function notifierArgs(p) {
  const title = clean(p?.title, 120) || "Herdr";
  return ["-title", title, "-message", clean(p?.body, 240) || title, "-group", groupKey(p),
    "-activate", "dev.herdr.app", "-action", "Show", "-timeout", String(WAIT_S)];
}
// Markers first: a banner nobody clicked ends with @TIMEOUT whatever the exit code (the help says 6).
export function outcome(r) {
  if (!r || r instanceof Error) return "failed";
  if (/@(TIMEOUT|CLOSED)/.test(r.stdout ?? "")) return "ignored";
  return r.code === 0 ? "clicked" : "failed";
}
```
**Verify:** `node --test test/notifier.test.mjs` · **Done when:** zielone.

### B2: `terminal-notifier` na liście dozwolonych programów

**Files:** `~ test/rules.test.mjs`
**Tests (najpierw):** `violations('exec("terminal-notifier", ["-title", "x"])')` = `[]`; `exec("osascript", …)` dalej
`["runs osascript"]`.
**Code:** `ALLOWED_PROGRAMS` += `"terminal-notifier"` (pokazuje powiadomienie, nic nie zapisuje).
**Verify:** `node --test test/rules.test.mjs` · **Done when:** zielone.

### B3a: klon `latveria-toast` bez zmian zachowania

**Files:** `+ upstream/toast-0.1.16/main.js` i `+ mods/latveria-toast/main.js` (obie kopie 1:1 z
`~/.config/herdr-app/mods/toast/main.js`), `+ mods/latveria-toast/mod.json` =
`{ "place": "none", "cloned_from": { "name": "toast", "version": "0.1.16" } }`, `+ test/toast.test.mjs`
**Tests (najpierw):** render z `props = {title:"t2 needs you", body:"Claude", level:"warning"}` zawiera tytuł i treść;
klik → `fake.runs` ma akcję, `fake.closed` ma overlay; tekst ≥ 12 px.
**Verify:** `node --test test/toast.test.mjs && node scripts/upstream-diff.mjs` · **Done when:** zielone, diff exit 0.

### B3b: toast przekazuje notkę przy nieaktywnym oknie

**Files:** `~ mods/latveria-toast/main.js`, `~ test/toast.test.mjs`
**Tests (najpierw):** `active = true` → `init` nic nie kolejkuje, `fake.closed` puste; `active = false` → `shared("latveria.notes")`
ma `{title, body, action, at}`, `fake.closed` = `[overlay]`, render pusty; to samo dla notki „finished” (toast nie
rozróżnia rodzajów — każda notka Herdra idzie dalej); `latveria.direct` zawiera `title+"\n"+body` → rysuje w oknie
i usuwa wpis; `latveria.notifier = {missing:true, at: now}` → rysuje w oknie bez kolejki; `missing` sprzed 11 min →
kolejka; kolejka 20 → najstarsza wypada; `fake.checking = true` → nic nie kolejkuje i nie zamyka.
**Code:** dopisany `init` (importy `shared`, `setShared`, `window`, `checking`):
```js
const KEY = (p) => `${p.title ?? ""}\n${p.body ?? ""}`;
const fresh = (flag) => flag?.missing && Date.now() - flag.at < 10 * 60_000;
init(_props, _cx) {
  if (checking()) return;
  const p = props() ?? {};
  const direct = shared("latveria.direct") ?? [];
  const i = direct.indexOf(KEY(p));
  if (i >= 0) { setShared("latveria.direct", direct.filter((_, j) => j !== i)); return; }
  if (window()?.active || fresh(shared("latveria.notifier"))) return;
  const notes = [...(shared("latveria.notes") ?? []), { title: p.title, body: p.body, action: p.action, at: Date.now() }].slice(-20);
  setShared("latveria.notes", notes);
  this.handed = true;
  closeOverlay(p.overlay);
}
```
`render` zwraca `div()` przy `this.handed`, inaczej rysunek oryginału bez zmian.
**Verify:** `node --test test/toast.test.mjs && node scripts/upstream-diff.mjs` · **Done when:** zielone, diff exit 0
(porównuje `upstream/` z Herdrem, nie z naszym klonem).

### B4a: pasek opróżnia kolejkę i pokazuje dymek

**Files:** `~ mods/latveria-status/main.js`, `~ test/status.test.mjs`
**Tests (najpierw):** notka w kolejce → po tiku `fake.execs` ma `terminal-notifier` z `notifierArgs(note)`, `timeout`
600000, kolejka pusta; notka starsza niż 60 s → odrzucona bez exec; pusta kolejka → brak exec (stare liczniki
`fake.execs` w testach limitów bez zmian).
**Code:** w `tick` po plakietce:
```js
const notes = shared("latveria.notes");
if (Array.isArray(notes) && notes.length) {
  setShared("latveria.notes", []);
  for (const n of notes) if (Date.now() - (n.at ?? 0) < 60_000) this.banner(n, cx);
}
```
```js
banner(n, cx) {
  if (this.waiting >= MAX_WAITING) return this.intoWindow(n, false);
  this.waiting++;
  cx.spawn(async () => {
    let r;
    try { r = await exec("terminal-notifier", notifierArgs(n), { timeout: EXEC_TIMEOUT_MS }); } catch (e) { r = e; }
    this.waiting--;
  });
}
```
B4a jeszcze nie czyta wyniku (dymek się pokazuje, klik tylko przywołuje Herdra przez `-activate`); B4b dopisuje
`this.after(n, outcome(r));` po `this.waiting--;`.
**Verify:** `node --test test/status.test.mjs` · **Done when:** zielone.

### B4b: klik, zignorowanie, powrót do okna

**Files:** `~ mods/latveria-status/main.js`, `~ test/status.test.mjs`
**Tests (najpierw):** `{stdout:""}` → `fake.runs` zawiera `[note.action.name, note.action.args]`; `{code:6, stdout:"@TIMEOUT"}`
→ brak `run`, brak `notify`; exec rzuca → `latveria.direct` ma klucz, `fake.notes` ma notkę, `latveria.notifier.missing`;
kod 3 → to samo; szósta notka przy 5 czekających (exec, który nie wraca) → `direct` + `notify`, bez szóstego exec,
bez `missing`; akcja bez `name` → brak `run`.
**Code:**
```js
after(n, o) {
  if (o === "clicked" && n.action?.name) run(n.action.name, n.action.args ?? {});
  if (o === "failed") this.intoWindow(n, true);
}
// Missing or not allowed (exec rejects, or exit ≠ 0 without a marker), or five banners already waiting.
intoWindow(n, missing) {
  setShared("latveria.direct", [...(shared("latveria.direct") ?? []), `${n.title ?? ""}\n${n.body ?? ""}`].slice(-20));
  if (missing) setShared("latveria.notifier", { missing: true, at: Date.now() });
  notify({ title: n.title ?? "", body: n.body, action: n.action });
}
```
**Verify:** `node --test test/status.test.mjs` · **Done when:** zielone.

### B5: layout

**Files:** `~ layouts/latveria.json` (root `"toast": "latveria-toast"`), `~ test/layout.test.mjs`
**Tests (najpierw):** czyta `layouts/latveria.json` wprost (`mods()` w teście nie zna pola `toast`): `root.toast` ===
`"latveria-toast"` i `mods/latveria-toast/main.js` istnieje.
**Code:** w rootcie layoutu po `"theme": "latveria",` dopisz `"toast": "latveria-toast",`.
**Verify:** `node --test test/layout.test.mjs` · **Done when:** zielone.

**Checkpoint B:** bramka (exit 0 każda); `herdr-app check` dla `latveria-toast` i `latveria-status`; **na żywo:**
`node install.mjs`, właściciel w innej aplikacji, agent prosi o zgodę → dymek pod zegarem → klik → Herdr + ten agent.

## Faza C — zamknięcie

### C1: dokumentacja
README: sekcja „Waiting agents” (Dock, licznik, dymki; `brew install terminal-notifier`, Ustawienia › Powiadomienia ›
terminal-notifier › Banery, `terminal-notifier -diagnose`; ikona dymku to ikona programu). RECIPE: zachowanie +
„Watch out”. NOTICE: klon `toast` (Apache 2.0). CLAUDE.md: reguła 2 — `terminal-notifier` na liście; reguła 7 —
`test/toast.test.mjs`, `test/status.test.mjs` (brak programu → dymek w oknie).
**Verify:** `npm run lint && npm test && npm run privacy`.

### C2: na żywo (Mac)
`node install.mjs`; `herdr-app check mods/latveria-toast`, `… latveria-status`; `herdr-app status` bez `errors`.
Właściciel w Safari, agent prosi o zgodę → dymek → klik → Herdr + ten agent; drugi dymek zsunięty → widok bez zmian;
Dock pokazuje liczbę. Dwa dymki tego samego agenta → zostaje nowszy, a `pgrep -fl terminal-notifier` po kliku
w nowszy nie pokazuje procesu starszego (inaczej trzyma miejsce przez 9 min → poprawka przed PR). Brak zgody:
Właściciel na chwilę wyłącza powiadomienia `terminal-notifier` → notka w oknie Herdra, bez przeskoku (potwierdza, że
odmowa nie wygląda jak klik). Zrzut paska lokalnie (nie do repo).

### C3: archiwum OpenSpec, PR, review, land
`openspec archive add-waiting-alerts` → `openspec/specs/waiting-alerts/spec.md`; `openspec validate --specs --strict`.
PR (sekcja „Czeka na Ciebie”: `terminal-notifier` jako opcjonalna zależność MIT), `/review` (≤ 2 fale), `pr_land.py`.
GEM: wpis w dzienniku huba, poprawka §5/§7 designu `latveria-os-waiting.md` (przekazanie przez pasek), karta VVD #421.

## Zależności

A1 → A2 → A3 → checkpoint A → (B1 ∥ B2 ∥ B3a) → B3b (po A1) → B4a (po B1) → B4b → B5 (po B3b i B4b: dopiero
wtedy kolejka ma kto opróżniać) → checkpoint B → C1 → C2 → C3. Projekt buduje się i bramka jest zielona po każdym
zadaniu.

Razem: 14 zadań + 2 checkpointy.
