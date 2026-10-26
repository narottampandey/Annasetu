// env.js
// Runtime frontend configuration. Safe defaults for localhost + deployment.
// - __SOCKET_ENDPOINT__: full URL to backend for Socket.IO (use Render service URL)
// - __API_PREFIX__: prefix to prepend to API calls (leave empty to use relative '/api')

(function () {
    const defaultBackend = 'http://localhost:5000';
    const defaultSocket = 'https://annasetu-backend-uz5m.onrender.com';

    const hostname = window.location.hostname || '';
    const isFile = window.location.protocol === 'file:';
    const isLocalHost = isFile || hostname === 'localhost' || hostname === '127.0.0.1';
    const isBackendOrigin = !isFile && String(window.location.port || '') === '5000';

    const normalize = (value) => String(value || '').trim().replace(/\/+$/, '');

    const configuredApi = normalize(window.__API_PREFIX__);
    const apiPrefix = configuredApi || (isLocalHost && !isBackendOrigin ? defaultBackend : '');
    window.__API_PREFIX__ = apiPrefix;
    // Compatibility alias for older scripts.
    window.API_BASE = apiPrefix;

    const configuredSocket = normalize(window.__SOCKET_ENDPOINT__);
    window.__SOCKET_ENDPOINT__ = configuredSocket || (isLocalHost ? defaultBackend : defaultSocket);

    // Helper for API URLs (only rewrites /api paths).
    window.apiUrl = function (path) {
        if (!path) return apiPrefix;
        if (/^https?:\/\//i.test(path)) return path;
        if (!apiPrefix) return path;
        if (path === '/api' || path.startsWith('/api/')) return apiPrefix + path;
        return path;
    };

    // Patch fetch to auto-prefix /api calls when running the frontend separately.
    if (!window.__annasetuFetchPatched && typeof window.fetch === 'function') {
        const origFetch = window.fetch.bind(window);
        window.fetch = function (resource, init) {
            if (typeof resource === 'string') {
                resource = window.apiUrl(resource);
            }
            return origFetch(resource, init);
        };
        window.__annasetuFetchPatched = true;
    }
})();

// Note: If you host the frontend on Vercel, keep `__API_PREFIX__` empty and
// update `project/annasetu/annasetu_clients/vercel.json` `rewrites.destination`
// to point to your Render backend domain. Socket connections should point
// directly to Render (set __SOCKET_ENDPOINT__ to your Render URL).
