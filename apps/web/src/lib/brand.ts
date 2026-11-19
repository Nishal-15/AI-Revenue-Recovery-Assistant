/**
 * The product name, in one place. Set VITE_BRAND_NAME in apps/web/.env (and in Cloudflare Pages) to rename
 * the whole website without touching code.
 */
export const BRAND = (import.meta.env.VITE_BRAND_NAME as string | undefined)?.trim() || "Revenue Recovery";
