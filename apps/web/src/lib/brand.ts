/**
 * The product name and logo, in one place. Set these in apps/web/.env (and in Cloudflare Pages):
 *   VITE_BRAND_NAME=Recallo
 *   VITE_LOGO_URL=/brand/logo.svg        (put the file in apps/web/public/brand/)
 *   VITE_LOGO_INCLUDES_NAME=true         (when the logo already shows the name, the text is hidden)
 */
export const BRAND = (import.meta.env.VITE_BRAND_NAME as string | undefined)?.trim() || "Revenue Recovery";

export const LOGO_URL = (import.meta.env.VITE_LOGO_URL as string | undefined)?.trim() || null;

export const LOGO_INCLUDES_NAME = (import.meta.env.VITE_LOGO_INCLUDES_NAME as string | undefined)?.trim() === "true";
