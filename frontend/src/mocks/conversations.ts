export type ConversationListItem = {
  id: number
  title: string
}

const conversations = new Map<number, ConversationListItem[]>([
  [1, []],
  [2, []],
])

export function mockListConversations(userId: number): ConversationListItem[] {
  return conversations.get(userId) ?? []
}
