import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true, // Listen on all network interfaces (0.0.0.0)
    allowedHosts: true, // Allow ngrok, cloudflared, and any external tunnel hosts
  },
})
