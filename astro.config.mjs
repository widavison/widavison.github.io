// @ts-check
import { defineConfig } from "astro/config";
import { createHash } from "node:crypto";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

// Keep generated dependencies off the shared home filesystem. Each checkout
// gets a separate cache on the machine actually running the dev server.
const projectKey = createHash("sha256").update(import.meta.url).digest("hex").slice(0, 12);
const viteCache = join(tmpdir(), `widavison-vite-${userInfo().uid}-${projectKey}`);

export default defineConfig({
  site: "https://widavison.github.io",
  vite: {
    cacheDir: viteCache,
    optimizeDeps: {
      // The only browser dependency is Three.js. Listing its entry points
      // avoids a filesystem crawl and re-bundling when the demo scrolls in.
      noDiscovery: true,
      include: [
        "three",
        "three/addons/loaders/GLTFLoader.js",
        "three/addons/controls/OrbitControls.js",
        "three/addons/environments/RoomEnvironment.js",
      ],
    },
    server: {
      strictPort: true,
      // Home directories are on shared Lustre storage. Edits made on another
      // workstation may not emit local file events, so poll for live updates.
      watch: {
        usePolling: true,
        interval: 2000,
        // Demo videos, meshes and trajectories don't need HMR polling.
        ignored: ["**/public/demo/**"],
      },
    },
  },
});
