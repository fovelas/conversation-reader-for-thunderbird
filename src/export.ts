import type { Conversation, ConversationMessage } from './conversation'

const filenameInvalidCharacterPattern = /[<>:"/\\|?*\u0000-\u001f]/g

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+\-.!|<>])/g, '\\$1')
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function sanitizeFilenamePart(value: string): string {
  const sanitized = value
    .normalize('NFKC')
    .replace(filenameInvalidCharacterPattern, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 80)
    .replace(/^[.-]+|[.-]+$/g, '')

  return sanitized || 'conversation-reader-export'
}

function getTextFence(value: string): string {
  const longestBacktickRun = Math.max(
    0,
    ...(value.match(/`+/g) ?? []).map((run) => run.length),
  )

  return '`'.repeat(Math.max(3, longestBacktickRun + 1))
}

function formatPlainTextBlock(value: string): string {
  const normalizedValue = value.replace(/\r\n?/g, '\n').trimEnd()
  const fence = getTextFence(normalizedValue)

  return `${fence}text\n${normalizedValue}\n${fence}`
}

function formatMessage(message: ConversationMessage, index: number): string {
  const subject = message.subject.trim() || '(No subject)'
  const author = `${message.author}${message.isFromUser ? ' (You)' : ''}`
  const recipients = message.recipients.length > 0
    ? message.recipients.join(', ')
    : '—'
  const messageBody = message.body || 'No readable message body.'
  const sections = [
    `## Message ${index + 1}`,
    '',
    `**Subject:** ${escapeMarkdown(subject)}`,
    `**From:** ${escapeMarkdown(author)}`,
    `**Date:** ${message.date.toISOString()}`,
    `**Recipients:** ${escapeMarkdown(recipients)}`,
  ]

  if (message.hasAttachments) {
    sections.push('**Attachments:** Included')
  }

  sections.push(
    '',
    '### Message',
    '',
    formatPlainTextBlock(messageBody),
  )

  if (message.quotedBody) {
    sections.push(
      '',
      '### Quoted text',
      '',
      formatPlainTextBlock(message.quotedBody),
    )
  }

  return sections.join('\n')
}

function waitForDownloadCompletion(downloadId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false

    const finish = (error?: Error): void => {
      if (settled) {
        return
      }

      settled = true
      messenger.downloads.onChanged.removeListener(handleDownloadChange)

      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }

    const handleDownloadChange = (downloadDelta: ThunderbirdDownloadDelta): void => {
      if (downloadDelta.id !== downloadId) {
        return
      }

      const state = downloadDelta.state?.current
      if (state === 'complete') {
        finish()
      } else if (state === 'interrupted') {
        finish(new Error('The conversation download was interrupted.'))
      }
    }

    messenger.downloads.onChanged.addListener(handleDownloadChange)

    void messenger.downloads.search({ id: downloadId })
      .then((downloads) => {
        const state = downloads[0]?.state
        if (state === 'complete') {
          finish()
        } else if (state === 'interrupted') {
          finish(new Error('The conversation download was interrupted.'))
        }
      })
      .catch((error: unknown) => {
        finish(error instanceof Error ? error : new Error('Could not read the conversation download state.'))
      })
  })
}

export function buildConversationMarkdown(conversation: Conversation): string {
  const subject = conversation.subject.trim() || '(No subject)'
  const messages = conversation.messages.map(formatMessage).join('\n\n---\n\n')

  return `# ${escapeMarkdown(subject)}\n\n${messages}\n`
}

export function buildConversationFilename(subject: string, date = new Date()): string {
  return `${sanitizeFilenamePart(subject)}-${formatLocalDate(date)}.md`
}

export async function downloadConversationMarkdown(conversation: Conversation): Promise<void> {
  const markdown = buildConversationMarkdown(conversation)
  const blobUrl = URL.createObjectURL(
    new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
  )

  try {
    const downloadId = await messenger.downloads.download({
      url: blobUrl,
      filename: buildConversationFilename(conversation.subject),
      saveAs: true,
    })

    await waitForDownloadCompletion(downloadId)
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}
