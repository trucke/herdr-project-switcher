import { realpath, stat } from "node:fs/promises";
import { loadConfig, discoverProjects, projectPath, validateName } from "./projects";
import { confirmCreation, pickProject, showError } from "./picker";

export async function herdr(args: string[]) {
  const child = Bun.spawn([process.env.HERDR_BIN_PATH || "herdr", ...args], {
    stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  if (code !== 0) throw new Error(`Herdr failed (exit ${code}): ${stderr || stdout}`);
}

export function openArgs(placement: "popup" | "overlay") {
  // 0.9.1 supports manifest popups, but its CLI placement enum omits popup.
  return ["plugin", "pane", "open", "--plugin", "sudokvn.project-switcher", "--entrypoint", "picker",
    ...(placement === "overlay" ? ["--placement", "overlay"] : [])];
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "open" && mode !== "pick") throw new Error("Usage: herdr-project-switcher open|pick");
  if (process.env.HERDR_ENV !== "1" || !process.env.HERDR_PLUGIN_CONFIG_DIR) {
    throw new Error("Run this through the Herdr plugin action or pane");
  }
  const config = await loadConfig(process.env.HERDR_PLUGIN_CONFIG_DIR);
  if (mode === "open") {
    await herdr(openArgs(config.placement));
    return;
  }
  const root = await realpath(config.projectRoot);
  if (!(await stat(root)).isDirectory()) throw new Error("projectRoot is not a directory");
  let query = "";
  while (true) {
    const projects = await discoverProjects(root);
    const choice = await pickProject(projects, query);
    if (choice.kind === "cancel") return;
    query = choice.name;
    try {
      validateName(choice.name);
    } catch (error) {
      await showError(error instanceof Error ? error.message : String(error));
      continue;
    }
    if (choice.kind === "create" && !await confirmCreation(choice.name)) return;
    const path = await projectPath(root, choice.name, choice.kind === "create");
    // Never list/reuse workspaces. Focus before exit; Herdr then reaps the transient UI.
    // A failed CLI request is not retried: it may already have created the workspace.
    await herdr(["workspace", "create", "--cwd", path, "--focus"]);
    return;
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    if (process.argv[2] === "pick" && process.stderr.isTTY) {
      try { await showError(message); } catch { /* stderr still records the original failure. */ }
    }
    process.exitCode = 1;
  }
}
