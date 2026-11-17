// WCAG 2.x relative luminance and contrast ratio, for #rrggbb colors.
const HEX = /^#[0-9a-f]{6}$/i;
const channels = (hex) => {
  if (!HEX.test(hex)) throw new TypeError(`expected #rrggbb, got ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
};
const linear = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const [r, g, b] = channels(hex).map((c) => linear(c / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// `fg` drawn at `alpha` over `bg`, as GPUI draws an "#rrggbbaa" fill.
export function mix(fg, bg, alpha) {
  const [f, b] = [channels(fg), channels(bg)];
  return "#" + f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("");
}
