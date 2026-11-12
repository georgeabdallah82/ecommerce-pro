// A collection's picture for the collections page, the menus and its own banner: its own photo, else the first
// product photo, and never the stock placeholder. A seeded collection can carry /placeholder-product.svg as its
// image, which showed a grey box where a photo should be. null means "no photo": the page draws the department's
// glyph (components/department-glyph.tsx) or leaves the banner out. Any value a store already uses (a site path,
// an http(s) or data: URL) is kept as it is; only empty values and the placeholder are dropped.
export function realPhoto(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return value && !value.includes('placeholder-product') ? value : null
}

export function collectionPhoto(own: unknown, productPhotos: unknown[] = []): string | null {
  return realPhoto(own) ?? productPhotos.map(realPhoto).find((url): url is string => Boolean(url)) ?? null
}
