import { useEffect } from "react";
import { loadPayload, managedActive } from "@/lib/access/managed";
import { useSettings } from "@/lib/settings";

// The household's service keys (TMDB, debrid, AI, artwork providers) are paid
// for and managed by the admin, so a managed device applies whatever the vault
// carries. Runs on every launch, not just on unlock, so republishing the config
// with a rotated key updates everyone the next time they open the app.
export function ManagedKeysMount() {
  const { settings, update } = useSettings();

  useEffect(() => {
    if (!managedActive()) return;
    const shared = loadPayload()?.sharedKeys;
    if (!shared) return;
    const patch: Record<string, string> = {};
    for (const [field, value] of Object.entries(shared)) {
      if (!value) continue;
      if ((settings as unknown as Record<string, unknown>)[field] !== value) patch[field] = value;
    }
    if (Object.keys(patch).length > 0) update(patch);
  }, [settings, update]);

  return null;
}
