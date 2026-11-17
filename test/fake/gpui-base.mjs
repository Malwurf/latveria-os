import { element } from "./ui.mjs";

export const v_flex = () => element("div", { axis: "column" }); // not "flex": gpui has a .flex() method
export const h_flex = () => element("div", { axis: "row" });
export const Editor = { new: (state) => element("editor", { state }) };
export const EditorState = { new: (options) => ({ options, release() {} }) };
