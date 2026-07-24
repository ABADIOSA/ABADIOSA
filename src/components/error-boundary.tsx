import { Component, type ErrorInfo, type ReactNode } from "react";
import { IS_ADMIN } from "@/lib/build-info";
import { captureError } from "@/lib/admin/capture";
import { showHarborError } from "./error-view";

type State = { crashed: boolean };

export class HarborErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Always capture the full crash for the dashboard / crash feed, regardless
    // of channel, so the owner can diagnose it.
    captureError({
      kind: "crash",
      code: error.name || "Crash",
      message: error.message || "Render crash",
      detail: [
        `${error.name}: ${error.message}`,
        "",
        error.stack ?? "(no stack)",
        "",
        "Component stack:",
        info.componentStack ?? "(none)",
      ].join("\n"),
    });
    // Friends/family on the stable channel get a calm, recoverable message with
    // no stack trace; the admin/canary channel keeps the full technical detail
    // so the owner can actually diagnose the crash.
    showHarborError({
      fatal: true,
      code: error.name || "Crash",
      title: IS_ADMIN ? "Crash" : "Something went wrong",
      message: IS_ADMIN
        ? error.message ||
          "Something blew up while rendering. Reload to recover, or send us the technical detail."
        : "Something interrupted the app. Reload to pick up where you left off.",
      detail: IS_ADMIN
        ? [
            `${error.name}: ${error.message}`,
            "",
            error.stack ?? "(no stack)",
            "",
            "Component stack:",
            info.componentStack ?? "(none)",
          ].join("\n")
        : undefined,
    });
  }

  render() {
    if (this.state.crashed) return null;
    return this.props.children;
  }
}
