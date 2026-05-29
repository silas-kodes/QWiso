export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isDistPath = url.pathname === '/dist' || url.pathname.startsWith('/dist/');

    if (!isDistPath) {
      return new Response('Not Found via Worker Proxy', { status: 404 });
    }

    const RAILWAY_BACKEND = 'https://qwiso-production.up.railway.app';
    const targetUrl = `${RAILWAY_BACKEND}${url.pathname}${url.search}`;

    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.delete('host');

    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: forwardedHeaders,
      body: request.body,
      redirect: 'follow',
    });

    const response = await fetch(proxyRequest);
    return response;
  },
};
