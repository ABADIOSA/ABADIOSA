export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

export const IS_BETA_BUILD: boolean =
  typeof __IS_BETA_BUILD__ !== "undefined" ? __IS_BETA_BUILD__ : true;

// Release channel. The production build (family/friends, served at the site root)
// is compiled with HARBOR_CHANNEL="stable"; the admin/canary build (the owner's
// bleeding-edge app, served under /admin/) is anything else. IS_ADMIN gates
// experimental or half-finished work so it never reaches the stable channel.
export const IS_ADMIN: boolean = IS_BETA_BUILD;
export const CHANNEL: "stable" | "admin" = IS_ADMIN ? "admin" : "stable";
