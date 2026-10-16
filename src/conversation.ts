export interface ConversationMessage {
  id: number
  headerMessageId: string
  subject: string
  author: string
  recipients: string[]
  date: Date
  body: string
  quotedBody: string | null
  avatarInitials: string
  hasAttachments: boolean
  isFromUser: boolean
}

export interface Conversation {
  subject: string
  messages: ConversationMessage[]
  selectedMessageId: number
}

interface ThreadMetadata {
  header: ThunderbirdMessageHeader
  references: string[]
  inReplyTo: string | null
}

interface MessageBody {
  body: string
  quotedBody: string | null
}

const messageIdPattern = /<[^>]+>/g

function canonicalMessageId(messageId: string): string {
  return messageId.trim().replace(/^<|>$/g, '').toLowerCase()
}

function extractMessageIds(values: string[]): string[] {
  return values.flatMap((value) => {
    const matches = value.match(messageIdPattern)
    return matches
      ? matches.map(canonicalMessageId)
      : value.split(/\s+/).map(canonicalMessageId)
  }).filter(Boolean)
}

function getHeaderValues(headers: Record<string, string[]> | undefined, name: string): string[] {
  if (!headers) {
    return []
  }

  const matchingEntry = Object.entries(headers).find(([key]) => key.toLowerCase() === name)
  return matchingEntry?.[1] ?? []
}

function normalizeSubject(subject: string): string {
  return subject.replace(/^(?:(?:re|fw|fwd):\s*)+/gi, '').trim()
}

function extractEmail(value: string): string {
  const match = value.match(/<([^>]+)>/)
  return (match?.[1] ?? value).trim().toLowerCase()
}

function getAuthorName(value: string): string {
  const emailMatch = value.match(/<([^>]+)>/)
  const displayName = emailMatch
    ? value.slice(0, emailMatch.index ?? 0).trim().replace(/^['"]|['"]$/g, '').trim()
    : value.trim()

  if (displayName) {
    return displayName
  }

  const email = emailMatch?.[1] ?? value
  return email.split('@')[0].trim()
}

function getAvatarInitials(author: string): string {
  const authorName = getAuthorName(author)
  const words = authorName.split(/[^\p{L}\p{N}]+/u).filter(Boolean)

  if (words.length >= 2) {
    return `${Array.from(words[0])[0]}${Array.from(words[1])[0]}`.toLocaleUpperCase()
  }

  const initials = Array.from(words[0] ?? authorName).slice(0, 2).join('')
  return initials ? initials.toLocaleUpperCase() : '?'
}

function uniqueMessageHeaders(messages: ThunderbirdMessageHeader[]): ThunderbirdMessageHeader[] {
  const byMessageKey = new Map<string, ThunderbirdMessageHeader>()

  for (const message of messages) {
    const normalizedHeaderId = canonicalMessageId(message.headerMessageId)
    const messageKey = normalizedHeaderId
      ? `header:${normalizedHeaderId}`
      : `internal:${message.id}`

    if (!byMessageKey.has(messageKey)) {
      byMessageKey.set(messageKey, message)
    }
  }

  return [...byMessageKey.values()]
}

async function collectMessageList(messageList: ThunderbirdMessageList): Promise<ThunderbirdMessageHeader[]> {
  const messages = [...messageList.messages]
  let nextListId = messageList.id

  while (nextListId) {
    const nextPage = await messenger.messages.continueList(nextListId)
    messages.push(...nextPage.messages)
    nextListId = nextPage.id
  }

  return messages
}

async function findCandidateMessages(anchor: ThunderbirdMessageHeader): Promise<ThunderbirdMessageHeader[]> {
  const accountId = anchor.folder?.accountId
  const subject = normalizeSubject(anchor.subject)

  if (!accountId || !subject) {
    return [anchor]
  }

  try {
    const result = await messenger.messages.query({
      accountId,
      messagesPerPage: 100,
      subject,
    })

    return collectMessageList(result)
  } catch (error) {
    console.warn('Could not search for related messages.', error)
    return [anchor]
  }
}

async function getThreadMetadata(header: ThunderbirdMessageHeader): Promise<ThreadMetadata> {
  const fullMessage = await messenger.messages.getFull(header.id, {
    decodeContent: false,
    decodeHeaders: true,
  })
  const references = extractMessageIds(getHeaderValues(fullMessage.headers, 'references'))
  const inReplyToValues = extractMessageIds(getHeaderValues(fullMessage.headers, 'in-reply-to'))

  return {
    header,
    references,
    inReplyTo: inReplyToValues[0] ?? null,
  }
}

function getConnectedThread(
  metadata: ThreadMetadata[],
  selectedHeaders: ThunderbirdMessageHeader[],
): ThunderbirdMessageHeader[] {
  const parentByIndex = new Map<number, number>()
  const messageIndexByHeaderId = new Map<string, number>()

  for (let index = 0; index < metadata.length; index += 1) {
    parentByIndex.set(index, index)
    messageIndexByHeaderId.set(canonicalMessageId(metadata[index].header.headerMessageId), index)
  }

  function find(index: number): number {
    const parent = parentByIndex.get(index)
    if (parent === undefined || parent === index) {
      return index
    }

    const root = find(parent)
    parentByIndex.set(index, root)
    return root
  }

  function union(left: number, right: number): void {
    const leftRoot = find(left)
    const rightRoot = find(right)

    if (leftRoot !== rightRoot) {
      parentByIndex.set(rightRoot, leftRoot)
    }
  }

  metadata.forEach((message, index) => {
    const relatedIds = [...message.references, message.inReplyTo].filter(
      (messageId): messageId is string => messageId !== null,
    )

    for (const relatedId of relatedIds) {
      const relatedIndex = messageIndexByHeaderId.get(relatedId)
      if (relatedIndex !== undefined) {
        union(index, relatedIndex)
      }
    }
  })

  const selectedRoots = new Set(
    selectedHeaders
      .map((header) => metadata.findIndex((message) => message.header.id === header.id))
      .filter((index) => index >= 0)
      .map(find),
  )

  return metadata
    .filter((_, index) => selectedRoots.has(find(index)))
    .map((message) => message.header)
}

// Keep the timeline chronological while ensuring known replies follow their parent.
function compareThreadMessages(
  left: ThreadMetadata,
  right: ThreadMetadata,
  leftIndex: number,
  rightIndex: number,
): number {
  const leftTime = left.header.date.getTime()
  const rightTime = right.header.date.getTime()
  const leftHasValidDate = Number.isFinite(leftTime)
  const rightHasValidDate = Number.isFinite(rightTime)

  if (leftHasValidDate && rightHasValidDate && leftTime !== rightTime) {
    return leftTime - rightTime
  }

  if (leftHasValidDate !== rightHasValidDate) {
    return leftHasValidDate ? -1 : 1
  }

  return leftIndex - rightIndex
}

function orderThreadHeaders(
  threadHeaders: ThunderbirdMessageHeader[],
  metadata: ThreadMetadata[],
): ThunderbirdMessageHeader[] {
  const metadataByMessageId = new Map<number, ThreadMetadata>()
  for (const message of metadata) {
    metadataByMessageId.set(message.header.id, message)
  }

  const threadMetadata = threadHeaders
    .map((header) => metadataByMessageId.get(header.id))
    .filter((message): message is ThreadMetadata => message !== undefined)
  const messageIndexByHeaderId = new Map<string, number>()
  const childrenByIndex = threadMetadata.map(() => [] as number[])
  const parentCountByIndex = threadMetadata.map(() => 0)

  threadMetadata.forEach((message, index) => {
    const headerMessageId = canonicalMessageId(message.header.headerMessageId)
    if (headerMessageId) {
      messageIndexByHeaderId.set(headerMessageId, index)
    }
  })

  threadMetadata.forEach((message, index) => {
    if (!message.inReplyTo) {
      return
    }

    const parentIndex = messageIndexByHeaderId.get(message.inReplyTo)
    if (parentIndex === undefined || parentIndex === index) {
      return
    }

    childrenByIndex[parentIndex].push(index)
    parentCountByIndex[index] += 1
  })

  const readyIndices = parentCountByIndex
    .map((parentCount, index) => (parentCount === 0 ? index : -1))
    .filter((index) => index >= 0)
  const orderedIndices: number[] = []

  while (readyIndices.length > 0) {
    readyIndices.sort((leftIndex, rightIndex) => compareThreadMessages(
      threadMetadata[leftIndex],
      threadMetadata[rightIndex],
      leftIndex,
      rightIndex,
    ))

    const nextIndex = readyIndices.shift()
    if (nextIndex === undefined) {
      break
    }

    orderedIndices.push(nextIndex)

    for (const childIndex of childrenByIndex[nextIndex]) {
      parentCountByIndex[childIndex] -= 1
      if (parentCountByIndex[childIndex] === 0) {
        readyIndices.push(childIndex)
      }
    }
  }

  if (orderedIndices.length < threadMetadata.length) {
    const orderedIndexSet = new Set(orderedIndices)
    const remainingIndices = threadMetadata
      .map((_, index) => index)
      .filter((index) => !orderedIndexSet.has(index))
      .sort((leftIndex, rightIndex) => compareThreadMessages(
        threadMetadata[leftIndex],
        threadMetadata[rightIndex],
        leftIndex,
        rightIndex,
      ))

    orderedIndices.push(...remainingIndices)
  }

  return orderedIndices.map((index) => threadMetadata[index].header)
}

async function getUserEmails(accountId: string | undefined): Promise<Set<string>> {
  if (!accountId) {
    return new Set()
  }

  try {
    const account = await messenger.accounts.get(accountId)
    return new Set(
      account?.identities
        .map((identity) => identity.email)
        .filter((email): email is string => Boolean(email))
        .map((email) => email.toLowerCase()),
    )
  } catch (error) {
    console.warn('Could not read the account identities.', error)
    return new Set()
  }
}

function findTextPart(parts: ThunderbirdMessagePart[], contentType: string): ThunderbirdMessagePart | null {
  for (const part of parts) {
    if (part.contentType?.toLowerCase().startsWith(contentType)) {
      return part
    }

    const nestedPart = findTextPart(part.parts ?? [], contentType)
    if (nestedPart) {
      return nestedPart
    }
  }

  return null
}

function findInlineTextPart(
  parts: ThunderbirdInlineTextPart[],
  contentType: string,
): ThunderbirdInlineTextPart | null {
  return parts.find((part) => part.contentType.toLowerCase().startsWith(contentType)) ?? null
}

function isQuoteLine(line: string): boolean {
  return line.trimStart().startsWith('>')
}

function isReplyAttribution(line: string): boolean {
  return /^\s*On\b.+\bwrote:\s*$/i.test(line)
}

function isOriginalMessageSeparator(line: string): boolean {
  return /^\s*-{2,}\s*Original Message\s*-{2,}\s*:?\s*$/i.test(line)
}

function hasQuoteLineSoon(lines: string[], startIndex: number): boolean {
  for (let index = startIndex; index < Math.min(startIndex + 4, lines.length); index += 1) {
    if (!lines[index].trim()) {
      continue
    }

    return isQuoteLine(lines[index])
  }

  return false
}

function findQuotedBodyStart(lines: string[]): number {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (isOriginalMessageSeparator(line)) {
      return index
    }

    if (isReplyAttribution(line) && hasQuoteLineSoon(lines, index + 1)) {
      return index
    }

    if (isQuoteLine(line)) {
      let previousIndex = index - 1
      while (previousIndex >= 0 && !lines[previousIndex].trim()) {
        previousIndex -= 1
      }

      if (previousIndex >= 0 && isReplyAttribution(lines[previousIndex])) {
        return previousIndex
      }

      return index
    }
  }

  return -1
}

function removeQuotedPrefix(body: string): string {
  return body
    .split('\n')
    .map((line) => line.replace(/^\s*>\s?/, ''))
    .join('\n')
    .trim()
}

function splitQuotedText(body: string): MessageBody {
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  const quotedBodyStart = findQuotedBodyStart(lines)

  if (quotedBodyStart < 0) {
    return {
      body: body.trim(),
      quotedBody: null,
    }
  }

  const visibleBody = lines.slice(0, quotedBodyStart).join('\n').trim()
  const quotedBody = removeQuotedPrefix(lines.slice(quotedBodyStart).join('\n'))

  return {
    body: visibleBody,
    quotedBody: quotedBody || null,
  }
}

async function readMessageBody(messageId: number): Promise<string> {
  try {
    const inlineParts = await messenger.messages.listInlineTextParts(messageId)
    const plainPart = findInlineTextPart(inlineParts, 'text/plain')
    if (plainPart?.content) {
      return plainPart.content.trim()
    }

    const htmlPart = findInlineTextPart(inlineParts, 'text/html')
    if (htmlPart?.content) {
      return (await messenger.messengerUtilities.convertToPlainText(htmlPart.content)).trim()
    }
  } catch (error) {
    console.warn(`Could not read the inline body for message ${messageId}.`, error)
  }

  try {
    const fullMessage = await messenger.messages.getFull(messageId, {
      decodeContent: true,
      decodeHeaders: false,
    })
    const parts = [fullMessage, ...(fullMessage.parts ?? [])]
    const plainPart = findTextPart(parts, 'text/plain')
    if (plainPart?.body) {
      return plainPart.body.trim()
    }

    const htmlPart = findTextPart(parts, 'text/html')
    if (htmlPart?.body) {
      return (await messenger.messengerUtilities.convertToPlainText(htmlPart.body)).trim()
    }
  } catch (error) {
    console.warn(`Could not read the body for message ${messageId}.`, error)
  }

  return ''
}

async function hasAttachments(messageId: number): Promise<boolean> {
  try {
    const attachments = await messenger.messages.listAttachments(messageId)
    return attachments.length > 0
  } catch (error) {
    console.warn(`Could not read attachments for message ${messageId}.`, error)
    return false
  }
}

async function toConversationMessage(
  header: ThunderbirdMessageHeader,
  userEmails: Set<string>,
): Promise<ConversationMessage> {
  const [body, attachments] = await Promise.all([
    readMessageBody(header.id),
    hasAttachments(header.id),
  ])
  const messageBody = splitQuotedText(body)

  return {
    id: header.id,
    headerMessageId: header.headerMessageId,
    subject: header.subject,
    author: header.author,
    recipients: [...header.recipients, ...(header.ccList ?? [])],
    date: header.date,
    body: messageBody.body,
    quotedBody: messageBody.quotedBody,
    avatarInitials: getAvatarInitials(header.author),
    hasAttachments: attachments,
    isFromUser: userEmails.has(extractEmail(header.author)),
  }
}

export async function loadConversation(selectedMessageIds: number[]): Promise<Conversation | null> {
  if (selectedMessageIds.length === 0) {
    return null
  }

  const selectedHeaders = await Promise.all(
    selectedMessageIds.map((messageId) => messenger.messages.get(messageId)),
  )
  const anchor = selectedHeaders[0]
  const candidateHeaders = uniqueMessageHeaders([
    ...selectedHeaders,
    ...(await findCandidateMessages(anchor)),
  ])
  const metadata = await Promise.all(candidateHeaders.map(getThreadMetadata))
  const threadHeaders = getConnectedThread(metadata, selectedHeaders)
  const headersToRender = threadHeaders.length > 0 ? threadHeaders : selectedHeaders
  const orderedHeaders = orderThreadHeaders(headersToRender, metadata)
  const userEmails = await getUserEmails(anchor.folder?.accountId)
  const messages = await Promise.all(
    orderedHeaders.map((header) => toConversationMessage(header, userEmails)),
  )

  return {
    subject: anchor.subject,
    messages,
    selectedMessageId: anchor.id,
  }
}
