import { useEffect, useState } from "react";
import {
  fetchInstalledAddons,
  fetchManifestAt,
  filterEnabled,
  loadInstalled,
} from "@/lib/addon-store";
import { torrentioAddonFor, userAddons, withDebridKeys, type Addon } from "@/lib/addons";
import { resolveAddonAuthKey } from "@/lib/access/managed";
import { applyOrderToItems, loadDisplayOrder } from "@/lib/addons-store/reorder";
import { withTimeout } from "@/lib/progressive-rows";
import type { useSettings } from "@/lib/settings";

type Settings = ReturnType<typeof useSettings>["settings"];
const ADDON_DISCOVERY_TIMEOUT_MS = 10_000;

function savedAddons(): Addon[] {
  return filterEnabled(loadInstalled()).flatMap((entry) =>
    entry.manifest ? [{ manifest: entry.manifest, transportUrl: entry.transportUrl }] : [],
  );
}

function hasAnyResources(a: Addon): boolean {
  return (a.manifest.resources ?? []).length > 0;
}

function declaresStream(a: Addon): boolean {
  return (a.manifest.resources ?? []).some((r) =>
    typeof r === "string" ? r === "stream" : r.name === "stream",
  );
}

async function resolveManifests(addons: Addon[]): Promise<Addon[]> {
  return Promise.all(
    addons.map(async (a) => {
      if (hasAnyResources(a)) return a;
      const manifest = await withTimeout(
        fetchManifestAt(a.transportUrl),
        ADDON_DISCOVERY_TIMEOUT_MS,
      ).catch(() => null);
      return manifest ? { ...a, manifest } : a;
    }),
  );
}

export function useAddons(
  authKey: string | null,
  settings: Settings,
): {
  addons: Addon[];
  discovering: boolean;
  userHasStreamAddons: boolean;
} {
  const [addons, setAddons] = useState<Addon[]>(() => savedAddons());
  const [discovering, setDiscovering] = useState(true);
  const [userHasStreamAddons, setUserHasStreamAddons] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const debridKeys = {
      rdKey: settings.rdKey,
      tbKey: settings.tbKey,
      adKey: settings.adKey,
      pmKey: settings.pmKey,
      dlKey: settings.dlKey,
    };
    const anyDebridKey = Object.values(debridKeys).some((k) => !!k?.trim());
    void Promise.resolve().then(() => {
      if (!cancelled) setDiscovering(true);
    });
    (async () => {
      // On a managed device this resolves to the admin's account, so their
      // curated addon set reaches every family member live.
      const addonKey = resolveAddonAuthKey(authKey);
      const [stremioResult, installedResult] = await Promise.all([
        addonKey
          ? withTimeout(userAddons(addonKey), ADDON_DISCOVERY_TIMEOUT_MS).catch(() => [] as Addon[])
          : Promise.resolve([] as Addon[]),
        withTimeout(fetchInstalledAddons(), ADDON_DISCOVERY_TIMEOUT_MS).catch(() => []),
      ]);
      const stremioAddons = filterEnabled(stremioResult);
      const installed = filterEnabled([...savedAddons(), ...installedResult]);
      if (cancelled) return;
      const merged: Addon[] = [];
      const idxByUrl = new Map<string, number>();
      for (const a of [...stremioAddons, ...installed]) {
        const existingIdx = idxByUrl.get(a.transportUrl);
        if (existingIdx === undefined) {
          idxByUrl.set(a.transportUrl, merged.length);
          merged.push(a);
          continue;
        }
        if (!hasAnyResources(merged[existingIdx]) && hasAnyResources(a)) {
          merged[existingIdx] = a;
        }
      }
      const resolved = await resolveManifests(merged);
      if (cancelled) return;
      merged.length = 0;
      merged.push(...resolved);
      const savedOrder = loadDisplayOrder();
      if (savedOrder.length > 0) {
        const ordered = applyOrderToItems(merged, savedOrder);
        merged.length = 0;
        merged.push(...ordered);
      }
      const userStreamCount = merged.filter(declaresStream).length;
      setUserHasStreamAddons(userStreamCount > 0);
      const list = withDebridKeys(merged, debridKeys);
      // Drop the retired official TorBox addon (stremio.torbox.app no longer
      // resolves) so a stale saved copy doesn't produce dead sources.
      for (let i = list.length - 1; i >= 0; i--) {
        const a = list[i];
        if (
          a.manifest.id === "app.torbox.stremio" ||
          a.transportUrl?.includes("stremio.torbox.app")
        ) {
          list.splice(i, 1);
        }
      }
      // When the user has a debrid key but no stream addon that already carries
      // it, auto-add Torrentio configured with their keys. Torrentio returns
      // direct debrid links, which play in the browser; a raw-torrent addon
      // would not. This removes the need for any external setup site.
      const hasConfiguredStreamAddon = list.some(
        (a) =>
          declaresStream(a) && /torrentio\.strem\.fun\/[^/]+\/manifest/.test(a.transportUrl ?? ""),
      );
      if (anyDebridKey && !hasConfiguredStreamAddon) {
        const torrentio = torrentioAddonFor(debridKeys);
        list.push(torrentio);
      }
      setAddons(list);
    })().finally(() => {
      if (!cancelled) setDiscovering(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authKey, settings.rdKey, settings.tbKey, settings.adKey, settings.pmKey, settings.dlKey]);

  return { addons, discovering, userHasStreamAddons };
}
