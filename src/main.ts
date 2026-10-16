import './style.css'
import { loadConversation, type Conversation, type ConversationMessage } from './conversation'
import { downloadConversationMarkdown } from './export'
import { initializeAccent, subscribeToThemeChanges } from './theme'

function getAppRoot(): HTMLDivElement {
  const root = document.querySelector<HTMLDivElement>('#app')

  if (!root) {
    throw new Error('The application root was not found.')
  }

  return root
}

const app = getAppRoot()
let currentConversation: Conversation | null = null
let replyRefreshPending = false
let isRefreshingConversation = false

subscribeToThemeChanges()
void initializeAccent()

function closeMoreMenus(): void {
  document.querySelectorAll<HTMLDetailsElement>('.more-menu[open]').forEach((menu) => {
    menu.open = false
  })
}

document.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element) || !target.closest('.more-menu')) {
    closeMoreMenus()
  }
})

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') {
    return
  }

  const openMenu = document.querySelector<HTMLDetailsElement>('.more-menu[open]')
  if (!openMenu) {
    return
  }

  openMenu.open = false
  openMenu.querySelector<HTMLElement>('summary')?.focus()
})

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName)
  if (className) {
    element.className = className
  }
  return element
}

function getSelectedMessageIds(): number[] {
  const rawValue = new URLSearchParams(window.location.search).get('messageIds')
  if (!rawValue) {
    return []
  }

  return [...new Set(
    rawValue
      .split(',')
      .map(Number)
      .filter((messageId) => Number.isInteger(messageId) && messageId >= 0),
  )]
}

function setMessage(element: HTMLElement, message: string): void {
  element.textContent = message
}

function setPageTitle(subject?: string): void {
  const trimmedSubject = subject?.trim()
  document.title = trimmedSubject
    ? `${trimmedSubject} - Conversation Reader`
    : 'Conversation Reader'
}

function getMessageKey(message: ConversationMessage): string {
  return message.headerMessageId || `internal:${message.id}`
}

function hasConversationChanged(conversation: Conversation): boolean {
  if (!currentConversation || currentConversation.subject !== conversation.subject) {
    return true
  }

  if (currentConversation.messages.length !== conversation.messages.length) {
    return true
  }

  return currentConversation.messages.some((message, index) => (
    getMessageKey(message) !== getMessageKey(conversation.messages[index])
  ))
}

async function refreshConversation(forceRender: boolean, reportError: boolean): Promise<void> {
  if (isRefreshingConversation) {
    return
  }

  const selectedMessageIds = getSelectedMessageIds()
  if (selectedMessageIds.length === 0) {
    return
  }

  isRefreshingConversation = true

  try {
    const conversation = await loadConversation(selectedMessageIds)
    if (!conversation) {
      return
    }

    const shouldRender = forceRender || hasConversationChanged(conversation)
    currentConversation = conversation
    replyRefreshPending = false

    if (shouldRender) {
      renderConversation(conversation)
    }
  } catch (error) {
    console.error('Could not refresh the conversation.', error)
    if (reportError) {
      showActionError('The conversation could not be refreshed.')
    }
  } finally {
    isRefreshingConversation = false
  }
}

function refreshAfterReplyWhenVisible(): void {
  if (!replyRefreshPending || document.visibilityState !== 'visible') {
    return
  }

  void refreshConversation(false, false)
}

window.addEventListener('focus', refreshAfterReplyWhenVisible)
document.addEventListener('visibilitychange', refreshAfterReplyWhenVisible)

interface MoreMenuAction {
  label: string
  action: () => void
}

function createMoreMenu(
  buttonLabel: string,
  actions: MoreMenuAction[],
): HTMLDetailsElement {
  const menu = createElement('details', 'more-menu')
  const summary = createElement('summary', 'more-button')
  summary.setAttribute('aria-label', buttonLabel)
  summary.setAttribute('aria-haspopup', 'menu')
  setMessage(summary, '⋮')

  const popover = createElement('div', 'more-popover')
  popover.setAttribute('role', 'menu')
  actions.forEach(({ label, action }) => {
    const menuItem = createElement('button', 'more-menu-item')
    menuItem.type = 'button'
    menuItem.setAttribute('role', 'menuitem')
    setMessage(menuItem, label)
    menuItem.addEventListener('click', () => {
      menu.open = false
      action()
    })
    popover.append(menuItem)
  })
  menu.append(summary, popover)

  menu.addEventListener('toggle', () => {
    if (!menu.open) {
      return
    }

    document.querySelectorAll<HTMLDetailsElement>('.more-menu[open]').forEach((otherMenu) => {
      if (otherMenu !== menu) {
        otherMenu.open = false
      }
    })
  })

  return menu
}

function createRefreshButton(): HTMLButtonElement {
  const button = createElement('button', 'refresh-button')
  button.type = 'button'
  button.setAttribute('aria-label', 'Refresh conversation')
  button.title = 'Refresh conversation'
  setMessage(button, '↻')
  button.addEventListener('click', () => {
    void refreshConversation(true, true)
  })

  return button
}

function renderLoading(): void {
  app.replaceChildren()
  const main = createElement('main', 'page-state')
  const title = createElement('h1')
  setMessage(title, 'Loading conversation')
  const detail = createElement('p')
  setMessage(detail, 'Reading the selected messages from Thunderbird…')
  main.append(title, detail)
  app.append(main)
}

function renderState(titleText: string, detailText: string): void {
  setPageTitle()
  app.replaceChildren()
  const main = createElement('main', 'page-state')
  const title = createElement('h1')
  setMessage(title, titleText)
  const detail = createElement('p')
  setMessage(detail, detailText)
  main.append(title, detail)
  app.append(main)
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function createMessageCard(message: ConversationMessage): HTMLElement {
  const card = createElement('article', `message-card${message.isFromUser ? ' is-from-user' : ''}`)
  const header = createElement('header', 'message-header')
  const senderGroup = createElement('div', 'sender-group')
  const avatar = createElement('div', 'sender-avatar')
  avatar.setAttribute('aria-hidden', 'true')
  setMessage(avatar, message.avatarInitials)
  const sender = createElement('div', 'message-sender')
  const author = createElement('strong')
  setMessage(author, message.author)
  const senderNameRow = createElement('div', 'sender-name-row')
  senderNameRow.append(author)
  if (message.isFromUser) {
    const youTag = createElement('span', 'you-tag')
    setMessage(youTag, 'You')
    senderNameRow.append(youTag)
  }
  const date = createElement('time')
  date.dateTime = message.date.toISOString()
  setMessage(date, formatDate(message.date))
  sender.append(senderNameRow, date)
  senderGroup.append(avatar, sender)

  const replyButton = createElement('button', 'reply-button')
  replyButton.type = 'button'
  replyButton.dataset.messageId = String(message.id)
  setMessage(replyButton, 'Reply')
  const headerActions = createElement('div', 'header-actions')
  headerActions.append(
    replyButton,
    createMoreMenu('More message actions', [
      {
        label: 'Show original email',
        action: () => {
          void openOriginalMessage(message.id)
        },
      },
    ]),
  )
  header.append(senderGroup, headerActions)

  const body = createElement('p', 'message-body')
  const bodyFallback = message.quotedBody
    ? 'No new message text.'
    : 'This message has no readable text body.'
  setMessage(body, message.body || bodyFallback)

  const content = createElement('div', 'message-content')
  content.append(body)

  const metadata = createElement('div', 'message-metadata')
  if (message.hasAttachments) {
    setMessage(metadata, 'Attachment included')
  }

  if (metadata.textContent) {
    content.append(metadata)
  }

  if (message.quotedBody) {
    const quotedMessage = createElement('details', 'quoted-message')
    const quotedToggle = createElement('summary', 'quoted-message-toggle')
    setMessage(quotedToggle, 'Show quoted text')
    const quotedBody = createElement('pre', 'quoted-message-body')
    setMessage(quotedBody, message.quotedBody)
    quotedMessage.addEventListener('toggle', () => {
      setMessage(quotedToggle, quotedMessage.open ? 'Hide quoted text' : 'Show quoted text')
    })
    quotedMessage.append(quotedToggle, quotedBody)
    content.append(quotedMessage)
  }

  card.append(header, content)

  return card
}

function showReplyError(message: string): void {
  const alert = createElement('div', 'toast')
  alert.setAttribute('role', 'alert')
  setMessage(alert, message)
  app.append(alert)
  window.setTimeout(() => alert.remove(), 5000)
}

function showActionError(message: string): void {
  showReplyError(message)
}

async function openOriginalMessage(messageId: number): Promise<void> {
  try {
    await messenger.messageDisplay.open({
      messageId,
      location: 'tab',
      active: true,
    })
  } catch (error) {
    console.error('Could not open the original message.', error)
    showActionError('The original message could not be opened.')
  }
}

async function openOptionsPage(): Promise<void> {
  try {
    await messenger.runtime.openOptionsPage()
  } catch (error) {
    console.error('Could not open the options page.', error)
    showActionError('The options page could not be opened.')
  }
}

async function exportConversation(conversation: Conversation): Promise<void> {
  try {
    await downloadConversationMarkdown(conversation)
  } catch (error) {
    console.error('Could not export the conversation.', error)
    showActionError('The conversation could not be exported.')
  }
}

async function openReply(messageId: number, button: HTMLButtonElement): Promise<void> {
  button.disabled = true

  try {
    await messenger.compose.beginReply(messageId, 'replyToSender')
    replyRefreshPending = true
  } catch (error) {
    console.error('Could not open the reply composer.', error)
    showReplyError('The reply composer could not be opened.')
  } finally {
    button.disabled = false
  }
}

function renderConversation(conversation: Conversation): void {
  setPageTitle(conversation.subject)
  app.replaceChildren()

  const main = createElement('main', 'conversation-page')
  const header = createElement('header', 'conversation-header')
  const headerCopy = createElement('div', 'conversation-header-copy')
  const title = createElement('h1')
  setMessage(title, conversation.subject || '(No subject)')
  const count = createElement('p', 'message-count')
  setMessage(count, `${conversation.messages.length} messages`)
  headerCopy.append(title, count)
  const headerActions = createElement('div', 'header-actions')
  headerActions.append(
    createRefreshButton(),
    createMoreMenu('More conversation options', [
      {
        label: 'Export',
        action: () => {
          void exportConversation(conversation)
        },
      },
      {
        label: 'Options',
        action: () => {
          void openOptionsPage()
        },
      },
    ]),
  )
  header.append(headerCopy, headerActions)

  const thread = createElement('section', 'message-thread')
  thread.setAttribute('aria-label', 'Conversation messages')
  conversation.messages.forEach((message) => thread.append(createMessageCard(message)))

  thread.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof HTMLButtonElement) || !target.dataset.messageId) {
      return
    }

    void openReply(Number(target.dataset.messageId), target)
  })

  main.append(header, thread)
  app.append(main)
}

async function initialize(): Promise<void> {
  const messageIds = getSelectedMessageIds()
  if (messageIds.length === 0) {
    renderState(
      'No message selected',
      'Select a message in Thunderbird, then use the Conversation Reader toolbar button.',
    )
    return
  }

  renderLoading()

  try {
    const conversation = await loadConversation(messageIds)
    if (!conversation) {
      renderState('No conversation found', 'Thunderbird did not return a readable message.')
      return
    }

    currentConversation = conversation
    renderConversation(conversation)
  } catch (error) {
    console.error('Could not load the conversation.', error)
    renderState(
      'Conversation could not be loaded',
      'Check the Thunderbird Error Console for more details, then try again.',
    )
  }
}

void initialize()
