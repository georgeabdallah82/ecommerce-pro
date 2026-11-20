// Addresses that look like files but are none of the store's own: scanners trying /wp-login.php or /.env, a browser
// asking for /favicon.ico. proxy.ts answers them with a plain 404 at once. They used to get the store's 404 page,
// whose layout reads the theme and the settings from the database, so every probe woke the database (Neon's free plan
// counts the hours it is awake). Real files never reach the Worker (Cloudflare serves the static files first), and
// the store's own file-like routes are listed here. Only common file types count, so a product address that happens
// to end in something like ".5l" still reaches its page.
export const FILE_ROUTES = new Set(['/robots.txt', '/sitemap.xml', '/manifest.webmanifest', '/feeds/products.xml', '/.well-known/appspecific/com.chrome.devtools.json'])

const PROBE_EXTENSION = /\.(php\d?|phtml|aspx?|ashx|asmx|jspx?|do|action|cgi|pl|py|rb|sh|bash|env|ini|conf|cfg|config|log|sql|sqlite|db|bak|backup|old|orig|save|swp|tmp|zip|gz|tgz|tar|rar|7z|ya?ml|toml|xml|txt|json|js|mjs|map|css|ico|png|jpe?g|gif|svg|webp|avif|bmp|tiff?|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|pdf|csv|xlsx?|docx?|html?|md|lock|pem|key|crt|htaccess|htpasswd|ds_store)$/i

export function isFileProbe(pathname: string) {
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/') || FILE_ROUTES.has(pathname)) return false
  return PROBE_EXTENSION.test(pathname)
}
