import https from 'https';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createReadStream, existsSync, statSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const certsDir = join(__dirname, '..', 'certs');
const distDir = join(__dirname, '..', 'apps', 'web', 'dist');

const options = {
  key: readFileSync(join(certsDir, 'key.pem')),
  cert: readFileSync(join(certsDir, 'cert.pem')),
};

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

const server = https.createServer(options, (req, res) => {
  let filePath = join(distDir, req.url === '/' ? 'index.html' : req.url);

  // Handle SPA routing - if file doesn't exist, serve index.html
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(distDir, 'index.html');
  }

  const ext = filePath.substring(filePath.lastIndexOf('.'));
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
});

const PORT = 443;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  HTTPS server running at:`);
  console.log(`  ➜  Local:   https://localhost:${PORT}/`);
  console.log(`  ➜  Network: https://cams-work-comp.taila29c19.ts.net:${PORT}/`);
  console.log(`  ➜  Network: https://100.75.74.49:${PORT}/`);
  console.log(`\n  Note: You'll need to accept the self-signed certificate warning in your browser.`);
});
