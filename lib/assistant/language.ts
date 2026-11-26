// Which language a shopper wrote in, so the assistant answers in kind. Arabic letters mean Arabic;
// Lebanese Arabic typed in Latin letters with numbers for sounds ("baddi", "3andkon", "shu fi") is
// "arabizi" (the answer is in Lebanese Arabic, in Latin letters); anything else is English.

export type ChatLang = 'en' | 'ar' | 'arabizi'

const ARABIC_LETTER = /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/g
// Common Lebanese words written in Latin letters, and the numbers that stand for Arabic sounds
// inside a word (3 = ain, 7 = haa, 2 = hamza, 5 = khaa).
const ARABIZI_WORDS = new Set(['baddi', 'badde', 'bade', 'badi', 'shu', 'shou', 'chu', 'fi', 'fee', 'kifak', 'kifik', 'kifkon', 'marhaba', 'mar7aba', 'ahla', 'ya3ne', 'ya3ni', 'yaane', 'kteer', 'ktir', 'shi', 'chi', 'hayda', 'hayde', 'haydi', 'w', 'aw', 'la2', 'eh', 'ma', 'mish', 'mesh', 'kam', 'adde', 'addesh', 'adesh', 'qaddesh', 'wen', 'wein', 'ween', 'emta', 'aymta', 'leh', 'lesh', 'leish', 'heik', 'hek', 'tayeb', 'tab', 'yalla', 'habibi', 'habibti', 'shukran', 'merci', 'ta3', 'ta3oul', 'jib', 'jible', 'beddi', 'mnih', 'mni7', 'sa3er', 'se3er', 'tawsil', 'tawseel', 'delivery', 'talab', 'talabiye', 'talabeye'])
// Everyday English words: one Lebanese word in an otherwise English sentence keeps it English.
const ENGLISH_WORDS = new Set(['the', 'a', 'an', 'i', 'you', 'do', 'does', 'is', 'are', 'for', 'my', 'have', 'has', 'what', 'want', 'in', 'of', 'to', 'and', 'can', 'how', 'it', 'me', 'this', 'that', 'with', 'on', 'any', 'your', 'under', 'need', 'looking', 'please', 'there', 'where', 'when', 'which', 'order', 'price'])
const SOUND_NUMBER_IN_WORD = /\b[a-z]+[23579][a-z]*\b|\b[23579][a-z]{2,}\b/i

export function detectLanguage(text: string): ChatLang {
  const value = String(text || '')
  const arabic = (value.match(ARABIC_LETTER) || []).length
  const latin = (value.match(/[a-z]/gi) || []).length
  // Arabic letters mean Arabic, even with an English product name in the middle.
  if (arabic >= 2 && arabic * 5 >= latin) return 'ar'
  if (arabic > 0 && arabic >= latin / 3) return 'ar'
  const words = value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  if (!words.length) return 'en'
  // "w" and "ma" alone are too common in English typos; they count only with another sign.
  const strong = words.filter(w => ARABIZI_WORDS.has(w) && !['w', 'ma', 'eh', 'delivery', 'merci', 'tab', 'aw'].includes(w)).length
  const numbered = words.filter(w => SOUND_NUMBER_IN_WORD.test(w)).length
  const english = words.filter(w => ENGLISH_WORDS.has(w)).length
  if (strong >= 2 || (strong >= 1 && numbered >= 1) || numbered >= 2 || ((strong >= 1 || numbered >= 1) && (words.length <= 3 || english === 0))) return 'arabizi'
  return 'en'
}

// The language the store's own texts (product names, cards, buttons) are shown in for this answer.
export const pageLang = (lang: ChatLang): 'en' | 'ar' => (lang === 'ar' ? 'ar' : 'en')
