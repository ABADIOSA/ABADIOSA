import { CHANNEL, APP_VERSION } from "@/lib/build-info";
import { recordError, type LoggedError } from "./error-log";
import { reportError } from "./report";

// The single entry point the error handlers call. It always keeps the full
// technical detail (stack) for diagnosis even when the on-screen message shown
// to family/friends is deliberately softened, records it to the local ring
// buffer, and — if a report endpoint is configured — sends it onward.
export function captureError(input: {
  kind: LoggedError["kind"];
  code: string;
  message: string;
  detail?: string;
}): void {
  const logged = recordError({
    kind: input.kind,
    code: input.code,
    message: input.message,
    detail: input.detail,
    channel: CHANNEL,
    version: APP_VERSION,
    url: typeof window !== "undefined" ? window.location.href : "",
  });
  if (logged) reportError(logged);
}
