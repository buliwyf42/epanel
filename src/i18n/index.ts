import { createI18n } from 'vue-i18n'
import { LOCALES, type Locale } from '@/domain/model'

const STORAGE = 'panel.locale'

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE) as Locale | null
    if (saved && LOCALES.includes(saved)) return saved
  } catch {
    // storage blocked
  }
  const nav = (navigator.language || 'ru').slice(0, 2) as Locale
  return LOCALES.includes(nav) ? nav : 'ru'
}

export const LOCALE_NAMES: Record<Locale, string> = { ru: 'Русский', en: 'English', sr: 'Srpski', es: 'Español', de: 'Deutsch' }

// one locale per visit: CI checks every locale has every key, so there is no fallback to download
const messages: Record<Locale, () => Promise<{ default: unknown }>> = {
  ru: () => import('./ru.json'),
  en: () => import('./en.json'),
  sr: () => import('./sr.json'),
  es: () => import('./es.json'),
  de: () => import('./de.json'),
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  messages: {},
  missingWarn: false,
  fallbackWarn: false,
})

async function loadMessages(l: Locale) {
  if (!i18n.global.availableLocales.includes(l)) i18n.global.setLocaleMessage(l, (await messages[l]()).default as never)
}

export const i18nReady = loadMessages(i18n.global.locale.value as Locale).then(() => {
  document.documentElement.lang = i18n.global.locale.value
})

export async function setLocale(l: Locale) {
  await loadMessages(l)
  i18n.global.locale.value = l
  document.documentElement.lang = l
  try {
    localStorage.setItem(STORAGE, l)
  } catch {
    // storage blocked
  }
}
