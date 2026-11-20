# LatveriaOS

Czytelny layout + mody do [Herdr app](https://herdr.dev) w ciemnozielonym klimacie: przy każdym
agencie profil konta Claude i maszyna, panel plików z kolorowymi ikonami typów (Material Icon
Theme), w pasku limity 5h/7d per profil z obu maszyn. Open source (Apache-2.0), w galerii Herdra (decyzja
właściciela 17.11.2026). Independent fan tribute, not affiliated with Marvel.

## Zasady, których nie łamiemy

1. **Zero poświadczeń.** Bez Keychaina, tokenów OAuth i wywołań API Anthropic/OpenAI; limity tylko
   ze zrzutów statusline'u. *Test: skaner zakazanych wywołań w całym kodzie poza `test/` (`test/rules.test.mjs`).*
2. **Tylko odczyt wobec repozytoriów.** Mody nie robią `push`/`merge`/`commit` ani nie usuwają
   plików. Dozwolone programy: `git` (tylko odczyt), `sh`, `hc`, `powershell` (tylko listowanie) i
   `terminal-notifier` (sam dymek macOS; jego klik uruchamia tylko `herdr-app do <akcja notki>` z nazwą akcji
   i argumentami po walidacji — bez tekstu notki). *Test: skaner listy dozwolonych komend `exec` (`test/rules.test.mjs`).*
3. **Czytelność.** Każda para tekst/tło w motywie ≥ 4,5:1, tekst ≥ 12 px. Znany wyjątek: plakietka
   statusu na tincie 0x26 spada poniżej 4,5:1 na `selected` — mody nie tintują zaznaczonego wiersza.
   *Test: kontrast z pliku motywu (`test/theme.test.mjs`); skan rozmiarów tekstu w modach
   (`test/text-size.test.mjs` — łapie tylko rozmiary wpisane liczbą, nie stałe ani zmienne).*
4. **Żadnych danych osobowych ani nazw klientów w repo.** Profile, konta i ścieżki tylko w lokalnej
   konfiguracji (`~/.config/latveria/`); w repo tylko `profiles.example.json` z `Personal`/`Work`.
   *Test: `npm run privacy` (lokalnie i w CI).*
5. **Żadnych grafik ani nazw postaci Marvela;** dopisek o fanowskim charakterze w README.
   *test: brak (przegląd).*
6. **Zdalna maszyna to pełnoprawny przypadek.** Każdy odczyt przekazuje `{on: machine}`, każdy agent
   pokazuje maszynę. *Test: `test/files.test.mjs` (listing, otwarcie folderu, git i odczyt na zdalnej
   maszynie); `test/agents.test.mjs` (maszyna w każdym wierszu, mapa profili czytana na zdalnej maszynie); `test/status.test.mjs`
   (zrzuty limitów czytane na każdej gotowej maszynie).*
7. **Brak danych nie psuje widoku.** Brak etykiety/zrzutu → „?”, nie błąd. *Test: `test/profile.test.mjs`,
   `test/agents.test.mjs` („?” bez etykiety, zła mapa), `test/hook.test.mjs` (hook zawsze exit 0); `test/quota-snapshot.test.mjs` (skrypt zrzutu zawsze exit 0),
   `test/quota.test.mjs` i `test/status.test.mjs` (zły zrzut pominięty, brak zrzutów → `limits ?`; brak
   `terminal-notifier` albo zgody → notka w oknie Herdra); `test/toast.test.mjs` (notka wraca do okna, gdy dymka nie będzie).*

## Stack i struktura

- JavaScript ESM bez kroku budowania (mody Herdra to `mods/<name>/main.js` na gpui-kit).
- Typy prawdy: `~/.config/herdr-app/herdr.d.ts` i `gpui-kit.d.ts`, przewodnik
  `~/.config/herdr-app/AGENTS.md` (nadpisywane przy każdym starcie Herdra — czytaj, nie edytuj).
- Testy: `node --test`, bez uruchomionej aplikacji; atrapy `herdr`/`gpui-kit`/`gpui-base` w `test/fake/`
  (`import "./fake/register.mjs"` jako pierwszy, potem dynamiczne `await import("herdr")`).
- Na żywo: `herdr-app check <mod>`, `herdr-app status` (pole `errors`), `herdr-app shot <plik>`.
- Instalacja do `~/.config/herdr-app`: `node install.mjs` (kopie zapasowe, nic nie nadpisuje po cichu).

## Bramka i TDD

Bramka (`.ai/agentic.config.json`): `npm run lint` → `npm test` → `npm run privacy`. Każda zmiana
logiki: najpierw czerwony test, potem kod. „Done” = exit 0 każdej komendy bramki, podany wprost.
Komenda, która się nie uruchomiła, nie jest zielona. Testy na atrapach nie łapią zmian API Herdra
po aktualizacji — dlatego dodatkowo `herdr-app check` + `herdr-app status` przed zamknięciem etapu.

## Specyfikacje (OpenSpec)

`openspec-propose` → implementacja → `openspec-archive-change`. Specs rosną deltami wokół zmian,
nie spisujemy kodu wstecz. Kontekst repo w `openspec/config.yaml`.

## Konwencje

Conventional commits, gałęzie `feat/*`, PR do `main`, nigdy push na `main`. Dokumentacja PL,
kod i identyfikatory EN. Klony wbudowanych modów zapisują `cloned_from` (wersja Herdra).

## Dokumentacja produktowa (wiki GEM)

Hub: `../GEM/docs/projekty/latveria-os/00-przeglad.md` (roadmapa z etapami, dziennik decyzji) ·
design: `../GEM/.claude/designs/latveria-os.md`. Istotne decyzje (stack, architektura, zakres,
publikacja) → datowany wpis w „Dzienniku decyzji” huba.
