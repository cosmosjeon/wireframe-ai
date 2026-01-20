import { ExcalidrawSchema } from '@/lib/schema'
import { DeepPartial } from 'ai'

export type MessageContent = {
  type: 'text' | 'code' | 'image'
  text?: string
  image?: string
}

export type Conversation = {
  id: string
  user_id: string
  title: string
  wireframe?: DeepPartial<ExcalidrawSchema> | null
  created_at: string
  updated_at: string
}

export type DBMessage = {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: MessageContent[]
  wireframe?: DeepPartial<ExcalidrawSchema> | null
  created_at: string
}

export type ConversationWithMessages = Conversation & {
  messages: DBMessage[]
}

// API Response types
export type ConversationsListResponse = {
  conversations: Conversation[]
}

export type ConversationDetailResponse = {
  conversation: ConversationWithMessages
}

export type CreateConversationRequest = {
  title?: string
}

export type CreateMessageRequest = {
  role: 'user' | 'assistant'
  content: MessageContent[]
  wireframe?: DeepPartial<ExcalidrawSchema> | null
}

export type UpdateConversationRequest = {
  title?: string
  wireframe?: DeepPartial<ExcalidrawSchema> | null
}
