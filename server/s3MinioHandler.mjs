import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Load environment variables from .env file if present (fallback to process.env and defaults)
 */
function loadEnvConfig() {
  const envFile = path.resolve(process.cwd(), '.env');
  const fileVars = {};
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
        fileVars[key] = val;
      }
    }
  }

  const get = (key, fallback) => process.env[key] || fileVars[key] || fallback;

  return {
    accessKeyId: get('AWS_ACCESS_KEY_ID', 'E058VA970PLY1X2NY8ME'),
    secretAccessKey: get(
      'AWS_SECRET_ACCESS_KEY',
      'wjMsNEvVUGIUdwPCVpB6g1KkGaoplZOA+J127+C9'
    ),
    region: get('AWS_DEFAULT_REGION', 'us-east-1'),
    bucket: get('AWS_BUCKET', 'car-simulator'),
    usePathStyle:
      get('AWS_USE_PATH_STYLE_ENDPOINT', 'true').toLowerCase() !== 'false',
    endpoint: get('AWS_ENDPOINT', 'http://100.88.163.2:9000'),
    awsUrl: get('AWS_URL', 'http://100.88.163.2:9000/smart-sdmk'),
  };
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function uriEncodePathSegment(segment) {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeS3Path(rawPath) {
  return rawPath
    .split('/')
    .map((part) => uriEncodePathSegment(part))
    .join('/');
}

/**
 * Generates AWS Signature Version 4 headers for MinIO / S3 requests
 */
function signS3Request({
  method,
  endpointUrl,
  canonicalPath,
  queryParams = {},
  headers = {},
  payloadHash,
  config,
}) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const hostHeader = endpointUrl.port
    ? `${endpointUrl.hostname}:${endpointUrl.port}`
    : endpointUrl.hostname;

  const sortedQuery = Object.keys(queryParams)
    .sort()
    .map(
      (k) =>
        `${uriEncodePathSegment(k)}=${uriEncodePathSegment(String(queryParams[k] ?? ''))}`
    )
    .join('&');

  const signHeaders = {
    host: hostHeader,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };

  const canonicalHeaders = Object.keys(signHeaders)
    .sort()
    .map((k) => `${k}:${signHeaders[k]}\n`)
    .join('');

  const signedHeadersList = Object.keys(signHeaders).sort().join(';');

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalPath,
    sortedQuery,
    canonicalHeaders,
    signedHeadersList,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmacSha256(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, config.region);
  const kService = hmacSha256(kRegion, 's3');
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign)
    .digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersList}, Signature=${signature}`;

  return {
    ...headers,
    Host: hostHeader,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    Authorization: authorization,
  };
}

/**
 * Executes an HTTP/HTTPS request against the MinIO S3 endpoint
 */
function s3Request({
  method,
  objectKey = '',
  queryParams = {},
  headers = {},
  body = Buffer.alloc(0),
  timeoutMs = 15000,
}) {
  const config = loadEnvConfig();
  const endpointUrl = new URL(config.endpoint);
  const cleanKey = objectKey.replace(/^\/+/, '');
  const rawPath = cleanKey
    ? `/${config.bucket}/${cleanKey}`
    : `/${config.bucket}`;
  const canonicalPath = encodeS3Path(rawPath);

  const payloadBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const payloadHash = sha256Hex(payloadBuffer);

  const signedHeaders = signS3Request({
    method,
    endpointUrl,
    canonicalPath,
    queryParams,
    headers,
    payloadHash,
    config,
  });

  if (payloadBuffer.length > 0) {
    signedHeaders['Content-Length'] = payloadBuffer.length;
  }

  const queryStr = Object.keys(queryParams)
    .sort()
    .map(
      (k) =>
        `${uriEncodePathSegment(k)}=${uriEncodePathSegment(String(queryParams[k] ?? ''))}`
    )
    .join('&');

  const requestPath = queryStr ? `${canonicalPath}?${queryStr}` : canonicalPath;
  const transport = endpointUrl.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: endpointUrl.protocol,
        hostname: endpointUrl.hostname,
        port: endpointUrl.port || (endpointUrl.protocol === 'https:' ? 443 : 80),
        method,
        path: requestPath,
        headers: signedHeaders,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`MinIO S3 connection timed out (${config.endpoint})`));
    });
    req.on('error', (err) => reject(err));

    if (payloadBuffer.length > 0) {
      req.write(payloadBuffer);
    }
    req.end();
  });
}

let bucketChecked = false;

async function ensureBucketExists() {
  if (bucketChecked) return;
  const headRes = await s3Request({ method: 'HEAD', timeoutMs: 6000 });
  if (headRes.statusCode === 404) {
    const putRes = await s3Request({ method: 'PUT', timeoutMs: 8000 });
    if (putRes.statusCode >= 200 && putRes.statusCode < 300) {
      bucketChecked = true;
    }
  } else if (headRes.statusCode >= 200 && headRes.statusCode < 400) {
    bucketChecked = true;
  }
}

const METADATA_KEY = 'tracks/metadata.json';
const AUDIO_EXT_REGEX = /\.(mp3|wav|ogg|m4a|aac|flac|webm|opus)$/i;

async function loadMetadataJson() {
  try {
    const res = await s3Request({
      method: 'GET',
      objectKey: METADATA_KEY,
      timeoutMs: 8000,
    });
    if (res.statusCode === 200 && res.body.length > 0) {
      const parsed = JSON.parse(res.body.toString('utf8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore if metadata.json does not exist yet
  }
  return [];
}

async function saveMetadataJson(tracksMeta) {
  const jsonBytes = Buffer.from(JSON.stringify(tracksMeta, null, 2), 'utf8');
  await s3Request({
    method: 'PUT',
    objectKey: METADATA_KEY,
    headers: { 'Content-Type': 'application/json' },
    body: jsonBytes,
    timeoutMs: 10000,
  });
}

function parseS3ListXml(xmlText) {
  const items = [];
  const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match;
  while ((match = contentsRegex.exec(xmlText)) !== null) {
    const block = match[1];
    const keyMatch = /<Key>([\s\S]*?)<\/Key>/.exec(block);
    const sizeMatch = /<Size>(\d+)<\/Size>/.exec(block);
    const lastModMatch = /<LastModified>([\s\S]*?)<\/LastModified>/.exec(block);
    if (keyMatch) {
      const decodedKey = keyMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
      items.push({
        key: decodedKey,
        size: sizeMatch ? Number(sizeMatch[1]) : 0,
        lastModified: lastModMatch ? Date.parse(lastModMatch[1]) || Date.now() : Date.now(),
      });
    }
  }
  return items;
}

function guessMimeType(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.opus')) return 'audio/opus';
  return 'audio/mpeg';
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function collectRequestBody(req, maxBytes = 120 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('File size exceeds 120MB limit'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Connect/Vite/Node HTTP middleware handling `/api/music/*` for MinIO S3 storage
 */
export async function handleS3MusicApi(req, res) {
  const config = loadEnvConfig();
  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = parsedUrl.pathname;

  // 1. GET /api/music/tracks -> List tracks from MinIO S3 bucket
  if (req.method === 'GET' && pathname === '/api/music/tracks') {
    try {
      await ensureBucketExists();
      const [listRes, savedMeta] = await Promise.all([
        s3Request({
          method: 'GET',
          queryParams: { 'list-type': '2' },
          timeoutMs: 8000,
        }),
        loadMetadataJson(),
      ]);

      if (listRes.statusCode >= 400) {
        return sendJson(res, 502, {
          connected: false,
          bucket: config.bucket,
          endpoint: config.endpoint,
          error: `MinIO returned HTTP ${listRes.statusCode}`,
          tracks: [],
        });
      }

      const xmlObjects = parseS3ListXml(listRes.body.toString('utf8'));
      const audioObjects = xmlObjects.filter((obj) => AUDIO_EXT_REGEX.test(obj.key));

      const metaByKey = new Map();
      for (const m of savedMeta) {
        if (m && m.s3Key) metaByKey.set(m.s3Key, m);
      }

      const mergedTracks = audioObjects.map((obj) => {
        const existing = metaByKey.get(obj.key);
        const baseName = obj.key.split('/').pop() || obj.key;
        const cleanFileName = baseName.replace(/^track_\d+_[a-z0-9]+-/, '');
        const titleFromFile = cleanFileName.replace(/\.[^/.]+$/, '');

        return {
          id: existing?.id || `s3_${Buffer.from(obj.key).toString('base64url').slice(0, 20)}`,
          s3Key: obj.key,
          title: existing?.title || titleFromFile,
          artist: existing?.artist || 'MinIO S3 Cloud Audio',
          album: existing?.album || `S3 Bucket (${config.bucket})`,
          fileName: existing?.fileName || cleanFileName,
          fileSize: obj.size || existing?.fileSize || 0,
          mimeType: existing?.mimeType || guessMimeType(cleanFileName),
          duration: existing?.duration || 0,
          artworkDataUrl: existing?.artworkDataUrl || null,
          streamUrl: `/api/music/stream?key=${encodeURIComponent(obj.key)}`,
          addedAt: existing?.addedAt || obj.lastModified,
        };
      });

      return sendJson(res, 200, {
        connected: true,
        bucket: config.bucket,
        endpoint: config.endpoint,
        tracks: mergedTracks,
      });
    } catch (err) {
      return sendJson(res, 200, {
        connected: false,
        bucket: config.bucket,
        endpoint: config.endpoint,
        error: err instanceof Error ? err.message : 'Unable to reach MinIO S3 endpoint',
        tracks: [],
      });
    }
  }

  // 2. POST /api/music/upload -> Upload audio file & metadata to MinIO S3 bucket
  if (req.method === 'POST' && pathname === '/api/music/upload') {
    try {
      await ensureBucketExists();
      const metaHeader = req.headers['x-track-meta'];
      if (!metaHeader || typeof metaHeader !== 'string') {
        return sendJson(res, 400, { error: 'Missing x-track-meta header' });
      }

      const meta = JSON.parse(Buffer.from(metaHeader, 'base64').toString('utf8'));
      const fileBuffer = await collectRequestBody(req);

      const safeFileName = String(meta.fileName || 'track.mp3').replace(
        /[^a-zA-Z0-9._\-\s()]/g,
        '_'
      );
      const id = String(meta.id || `track_${Date.now()}`);
      const s3Key = `tracks/${id}-${safeFileName}`;
      const mimeType = meta.mimeType || guessMimeType(safeFileName);

      const putRes = await s3Request({
        method: 'PUT',
        objectKey: s3Key,
        headers: {
          'Content-Type': mimeType,
        },
        body: fileBuffer,
        timeoutMs: 60000,
      });

      if (putRes.statusCode >= 400) {
        return sendJson(res, 502, {
          error: `MinIO upload failed with HTTP ${putRes.statusCode}`,
        });
      }

      const savedMeta = await loadMetadataJson();
      const trackRecord = {
        id,
        s3Key,
        title: meta.title || safeFileName,
        artist: meta.artist || 'MinIO S3 Audio',
        album: meta.album || `S3 Bucket (${config.bucket})`,
        fileName: meta.fileName || safeFileName,
        fileSize: fileBuffer.length,
        mimeType,
        duration: Number(meta.duration) || 0,
        artworkDataUrl:
          meta.artworkDataUrl && String(meta.artworkDataUrl).length < 85000
            ? meta.artworkDataUrl
            : null,
        addedAt: meta.addedAt || Date.now(),
      };

      const filtered = savedMeta.filter((m) => m.id !== id && m.s3Key !== s3Key);
      filtered.push(trackRecord);
      await saveMetadataJson(filtered);

      return sendJson(res, 200, {
        ok: true,
        bucket: config.bucket,
        track: {
          ...trackRecord,
          streamUrl: `/api/music/stream?key=${encodeURIComponent(s3Key)}`,
        },
      });
    } catch (err) {
      return sendJson(res, 500, {
        error: err instanceof Error ? err.message : 'Failed to upload track to MinIO S3',
      });
    }
  }

  // 3. GET /api/music/stream?key=... -> Stream audio from MinIO S3 with Range support
  if (req.method === 'GET' && pathname === '/api/music/stream') {
    const objectKey = parsedUrl.searchParams.get('key');
    if (!objectKey) {
      return sendJson(res, 400, { error: 'Missing key parameter' });
    }

    try {
      const endpointUrl = new URL(config.endpoint);
      const cleanKey = objectKey.replace(/^\/+/, '');
      const rawPath = `/${config.bucket}/${cleanKey}`;
      const canonicalPath = encodeS3Path(rawPath);
      const emptyHash = sha256Hex(Buffer.alloc(0));

      const extraHeaders = {};
      if (req.headers.range) {
        extraHeaders.Range = req.headers.range;
      }

      const signedHeaders = signS3Request({
        method: 'GET',
        endpointUrl,
        canonicalPath,
        queryParams: {},
        headers: extraHeaders,
        payloadHash: emptyHash,
        config,
      });

      const transport = endpointUrl.protocol === 'https:' ? https : http;
      const proxyReq = transport.request(
        {
          protocol: endpointUrl.protocol,
          hostname: endpointUrl.hostname,
          port: endpointUrl.port || (endpointUrl.protocol === 'https:' ? 443 : 80),
          method: 'GET',
          path: canonicalPath,
          headers: signedHeaders,
          timeout: 20000,
        },
        (proxyRes) => {
          const outHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Accept-Ranges': proxyRes.headers['accept-ranges'] || 'bytes',
            'Content-Type':
              proxyRes.headers['content-type'] || guessMimeType(objectKey),
          };
          if (proxyRes.headers['content-length']) {
            outHeaders['Content-Length'] = proxyRes.headers['content-length'];
          }
          if (proxyRes.headers['content-range']) {
            outHeaders['Content-Range'] = proxyRes.headers['content-range'];
          }
          res.writeHead(proxyRes.statusCode || 200, outHeaders);
          proxyRes.pipe(res);
        }
      );

      proxyReq.on('error', (err) => {
        if (!res.headersSent) {
          sendJson(res, 502, { error: err.message });
        } else {
          res.end();
        }
      });
      proxyReq.end();
      return;
    } catch (err) {
      return sendJson(res, 500, {
        error: err instanceof Error ? err.message : 'Stream error',
      });
    }
  }

  // 4. DELETE /api/music/tracks?id=...&key=... -> Delete audio object from MinIO S3
  if (req.method === 'DELETE' && pathname === '/api/music/tracks') {
    const id = parsedUrl.searchParams.get('id');
    const s3Key = parsedUrl.searchParams.get('key');
    try {
      if (s3Key) {
        await s3Request({
          method: 'DELETE',
          objectKey: s3Key,
          timeoutMs: 10000,
        });
      }
      const savedMeta = await loadMetadataJson();
      const updated = savedMeta.filter(
        (m) => (id ? m.id !== id : true) && (s3Key ? m.s3Key !== s3Key : true)
      );
      await saveMetadataJson(updated);
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      return sendJson(res, 500, {
        error: err instanceof Error ? err.message : 'Failed to delete track from MinIO S3',
      });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
}

