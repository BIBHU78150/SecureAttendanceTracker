import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Event Attendance Tracker',
        short_name: 'Attendance',
        description: 'Geofenced Event Attendance Tracker',
        theme_color: '#ffffff'

      }
    })
  ],
});
