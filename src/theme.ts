import {
  DEFAULT_USER_ACCENT,
  getUserAccentOption,
  USER_ACCENT_STORAGE_KEY,
} from './theme-config'

interface ThemeAccent {
  color: string
  foreground: string
}

const fallbackAccent: ThemeAccent = {
  color: DEFAULT_USER_ACCENT,
  foreground: '#ffffff',
}

let hasStoredUserAccent = false

function toCssColor(value: ThunderbirdThemeColor | undefined): string | null {
  if (Array.isArray(value)) {
    if ((value.length !== 3 && value.length !== 4) || value.some((channel) => !Number.isFinite(channel))) {
      return null
    }

    const [red, green, blue, alpha] = value
    if (alpha === undefined) {
      return `rgb(${red} ${green} ${blue})`
    }

    return `rgb(${red} ${green} ${blue} / ${alpha})`
  }

  if (typeof value === 'string' && CSS.supports('color', value)) {
    return value
  }

  return null
}

function parseRgb(color: string): [number, number, number] | null {
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1]
  if (hex) {
    const normalizedHex = hex.length === 3
      ? hex.split('').map((channel) => `${channel}${channel}`).join('')
      : hex

    return [
      Number.parseInt(normalizedHex.slice(0, 2), 16),
      Number.parseInt(normalizedHex.slice(2, 4), 16),
      Number.parseInt(normalizedHex.slice(4, 6), 16),
    ]
  }

  const rgb = color.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/i)
  if (!rgb) {
    return null
  }

  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
}

function getForegroundColor(backgroundColor: string): string {
  const probe = document.createElement('span')
  probe.style.color = backgroundColor
  probe.style.position = 'fixed'
  probe.style.visibility = 'hidden'
  document.body.append(probe)
  const computedColor = getComputedStyle(probe).color
  probe.remove()

  const rgb = parseRgb(computedColor)
  if (!rgb) {
    return '#000000'
  }

  const luminance = (0.299 * rgb[0]) + (0.587 * rgb[1]) + (0.114 * rgb[2])
  return luminance >= 160 ? '#000000' : '#ffffff'
}

function resolveAccent(theme: ThunderbirdTheme): ThemeAccent {
  const colors = theme.colors
  const color = toCssColor(colors?.accentcolor)
    ?? toCssColor(colors?.tab_line)

  if (!color) {
    return fallbackAccent
  }

  return {
    color,
    foreground: getForegroundColor(color),
  }
}

function applyAccent(accent: ThemeAccent): void {
  const root = document.documentElement
  root.style.setProperty('--user-accent', accent.color)
  root.style.setProperty('--user-accent-foreground', accent.foreground)
}

export async function applyCurrentThemeAccent(): Promise<void> {
  try {
    const theme = await messenger.theme.getCurrent()
    applyAccent(resolveAccent(theme))
  } catch (error) {
    console.warn('Could not read the current Thunderbird theme.', error)
    applyAccent(fallbackAccent)
  }
}

export function subscribeToThemeChanges(): void {
  messenger.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[USER_ACCENT_STORAGE_KEY]) {
      return
    }

    const newValue = getUserAccentOption(changes[USER_ACCENT_STORAGE_KEY].newValue)
    if (newValue) {
      hasStoredUserAccent = true
      applyAccent({
        color: newValue.value,
        foreground: getForegroundColor(newValue.value),
      })
      return
    }

    hasStoredUserAccent = false
    void applyCurrentThemeAccent()
  })

  messenger.theme.onUpdated.addListener((updateInfo) => {
    if (!hasStoredUserAccent) {
      applyAccent(resolveAccent(updateInfo.theme))
    }
  })
}

export async function initializeAccent(): Promise<void> {
  try {
    const values = await messenger.storage.local.get(USER_ACCENT_STORAGE_KEY)
    const storedAccent = getUserAccentOption(values[USER_ACCENT_STORAGE_KEY])

    if (storedAccent) {
      hasStoredUserAccent = true
      applyAccent({
        color: storedAccent.value,
        foreground: getForegroundColor(storedAccent.value),
      })
      return
    }
  } catch (error) {
    console.warn('Could not read the saved user accent.', error)
  }

  hasStoredUserAccent = false
  await applyCurrentThemeAccent()
}
