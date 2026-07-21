// ABADIOSA crash-report relay — a tiny Cloudflare Worker (free tier).
//
// The static site can't hold a GitHub token, so it POSTs crash reports here and
// this Worker (which holds the secret) opens/updates a GitHub issue and pings a
// notification webhook. That gives the owner a phone notification AND a feed the
// autonomous fixer can read via the GitHub API.
//
// Deploy (≈2 minutes, free):
//   1. https://dash.cloudflare.com → Workers & Pages → Create → paste this file.
//   2. Settings → Variables → add secrets:
//        GITHUB_TOKEN   a fine-grained PAT with Issues: read & write on the repo
//        GITHUB_REPO    ABADIOSA/abadiosa   (owner/repo that receives the issues)
//        ALLOW_ORIGIN   https://abadiosa.github.io
//        DISCORD_WEBHOOK (optional) your Discord webhook for phone notifications
//   3. Copy the Worker URL and set it as the build variable
//        VITE_ABADIOSA_REPORT_URL   in the GitHub Actions deploy of abadiosa.github.io.
//
// The owner watches the repo issues (GitHub mobile app) to get notified, and the
// autonomous fixer triages the "production-error" label.

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return new Response("POST only", { status: 405, headers: cors });

    let err;
    try {
      err = await request.json();
    } catch {
      return new Response("bad json", { status: 400, headers: cors });
    }

    const code = String(err.code || "Error").slice(0, 80);
    const message = String(err.message || "").slice(0, 300);
    const title = `[${err.channel || "?"}] ${code}: ${message}`.slice(0, 240);
    const repo = env.GITHUB_REPO;
    const gh = (path, init) =>
      fetch(`https://api.github.com/repos/${repo}/${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "abadiosa-relay",
          "Content-Type": "application/json",
        },
      });

    const bodyMd = [
      `**${err.kind || "error"}** on channel \`${err.channel}\` (v${err.version})`,
      `Device: \`${err.device || "?"}\` · ${err.at ? new Date(err.at).toISOString() : ""}`,
      `URL: ${err.url || "?"}`,
      "",
      "```",
      (err.detail || message).slice(0, 5000),
      "```",
      "",
      `UA: ${(err.userAgent || "").slice(0, 300)}`,
    ].join("\n");

    try {
      // De-duplicate: if an open issue with the same title exists, comment on it.
      const q = encodeURIComponent(`repo:${repo} is:issue is:open in:title ${code}`);
      const search = await fetch(`https://api.github.com/search/issues?q=${q}`, {
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "abadiosa-relay",
        },
      }).then((r) => r.json());
      const existing = (search.items || []).find((i) => i.title === title);

      if (existing) {
        await gh(`issues/${existing.number}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: `Seen again:\n\n${bodyMd}` }),
        });
      } else {
        await gh(`issues`, {
          method: "POST",
          body: JSON.stringify({ title, body: bodyMd, labels: ["production-error"] }),
        });
      }

      if (env.DISCORD_WEBHOOK) {
        await fetch(env.DISCORD_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: `🚨 ${title}` }),
        }).catch(() => {});
      }
    } catch {
      return new Response("relay error", { status: 502, headers: cors });
    }
    return new Response("ok", { status: 202, headers: cors });
  },
};
