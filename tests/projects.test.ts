import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { discoverProjects, loadConfig, parseConfig, projectPath, validateName } from "../src/projects";
import { fzfEnvironment, parseChoice } from "../src/picker";
import { openArgs } from "../src/main";

const temporary: string[] = [];
async function fixture() {
  await mkdir(".test-tmp", { recursive: true });
  const path = await mkdtemp(resolve(".test-tmp/case-"));
  temporary.push(path);
  return path;
}
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

test("config defaults, home expansion and strict validation", () => {
  expect(parseConfig({}, "/home/kevin")).toEqual({ projectRoot: "/home/kevin/Projects", placement: "popup" });
  expect(parseConfig({ projectRoot: "~/My Projects", placement: "overlay" }, "/home/kevin").projectRoot).toBe("/home/kevin/My Projects");
  expect(parseConfig({ projectRoot: "~" }, "/home/kevin").projectRoot).toBe("/home/kevin");
  for (const value of [null, [], 1, { typo: true }, { projectRoot: "relative" }, { projectRoot: "~other/path" }, { projectRoot: "" }, { projectRoot: "/bad\npath" }, { projectRoot: null }, { placement: "split" }]) {
    expect(() => parseConfig(value)).toThrow();
  }
});

test("missing config uses defaults; invalid JSON fails instead of silently defaulting", async () => {
  const dir = await fixture();
  expect(await loadConfig(dir)).toEqual(parseConfig({}));
  await writeFile(join(dir, "config.json"), "{");
  await expect(loadConfig(dir)).rejects.toThrow();
});

test("names cannot traverse or contain controls; spaces and literal shell syntax are preserved", () => {
  for (const name of ["", " ", ".", "..", "../escape", "/tmp", "a/b", "a\\b", "bad\0name", "bad\nname", "bad\u007fname", ".hidden"]) {
    expect(() => validateName(name)).toThrow();
  }
  for (const name of ["My Project", "$(touch nope)", "-option", "日本語", " trailing "]) expect(validateName(name)).toBe(name);
});

test("discover immediate visible directories afresh, excluding symlinks and terminal controls", async () => {
  const root = await fixture();
  await mkdir(join(root, "My Project", "nested"), { recursive: true });
  await mkdir(join(root, ".hidden"));
  await mkdir(join(root, "bad\nname"));
  await writeFile(join(root, "file"), "");
  await symlink(join(root, "My Project"), join(root, "link"));
  expect(await discoverProjects(root)).toEqual(["My Project"]);
  await mkdir(join(root, "Another"));
  expect(await discoverProjects(root)).toEqual(["Another", "My Project"]);
});

test("creation is empty, non-recursive and refuses collisions and symlinks", async () => {
  const root = await fixture();
  const path = await projectPath(root, "New Project", true);
  expect(await readdir(path)).toEqual([]);
  expect(await projectPath(root, "New Project", false)).toBe(path);
  await expect(projectPath(root, "New Project", true)).rejects.toThrow();
  await symlink(path, join(root, "link"));
  await expect(projectPath(root, "link", true)).rejects.toThrow();
  await expect(projectPath(root, "link", false)).rejects.toThrow();
  await expect(projectPath(root, "../escape", true)).rejects.toThrow();
  await writeFile(join(root, "file"), "");
  await expect(projectPath(root, "file", true)).rejects.toThrow();
});

test("a replaced root symlink cannot redirect creation", async () => {
  const base = await fixture();
  const outside = join(base, "outside");
  const root = join(base, "root");
  await mkdir(outside);
  await symlink(outside, root);
  await expect(projectPath(root, "escape", true)).rejects.toThrow("Project root changed");
  expect(await readdir(outside)).toEqual([]);
});

test("fzf selection, no-match query, empty query and cancellation are distinct", () => {
  expect(parseChoice(0, "mp\0My Project\0", ["My Project"])).toEqual({ kind: "select", name: "My Project" });
  expect(parseChoice(1, "New Project\0", [])).toEqual({ kind: "create", name: "New Project" });
  expect(parseChoice(1, "\0", [])).toEqual({ kind: "create", name: "" });
  expect(parseChoice(130, "anything", [])).toEqual({ kind: "cancel" });
  expect(() => parseChoice(2, "", [])).toThrow();
  expect(() => parseChoice(0, "q\0unexpected\0", [])).toThrow();
});

test("fzf defaults cannot override required behavior", () => {
  expect(fzfEnvironment({ PATH: "/bin", FZF_DEFAULT_OPTS: "--select-1", FZF_DEFAULT_OPTS_FILE: "/evil", FZF_DEFAULT_COMMAND: "exit 1" })).toEqual({ PATH: "/bin" });
});

test("popup uses the declared plugin and pane; overlay uses supported CLI override", async () => {
  const manifest = Bun.TOML.parse(await Bun.file("herdr-plugin.toml").text());
  if (!("id" in manifest) || typeof manifest.id !== "string") throw new Error("Manifest is missing its plugin ID");
  expect(openArgs("popup")).toEqual([
    "plugin", "pane", "open", "--plugin", manifest.id, "--entrypoint", "picker",
  ]);
  expect(openArgs("overlay").slice(-2)).toEqual(["--placement", "overlay"]);
});
