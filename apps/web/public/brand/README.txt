Put your logo here, for example logo.svg (best) or logo.png (at least 144px high).

Then add to apps/web/.env (and to Cloudflare Pages > Settings > Environment variables):
  VITE_LOGO_URL=/brand/logo.svg
  VITE_LOGO_INCLUDES_NAME=true    <- only if the logo already shows the product name
and restart npm run dev. Until then the built-in mark is shown.
For the browser tab icon, replace apps/web/public/favicon.svg.
