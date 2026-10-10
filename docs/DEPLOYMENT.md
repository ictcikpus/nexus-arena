# Deployment from GitHub — no local game testing

## Before starting

- GitHub account
- Render account
- A browser; no local Node.js install is required to deploy

## Repository upload

1. Create repository `nexus-arena` on GitHub and add README.
2. Start GitHub Codespaces for the repository.
3. Upload `nexus-arena.zip` into the Codespaces explorer.
4. Run in its terminal:

```bash
unzip nexus-arena.zip -d /tmp/nexus-arena
cp -a /tmp/nexus-arena/. .
rm -rf /tmp/nexus-arena
rm -f nexus-arena.zip
git add .
git commit -m "Add NEXUS ARENA source"
git push
```

Do not run the game or install packages locally; these commands only place source files in GitHub. Stop Codespaces after pushing.

## Render Blueprint

1. Open Render → New → Blueprint.
2. Connect GitHub and select `nexus-arena`.
3. Review the two services defined in `render.yaml`.
4. Apply Blueprint with Free plans where offered.
5. Wait for each cloud deployment to report Live.
6. Open server `/health`; expected JSON: `{"ok":true,"service":"nexus-arena-server"}`.
7. If the server host differs from `https://nexus-arena-server.onrender.com`, update `VITE_SERVER_URL` on the static site and redeploy it.
8. Open the frontend URL and create a private room to invite a friend.

## Public endpoints

- Frontend: Render Static Site URL from dashboard.
- Backend: Render Web Service URL from dashboard.
- Health: `<backend-url>/health`.
- WebSocket connection: managed by the Colyseus client SDK using the backend HTTPS origin.

## Free tier caveats

The first connection can be delayed when a free service is sleeping. Plan availability and quotas may change. No guaranteed uptime, persistent match state, or database is included.
