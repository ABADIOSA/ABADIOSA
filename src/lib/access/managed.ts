import { userAddons, withDebridKeys, type Addon, type DebridKeySet } from "@/lib/addons";
import {
  fetchInstalledAddons,
  filterEnabled,
  installAddon,
  loadInstalled,
} from "@/lib/addon-store";
import { IS_ADMIN } from "@/lib/build-info";

// The managed configuration: the admin's streaming setup that every family
// member's app picks up after unlocking with a code.
//
// It carries a *live link* — the admin's Stremio auth key — so the family app
// reads the admin's addon collection straight from their account on every
// launch. Adding or removing an addon in the admin's Stremio account therefore
// reaches everyone immediately: no re-export, no redeploy, no new codes. The
// `addons` snapshot is only a fallback for when the account can't be reached.
//
// The key is used to READ THE ADDON COLLECTION ONLY. Family members are never
// signed in as the admin, so their library and watch history stay their own —
// and the admin's email/password are never shown anywhere in their app.

export type AddonEntry = { id: string; transportUrl: string };
export type ManagedPayload = {
  addons: AddonEntry[];
  /** Admin's Stremio auth key — live addon source. */
  stremioAuthKey?: string;
};

const APPLIED_KEY = "abadiosa.managed.applied.v1";
const PAYLOAD_KEY = "abadiosa.managed.payload.v1";
const VAULTKEY_KEY = "abadiosa.managed.vaultkey.v1"; // admin device only

// Admin side: capture the admin's addon set plus the live account link. Most
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
  return { addons, stremioAuthKey: authKey ?? undefined };
}

// Production side: remember the decrypted config for later launches, install the
// snapshot so the device works immediately, and record that a managed set is
// active so the addon editor can lock itself. Installs run in parallel so
// unlocking with a big addon set stays fast, and one bad addon never blocks the
// rest.
export async function applyManaged(payload: ManagedPayload): Promise<void> {
  savePayload(payload);
  await Promise.allSettled(payload.addons.map((a) => installAddon(a.id, a.transportUrl)));
  try {
    localStorage.setItem(APPLIED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function savePayload(p: ManagedPayload): void {
  try {
    localStorage.setItem(PAYLOAD_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function loadPayload(): ManagedPayload | null {
  try {
    const raw = localStorage.getItem(PAYLOAD_KEY);
    return raw ? (JSON.parse(raw) as ManagedPayload) : null;
  } catch {
    return null;
  }
}

export function clearManaged(): void {
  try {
    localStorage.removeItem(PAYLOAD_KEY);
    localStorage.removeItem(APPLIED_KEY);
  } catch {
    /* ignore */
  }
}

// The addon collection to read from. On a managed device this is always the
// admin's account, so the admin stays the single curator even if the family
// member signs into their own Stremio account for their personal library.
export function resolveAddonAuthKey(userAuthKey: string | null): string | null {
  if (IS_ADMIN) return userAuthKey;
  return loadPayload()?.stremioAuthKey ?? userAuthKey;
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
