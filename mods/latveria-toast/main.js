// Modified from Herdr app 0.1.16 "toast" (Apache-2.0): while Herdr's window is not in front, a note goes to
// latveria-status, which shows it as a macOS banner (a copy's work ends when its overlay closes; the bar stays).
// How notifications look. Anything can post one with notify({ title, body,
// level, icon, action }); replace this mod to restyle them all. Click to
// run its action (e.g. go to the agent) and dismiss it.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, shared, setShared, window, checking } from "herdr";

const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };
// The bar sends a note back (no banner possible) under this key; the toast that finds it draws in the window.
const KEY = (p) => `${p.title ?? ""}\n${p.body ?? ""}`;
const MISSING_MS = 10 * 60_000;
const missing = (flag) => Boolean(flag?.missing) && Date.now() - (flag.at ?? 0) < MISSING_MS;

export default class Toast extends View {
  init(_props, _cx) {
    if (checking()) return;
    const p = props() ?? {};
    const direct = shared("latveria.direct") ?? [];
    const i = direct.indexOf(KEY(p));
    if (i >= 0) {
      setShared("latveria.direct", direct.filter((_, j) => j !== i));
      return;
    }
    if (window()?.active || missing(shared("latveria.notifier"))) return;
    const all = { title: p.title, body: p.body, level: p.level, icon: p.icon, timeout: p.timeout, action: p.action, at: Date.now() };
    const note = Object.fromEntries(Object.entries(all).filter(([, v]) => v !== undefined)); // shared state is JSON
    setShared("latveria.notes", [...(shared("latveria.notes") ?? []), note].slice(-20));
    this.handed = true;
    closeOverlay(p.overlay);
  }

  render(cx) {
    if (this.handed) return div();
    const t = theme();
    const p = props() ?? {};
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;
    return h_flex()
      .id("toast")
      .size_full()
      .px(18)
      .gap(12)
      .items_center()
      .bg(t.popover)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        closeOverlay(p.overlay);
      })
      .child(p.icon ? image(p.icon).w(18).h(18).flex_none() : div().size(8).rounded(4).flex_none().bg(t[DOT[p.level] ?? "accent"]))
      .child(
        v_flex()
          .flex_1()
          .overflow_hidden()
          .child(div().truncate().font_semibold().text_size(13).text_color(t.foreground).child(login ? `${login[1]} needs a login: run` : p.title ?? ""))
          .when(!login && Boolean(p.body), (el) => el.child(div().truncate().text_size(12).text_color(t.muted).child(p.body ?? "")))
          .when(Boolean(login), (el) => el.child(h_flex().gap(8).items_center()
            .child(div().flex_1().min_w(0).truncate().tooltip(command).text_size(12).text_color(t.muted).child(command))
            .child(div().id("toast-login-copy").flex_none().px(6).py(3).rounded(4).bg(t.raised)
              .text_size(12).text_color(t.foreground).cursor_pointer().hover(s => s.bg(t.hover))
              .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(command); this.copied = true; cx.notify(); })
              .child(this.copied ? "Copied" : "Copy")))),
      );
  }
}
