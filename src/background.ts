const conversationMenuId = 'open-in-conversation-reader'

function getSelectedMessageIds(tabId?: number): Promise<number[]> {
  return messenger.mailTabs
    .getSelectedMessages(tabId)
    .then((messageList) => messageList.messages.map((message) => message.id))
}

async function openConversationTab(messageIds: number[]): Promise<void> {
  const query = messageIds.length > 0
    ? `?messageIds=${encodeURIComponent(messageIds.join(','))}`
    : ''

  await messenger.tabs.create({
    active: true,
    url: `${messenger.runtime.getURL('index.html')}${query}`,
  })
}

async function openConversationFromToolbar(tab: ThunderbirdTab): Promise<void> {
  let messageIds: number[] = []
  try {
    messageIds = await getSelectedMessageIds(tab.id)
  } catch (error) {
    console.warn('Could not read the selected Thunderbird messages.', error)
  }

  await openConversationTab(messageIds)
}

messenger.action.onClicked.addListener((tab) => {
  void openConversationFromToolbar(tab).catch((error) => {
    console.error('Could not open the conversation tab.', error)
  })
})

messenger.menus.onClicked.addListener((info) => {
  if (info.menuItemId !== conversationMenuId) {
    return
  }

  const messageIds = info.selectedMessages?.messages.map((message) => message.id) ?? []
  if (messageIds.length === 0) {
    console.warn('Could not open the conversation because no message was selected.')
    return
  }

  void openConversationTab(messageIds).catch((error) => {
    console.error('Could not open the conversation tab from the context menu.', error)
  })
})

try {
  messenger.menus.create({
    id: conversationMenuId,
    title: 'Open in Conversation Reader',
    contexts: ['message_list'],
  })
} catch (error) {
  console.error('Could not create the Conversation Reader context menu.', error)
}
