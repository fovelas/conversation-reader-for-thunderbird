export const DEFAULT_USER_ACCENT = '#22c55e'
export const USER_ACCENT_STORAGE_KEY = 'userAccent'

export const USER_ACCENT_OPTIONS = [
  { label: 'Green', value: DEFAULT_USER_ACCENT },
  { label: 'Amber', value: '#ffb000' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Teal', value: '#14b8a6' },
  { label: 'Purple', value: '#8b5cf6' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Slate', value: '#64748b' },
] as const

export function getUserAccentOption(value: unknown): (typeof USER_ACCENT_OPTIONS)[number] | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  return USER_ACCENT_OPTIONS.find((option) => option.value.toLowerCase() === value.toLowerCase())
}
