import { userAddons, withDebridKeys, type Addon, type DebridKeySet } from "@/lib/addons";
import {
  fetchInstalledAddons,
  filterEnabled,
  installAddon,
  loadInstalled,
} from "@/lib/addon-store";
import { IS_ADMIN } from "@/lib/build-info";

// The managed addon set: the admin's streaming addons (Torrentio + debrid, etc.)
// that every family member's app installs automatically after unlocking with a
// code. The payload is what gets encrypted into the vault (see vault.ts).

export type AddonEntry = { id: string; transportUrl: string };
export type ManagedPayload = { addons: AddonEntry[] };

const APPLIED_KEY = "abadiosa.managed.applied.v1";
const VAULTKEY_KEY = "abadiosa.managed.vaultkey.v1"; // admin device only

// Admin side: capture the admin's full addon set to bake into the config. Most
// addons live in the Stremio account (synced), not the local store, so we pull
// the account collection + the local list the same way the picker does, and
// inject the admin's debrid keys so the streaming addons carry them.
export async function exportInstalledAddons(
  authKey: string | null,
  debridKeys: DebridKeySet,
): Promise<ManagedPayload> {
  const [account, installed] = await Promise.all([
    authKey ? userAddons(authKey).catch(() => [] as Addon[]) : Promise.resolve([] as Addon[]),
    fetchInstalledAddons().catch(() => [] as Addon[]),
  ]);
  const local: Addon[] = filterEnabled(loadInstalled()).map((e) => ({
    manifest: e.manifest ?? ({ id: e.id } as Addon["manifest"]),
    transportUrl: e.transportUrl,
  }));
  const seen = new Set<string>();
  const merged: Addon[] = [];
  for (const a of [...filterEnabled(account), ...filterEnabled(installed), ...local]) {
    if (!a.transportUrl || seen.has(a.transportUrl)) continue;
    seen.add(a.transportUrl);
    merged.push(a);
  }
  const withKeys = withDebridKeys(merged, debridKeys);
  const addons = withKeys
    .filter((a) => a.transportUrl)
    .map((a) => ({ id: a.manifest?.id ?? a.transportUrl, transportUrl: a.transportUrl }));
  return { addons };
}

// Production side: install the admin's addons on this device, and record that a
// managed set is active so the addon editor can lock itself. Installs run in
// parallel so unlocking with a big addon set stays fast, and a single bad addon
// never blocks the rest.
export async function applyManaged(payload: ManagedPayload): Promise<void> {
  await Promise.allSettled(payload.addons.map((a) => installAddon(a.id, a.transportUrl)));
  try {
    localStorage.setItem(APPLIED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

// Whether this device is running an admin-managed addon set (→ lock editing).
export function managedActive(): boolean {
  try {
    return !!localStorage.getItem(APPLIED_KEY);
  } catch {
    return false;
  }
}

// On the production app, once a managed set is active, only the admin may change
// addons — family members get a read-only, admin-curated list. The admin build
// is never locked.
export function addonsLocked(): boolean {
  return !IS_ADMIN && managedActive();
}

// The admin keeps the vault key on their device so they can wrap it for new codes
// after the initial export, without re-encrypting everything.
export function saveAdminVaultKey(keyB64: string): void {
  try {
    localStorage.setItem(VAULTKEY_KEY, keyB64);
  } catch {
    /* ignore */
  }
}

export function loadAdminVaultKey(): string | null {
  try {
    return localStorage.getItem(VAULTKEY_KEY);
  } catch {
    return null;
  }
}
