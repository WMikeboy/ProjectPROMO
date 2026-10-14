import http from 'node:http';

// Expose only signed media reads. Never forward cookies or administration routes.
http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (!['GET', 'HEAD'].includes(req.method) ||
      !/^\/media\/[a-f0-9-]{36}$/.test(url.pathname) ||
      !/^\d+$/.test(url.searchParams.get('expires') || '') ||
      !/^[a-f0-9]{64}$/.test(url.searchParams.get('signature') || '')) {
    res.writeHead(404); res.end(); return;
  }
  const upstream = http.request({ hostname: '127.0.0.1', port: 4100,
    path: url.pathname + url.search, method: req.method,
    headers: req.headers.range ? {range: req.headers.range} : {},
  }, response => {
    res.writeHead(response.statusCode || 502, response.headers);
    response.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  upstream.setTimeout(120000, () => upstream.destroy());
  res.on('close', () => upstream.destroy());
  upstream.end();
}).listen(4101, '127.0.0.1', () => console.log('Media gateway: 127.0.0.1:4101'));
