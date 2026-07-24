// Encrypted "managed config" vault for the production app. The admin's streaming
// setup (Torrentio + debrid, i.e. a URL that carries the debrid API key) must
// reach family members' devices without being readable by the whole public
// internet. So the config is AES-GCM encrypted under a random vault key, and that
// vault key is separately wrapped for each access code (a keybag): only someone
// holding a valid code can unwrap it and decrypt the config. Removing a person's
// slot revokes them. All primitives are WebCrypto, available in any HTTPS page.

const KDF_ITERATIONS = 150_000;

// Byte helpers that always produce ArrayBuffer-backed views, which is what the
// WebCrypto BufferSource type expects.
type Bytes = Uint8Array<ArrayBuffer>;

function b64(bytes: Bytes): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function ub64(text: string): Bytes {
  const bin = atob(text);
  const out = new Uint8Array(new ArrayBuffer(bin.length)) as Bytes;
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function enc(s: string): Bytes {
  const src = new TextEncoder().encode(s);
  const out = new Uint8Array(new ArrayBuffer(src.length)) as Bytes;
  out.set(src);
  return out;
}

function randomBytes(n: number): Bytes {
  const b = new Uint8Array(new ArrayBuffer(n)) as Bytes;
  crypto.getRandomValues(b);
  return b;
}

// Derive an AES-GCM key from an access code, salted per slot. This is the key
// that wraps/unwraps the vault key for one person.
async function deriveWrapKey(code: string, salt: Bytes): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc(code.trim()), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: KDF_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export type VaultBlob = { ct: string; iv: string };
export type Slot = {
  name: string;
  hash: string;
  salt: string;
  iv: string;
  wrapped: string;
  /** Optional expiry (epoch ms) for a temporary account. Omitted = permanent. */
  exp?: number;
};
export type ManagedConfig = { v: 1; vault: VaultBlob; slots: Slot[] };

// --- Admin side: build the vault + wrap the key for a code ---------------------

export async function makeVaultKey(): Promise<Bytes> {
  return randomBytes(32);
}

// The admin persists the vault key (base64) on their device so they can wrap it
// for new codes later without re-encrypting the whole config.
export function keyToB64(k: Bytes): string {
  return b64(k);
}
export function keyFromB64(s: string): Bytes {
  return ub64(s);
}

export async function encryptConfig(config: unknown, vaultKeyRaw: Bytes): Promise<VaultBlob> {
  const key = await crypto.subtle.importKey("raw", vaultKeyRaw, "AES-GCM", false, ["encrypt"]);
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc(JSON.stringify(config)));
  return { ct: b64(new Uint8Array(ct) as Bytes), iv: b64(iv) };
}

export async function wrapForCode(
  vaultKeyRaw: Bytes,
  name: string,
  code: string,
  hash: string,
): Promise<Slot> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrapKey = await deriveWrapKey(code, salt);
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, vaultKeyRaw);
  return {
    name,
    hash,
    salt: b64(salt),
    iv: b64(iv),
    wrapped: b64(new Uint8Array(wrapped) as Bytes),
  };
}

// --- Production side: unwrap with a code, then decrypt the config --------------

export async function unwrapVaultKey(code: string, slot: Slot): Promise<Bytes | null> {
  try {
    const wrapKey = await deriveWrapKey(code, ub64(slot.salt));
    const raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ub64(slot.iv) },
      wrapKey,
      ub64(slot.wrapped),
    );
    return new Uint8Array(raw) as Bytes;
  } catch {
    return null;
  }
}

export async function decryptConfig<T = unknown>(
  vault: VaultBlob,
  vaultKeyRaw: Bytes,
): Promise<T | null> {
  try {
    const key = await crypto.subtle.importKey("raw", vaultKeyRaw, "AES-GCM", false, ["decrypt"]);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ub64(vault.iv) },
      key,
      ub64(vault.ct),
    );
    return JSON.parse(new TextDecoder().decode(pt)) as T;
  } catch {
    return null;
  }
}
