import { fileURLToPath } from "node:url";
import path from "node:path";
import loadNativeAddon from "node-gyp-build";

export interface NativeThreadPoolProbeResult {
  queueWaitMs: number;
  executionMs: number;
}

interface NativeThreadPoolAddon {
  probe(): Promise<NativeThreadPoolProbeResult>;
}

let cachedAddon: NativeThreadPoolAddon | undefined;

const isNativeAddon = (value: unknown): value is NativeThreadPoolAddon =>
  typeof value === "object"
  && value !== null
  && "probe" in value
  && typeof value.probe === "function";

export function loadThreadPoolAddon(): NativeThreadPoolAddon {
  if (cachedAddon) return cachedAddon;
  const moduleDirectory = typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
  const candidateRoots = [
    path.resolve(moduleDirectory, ".."),
    path.resolve(moduleDirectory, "../.."),
  ];
  let lastError: unknown;

  for (const root of candidateRoots) {
    try {
      const addon = loadNativeAddon(root);
      if (!isNativeAddon(addon)) throw new TypeError("Native addon does not export probe()");
      cachedAddon = addon;
      return addon;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to load the native libuv thread pool probe");
}
