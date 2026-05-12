import { build } from "vite";

function patchProcessStdinOff() {
  if (!process.stdin) return;

  if (
    typeof process.stdin.off !== "function" &&
    typeof process.stdin.removeListener === "function"
  ) {
    process.stdin.off = process.stdin.removeListener.bind(process.stdin);
  }
}

patchProcessStdinOff();

await build();
await import("./prepare-cpanel-dist.mjs");