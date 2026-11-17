import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Rule 1: no credentials, no network. Rule 2: read-only towards repositories, nothing deleted.
const FORBIDDEN = [
  [/\bfetch\s*\(/, "network call"],
  [/api\.anthropic|api\.openai/i, "AI provider API"],
  [/oauth/i, "OAuth"],
  [/find-(generic|internet)-password|["'`]security["'`]/, "Keychain"],
  [/\b(unlink|unlinkSync|rmSync|rmdirSync)\s*\(|\brm\s+-/, "deletes files"],
  [/\bgit\s+(push|merge|commit|rebase|reset|clean)\b/, "writes to a repository"],
  [/\b(Remove-Item|Set-Content|Add-Content|Out-File|Move-Item|Copy-Item|New-Item)\b/, "writes files"], // powershell is allowed to list only
];
const EXEC = /\b(?:exec(?:File)?|spawn)(?:Sync)?\(\s*["'`]([\w-]+)["'`]\s*(?:,\s*\[([^\]]*)\])?/g;
// terminal-notifier only shows a macOS notification (the waiting-agent banner).
const ALLOWED_PROGRAMS = new Set(["git", "sh", "hc", "powershell", "terminal-notifier"]);
const ALLOWED_GIT = new Set(["status", "rev-parse", "ls-files", "log", "diff", "show"]);
const GIT_VALUE_FLAGS = new Set(["-c", "-C"]);

// The first argument that is not a global flag (or a flag's value) is git's subcommand.
function gitSubcommand(argsSource) {
  const args = [...(argsSource ?? "").matchAll(/["'`]([^"'`]*)["'`]/g)].map((m) => m[1]);
  for (let i = 0; i < args.length; i++) {
    if (GIT_VALUE_FLAGS.has(args[i])) { i++; continue; }
    if (!args[i].startsWith("-")) return args[i];
  }
  return undefined;
}

// Shell scripts (hooks) get only the FORBIDDEN patterns; EXEC matches JavaScript calls.
export function shellViolations(text) {
  return FORBIDDEN.filter(([re]) => re.test(text)).map(([, why]) => why);
}

export function violations(text) {
  const found = shellViolations(text);
  for (const [, program, args] of text.matchAll(EXEC)) {
    if (!ALLOWED_PROGRAMS.has(program)) found.push(`runs ${program}`);
    else if (program === "git") {
      const sub = gitSubcommand(args);
      if (!ALLOWED_GIT.has(sub)) found.push(`git ${sub ?? "?"}`);
    }
  }
  return found;
}

test("catches each forbidden kind of call", () => {
  assert.deepEqual(violations('await fetch("https://x")'), ["network call"]);
  assert.deepEqual(violations('exec("security", ["find-generic-password"])'), ["Keychain", "runs security"]);
  assert.deepEqual(violations('exec("git", ["push", "origin"])'), ["git push"]);
  assert.deepEqual(violations('exec("curl", ["x"])'), ["runs curl"]);
  assert.deepEqual(violations('spawnSync("curl", ["x"])'), ["runs curl"]);
  assert.deepEqual(violations("fs.rmSync(dir)"), ["deletes files"]);
  assert.deepEqual(violations('exec("sh", ["-c", "git push origin main"])'), ["writes to a repository"]);
});

test("reads git's subcommand past its global flags", () => {
  assert.deepEqual(violations('exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "-z"])'), []);
  assert.deepEqual(violations('exec("git", ["-c", "user.name=x", "commit", "-m", "x"])'), ["git commit"]);
  assert.deepEqual(violations('exec("git", ["-C", "/tmp/x", "log"])'), []);
  assert.deepEqual(violations('exec("powershell", ["-NoProfile", "-Command", "Get-ChildItem"])'), []);
  assert.deepEqual(violations('exec("powershell", ["-Command", "Remove-Item x"])'), ["writes files"]);
});

test("allows the notification program, and no other new one", () => {
  assert.deepEqual(violations('exec("terminal-notifier", ["-title", "x"])'), []);
  assert.deepEqual(violations('exec("osascript", ["-e", "x"])'), ["runs osascript"]);
});

test("allows read-only git and hc", () => {
  assert.deepEqual(violations('exec("git", ["status", "--porcelain"]); exec("hc", ["label"])'), []);
  assert.deepEqual(violations('execFileSync("git", ["ls-files", "-z"])'), []);
});

test("catches forbidden calls in shell scripts, without the JavaScript exec check", () => {
  assert.deepEqual(shellViolations("rm -rf x"), ["deletes files"]);
  assert.deepEqual(shellViolations("curl https://api.anthropic.com"), ["AI provider API"]);
  assert.deepEqual(shellViolations('hc label "$HC_TERMINAL_ID" "latveria.profile=$key"'), []);
});

test("no code in the repo breaks rules 1 and 2", () => {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" })
    .split("\0").filter((f) => f && !f.startsWith("test/") && !/^mods\/[^/]+\/material-icons\.js$/.test(f));
  const check = (f) => (/\.m?js$/.test(f) ? violations : /\.sh$/.test(f) ? shellViolations : null);
  const broken = files.flatMap((f) => (check(f)?.(readFileSync(f, "utf8")) ?? []).map((why) => `${f}: ${why}`));
  assert.deepEqual(broken, []);
});
