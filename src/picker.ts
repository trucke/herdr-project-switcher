export type Choice = { kind: "cancel" } | { kind: "select"; name: string } | { kind: "create"; name: string };

export function parseChoice(code: number, output: string, projects: readonly string[]): Choice {
  if (code === 130) return { kind: "cancel" };
  if (code !== 0 && code !== 1) throw new Error(`fzf failed (exit ${code})`);
  const fields = output.split("\0");
  const query = fields[0];
  if (query === undefined || fields.at(-1) !== "") throw new Error("Invalid fzf output");
  if (code === 1 && fields.length === 2) return { kind: "create", name: query };
  const selected = fields[1];
  if (code === 0 && fields.length === 3 && selected !== undefined && projects.includes(selected)) {
    return { kind: "select", name: selected };
  }
  throw new Error("Unexpected fzf selection");
}

export function fzfEnvironment(env = process.env) {
  // Defaults can add shell previews, auto-selection, bindings, or output transformations.
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("FZF_")));
}

async function fzf(items: readonly string[], args: string[]) {
  const child = Bun.spawn(["fzf", "--sync", "--read0", "--print0", "--layout=reverse", "--no-multi", ...args], {
    env: fzfEnvironment(),
    stdin: new Blob([items.length ? `${items.join("\0")}\0` : ""]),
    stdout: "pipe",
    stderr: "inherit",
  });
  const [output, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  return { output, code };
}

export async function pickProject(projects: readonly string[], query = "") {
  const { output, code } = await fzf(projects, [
    "--no-extended", "--print-query", "--query", query, "--prompt=Project > ",
    "--header=Enter: new workspace | No match: offer creation | Esc: cancel",
    "--bind=enter:accept,esc:abort,ctrl-c:abort",
  ]);
  return parseChoice(code, output, projects);
}

export async function confirmCreation(name: string) {
  const { output, code } = await fzf(["Create project", "Cancel"], [
    "--disabled", "--no-input", `--header=Create empty project ${JSON.stringify(name)}?`,
    "--prompt=Confirm > ", "--bind=enter:accept,esc:abort,ctrl-c:abort",
  ]);
  if (code === 130) return false;
  if (code !== 0) throw new Error(`fzf confirmation failed (exit ${code})`);
  return output === "Create project\0";
}

export async function showError(message: string) {
  await fzf(["Close"], ["--disabled", "--no-input", `--header=${message.replace(/[\p{Cc}]/gu, " ")}`]);
}
