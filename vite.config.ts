import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error ESM server handler
import { handleS3MusicApi } from './server/s3MinioHandler.mjs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 's3-minio-music-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.startsWith('/api/music/')) {
            void handleS3MusicApi(req, res);
            return;
          }
          next();
        });
      },
    },
  ],
  server: {
    port: 5173,
    host: true,
  },
});
