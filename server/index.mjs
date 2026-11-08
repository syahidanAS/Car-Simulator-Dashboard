import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { handleS3MusicApi } from './s3MinioHandler.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../dist');
const PORT = Number(process.env.PORT || 5013);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
};

const COMPRESSIBLE_EXTS = new Set(['.html', '.js', '.css', '.json', '.svg']);

const server = http.createServer(async (req, res) => {
  // Security & Browser Sensor headers (Geolocation for EV GPS + Autoplay + Fullscreen)
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(self), autoplay=(self), fullscreen=(self)'
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  const urlPath = (req.url || '/').split('?')[0];

  // 1. Healthcheck endpoint
  if (urlPath === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('OK\n');
    return;
  }

  // 2. MinIO S3 Music Storage API (/api/music/*)
  if (urlPath.startsWith('/api/music/')) {
    await handleS3MusicApi(req, res);
    return;
  }

  // 3. Static Asset & SPA Fallback serving from /dist
  let safeRelPath = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.(\/|\\|$))+/, '');
  let filePath = path.join(DIST_DIR, safeRelPath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Build artifacts not found. Run npm run build first.');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const isAsset = urlPath.startsWith('/assets/');
  const cacheControl = isAsset
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';

  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  const canGzip = COMPRESSIBLE_EXTS.has(ext) && acceptEncoding.includes('gzip');

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    ...(canGzip ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}),
  });

  const fileStream = fs.createReadStream(filePath);
  if (canGzip) {
    fileStream.pipe(zlib.createGzip()).pipe(res);
  } else {
    fileStream.pipe(res);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `[FERRARI VIRTUAL COCKPIT] Server listening on http://0.0.0.0:${PORT} (MinIO S3 Bucket: ${process.env.AWS_BUCKET || 'car-simulator'})`
  );
});

