import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "JalSetu — community water portal",
        short_name: "JalSetu",
        description: "Log water supply and tankers, watch groundwater with a 30-day forecast, look after rainwater harvesting, report leaks.",
        theme_color: "#0039D3",
        background_color: "#F6F8FE",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/uploads/],
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/speech"),
            handler: "NetworkFirst", method: "GET",
            options: { cacheName: "api", networkTimeoutSeconds: 4, expiration: { maxEntries: 200, maxAgeSeconds: 7 * 86400 } } },
          { urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\//, handler: "CacheFirst",
            options: { cacheName: "tiles", expiration: { maxEntries: 400, maxAgeSeconds: 30 * 86400 } } },
        ],
      },
    }),
  ],
  server: {
    port: 5180,
    strictPort: true,
    proxy: { "/api": "http://localhost:8100", "/uploads": "http://localhost:8100" },
  },
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 1200 },
  test: { environment: "node" },
});
