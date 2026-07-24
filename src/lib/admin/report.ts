import type { LoggedError } from "./error-log";

// Optional crash reporting. When the build is compiled with a report endpoint
// (VITE_ABADIOSA_REPORT_URL — e.g. a Discord/Telegram webhook or a tiny relay
// that opens a GitHub issue), production errors are POSTed there so the owner is
// notified and the autonomous fixer can pick them up. With no endpoint set this
// is a no-op, so nothing secret is ever committed to the repo.

const ENDPOINT: string =
  (import.meta.env.VITE_ABADIOSA_REPORT_URL as string | undefined)?.trim() || "";

const DEVICE_KEY = "abadiosa.deviceid.v1";

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

export function reportingEnabled(): boolean {
  return ENDPOINT.length > 0;
}

// Cap how many reports we send per session so a broken build can't hammer the
// endpoint (or the owner's phone) with hundreds of notifications.
let sent = 0;
const SESSION_CAP = 12;

function summary(err: LoggedError, device: string): string {
  return (
    `🚨 ABADIOSA (${err.channel} v${err.version})\n` +
    `${err.kind} · ${err.code}\n` +
    `${err.message}\n` +
    `device ${device} · ${new Date(err.at).toISOString()}`
  );
}

// The reporter targets whatever endpoint the owner configured. It shapes the
// body for the two zero-infra options (a Discord or Telegram webhook, which give
// instant phone notifications) and otherwise sends the raw error JSON, which is
// what a custom relay (e.g. one that opens a GitHub issue for the autonomous
// fixer) expects.
export function reportError(err: LoggedError): void {
  if (!ENDPOINT || sent >= SESSION_CAP) return;
  sent += 1;
  const device = deviceId();

  let body: string;
  if (ENDPOINT.includes("discord.com/api/webhooks")) {
    body = JSON.stringify({ content: summary(err, device).slice(0, 1900) });
  } else if (ENDPOINT.includes("api.telegram.org")) {
    // Endpoint form: https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>
    body = JSON.stringify({ text: summary(err, device) });
  } else {
    body = JSON.stringify({
      ...err,
      device,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    });
  }

  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      mode: "cors",
    }).catch(() => {
      /* reporting is best-effort */
    });
  } catch {
    /* ignore */
  }
}
