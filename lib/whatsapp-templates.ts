// The three message templates the store creates once in WhatsApp Manager for the automatic order messages
// (lib/whatsapp-cloud.ts), and the words the store fills into them. Shared by the sender, the Settings card that
// shows the texts to copy (Settings › Email & messaging) and the guide (docs/whatsapp-messages-2026-11.md). No server
// imports: the Settings card is a client component.
export type WhatsAppUpdate = 'confirmed' | 'on_the_way' | 'delivered'
export const WHATSAPP_UPDATES: WhatsAppUpdate[] = ['confirmed', 'on_the_way', 'delivered']

// What each message is called on the order page and in Settings.
export const WHATSAPP_LABELS: Record<WhatsAppUpdate, string> = { confirmed: 'Order confirmed', on_the_way: 'Out for delivery', delivered: 'Delivered' }
export const SUGGESTED_TEMPLATE_NAMES: Record<WhatsAppUpdate, string> = { confirmed: 'order_confirmed', on_the_way: 'order_on_the_way', delivered: 'order_delivered' }

// The language a template was created in, exactly as WhatsApp Manager names it: a message is refused when the code
// differs. The store fills in its words in the same language.
export const WHATSAPP_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'en_US', label: 'English (US)' },
  { code: 'en_GB', label: 'English (UK)' },
  { code: 'ar', label: 'Arabic' },
]
export const isArabicTemplate = (language: string) => language === 'ar' || language.startsWith('ar_')

// {{1}} first name, {{2}} order number, then: confirmed {{3}} total and how it is paid, {{4}} the order's link;
// on the way {{3}} what to pay on delivery, {{4}} the order's link; delivered {{3}} the "rate your order" link.
// WhatsApp refuses a template that starts or ends with a value, so each ends with a few words.
const BODIES: Record<'en' | 'ar', Record<WhatsAppUpdate, string>> = {
  en: {
    confirmed: 'Hi {{1}}, your order #{{2}} is confirmed. We are preparing it now.\nTotal: {{3}}\nFollow your order: {{4}}\nThank you!',
    on_the_way: 'Hi {{1}}, your order #{{2}} is on its way! The driver will call you when they arrive.\nTo pay on delivery: {{3}}\nFollow your order: {{4}}\nThank you!',
    delivered: 'Hi {{1}}, your order #{{2}} has been delivered. We hope you love it!\nTell us how it went: {{3}}\nThank you for shopping with us.',
  },
  ar: {
    confirmed: 'مرحباً {{1}}، تم تأكيد طلبك رقم {{2}} ونحن نجهّزه الآن.\nالمجموع: {{3}}\nتابع طلبك: {{4}}\nشكراً لك!',
    on_the_way: 'مرحباً {{1}}، طلبك رقم {{2}} في الطريق إليك! سيتصل بك السائق عند الوصول.\nالمبلغ عند الاستلام: {{3}}\nتابع طلبك: {{4}}\nشكراً لك!',
    delivered: 'مرحباً {{1}}، تم تسليم طلبك رقم {{2}}. نتمنى أن ينال إعجابك!\nأخبرنا برأيك: {{3}}\nشكراً لتسوقك معنا.',
  },
}
export const templateBody = (kind: WhatsAppUpdate, language: string) => BODIES[isArabicTemplate(language) ? 'ar' : 'en'][kind]

// How many values each template takes: WhatsApp refuses a message whose count differs from the template's.
export const TEMPLATE_VALUE_COUNT: Record<WhatsAppUpdate, number> = { confirmed: 4, on_the_way: 4, delivered: 3 }

const WORDS = {
  en: { there: 'there', cashOnDelivery: '(cash on delivery)', paid: '(paid)', inCash: 'in cash', alreadyPaid: 'nothing, it is already paid' },
  ar: { there: 'عزيزي العميل', cashOnDelivery: '(الدفع عند الاستلام)', paid: '(مدفوع)', inCash: 'نقداً', alreadyPaid: 'لا شيء، الطلب مدفوع' },
}
export const templateWords = (language: string) => WORDS[isArabicTemplate(language) ? 'ar' : 'en']

// "Running low?" (lib/refill-reminders.ts): a Marketing template, sent some time after delivery to customers who asked
// for WhatsApp updates. {{1}} first name, {{2}} what they bought, {{3}} the link that puts it back in their cart.
export const REFILL_TEMPLATE_LABEL = 'Running low?'
export const SUGGESTED_REFILL_TEMPLATE_NAME = 'running_low'
export const REFILL_TEMPLATE_VALUE_COUNT = 3
const REFILL_BODIES = {
  en: 'Hi {{1}}, running low on {{2}}? Order it again in one tap: {{3}}\nThank you for shopping with us.',
  ar: 'مرحباً {{1}}، هل قارب {{2}} على النفاد؟ اطلبه من جديد بنقرة واحدة: {{3}}\nشكراً لتسوقك معنا.',
}
export const refillTemplateBody = (language: string) => REFILL_BODIES[isArabicTemplate(language) ? 'ar' : 'en']
