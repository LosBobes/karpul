import { useT } from '../lib/i18n'
import { LOCALES, setLocale, useLocale, type Locale } from '../lib/locale'

/** Each language names itself, so a person can always find their way back. */
const NAMES: Record<Locale, string> = { en: 'English', sr: 'Srpski' }

/**
 * The English / Srpski segmented control. It sits at the foot of the app
 * menu and on the first-run name sheet, the two places a newcomer looks
 * before anything else. Picking a language re-renders every component that
 * reads `useT()`, which is all of them.
 */
export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const t = useT()
  const locale = useLocale()
  return (
    <div className={compact ? 'lang lang-compact' : 'lang'}>
      <span className="lang-label">{t.common.language}</span>
      <div className="segmented lang-seg" role="radiogroup" aria-label={t.common.language}>
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            lang={l === 'sr' ? 'sr-Latn' : 'en'}
            aria-checked={l === locale}
            className={l === locale ? 'seg seg-on' : 'seg'}
            onClick={() => setLocale(l)}
          >
            {NAMES[l]}
          </button>
        ))}
      </div>
    </div>
  )
}
