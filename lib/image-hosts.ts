// The hosts the storefront's image proxy (app/api/image-proxy) will fetch from. A fixed list: the
// store's own host, Google Drive, Dropbox and Unsplash. Any other host is refused, so the proxy cannot
// be used to fetch arbitrary images through the store. Subdomains of a listed host are allowed.
// To add a host, add it here and deploy.
export const PROXY_IMAGE_HOSTS = ['drive.google.com', 'dropbox.com', 'dl.dropboxusercontent.com', 'images.unsplash.com'] as const

export function imageHostAllowed(hostname: string, ownHost: string) {
  const host = hostname.toLowerCase()
  if (host === ownHost.toLowerCase()) return true
  return PROXY_IMAGE_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`))
}
