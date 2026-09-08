import type { NextConfig } from "next"
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare"

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", ".prisma/client", "pg"],
}

initOpenNextCloudflareForDev()

export default nextConfig
