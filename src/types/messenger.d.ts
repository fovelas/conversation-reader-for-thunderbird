interface ThunderbirdTab {
  id?: number
  type?: string
}

interface ThunderbirdMailFolder {
  id: string
  accountId: string
  name: string
  type?: string
  subFolders?: ThunderbirdMailFolder[]
}

interface ThunderbirdMessageHeader {
  id: number
  author: string
  recipients: string[]
  ccList?: string[]
  date: Date
  headerMessageId: string
  headersOnly?: boolean
  subject: string
  folder?: ThunderbirdMailFolder
}

interface ThunderbirdMessageList {
  id: string | null
  messages: ThunderbirdMessageHeader[]
}

interface ThunderbirdMessagePart {
  body?: string
  contentType?: string
  headers?: Record<string, string[]>
  parts?: ThunderbirdMessagePart[]
}

interface ThunderbirdInlineTextPart {
  content: string
  contentType: string
}

interface ThunderbirdMessageAttachment {
  name?: string
  partName: string
}

interface ThunderbirdMailIdentity {
  email?: string
}

interface ThunderbirdMailAccount {
  id: string
  identities: ThunderbirdMailIdentity[]
  rootFolder: ThunderbirdMailFolder
}

type ThunderbirdThemeColor = string | number[]

type ThunderbirdDownloadState = 'in_progress' | 'complete' | 'interrupted'

interface ThunderbirdDownloadDelta {
  id: number
  state?: {
    current?: ThunderbirdDownloadState
    previous?: ThunderbirdDownloadState
  }
}

interface ThunderbirdDownloadItem {
  id: number
  state: ThunderbirdDownloadState
}

interface ThunderbirdTheme {
  colors?: Record<string, ThunderbirdThemeColor | undefined>
}

interface ThunderbirdThemeUpdateInfo {
  theme: ThunderbirdTheme
  windowId?: number
}

interface ThunderbirdStorageChange {
  oldValue?: unknown
  newValue?: unknown
}

type ThunderbirdMenuContext = 'message_list'

interface ThunderbirdMenuCreateProperties {
  id: string
  title: string
  contexts: ThunderbirdMenuContext[]
}

interface ThunderbirdMenuClickInfo {
  menuItemId: string | number
  selectedMessages?: ThunderbirdMessageList
}

interface ThunderbirdMessenger {
  accounts: {
    get(accountId: string, includeSubFolders?: boolean): Promise<ThunderbirdMailAccount | null>
  }
  action: {
    onClicked: {
      addListener(listener: (tab: ThunderbirdTab) => void): void
    }
  }
  compose: {
    beginReply(
      messageId: number,
      replyType?: 'replyToSender' | 'replyToAll' | 'replyToList',
    ): Promise<ThunderbirdTab>
  }
  downloads: {
    download(downloadOptions: {
      url: string
      filename?: string
      saveAs?: boolean
    }): Promise<number>
    search(query: { id: number }): Promise<ThunderbirdDownloadItem[]>
    onChanged: {
      addListener(listener: (downloadDelta: ThunderbirdDownloadDelta) => void): void
      removeListener(listener: (downloadDelta: ThunderbirdDownloadDelta) => void): void
    }
  }
  menus: {
    create(createProperties: ThunderbirdMenuCreateProperties): string | number
    onClicked: {
      addListener(
        listener: (info: ThunderbirdMenuClickInfo, tab?: ThunderbirdTab) => void,
      ): void
    }
  }
  theme: {
    getCurrent(windowId?: number): Promise<ThunderbirdTheme>
    onUpdated: {
      addListener(listener: (updateInfo: ThunderbirdThemeUpdateInfo) => void): void
    }
  }
  storage: {
    local: {
      get(keys?: string | string[]): Promise<Record<string, unknown>>
      remove(keys: string | string[]): Promise<void>
      set(items: Record<string, unknown>): Promise<void>
    }
    onChanged: {
      addListener(
        listener: (changes: Record<string, ThunderbirdStorageChange>, areaName: string) => void,
      ): void
    }
  }
  mailTabs: {
    getSelectedMessages(tabId?: number): Promise<ThunderbirdMessageList>
  }
  messengerUtilities: {
    convertToPlainText(body: string): Promise<string>
  }
  messages: {
    get(messageId: number): Promise<ThunderbirdMessageHeader>
    getFull(
      messageId: number,
      options?: { decodeContent?: boolean; decodeHeaders?: boolean },
    ): Promise<ThunderbirdMessagePart>
    listAttachments(messageId: number): Promise<ThunderbirdMessageAttachment[]>
    listInlineTextParts(messageId: number): Promise<ThunderbirdInlineTextPart[]>
    query(queryInfo?: {
      accountId?: string
      subject?: string
      messagesPerPage?: number
    }): Promise<ThunderbirdMessageList>
    continueList(messageListId: string): Promise<ThunderbirdMessageList>
  }
  runtime: {
    getURL(path: string): string
    openOptionsPage(): Promise<void>
  }
  messageDisplay: {
    open(openProperties: {
      messageId: number
      location: 'tab' | 'window'
      active?: boolean
    }): Promise<ThunderbirdTab>
  }
  tabs: {
    create(createProperties: { active?: boolean; url: string }): Promise<ThunderbirdTab>
  }
}

declare const messenger: ThunderbirdMessenger
