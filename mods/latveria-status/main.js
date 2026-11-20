// Modified from Herdr app 0.1.16 "workspace-status" (Apache-2.0): 5h/7d usage limits per Claude profile from every machine, 12 px text.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys, machines, setBadge, checking, shared, setShared, notify, exec } from "herdr";
import { WARN, settled, quotaTone, readQuotas, mergeQuotas, span } from "./quota.js";
import { notifierArgs, outcome, groupKey, noteKey, appPath, EXEC_TIMEOUT_MS, REPEAT_MS } from "./notifier.js";

const NOTE_TTL_MS = 60_000; // shared state outlives a restart: an old note is news no more

const nowS = () => Math.floor(Date.now() / 1000);
// A profile's machine in its tooltip; this one goes by the platform.
const where = (machine) => machine ?? (window()?.platform === "macos" ? "Mac" : "this computer");
const NONE = "No usage snapshot yet: a Claude session writes one through its statusline";
// "2h" of "2h 1m": the bar has room for the larger unit only.
const ago = (sec) => span(sec).split(" ")[0];
// The machines Herdr lists (this one has no name), and the names of the ready ones.
const listedNow = () => machines().filter((m) => m.name);
const readyOf = (listed) => listed.filter((m) => m.layout === "ready").map((m) => m.name);
const newest = (sources) => sources.reduce((a, b) => (b.updated > a.updated ? b : a));

// A merged profile as the bar shows it. Clocks differ between machines, so a quiet machine whose clock runs ahead
// must not dim a profile another machine answers for: dimmed only when every machine it came from is quiet. The
// tooltip names the answering machine with the newest reading, or the newest overall when none answers.
function shown(q, quiet) {
  const answering = q.sources.filter((s) => !quiet.has(s.machine));
  const from = newest(answering.length ? answering : q.sources);
  return { ...q, dim: !answering.length, from: from.machine, changed: from.updated };
}

export default class WorkspaceStatus extends View {
  init(_props, cx) {
    this.quotas = [];
    this.badge = undefined;
    // When the bar first saw each agent needing you (address → ms), for "waited longest".
    this.since = new Map();
    // What each agent's last banner said and when (group → {says, at}): Herdr can post one note twice (seen 17.11).
    this.shownNotes = new Map();
    this.app = null; // herdr-app's absolute path, which a banner's click runs; looked up until found
    // Each machine's last readings (null: this one), kept when it stops answering.
    this.byMachine = new Map();
    // The ready machines at the last check: a machine joining them is read at once, not at the next 30 s read.
    // Herdr has no machine-change event for mods, so a cheap 5 s check compares names, without any exec.
    this.ready = new Set();
    this.drawn = "";
    // herdr-app check runs init for real: no badge, no timers, no reads there.
    if (checking()) return;
    this.tick(cx);
    cx.timer.every(1000, (cx) => this.tick(cx));
    cx.timer.every(5000, (cx) => {
      const ready = readyOf(listedNow());
      const grew = ready.some((m) => !this.ready.has(m));
      this.ready = new Set(ready);
      if (grew) this.load(cx);
    });
    this.load(cx);
    cx.timer.every(30000, (cx) => this.load(cx));
  }

  // Once a second: the Dock badge follows the number of agents that need you, and notes latveria-toast handed
  // over while Herdr was not in front become banners. Nothing here runs a program unless a note is queued.
  tick(cx) {
    const waiting = agents().filter((a) => a.status === "blocked");
    const now = Date.now();
    const still = new Set(waiting.map((a) => a.address));
    for (const k of this.since.keys()) if (!still.has(k)) this.since.delete(k);
    for (const a of waiting) if (!this.since.has(a.address)) this.since.set(a.address, now);
    const n = waiting.length;
    const badge = n ? String(n) : null;
    if (badge !== this.badge) {
      this.badge = badge;
      setBadge(badge);
    }
    const notes = shared("latveria.notes");
    if (Array.isArray(notes) && notes.length) {
      setShared("latveria.notes", []);
      // Herdr came back to the front since the toast handed these over: they belong in the window now.
      const front = Boolean(window()?.active);
      for (const note of notes) {
        if (now - (note?.at ?? 0) >= NOTE_TTL_MS) continue;
        if (front) this.intoWindow(note, false);
        else this.banner(note, cx);
      }
    }
  }

  // A macOS banner handed to macOS; nothing waits for the click. Its click brings Herdr forward and runs the note's
  // action through `herdr-app do`, so the bar is done once the banner is shown.
  banner(note, cx) {
    const group = groupKey(note);
    const says = noteKey(note);
    const now = Date.now();
    for (const [g, s] of this.shownNotes) if (now - s.at >= REPEAT_MS) this.shownNotes.delete(g);
    if (this.shownNotes.get(group)?.says === says) return; // that banner is up and leads to the same place
    const shown = { says, at: now };
    this.shownNotes.set(group, shown);
    cx.spawn(async () => {
      let result;
      try {
        result = await exec("terminal-notifier", notifierArgs(note, await this.herdrApp()), { timeout: EXEC_TIMEOUT_MS });
      } catch (e) {
        result = e;
      }
      const o = outcome(result);
      if (o === "shown") return;
      if (this.shownNotes.get(group) === shown) this.shownNotes.delete(group);
      this.intoWindow(note, o === "missing");
    });
  }

  // herdr-app as this computer's PATH finds it. The click runs in a shell with only the system PATH, so it needs the
  // absolute path. Kept once found; not found (no banner click then runs an action), asked again with the next banner.
  async herdrApp() {
    if (this.app) return this.app;
    try {
      this.app = appPath((await exec("sh", ["-c", "command -v herdr-app"], { timeout: 5000 }))?.stdout);
    } catch {
      this.app = null;
    }
    return this.app;
  }

  // No banner for this note (no program, no permission, another failure, or Herdr back in
  // front): back to Herdr's window. The toast that finds the note's key in latveria.direct draws it instead of
  // handing it over again. Only a missing program or permission keeps the toast drawing for the next 10 minutes.
  intoWindow(note, missing) {
    setShared("latveria.direct", [...(shared("latveria.direct") ?? []), noteKey(note)].slice(-20));
    if (missing) setShared("latveria.notifier", { missing: true, at: Date.now() });
    const back = { title: note.title ?? "", body: note.body, level: note.level, icon: note.icon, timeout: note.timeout, action: note.action };
    notify(Object.fromEntries(Object.entries(back).filter(([, v]) => v !== undefined)));
  }

  // The agent needing you that the bar saw first; ones it never timed go by the lowest seq.
  longestWaiting() {
    const at = (a) => this.since.get(a.address) ?? Number.MAX_SAFE_INTEGER; // not Infinity: Infinity - Infinity is NaN
    const waiting = agents().filter((a) => a.status === "blocked");
    return waiting.sort((x, y) => at(x) - at(y) || (x.seq ?? 0) - (y.seq ?? 0))[0] ?? null;
  }

  // The badge belongs to this layout: gone with the bar (another layout, quitting).
  async close() {
    setBadge(null);
  }

  // Snapshots from this computer and every ready machine. Snapshots change only with the numbers, so their age says
  // nothing on its own: only a dimmed profile shows it. Redraws when what the bar shows changes: the readings, or a
  // dimmed profile's age as the bar spells it.
  load(cx) {
    const all = listedNow(); // one machines() call
    const listed = new Set(all.map((m) => m.name));
    const ready = readyOf(all);
    this.ready = new Set(ready);
    cx.spawn(async (cx) => {
      const now = nowS();
      const read = await Promise.all([null, ...ready].map(async (m) => [m, await readQuotas(m, now)]));
      const answered = new Set();
      for (const [m, readings] of read) {
        if (!readings) continue;
        this.byMachine.set(m, readings);
        answered.add(m);
      }
      for (const m of this.byMachine.keys()) if (m !== null && !listed.has(m)) this.byMachine.delete(m);
      const quiet = new Set([...this.byMachine.keys()].filter((m) => !answered.has(m)));
      this.quotas = mergeQuotas([...this.byMachine]).map((q) => shown(q, quiet));
      const ages = this.quotas.filter((q) => q.dim).map((q) => [q.key, ago(now - q.updated)]);
      const drawn = JSON.stringify([this.quotas, ages]);
      if (drawn === this.drawn) return;
      this.drawn = drawn;
      cx.notify();
    });
  }

  // `● Personal 5h 3% · 7d 4%`, `● Work ▣ laptop 5h …` when only another machine reports it; times in the tooltip.
  // A dimmed profile shows its age.
  quota(t, q, now) {
    const five = settled(q.five, now);
    const seven = settled(q.seven, now);
    const tone = { ok: t.working, warn: WARN, high: t.blocked };
    // Only other machines report it: name the one the tooltip names, so it doesn't read as this computer's account.
    const remote = q.sources.every((s) => s.machine);
    const pct = (w) => div().text_color(!w || q.dim ? t.dim : tone[quotaTone(w.pct)]).child(w ? `${w.pct}%` : "?");
    const tip = (name, w) => (!w ? `${name} ?`
      : `${name} ${w.pct}%${w.resetsAt !== null ? `, resets in ${span(w.resetsAt - now)}` : w.reset ? ", reset" : w.idle ? ", no usage in the current window" : ""}`);
    return h_flex()
      .id(`quota-${q.machine ?? "local"}-${q.key}`)
      .gap(5)
      .items_center()
      .tooltip(`${q.label} on ${where(q.from)} \u00b7 ${tip("5h", five)} \u00b7 ${tip("7d", seven)} \u00b7 changed ${span(now - q.changed)} ago`)
      .child(div().size(8).flex_none().rounded(4)
        .when(Boolean(q.color), (el) => el.bg(q.color))
        .when(!q.color, (el) => el.border(1.5).border_color(t.dim)))
      .child(div().text_color(q.dim ? t.dim : t.muted).child(q.label))
      .when(remote, (el) => el.child(h_flex().gap(3).items_center()
        .child(svg("mods/workspace-chrome/server.svg").size(13).flex_none().text_color(t.dim))
        .child(div().text_color(t.dim).child(String(q.from).slice(0, 16)))))
      .child(div().text_color(t.dim).child("5h"))
      .child(pct(five))
      .child(div().text_color(t.dim).child("\u00b7 7d"))
      .child(pct(seven))
      .when(q.dim, (el) => el.child(div().text_color(t.dim).child(`\u00b7 ${ago(now - q.updated)} ago`)));
  }

  quotaBar(t) {
    const now = nowS();
    if (!this.quotas?.length) return div().id("quota-none").text_color(t.dim).tooltip(NONE).child("limits ?");
    return h_flex().gap(14).items_center().children(this.quotas.map((q) => this.quota(t, q, now)));
  }
  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(12).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().id("needs-you").cursor_pointer().text_color(t.blocked)
          .on_click(() => { const a = this.longestWaiting(); if (a) run("agent.focus", { terminal: a.address }); })
          .child(`· ${needs} needs you`))))
      .child(this.quotaBar(t))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)));
  }
}
