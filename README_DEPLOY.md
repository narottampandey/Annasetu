# Deployment Guide — Annasetu

This document explains how to deploy the frontend to Vercel and the backend to Render.

Overview
- Frontend: `project/annasetu/annasetu_clients` — static HTML/JS/CSS → deploy to Vercel
- Backend: `project/annasetu/annasetu_servers` — Node/Express → deploy to Render

Quick summary
1. Deploy backend on Render using the `annasetu_servers` folder.
2. Deploy frontend on Vercel using the `annasetu_clients` folder and update `vercel.json` rewrite destination.
3. Configure environment variables on Render (MongoDB URI, JWT secret, email creds, etc.).
4. (Optional) Add `env.js` to the frontend to configure `__SOCKET_ENDPOINT__` if you want socket connections to target Render directly.

Backend (Render)
- Create a new Web Service on Render and connect your Git repo.
- Set the "Root Directory" (if Render asks) to `project/annasetu/annasetu_servers`.
- Build Command: `npm install`
- Start Command: `npm start` (package.json already has `start: node server.js`).

Required environment variables (examples)
- `MONGODB_URI` — your MongoDB connection string
- `JWT_SECRET` — secret for signing JWTs
- `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASS` — email config if used
- `SERVE_STATIC` — set to `false` (recommended) so the backend does not serve the frontend in production
- `ALLOWED_ORIGINS` — comma-separated list of allowed origins (e.g., `https://your-frontend.vercel.app`)

A sample Render manifest has been added at `annasetu_servers/render.yaml`. Update the placeholder values before use.

Frontend (Vercel)
- Import the repository into Vercel.
- Set the project root to `project/annasetu/annasetu_clients`.
- Framework: Static (no build required) — Vercel will serve the files.
- Open `project/annasetu/annasetu_clients/vercel.json` and replace `RENDER_SERVICE.onrender.com` with your Render backend domain (e.g., `annasetu-backend.onrender.com`).
  - This `vercel.json` contains a rewrite so requests made to `/api/*` on the frontend are proxied to your backend on Render.

Socket.io / WebSockets
- Vercel rewrites do not reliably proxy WebSocket connections. To enable real-time notifications via Socket.IO when frontend is hosted on Vercel, do one of the following:
  - Add a small runtime script `env.js` (copy `env-sample.js` to `env.js`) and set `window.__SOCKET_ENDPOINT__ = 'https://<your-render-url>'`.
  - Include `<script src="/env.js"></script>` in your HTML pages before `js/common-utils.js` so the client uses the Render socket endpoint.

Files added/changed
- `project/annasetu/annasetu_clients/vercel.json` — Vercel rewrites (update the destination placeholder)
- `project/annasetu/annasetu_clients/env-sample.js` — sample runtime config for socket endpoint
- `project/annasetu/annasetu_servers/render.yaml` — sample Render manifest (update secrets)
- `project/annasetu/README_DEPLOY.md` — this file
- Multiple frontend files updated to use relative `/api` paths so Vercel rewrite can proxy API calls.
- Backend `app.js` updated to respect `ALLOWED_ORIGINS` and `SERVE_STATIC` env variables.

Runtime recommendations
- On Render set `SERVE_STATIC=false` so the backend does not serve the frontend directory.
- On Vercel edit `vercel.json` to point rewrites to your Render service domain.
- If you want to avoid editing `vercel.json`, instead edit client JS to call the full Render domain for API and sockets (not recommended — prefer rewrites).

Testing locally
- Backend: from `project/annasetu/annasetu_servers` run:

```bash
npm install
npm start
```

- Frontend: you can serve static files using a simple static server, or open `annasetu_clients/index.html` in browser. When running frontend locally, the client will connect to `http://localhost:5000` by default for sockets and `/api/*` requests will hit `localhost:5000` if you run the backend locally.

If you want, I can:
- Update `vercel.json` to reference a specific Render host if you provide it, or
- Add `env.js` and inject it into the HTML pages automatically.

*** End of guide ***
