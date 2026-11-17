// A recording stand-in for GPUI elements: every builder call is kept, children are collected.
export function element(kind, fields = {}) {
  const node = { kind, ...fields, calls: [], kids: [] }; // not "children": that is a builder method
  const self = new Proxy(node, {
    get(target, prop) {
      if (prop in target || typeof prop === "symbol" || prop === "then") return target[prop];
      return (...args) => {
        if (prop === "child") target.kids.push(args[0]);
        else if (prop === "children") target.kids.push(...args[0]);
        else if (prop === "when") { if (args[0]) args[1](self); }
        else target.calls.push([prop, ...args]);
        return self;
      };
    },
  });
  return self;
}

// Every element under `root`, depth first.
export function nodes(root) {
  const out = [];
  const walk = (n) => { if (n && typeof n === "object" && "kind" in n) { out.push(n); n.kids.forEach(walk); } };
  walk(root);
  return out;
}

// The text an element shows, its strings joined by spaces.
export function text(root) {
  const out = [];
  const walk = (n) => {
    if (typeof n === "string" || typeof n === "number") out.push(String(n));
    else if (n?.kids) n.kids.forEach(walk);
  };
  walk(root);
  return out.join(" ");
}
