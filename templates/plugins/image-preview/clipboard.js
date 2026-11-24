import { spawn } from "node:child_process";
import { once } from "node:events";
import { closeSync, constants, openSync } from "node:fs";

export async function copyImage(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let child;
  try {
    child = spawn("wl-copy", ["--type", "image/png"], { stdio: [fd, "ignore", "ignore"] });
  } finally {
    closeSync(fd);
  }
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error("wl-copy could not set the Wayland clipboard.");
}
