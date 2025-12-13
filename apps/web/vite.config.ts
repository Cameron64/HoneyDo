import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import fs from 'fs';

// Tailscale HTTPS certs (optional - for PWA support over Tailscale)
const certPath = path.resolve(__dirname, '../../certs/cams-work-comp.taila29c19.ts.net.crt');
const keyPath = path.resolve(__dirname, '../../certs/cams-work-comp.taila29c19.ts.net.key');
const hasCerts = fs.existsSync(certPath) && fs.existsSync(keyPath);

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'HoneyDo',
        short_name: 'HoneyDo',
        description: 'Household management for couples',
        theme_color: '#f59e0b',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Skip waiting - new service worker activates immediately
        skipWaiting: true,
        clientsClaim: true,
        // Don't precache everything - let runtime caching handle it
        globPatterns: ['**/*.{ico,png,svg,woff2}'],
        // Navigation fallback for SPA
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/trpc/, /^\/api/, /^\/socket\.io/],
        runtimeCaching: [
          // Never cache tRPC/API calls
          {
            urlPattern: /\/trpc\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/api\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/socket\.io\//,
            handler: 'NetworkOnly',
          },
          // HTML - network first, fall back to cache
          {
            urlPattern: /\.html$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
            },
          },
          // JS/CSS - stale while revalidate (use cache but fetch new in background)
          {
            urlPattern: /\.(?:js|css)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'assets-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
            },
          },
          // Images - cache first
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true, // Enable PWA in dev for Tailscale testing
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0', // Bind to all interfaces for LAN access
    port: 5173,
    https: hasCerts
      ? {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath),
        }
      : undefined,
    allowedHosts: [
      'localhost',
      '.ts.net', // Allow all Tailscale hostnames
      ...(process.env.VITE_ALLOWED_HOSTS?.split(',') || []),
    ],
    headers: {
      // Prevent caching of JS files during development
      'Cache-Control': 'no-store',
    },
  },
});
