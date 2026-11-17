// Which Claude profile an agent runs under, and on which machine. A SessionStart hook labels the terminal
// with the profile's key; each machine's ~/.config/latveria/profiles.json gives the key a label and color.
export const LABEL = "latveria.profile";
export const UNKNOWN = Object.freeze({ key: "?", label: "?", color: null });
const KEY = /^[A-Za-z0-9_-]{1,24}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX = 32;
const isKey = (k) => typeof k === "string" && KEY.test(k);

// "laptop/t2" → "laptop"; a terminal here has no machine in its address.
export const machineOf = (address) => (typeof address === "string" && address.includes("/") ? address.split("/")[0] : null);

// The map is a local file the person wrote: anything broken gives no profiles, never an error.
export function parseProfiles(text) {
  let data;
  try { data = JSON.parse(text); } catch { return []; }
  const list = Array.isArray(data?.profiles) ? data.profiles : [];
  return list.filter((p) => isKey(p?.key)).slice(0, MAX).map((p) => ({
    key: p.key,
    label: typeof p.label === "string" && p.label.trim() ? p.label.trim().slice(0, 16) : p.key,
    color: typeof p.color === "string" && COLOR.test(p.color) ? p.color : null,
  }));
}

export function profileOf(terminal, profiles) {
  const key = terminal?.labels?.[LABEL];
  if (!isKey(key)) return UNKNOWN;
  return profiles.find((p) => p.key === key) ?? { key, label: key, color: null };
}
