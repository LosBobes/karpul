import { useT } from '../lib/i18n'
import { setTheme, THEMES, useTheme, type Theme } from '../lib/theme'
import { MoonIcon, SunIcon } from './icons'
import { SegThumb } from './Segmented'

/**
 * Light / Dark / Auto, at the foot of the app menu next to the language.
 * "Auto" follows the phone's setting (lib/theme.ts).
 */
export function ThemeSwitch() {
  const t = useT()
  const theme = useTheme()
  const icon: Record<Theme, React.ReactNode> = {
    light: <SunIcon size={15} />,
    dark: <MoonIcon size={15} />,
    system: null,
  }
  return (
    <div className="lang">
      <span className="lang-label">{t.theme.label}</span>
      <div className="segmented lang-seg theme-seg" role="radiogroup" aria-label={t.theme.label}>
        <SegThumb count={THEMES.length} index={Math.max(0, THEMES.indexOf(theme))} />
        {THEMES.map((th) => (
          <button
            key={th}
            type="button"
            role="radio"
            aria-checked={th === theme}
            className={th === theme ? 'seg seg-on' : 'seg'}
            onClick={() => setTheme(th)}
          >
            {icon[th]} {t.theme[th]}
          </button>
        ))}
      </div>
    </div>
  )
}
