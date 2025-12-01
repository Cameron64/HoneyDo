import http from 'http';
import { createReadStream, existsSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'apps', 'web', 'dist');

const API_HOST = 'localhost';
const API_PORT = 3001;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function proxyToApi(req, res) {
  const options = {
    hostname: API_HOST,
    port: API_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${API_HOST}:${API_PORT}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.writeHead(502);
    res.end('Bad Gateway');
  });

  req.pipe(proxyReq);
}

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  let filePath = join(distDir, urlPath === '/' ? 'index.html' : urlPath);

  // Handle SPA routing - if file doesn't exist, serve index.html
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(distDir, 'index.html');
  }

  const ext = extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  res.setHeader('Content-Type', contentType);

  // Add cache headers for service worker
  if (req.url.includes('sw.js')) {
    res.setHeader('Cache-Control', 'no-cache');
  }

  createReadStream(filePath)
    .on('error', () => {
      res.writeHead(404);
      res.end('Not found');
    })
    .pipe(res);
}

const server = http.createServer((req, res) => {
  // Proxy API and WebSocket requests to backend
  if (req.url.startsWith('/trpc') || req.url.startsWith('/api') || req.url.startsWith('/socket.io')) {
    proxyToApi(req, res);
  } else {
    serveStatic(req, res);
  }
});

// Handle WebSocket upgrades for Socket.io
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/socket.io')) {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers,
    };

    const proxyReq = http.request(options);
    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
        Object.entries(proxyRes.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n') +
        '\r\n\r\n');

      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
    });

    proxyReq.on('error', (err) => {
      console.error('WebSocket proxy error:', err.message);
      socket.end();
    });

    proxyReq.end();
  }
});

const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  PWA Server running at:`);
  console.log(`  ➜  Local:   http://localhost:${PORT}/`);
  console.log(`\n  Proxying /trpc, /api, /socket.io to localhost:${API_PORT}`);
  console.log(`  Serving static files from ${distDir}`);
});
