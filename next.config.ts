import type { NextConfig } from "next"
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare"

// Security headers (nosniff, Referrer-Policy, Permissions-Policy, HSTS, X-Frame-Options) are set
// once, by proxy.ts (lib/security-headers.ts): setting them here as well sent each one twice.
const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  // node-postgres (lib/prisma.ts uses it for non-Neon databases: local development and CI) loads
  // pg-cloudflare under workerd, but file tracing only copies that package's Node stub, so the
  // Cloudflare build couldn't resolve it. Ship the whole package.
  outputFileTracingIncludes: { '/*': ['./node_modules/pg-cloudflare/**/*'] },
  poweredByHeader: false,
}

initOpenNextCloudflareForDev()

export default nextConfig
