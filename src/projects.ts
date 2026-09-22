import { lstat, mkdir, readFile, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export function parseConfig(value: unknown, home = homedir()): { projectRoot: string; placement: "popup" | "overlay" } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Config must be a JSON object");
  }
  for (const key of Object.keys(value)) {
    if (key !== "projectRoot" && key !== "placement") throw new Error(`Unknown config key: ${key}`);
  }
  const root = "projectRoot" in value ? value.projectRoot : "~/Projects";
  const placement = "placement" in value ? value.placement : "popup";
  if (typeof root !== "string" || !root || /[\p{Cc}]/u.test(root)) {
    throw new Error("projectRoot must be a non-empty path without control characters");
  }
  const expanded = root === "~" ? home : root.startsWith("~/") ? join(home, root.slice(2)) : root;
  if (!isAbsolute(expanded)) throw new Error("projectRoot must be absolute or start with ~/");
  if (placement !== "popup" && placement !== "overlay") throw new Error("placement must be popup or overlay");
  return { projectRoot: resolve(expanded), placement };
}

export async function loadConfig(configDir: string) {
  let text: string;
  try {
    text = await readFile(join(configDir, "config.json"), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return parseConfig({});
    throw error;
  }
  return parseConfig(JSON.parse(text));
}

export function validateName(name: string) {
  if (!name.trim() || name === "." || name === ".." || /[/\\\p{Cc}]/u.test(name) || isAbsolute(name)) {
    throw new Error("Use a single directory name, without separators or control characters");
  }
  // Hidden projects would disappear from the next invocation's discovery list.
  if (name.startsWith(".")) throw new Error("Project names must not start with a dot");
  return name;
}

export async function discoverProjects(root: string) {
  return (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !/[\p{Cc}]/u.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export async function projectPath(root: string, name: string, create: boolean) {
  validateName(name);
  // Resolve the root once in the caller. Reject replacement of that canonical path.
  if (await realpath(root) !== root) throw new Error("Project root changed; reopen the picker");
  const path = join(root, name);
  if (create) await mkdir(path); // Non-recursive: collisions, including symlinks, fail closed.
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(path) !== path) {
    throw new Error("Project is no longer a direct directory under the root");
  }
  return path;
}
