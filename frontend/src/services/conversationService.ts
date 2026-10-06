import {
  deleteConversation as mockDeleteConversation,
  getConversationDetail as mockGetConversationDetail,
  getMessageFiles as mockGetMessageFiles,
  getXiaobeiVersion as mockGetXiaobeiVersion,
  listConversations as mockListConversations,
  patchConversationModel as mockPatchConversationModel,
  regenerateAssistant as mockRegenerateAssistant,
  renameConversation as mockRenameConversation,
  retryAssistant as mockRetryAssistant,
  sendChat as mockSendChat,
  setMessageFeedback as mockSetMessageFeedback,
  stopGeneration as mockStopGeneration,
  subscribeXiaobei as mockSubscribeXiaobei,
  chatPayload,
  codePointLength,
  XIAO_BEI_MAX_TEXT,
  XIAO_BEI_PRO_MODEL,
  type ConversationDetail,
  type ConversationPublic,
  type MessagePublic,
  type PendingFile,
  type PendingImage,
  type SendResult,
  type XiaoBeiModelId,
} from '../mocks/xiaobei'
import type { ApiEnvelope } from '../types/auth'
import { ApiError } from '../types/auth'
import { isMockAuth } from './authService'
import api from './api'
import { throwApiError } from './weddingService'

type SendInput = {
  text: string
  images: PendingImage[]
  files: PendingFile[]
  modelId: XiaoBeiModelId
  replaceUserId?: number
}

type GenerationAccepted = {
  conversation: ConversationPublic
  user_message: MessagePublic | null
  assistant_message: MessagePublic
}

const listeners = new Set<() => void>()
let storeVersion = 0
let cacheUserId = 0
let conversationsLoaded = false
let conversations: ConversationPublic[] = []
const details = new Map<number, ConversationDetail>()
const localFiles = new Map<number, PendingFile[]>()
let eventSource: EventSource | null = null
let eventUserId = 0

function emit() {
  storeVersion += 1
  listeners.forEach((listener) => listener())
}

function apiBase() {
  return String(import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
}

function fallbackEnvelope(): ApiEnvelope<null> {
  return {
    success: false,
    data: null,
    error: '请求失败',
    error_code: 'INTERNAL_ERROR',
    message: null,
    timestamp: '',
    request_id: '',
    metadata: null,
  }
}

function failCopy(kind: MessagePublic['error_kind']) {
  if (kind === 'timeout') return '对不起，本次回答超时了，请您重试。'
  if (kind === 'rate_limited') return '对不起，当前暂时无法回答，请稍后重试。'
  return '对不起，这次没有得到回答，请您重试。'
}

function unwrapData<T>(status: number, envelope: ApiEnvelope<T> | undefined): T {
  if (!envelope || envelope.success === false || envelope.data == null) {
    throw new ApiError(status, {
      success: false,
      data: null,
      error: envelope?.error ?? '请求失败',
      error_code: envelope?.error_code ?? 'INTERNAL_ERROR',
      message: envelope?.message ?? null,
      timestamp: envelope?.timestamp ?? '',
      request_id: envelope?.request_id ?? '',
      metadata: envelope?.metadata ?? null,
    })
  }
  return envelope.data
}

function rejectIfUnauthorized(status: number) {
  if (status === 401 && window.location.pathname !== '/login') {
    window.location.replace('/login')
  }
}

function resetCache(userId: number) {
  if (cacheUserId === userId) return
  cacheUserId = userId
  conversationsLoaded = false
  conversations = []
  details.clear()
  localFiles.clear()
  emit()
}

function sortConversations(items: ConversationPublic[]) {
  return items.slice().sort((a, b) => {
    if (a.last_message_at === b.last_message_at) return b.id - a.id
    return a.last_message_at < b.last_message_at ? 1 : -1
  })
}

function normalizeImage(image: MessagePublic['images'][number]) {
  return {
    id: image.id,
    url: image.url,
    name: image.name || '图片',
  }
}

function normalizeMessage(raw: MessagePublic, previous?: MessagePublic | null): MessagePublic {
  const files = raw.files?.length ? raw.files : previous?.files ?? []
  let content = raw.content ?? ''
  if (raw.status === 'failed' && !content.trim()) content = failCopy(raw.error_kind)
  if (
    previous &&
    previous.status === 'generating' &&
    raw.status === 'generating' &&
    previous.content.length > content.length
  ) {
    content = previous.content
  }
  return {
    ...raw,
    content,
    images: (raw.images ?? []).map(normalizeImage),
    files,
    earlier_unused: !!raw.earlier_unused,
    module_link: raw.module_link ?? null,
    error_kind: raw.error_kind ?? null,
    feedback: raw.feedback ?? 'none',
  }
}

function upsertConversation(item: ConversationPublic) {
  const rest = conversations.filter((row) => row.id !== item.id)
  conversations = sortConversations([item, ...rest])
  const detail = details.get(item.id)
  if (detail) details.set(item.id, { ...detail, conversation: item })
}

function upsertMessage(message: MessagePublic) {
  const current = details.get(message.conversation_id)
  if (!current) return
  const previous = current.messages.find((item) => item.id === message.id) ?? null
  const next = normalizeMessage(message, previous)
  if (localFiles.has(next.id) && !next.files.length) {
    next.files = localFiles.get(next.id)!.map((file) => ({ name: file.name }))
  }
  const messages = current.messages.some((item) => item.id === next.id)
    ? current.messages.map((item) => (item.id === next.id ? next : item))
    : [...current.messages, next].sort((a, b) => a.id - b.id)
  details.set(message.conversation_id, { conversation: current.conversation, messages })
}

function removeMessage(conversationId: number, messageId: number) {
  const current = details.get(conversationId)
  if (!current) return
  details.set(conversationId, {
    conversation: current.conversation,
    messages: current.messages.filter((item) => item.id !== messageId),
  })
  localFiles.delete(messageId)
}

function generatingMessage(conversationId: number) {
  return (
    details
      .get(conversationId)
      ?.messages.find((item) => item.role === 'assistant' && item.status === 'generating') ?? null
  )
}

export function subscribeXiaobei(listener: () => void) {
  if (isMockAuth()) return mockSubscribeXiaobei(listener)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getXiaobeiVersion() {
  if (isMockAuth()) return mockGetXiaobeiVersion()
  return storeVersion
}

export function listConversations(userId: number): ConversationPublic[] {
  if (isMockAuth()) return mockListConversations(userId)
  resetCache(userId)
  return conversations
}

export function getConversationDetail(userId: number, conversationId: number): ConversationDetail | null {
  if (isMockAuth()) return mockGetConversationDetail(userId, conversationId)
  resetCache(userId)
  return details.get(conversationId) ?? null
}

export function getMessageFiles(messageId: number): PendingFile[] {
  if (isMockAuth()) return mockGetMessageFiles(messageId)
  return localFiles.get(messageId)?.map((file) => ({ name: file.name, text: file.text })) ?? []
}

export function conversationsReady() {
  return isMockAuth() || conversationsLoaded
}

async function readSse(response: Response, onEvent: (event: string, data: Record<string, unknown>) => void) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('无流式响应')
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    while (true) {
      const crlf = buffer.indexOf('\r\n\r\n')
      const lf = buffer.indexOf('\n\n')
      let at = -1
      let sepLen = 0
      if (crlf >= 0 && (lf < 0 || crlf <= lf)) {
        at = crlf
        sepLen = 4
      } else if (lf >= 0) {
        at = lf
        sepLen = 2
      }
      if (at < 0) break
      const block = buffer.slice(0, at)
      buffer = buffer.slice(at + sepLen)
      let eventName = 'message'
      const dataLines: string[] = []
      block.split(/\r?\n/).forEach((line) => {
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
      })
      if (!dataLines.length) continue
      onEvent(eventName, JSON.parse(dataLines.join('\n')) as Record<string, unknown>)
    }
  }
}

async function fetchJson(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${apiBase()}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      Accept: 'text/event-stream, application/json',
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  })
  rejectIfUnauthorized(response.status)
  return response
}

async function readApiError(response: Response): Promise<never> {
  let envelope: ApiEnvelope<null> | undefined
  try {
    envelope = (await response.json()) as ApiEnvelope<null>
  } catch {
    envelope = undefined
  }
  throw new ApiError(response.status, envelope ?? fallbackEnvelope())
}

function applyAccepted(accepted: GenerationAccepted, files: PendingFile[]) {
  upsertConversation(accepted.conversation)
  const current = details.get(accepted.conversation.id)
  const incoming = [accepted.user_message, accepted.assistant_message].filter(
    (item): item is MessagePublic => !!item,
  )
  const byId = new Map((current?.messages ?? []).map((item) => [item.id, item]))
  incoming.forEach((item) => byId.set(item.id, normalizeMessage(item, byId.get(item.id) ?? null)))
  if (accepted.user_message && files.length) {
    localFiles.set(
      accepted.user_message.id,
      files.map((file) => ({ name: file.name, text: file.text })),
    )
    const user = byId.get(accepted.user_message.id)
    if (user) user.files = files.map((file) => ({ name: file.name }))
  }
  details.set(accepted.conversation.id, {
    conversation: accepted.conversation,
    messages: [...byId.values()].sort((a, b) => a.id - b.id),
  })
  emit()
}

function applyDelta(conversationId: number, messageId: number, text: string) {
  const current = details.get(conversationId)
  if (!current) return
  const messages = current.messages.map((item) =>
    item.id === messageId ? { ...item, status: 'generating' as const, content: `${item.content}${text}` } : item,
  )
  details.set(conversationId, { conversation: current.conversation, messages })
  emit()
}

function applyDone(payload: Record<string, unknown>) {
  const conversationId = Number(payload.conversation_id)
  const messageId = Number(payload.message_id)
  const current = details.get(conversationId)
  if (!current) return
  const messages = current.messages.map((item) =>
    item.id === messageId
      ? {
          ...item,
          status: 'complete' as const,
          content: String(payload.content ?? item.content),
          earlier_unused: !!payload.earlier_unused,
          module_link: (payload.module_link as MessagePublic['module_link']) ?? null,
          error_kind: null,
        }
      : item,
  )
  details.set(conversationId, { conversation: current.conversation, messages })
  emit()
}

function applyFailed(payload: Record<string, unknown>) {
  const conversationId = Number(payload.conversation_id)
  const messageId = Number(payload.message_id)
  const errorKind = (payload.error_kind as MessagePublic['error_kind']) ?? 'other'
  const current = details.get(conversationId)
  if (!current) return
  const messages = current.messages.map((item) =>
    item.id === messageId
      ? {
          ...item,
          status: 'failed' as const,
          error_kind: errorKind,
          content: failCopy(errorKind),
          module_link: null,
        }
      : item,
  )
  details.set(conversationId, { conversation: current.conversation, messages })
  emit()
}

function applyStopped(payload: Record<string, unknown>) {
  const conversationId = Number(payload.conversation_id)
  const messageId = Number(payload.message_id)
  if (!payload.kept) {
    removeMessage(conversationId, messageId)
    emit()
    return
  }
  const current = details.get(conversationId)
  if (!current) return
  const messages = current.messages.map((item) =>
    item.id === messageId
      ? {
          ...item,
          status: 'stopped' as const,
          content: String(payload.content ?? item.content),
        }
      : item,
  )
  details.set(conversationId, { conversation: current.conversation, messages })
  emit()
}

function applyEvent(eventName: string, data: Record<string, unknown>) {
  if (eventName === 'conversation.upserted') {
    upsertConversation(data as unknown as ConversationPublic)
    emit()
    return
  }
  if (eventName === 'conversation.deleted') {
    const id = Number(data.id)
    conversations = conversations.filter((item) => item.id !== id)
    details.delete(id)
    emit()
    return
  }
  if (eventName === 'message.upserted') {
    const message = data as unknown as MessagePublic
    if (!details.has(message.conversation_id)) return
    upsertMessage(message)
    emit()
  }
}

function consumeGeneration(response: Response, files: PendingFile[]): Promise<ConversationPublic> {
  return new Promise((resolve, reject) => {
    let conversation: ConversationPublic | null = null
    void readSse(response, (eventName, data) => {
      if (eventName === 'accepted') {
        const accepted = data as unknown as GenerationAccepted
        conversation = accepted.conversation
        applyAccepted(accepted, files)
        resolve(accepted.conversation)
        return
      }
      if (eventName === 'delta') {
        applyDelta(Number(data.conversation_id), Number(data.message_id), String(data.text ?? ''))
        return
      }
      if (eventName === 'done') {
        applyDone(data)
        return
      }
      if (eventName === 'failed') {
        applyFailed(data)
        return
      }
      if (eventName === 'stopped') {
        applyStopped(data)
      }
    }).then(() => {
      if (!conversation) reject(new Error('生成未开始'))
    }).catch((error) => {
      if (!conversation) reject(error instanceof Error ? error : new Error('请求失败'))
    })
  })
}

async function uploadPendingImage(image: PendingImage): Promise<number> {
  if (!image.src.startsWith('data:')) return image.id
  const [header, body] = image.src.split(',')
  const mime = /data:(.*?);/.exec(header)?.[1] || 'image/png'
  const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0))
  const file = new File([bytes], image.name || '图片', { type: mime })
  const form = new FormData()
  form.append('file', file)
  try {
    const response = await api.post<ApiEnvelope<{ id: number; url: string }>>('/conversation_images', form)
    return unwrapData(response.status, response.data).id
  } catch (error) {
    throwApiError(error)
  }
}

async function resolveImageIds(images: PendingImage[]) {
  const ids: number[] = []
  for (const image of images) {
    ids.push(await uploadPendingImage(image))
  }
  return ids
}

function validateSend(input: SendInput): SendResult | null {
  const modelText = chatPayload(input.text, input.files)
  if (input.modelId === XIAO_BEI_PRO_MODEL && input.images.length) {
    return { ok: false, error: '当前模型看不了图片，请改用 Flash 后再发送图片。' }
  }
  if (!codePointLength(modelText) && !input.images.length) return { ok: false, error: '' }
  if (codePointLength(modelText) > XIAO_BEI_MAX_TEXT) {
    return { ok: false, error: '您输入的文案太长了，请您缩减后再次发送。' }
  }
  return null
}

export async function refreshConversations(userId: number) {
  if (isMockAuth()) return mockListConversations(userId)
  resetCache(userId)
  try {
    const response = await api.get<ApiEnvelope<ConversationPublic[]>>('/conversations')
    conversations = sortConversations(unwrapData(response.status, response.data))
    conversationsLoaded = true
    emit()
    return conversations
  } catch (error) {
    throwApiError(error)
  }
}

export async function loadConversationDetail(userId: number, conversationId: number) {
  if (isMockAuth()) return mockGetConversationDetail(userId, conversationId)
  resetCache(userId)
  try {
    const response = await api.get<ApiEnvelope<ConversationDetail>>(`/conversations/${conversationId}`)
    const data = unwrapData(response.status, response.data)
    const previous = details.get(conversationId)
    const messages = data.messages.map((item) =>
      normalizeMessage(item, previous?.messages.find((row) => row.id === item.id) ?? null),
    )
    details.set(conversationId, { conversation: data.conversation, messages })
    upsertConversation(data.conversation)
    emit()
    return details.get(conversationId) ?? null
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      conversations = conversations.filter((item) => item.id !== conversationId)
      details.delete(conversationId)
      emit()
      return null
    }
    throwApiError(error)
  }
}

export function startConversationEvents(userId: number) {
  if (isMockAuth()) return () => undefined
  resetCache(userId)
  if (eventSource && eventUserId === userId) {
    return () => undefined
  }
  eventSource?.close()
  eventUserId = userId
  const source = new EventSource(`${apiBase()}/conversations/events`, { withCredentials: true })
  eventSource = source
  const onEvent = (event: Event) => {
    const message = event as MessageEvent<string>
    if (!message.data) return
    try {
      applyEvent(message.type, JSON.parse(message.data) as Record<string, unknown>)
    } catch {
      return
    }
  }
  source.addEventListener('conversation.upserted', onEvent)
  source.addEventListener('conversation.deleted', onEvent)
  source.addEventListener('message.upserted', onEvent)
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) {
      eventSource = null
    }
  }
  return () => {
    if (eventSource === source) {
      source.close()
      eventSource = null
      eventUserId = 0
    }
  }
}

export async function patchConversationModel(
  userId: number,
  conversationId: number,
  modelId: XiaoBeiModelId,
) {
  if (isMockAuth()) return mockPatchConversationModel(userId, conversationId, modelId)
  try {
    const response = await api.patch<ApiEnvelope<ConversationPublic>>(`/conversations/${conversationId}`, {
      model_id: modelId,
    })
    const updated = unwrapData(response.status, response.data)
    upsertConversation(updated)
    emit()
    return updated
  } catch (error) {
    throwApiError(error)
  }
}

export async function renameConversation(
  userId: number,
  conversationId: number,
  title: string,
): Promise<SendResult> {
  if (isMockAuth()) return mockRenameConversation(userId, conversationId, title)
  const next = title.trim()
  if (!next) return { ok: false, error: 'empty' }
  if (codePointLength(next) > 200) return { ok: false, error: 'too_long' }
  try {
    const response = await api.patch<ApiEnvelope<ConversationPublic>>(`/conversations/${conversationId}`, {
      title: next,
    })
    const updated = unwrapData(response.status, response.data)
    upsertConversation(updated)
    emit()
    return { ok: true, conversation: updated }
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.error }
    throwApiError(error)
  }
}

export async function deleteConversation(userId: number, conversationId: number) {
  if (isMockAuth()) return mockDeleteConversation(userId, conversationId)
  try {
    await api.delete(`/conversations/${conversationId}`)
    conversations = conversations.filter((item) => item.id !== conversationId)
    details.delete(conversationId)
    emit()
    return { ok: true }
  } catch (error) {
    throwApiError(error)
  }
}

export async function setMessageFeedback(userId: number, messageId: number, value: 'like' | 'dislike') {
  if (isMockAuth()) return mockSetMessageFeedback(userId, messageId, value)
  const host = [...details.values()].find((item) => item.messages.some((row) => row.id === messageId))
  const message = host?.messages.find((item) => item.id === messageId)
  if (!host || !message) return null
  const feedback = message.feedback === value ? 'none' : value
  try {
    const response = await api.patch<ApiEnvelope<MessagePublic>>(
      `/conversations/${host.conversation.id}/messages/${messageId}/feedback`,
      { feedback },
    )
    const updated = unwrapData(response.status, response.data)
    upsertMessage(updated)
    emit()
    return updated
  } catch (error) {
    throwApiError(error)
  }
}

export async function stopGeneration(userId: number, conversationId: number) {
  if (isMockAuth()) return mockStopGeneration(userId, conversationId)
  const assistant = generatingMessage(conversationId)
  if (!assistant) return null
  try {
    const response = await api.post<ApiEnvelope<{ message: MessagePublic }>>(
      `/conversations/${conversationId}/messages/${assistant.id}/stop`,
    )
    const payload = unwrapData(response.status, response.data).message
    if (!payload.content) removeMessage(conversationId, assistant.id)
    else upsertMessage({ ...payload, status: payload.status === 'generating' ? 'stopped' : payload.status })
    emit()
    return true
  } catch (error) {
    throwApiError(error)
  }
}

const XIAO_BEI_TEST_FAULTS = new Set(['hold-first', 'timeout', 'rate_limited', 'mid-fail'])

function xiaobeiTestFaultHeader(): Record<string, string> {
  try {
    const value = sessionStorage.getItem('xiaobei-test-fault')
    if (value && XIAO_BEI_TEST_FAULTS.has(value)) {
      return { 'X-Xiaobei-Test-Fault': value }
    }
  } catch {
    return {}
  }
  return {}
}

async function startStream(
  method: 'POST' | 'PATCH',
  path: string,
  body: unknown,
  files: PendingFile[],
) {
  const response = await fetchJson(path, {
    method,
    body: body == null ? undefined : JSON.stringify(body),
    headers: xiaobeiTestFaultHeader(),
  })
  if (!response.ok) await readApiError(response)
  const type = response.headers.get('content-type') || ''
  if (!type.includes('text/event-stream')) await readApiError(response)
  return consumeGeneration(response, files)
}

export async function sendChat(userId: number, conversationId: number | null, input: SendInput): Promise<SendResult> {
  if (isMockAuth()) return mockSendChat(userId, conversationId, input)
  const blocked = validateSend(input)
  if (blocked) return blocked
  const text = chatPayload(input.text, input.files)
  try {
    const imageIds = await resolveImageIds(input.images)
    if (input.replaceUserId && conversationId) {
      const conversation = await startStream(
        'PATCH',
        `/conversations/${conversationId}/messages/${input.replaceUserId}`,
        { text, image_ids: imageIds },
        input.files,
      )
      return { ok: true, conversation }
    }
    if (!conversationId) {
      const conversation = await startStream(
        'POST',
        '/conversations',
        { text, image_ids: imageIds, model_id: input.modelId },
        input.files,
      )
      return { ok: true, conversation }
    }
    const current = details.get(conversationId)?.conversation
    if (current && current.model_id !== input.modelId) {
      await patchConversationModel(userId, conversationId, input.modelId)
    }
    const conversation = await startStream(
      'POST',
      `/conversations/${conversationId}/messages`,
      { text, image_ids: imageIds },
      input.files,
    )
    return { ok: true, conversation }
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.error }
    throw error instanceof Error ? error : new Error('请求失败')
  }
}

export async function retryAssistant(userId: number, messageId: number): Promise<SendResult> {
  if (isMockAuth()) return mockRetryAssistant(userId, messageId)
  const host = [...details.values()].find((item) => item.messages.some((row) => row.id === messageId))
  if (!host) return { ok: false, error: '消息不存在' }
  try {
    const conversation = await startStream(
      'POST',
      `/conversations/${host.conversation.id}/messages/${messageId}/retry`,
      null,
      [],
    )
    return { ok: true, conversation }
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.error }
    throw error instanceof Error ? error : new Error('请求失败')
  }
}

export async function regenerateAssistant(userId: number, messageId: number): Promise<SendResult> {
  if (isMockAuth()) return mockRegenerateAssistant(userId, messageId)
  const host = [...details.values()].find((item) => item.messages.some((row) => row.id === messageId))
  if (!host) return { ok: false, error: '消息不存在' }
  try {
    const conversation = await startStream(
      'POST',
      `/conversations/${host.conversation.id}/messages/${messageId}/regenerate`,
      null,
      [],
    )
    return { ok: true, conversation }
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.error }
    throw error instanceof Error ? error : new Error('请求失败')
  }
}
