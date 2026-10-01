import { redirect } from 'next/navigation'

// The homepage announcement bar and trust strip that used to be edited here are theme-studio
// sections now (see lib/home-strips.ts), alongside every other homepage section.
export default function Content() {
  redirect('/admin/online-store/theme-editor')
}
