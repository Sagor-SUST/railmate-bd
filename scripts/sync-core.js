// scripts/sync-core.js
// Copies core/ into extension/core/ so Chrome can load it.
import { cpSync, rmSync } from "node:fs";

rmSync("extension/core", { recursive: true, force: true });
cpSync("core", "extension/core", { recursive: true });
console.log("Synced core/ -> extension/core/");
