// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://widavison.github.io",
  vite: {
    server: {
      // Home directories are on shared Lustre storage. Edits made on another
      // workstation may not emit local file events, so poll for live updates.
      watch: {
        usePolling: true,
        interval: 1000,
      },
    },
  },
});
