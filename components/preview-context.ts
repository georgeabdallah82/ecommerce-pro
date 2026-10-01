'use client'

import { createContext } from 'react'

// Set by the theme editor's preview frame (components/theme-preview-frame.tsx) around
// everything it renders. Storefront components that have side effects a merchant
// shouldn't trigger while editing (e.g. the newsletter signup form) read it to switch
// themselves off, and StorefrontSections uses it to turn on click-to-select.
export const StorefrontPreviewContext = createContext<{ selectedId?: string; onSelect?: (id: string) => void } | null>(null)
