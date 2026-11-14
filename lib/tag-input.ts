// Tags typed in a tag box (Admin > Online store > Blog): Enter or a comma adds them, and whatever is still typed
// when the post is saved is added too (it used to be dropped without a word). Duplicates are left out.
export function withTyped(tags: string[], typed: string): string[] {
  const next = [...tags]
  for (const tag of typed.split(',').map(t => t.trim()).filter(Boolean)) if (!next.includes(tag)) next.push(tag)
  return next
}
