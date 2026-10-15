'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'

// Links inside the admin. Next.js prefetches every link it sees on screen; in the admin that
// was about 48 background requests per page view (each menu item asked twice), and each one
// read the store settings from the database again, because signed-in staff skip the shared
// settings cache to see their own changes at once. Admin pages are always rendered fresh on
// click anyway, so the admin's links load when they are clicked; the bar at the top of the
// page (components/nav-progress.tsx) shows the click straight away.
export default function AdminLink({ prefetch = false, ...props }: ComponentProps<typeof Link>) {
  return <Link prefetch={prefetch} {...props} />
}
