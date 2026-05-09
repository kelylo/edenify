import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/pwa-192.png', 'icons/pwa-512.png', 'icons/favicon-32.png', 'icons/favicon-16.png', 'icons/mobile-192.png'],
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.ts',
      manifest: {
        name: 'Edenify - Focused Life Architecture',
        short_name: 'Edenify',
        description: 'A focused life architecture app for spiritual, academic, financial, physical, and general growth.',
        theme_color: '#964407',
        background_color: '#fef9f2',
        display: 'standalone',
        start_url: '/?pwa=true',
        scope: '/',
        orientation: 'portrait-primary',
        categories: ['productivity', 'lifestyle'],
        icons: [
          {
            src: '/icons/favicon-16.png',
            sizes: '16x16',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/favicon-32.png',
            sizes: '32x32',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/mobile-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/app-icon-1024.png',
            sizes: '1024x1024',
            type: 'image/png',
            purpose: 'any',
          },
        ],
        shortcuts: [
          {
            name: 'Home',
            short_name: 'Home',
            description: 'Go to home dashboard',
            url: '/?pwa=true&tab=home',
            icons: [{ src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Focus',
            short_name: 'Focus',
            description: 'Start focus session',
            url: '/?pwa=true&tab=focus',
            icons: [{ src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Bible',
            short_name: 'Bible',
            description: 'Daily scripture reading',
            url: '/?pwa=true&tab=eden',
            icons: [{ src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/(api|\.)/, /service-worker\.js$/],
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,json}'],
        globIgnores: ['**/node_modules/**/*', 'db.json'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'edenify-api',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24,
              },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'edenify-images',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('bible-data.json'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'edenify-bible-data',
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
        ],
        skipWaiting: false,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: true,
        navigateFallback: '/index.html',
        suppressWarnings: true,
      },
    }), cloudflare()],
    define: {
      'process.env.SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: ['**/db.json', '**/dev-dist/**', '**/dist/**'],
      },
    },
  };
});