import translations from "__i18n_auto__"

export { translations }
export const DEFAULT_LANG = "en-GB"
export let SELECTED_LANG = DEFAULT_LANG

export function setLocale(lang) {
  SELECTED_LANG = lang || DEFAULT_LANG
}

export function getLocale() {
  return SELECTED_LANG
}

/**
 * Translate a key into the selected language
 * @param {string} lang - Language code (e.g., 'en-GB')
 * @param {string} key - Translation key (e.g., 'greeting.hello')
 * @param {Object} args - Optional arguments for placeholders
 * @returns {string} Translated string
 */
export function translate(lang, key, args = {}) {
  const language = translations[lang] || translations[DEFAULT_LANG]
  let translation = language[key] || translations[DEFAULT_LANG][key] || key

  // Replace placeholders with provided arguments
  Object.keys(args).forEach(placeholder => {
    const regex = new RegExp("{" + placeholder + "}", "g")
    translation = translation.replace(regex, args[placeholder])
  })

  return translation
}

/**
 * Get a list of available languages with their native names
 * @param {boolean} hideDefault - Whether to hide the default language from the list
 * @returns {Object} Object with language codes as keys and native names as values
 */
export function availableLanguages({ hideDefault = false } = {}) {
  const langs = {}
  for (const code in translations) {
    if (hideDefault && code === DEFAULT_LANG) continue
    langs[code] = translations[code]["language.name"] || code
  }
  return langs
}
