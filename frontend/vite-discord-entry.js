// Serve the Discord shell at `/` for an Activity launch (ADR-0022, plan
// decision 7). A Discord URL mapping appends the request path to its target,
// so the app maps `/` → the bare host (never `host/discord.html`, which would
// send `/api/...` and `/assets/...` to `/discord.html/api/...`). Discord then
// loads the Activity at `/?instance_id=…&frame_id=…`; the SDK can't run
// without `frame_id`, so its presence marks a launch. Everything else — the
// web app's `/`, the API, assets — is untouched.
export function discordLaunchRewrite(req, _res, next) {
  const [path, query = ''] = req.url.split('?')
  if (path === '/' && new URLSearchParams(query).has('frame_id')) req.url = `/discord.html?${query}`
  next()
}

export function discordEntry() {
  const install = (server) => {
    server.middlewares.use(discordLaunchRewrite)
  }
  return { name: 'discord-entry', configureServer: install, configurePreviewServer: install }
}
