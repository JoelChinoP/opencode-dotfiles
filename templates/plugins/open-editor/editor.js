import { readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

function parseInput(bin, input) {
  const usage = bin === "code" ? '/open-vscode [carpeta] [--profile "nombre"]' : "/open-zed [carpeta]";
  const invalid = () => new Error(`Uso: ${usage}. Puedes elegir la carpeta con @ o escribir su ruta entre comillas.`);
  const word = /^(?:"([^"]*)"|'([^']*)'|([^\s"']+))(?=\s|$)/u;
  // El selector de la TUI entrega @ruta con espacios sin añadir comillas.
  const atFolder = /^@(?:"([^"]*)"|'([^']*)'|([^"'\s].*?))(?=\s+--profile(?:\s|$)|$)/su;
  const words = [];
  let rest = input.trim();
  while (rest) {
    const mention = rest.startsWith("@") && words.at(-1) !== "--profile";
    const token = (mention ? atFolder : word).exec(rest);
    if (!token) throw invalid();
    const value = token[1] ?? token[2] ?? token[3];
    words.push(mention ? `@${value}` : value);
    rest = rest.slice(token[0].length).trimStart();
  }

  let profile;
  const index = words.indexOf("--profile");
  if (bin === "code" && index !== -1) {
    [, profile] = words.splice(index, 2);
    if (!profile?.trim() || profile.startsWith("-")) throw invalid();
  }
  const folder = (words[0] ?? ".").replace(/^@/, "");
  if (words.length > 1 || !folder || words[0]?.startsWith("-")) throw invalid();
  return { folder, profile };
}

async function savedProfile(requested) {
  const config = process.env.VSCODE_APPDATA || process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  const data = process.env.VSCODE_PORTABLE ? join(process.env.VSCODE_PORTABLE, "user-data") : join(config, "Code");
  // shortcut: catálogo interno de VS Code estable; usar la CLI cuando permita listar perfiles.
  let names;
  try {
    const state = JSON.parse(await readFile(join(data, "User/globalStorage/storage.json"), "utf8"));
    names = (state.userDataProfiles ?? []).map((profile) => profile.name);
  } catch {
    throw new Error("No se pudo leer el catálogo de perfiles de VS Code. Omite --profile para abrir la carpeta igualmente.");
  }
  if (names.includes(requested)) return requested;
  const matches = names.filter((name) => typeof name === "string" && name.toLowerCase() === requested.toLowerCase());
  if (matches.length === 1) return matches[0];
  if (matches.length) throw new Error(`Hay varios perfiles con el nombre «${requested}». Usa las mayúsculas exactas.`);
  throw new Error(`No se encontró el perfil «${requested}» en VS Code.`);
}

export async function editorArgs(bin, root, input = "") {
  const { folder, profile } = parseInput(bin, input);
  if (!root || !isAbsolute(root)) throw new Error("No se conoce la carpeta local de la sesión.");
  if (isAbsolute(folder)) throw new Error("Indica una carpeta relativa a la sesión.");
  const base = await realpath(root);
  const target = await realpath(resolve(base, folder)).catch(() => {
    throw new Error(`No se puede acceder a la carpeta «${folder}».`);
  });
  const subpath = relative(base, target);
  if (subpath === ".." || subpath.startsWith(`..${sep}`) || isAbsolute(subpath)) {
    throw new Error(`La carpeta «${folder}» está fuera de la sesión.`);
  }
  if (!(await stat(target)).isDirectory()) throw new Error(`«${folder}» no es una carpeta.`);
  const args = ["-n", target];
  if (profile) args.push("--profile", await savedProfile(profile));
  return args;
}
