// URL handles are plain Latin (a-z, 0-9, dashes) so they stay readable in links, sitemaps and
// ad-catalogue feeds. Arabic names are spelled out in Latin letters rather than dropped -- a
// product imported with an Arabic title used to get the address "/product/-" -- and accented
// letters lose their accent (é -> e). No imports, so the admin's client components can use it too.
const ARABIC_LATIN: Record<string, string> = {
  'ا': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'th', 'ر': 'r',
  'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f',
  'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'a',
  'پ': 'p', 'چ': 'ch', 'ژ': 'zh', 'گ': 'g', 'ک': 'k', 'ی': 'y',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '،': ' ', '؛': ' ', '؟': ' ',
}

export function slugify(input: string) {
  return input
    // NFKD splits accents and hamza marks off their letters (é -> e + ´, أ -> ا + hamza) so the
    // marks, Arabic short vowels and the tatweel stretch can be dropped in one pass.
    .normalize('NFKD').replace(/[̀-ͯؐ-ؚـً-ٰٟ]/g, '')
    .replace(/[؀-ۿ]/g, ch => ARABIC_LATIN[ch] ?? '')
    .toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}
