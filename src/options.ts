import './options.css'
import {
  DEFAULT_USER_ACCENT,
  getUserAccentOption,
  USER_ACCENT_OPTIONS,
  USER_ACCENT_STORAGE_KEY,
} from './theme-config'

function getRequiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)

  if (!element) {
    throw new Error(`The options page element was not found: ${selector}`)
  }

  return element
}

const accentOptions = getRequiredElement<HTMLDivElement>('#accent-options')
const resetButton = getRequiredElement<HTMLButtonElement>('#reset-color')
const preview = getRequiredElement<HTMLElement>('.accent-preview')
const status = getRequiredElement<HTMLParagraphElement>('#save-status')

const accentInputs = new Map<string, HTMLInputElement>()

function createAccentOptions(): void {
  USER_ACCENT_OPTIONS.forEach((option) => {
    const label = document.createElement('label')
    label.className = 'accent-option'
    label.title = option.label

    const input = document.createElement('input')
    input.className = 'accent-swatch'
    input.type = 'radio'
    input.name = 'user-accent'
    input.value = option.value
    input.setAttribute('aria-label', option.label)
    input.style.setProperty('--swatch-color', option.value)

    label.append(input)
    accentOptions.append(label)
    accentInputs.set(option.value, input)
  })
}

function getForegroundColor(color: string): string {
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  const luminance = (0.299 * red) + (0.587 * green) + (0.114 * blue)

  return luminance >= 160 ? '#000000' : '#ffffff'
}

function updatePreview(color: string): void {
  const selectedOption = getUserAccentOption(color) ?? getUserAccentOption(DEFAULT_USER_ACCENT)
  const selectedColor = selectedOption?.value ?? DEFAULT_USER_ACCENT

  preview.style.setProperty('--preview-accent', selectedColor)
  preview.style.setProperty('--preview-foreground', getForegroundColor(selectedColor))
  accentInputs.forEach((input, optionColor) => {
    input.checked = optionColor === selectedColor
  })
}

function showStatus(message: string): void {
  status.textContent = message
  window.setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = ''
    }
  }, 2500)
}

async function saveColor(color: string): Promise<void> {
  const selectedOption = getUserAccentOption(color)
  if (!selectedOption) {
    return
  }

  await messenger.storage.local.set({
    [USER_ACCENT_STORAGE_KEY]: selectedOption.value,
  })
  updatePreview(selectedOption.value)
  showStatus('Color saved')
}

async function loadColor(): Promise<void> {
  const values = await messenger.storage.local.get(USER_ACCENT_STORAGE_KEY)
  const storedColor = values[USER_ACCENT_STORAGE_KEY]
  const storedOption = getUserAccentOption(storedColor)

  if (storedOption) {
    updatePreview(storedOption.value)
    return
  }

  if (storedColor !== undefined) {
    await messenger.storage.local.remove(USER_ACCENT_STORAGE_KEY)
  }

  updatePreview(DEFAULT_USER_ACCENT)
}

createAccentOptions()

accentInputs.forEach((input) => {
  input.addEventListener('change', () => {
    void saveColor(input.value).catch(() => {
      showStatus('Could not save color')
    })
  })
})

resetButton.addEventListener('click', () => {
  void messenger.storage.local.remove(USER_ACCENT_STORAGE_KEY)
    .then(() => {
      updatePreview(DEFAULT_USER_ACCENT)
      showStatus('Default color restored')
    })
    .catch(() => {
      showStatus('Could not reset color')
    })
})

void loadColor().catch(() => {
  updatePreview(DEFAULT_USER_ACCENT)
  showStatus('Could not load saved color')
})
