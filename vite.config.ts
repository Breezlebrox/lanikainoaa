import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
const base = process.env.VITE_BASE_PATH || "/";
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      scope: base,
      base,
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Coastline · Coastal conditions",
        short_name: "Coastline",
        description:
          "Tides, weather, and ocean conditions. Your places stay on your device.",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#f7f7f2",
        theme_color: "#123f45",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
