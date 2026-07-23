import { installAddon, loadInstalled } from "@/lib/addon-store";
import { IS_ADMIN } from "@/lib/build-info";

// The managed addon set: the admin's streaming addons (Torrentio + debrid, etc.)
// that every family member's app installs automatically after unlocking with a
// code. The payload is what gets encrypted into the vault (see vault.ts).

export type AddonEntry = { id: string; transportUrl: string };
export type ManagedPayload = { addons: AddonEntry[] };

const APPLIED_KEY = "abadiosa.managed.applied.v1";
const VAULTKEY_KEY = "abadiosa.managed.vaultkey.v1"; // admin device only

// Admin side: capture the currently-installed addons to bake into the config.
export function exportInstalledAddons(): ManagedPayload {
  const addons = loadInstalled()
    .filter((a) => a.transportUrl)
    .map((a) => ({ id: a.id, transportUrl: a.transportUrl }));
  return { addons };
}

// Production side: install the admin's addons on this device, and record that a
// managed set is active so the addon editor can lock itself.
export async function applyManaged(payload: ManagedPayload): Promise<void> {
  for (const a of payload.addons) {
    try {
      await installAddon(a.id, a.transportUrl);
    } catch {
      /* one bad addon shouldn't block the rest */
    }
  }
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
