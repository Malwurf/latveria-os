import { element } from "./ui.mjs";

export class View {}
export const div = () => element("div");
export const svg = (src) => element("svg", { src });
export const image = (src) => element("image", { src });
