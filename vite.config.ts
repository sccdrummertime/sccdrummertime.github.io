import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Open Metronome',
        short_name: 'Metronome',
        description:
          'Free, open-source metronome and practice tracker. No subscriptions, no cloud, no caps.',
        theme_color: '#111318',
        background_color: '#111318',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  // Engine code must never be split away from the first paint — the app is tiny anyway.
  build: { target: 'es2022' },
});
