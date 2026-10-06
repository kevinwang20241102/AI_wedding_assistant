import type { ApiEnvelope } from '../types/auth'
import { getMockWedding } from './wedding'

export const XIAO_BEI_MAX_TEXT = 4000
export const XIAO_BEI_TITLE_LIMIT = 200
export const XIAO_BEI_IMAGE_LIMIT = 5 * 1024 * 1024
export const XIAO_BEI_DEFAULT_MODEL = 'deepseek-flash'
export const XIAO_BEI_PRO_MODEL = 'deepseek-v4-pro'

export const MODEL_OPTIONS = [
  { id: 'deepseek-flash', name: 'Deepseek-flash', note: '适合快速输出' },
  { id: 'deepseek-v4-pro', name: 'Deepseek-v4-pro', note: '适合深度思考' },
] as const

export type XiaoBeiModelId = (typeof MODEL_OPTIONS)[number]['id']

export type ConversationPublic = {
  id: number
  title: string
  title_customized: boolean
  model_id: XiaoBeiModelId
  created_at: string
  updated_at: string
  last_message_at: string
}

export type MessageImagePublic = {
  id: number
  url: string
  name: string
}

export type MessagePublic = {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  status: 'complete' | 'generating' | 'failed' | 'stopped'
  error_kind: 'timeout' | 'rate_limited' | 'other' | null
  content: string
  earlier_unused: boolean
  module_link: 'plan' | 'budget' | 'seating' | null
  feedback: 'like' | 'dislike' | 'none'
  images: MessageImagePublic[]
  files: { name: string }[]
  model_id: XiaoBeiModelId | null
  created_at: string
}

export type ConversationDetail = {
  conversation: ConversationPublic
  messages: MessagePublic[]
}

export type PendingImage = {
  id: number
  name: string
  src: string
}

export type PendingFile = {
  name: string
  text: string
}

export type SendResult =
  | { ok: true; conversation: ConversationPublic }
  | { ok: false; error: string }

type ConversationRecord = ConversationPublic & { user_id: number }
type MessageRecord = Omit<MessagePublic, 'files'> & {
  source: string
  has_image: boolean
  files: PendingFile[]
}
type ImageRecord = MessageImagePublic & { user_id: number; message_id: number | null }

const listeners = new Set<() => void>()
let storeVersion = 0
let nextConversationId = 1
let nextMessageId = 1
let nextImageId = 1
let streamTimer: ReturnType<typeof setInterval> | null = null
let streamTarget: { userId: number; conversationId: number; messageId: number; full: string } | null = null

const conversations: ConversationRecord[] = []
const messages: MessageRecord[] = []
const images: ImageRecord[] = []

function nowIso() {
  const now = new Date()
  const offset = 8 * 60
  const local = new Date(now.getTime() + offset * 60 * 1000)
  return local.toISOString().replace('Z', '+08:00')
}

function requestId() {
  return `mock-${Math.random().toString(36).slice(2, 10)}`
}

function successEnvelope<T>(data: T): ApiEnvelope<T> {
  return {
    success: true,
    data,
    error: null,
    error_code: null,
    message: 'success',
    timestamp: nowIso(),
    request_id: requestId(),
    metadata: { mock: true },
  }
}

function emit() {
  storeVersion += 1
  listeners.forEach((listener) => listener())
}

export function subscribeXiaobei(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getXiaobeiVersion() {
  return storeVersion
}

function toConversationDto(record: ConversationRecord): ConversationPublic {
  return {
    id: record.id,
    title: record.title,
    title_customized: record.title_customized,
    model_id: record.model_id,
    created_at: record.created_at,
    updated_at: record.updated_at,
    last_message_at: record.last_message_at,
  }
}

function toImageDto(record: ImageRecord): MessageImagePublic {
  return { id: record.id, url: record.url, name: record.name }
}

function toMessageDto(record: MessageRecord): MessagePublic {
  return {
    id: record.id,
    conversation_id: record.conversation_id,
    role: record.role,
    status: record.status,
    error_kind: record.error_kind,
    content: record.content,
    earlier_unused: record.earlier_unused,
    module_link: record.module_link,
    feedback: record.feedback,
    images: images.filter((image) => image.message_id === record.id).map(toImageDto),
    files: record.files.map((file) => ({ name: file.name })),
    model_id: record.model_id,
    created_at: record.created_at,
  }
}

export function modelName(id: string) {
  return MODEL_OPTIONS.find((item) => item.id === id)?.name ?? MODEL_OPTIONS[0].name
}

export function chatPayload(typed: string, files: PendingFile[]) {
  const body = files.map((file) => file.text).join('\n')
  return [typed, body].filter((part) => part.length).join('\n')
}

export function codePointLength(text: string) {
  return [...text].length
}

export function yuan(fen: number) {
  return (fen / 100).toFixed(2)
}

function slashDate(iso: string) {
  const [year, month, day] = String(iso || '').split('-').map(Number)
  if (!year || !month || !day) return ''
  return `${year}/${month}/${day}`
}

function listForUser(userId: number) {
  return conversations
    .filter((item) => item.user_id === userId)
    .slice()
    .sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1))
}

export function listConversations(userId: number): ConversationPublic[] {
  return listForUser(userId).map(toConversationDto)
}

export function getConversationDetail(userId: number, conversationId: number): ConversationDetail | null {
  const conversation = conversations.find((item) => item.user_id === userId && item.id === conversationId)
  if (!conversation) return null
  return {
    conversation: toConversationDto(conversation),
    messages: messages
      .filter((item) => item.conversation_id === conversationId)
      .slice()
      .sort((a, b) => a.id - b.id)
      .map(toMessageDto),
  }
}

export function listConversationsResponse(userId: number) {
  return successEnvelope(listConversations(userId))
}

export function getConversationResponse(userId: number, conversationId: number) {
  const detail = getConversationDetail(userId, conversationId)
  return detail ? successEnvelope(detail) : null
}

function clearStream() {
  if (streamTimer) {
    clearInterval(streamTimer)
    streamTimer = null
  }
  streamTarget = null
}

function failCopy(kind: 'timeout' | 'rate_limited' | 'other') {
  if (kind === 'timeout') return '对不起，本次回答超时了，请您重试。'
  if (kind === 'rate_limited') return '对不起，当前暂时无法回答，请稍后重试。'
  return '对不起，这次没有得到回答，请您重试。'
}

function mockReply(text: string, userId: number, hasImage: boolean) {
  const wedding = getMockWedding(userId)
  const city = wedding?.city || ''
  const budget = yuan(wedding?.total_budget_fen ?? 0)
  const date = slashDate(wedding?.wedding_date ?? '')
  const people = wedding?.guest_estimate ?? 0
  if (text === '演示超时') return { fail: 'timeout' as const }
  if (text === '演示繁忙') return { fail: 'rate_limited' as const }
  if (text === '演示失败') return { fail: 'other' as const }
  if (text === '演示长文') {
    return {
      text: '备婚这件事，建议你先把三块地基打牢：日期、场地、总预算。日期不是越早越好，而是要同时看双方家里的空档、亲友能不能到场，以及场地那天有没有档期。场地先问清能摆几桌、进场时间、是否含桌椅餐具和音响，再去现场走一遍宾客动线、化妆间和洗手间。总预算先按你们能接受的上限写死，再拆到场地餐饮、人员、礼服、摄影摄像、布置和纸品伴手礼，每项先询价再付钱，避免先付了定金才发现不包含服务。\n\n人员这块，司仪、跟妆、摄影摄像最好各看两家，对比同一天的档期和成片标准。礼服按试纱次数和改衣是否收费来问。宾客名单尽早收齐，主桌留给双方父母和证婚人，老人小孩靠近通道和洗手间，同事朋友按熟悉程度分桌，不要把不熟的人硬凑一桌。请柬发出去之后，确认出席的人再排座，待定的人先留空位。\n\n当天流程可以按迎接、仪式、用餐、敬酒、送客来排。仪式环节把证婚、交换戒指、改口的顺序提前写在司仪本上。用餐时主桌先动筷，敬酒按桌走，避免来回穿插。布置和灯光尽量提前一天进场彩排，当天只做微调。请柬、席位卡和伴手礼可以同一家做，减少对接次数。合同里写清延期、改期和不可抗力怎么处理，这一点务必当面确认。这些都是参考思路，具体以商家合同和当地习俗为准。',
    }
  }
  const outside =
    '对不起，您的问题在我的知识库之外，我只能回答结婚、婚礼、备婚、礼仪、流程、预算思路，以及宾客和座位思路相关问题。'
  const inScope =
    hasImage ||
    /结婚|婚礼|备婚|礼仪|流程|预算|宾客|座位|婚宴|场地|彩礼|定金|法律|吉日|任务|酒店|婚纱|新郎|新娘|蜜月|请柬|司仪|伴郎|伴娘|证婚|敬酒|改口|宴席|主桌|档期|婚庆|伴手礼|喜糖|迎亲|仪式|展开|写详细|不确定/.test(
      text,
    ) ||
    /wedding|bride|groom|ceremony|guest|venue|budget/i.test(text)
  if (!inScope) return { text: outside }
  let link: 'plan' | 'budget' | 'seating' | '' = ''
  if (/任务|做到哪|下一步/.test(text)) link = 'plan'
  else if (/分类|已分配|还剩多少|餐饮现在/.test(text)) link = 'budget'
  else if (/谁还没|我的宾客|排座名单/.test(text)) link = 'seating'
  const wan = String(text).match(/(\d+(?:\.\d+)?)\s*万/)
  let budgetNote = ''
  if (wan) {
    const stated = Number(wan[1]) * 10000
    const mine = (wedding?.total_budget_fen ?? 0) / 100
    if (stated >= mine * 2) {
      budgetNote = `\n按您提问的标准，您档案中的总预算是 ${budget}，远低于这个标准。`
    }
  }
  let body = '先把日期、场地和总预算定下来，再往下排人员、礼服和宾客。'
  if (/我的婚礼|档案|总预算是多少|多少人/.test(text)) {
    body = `你的婚礼定在 ${date}，${city}，总预算 ${budget} 元，档案人数 ${people}。`
  }
  if (hasImage) body = '我看到你发来的图片。先核对三件事：能容纳的人数、交通是否方便、报价里包含哪些项目。'
  if (/场地/.test(text)) {
    body = `选${/北京/.test(text) ? '北京' : city || '当地'}的场地，先问清桌数、档期和报价包含什么，再去现场看动线。`
  }
  if (/几月|最佳/.test(text) && /婚礼|时间/.test(text)) {
    body = '没有唯一的最佳月份。先看你们的档期、场地空档和亲友是否方便到场。'
  }
  if (/预算一般包含/.test(text)) {
    body = '婚礼预算通常包括场地、餐饮、人员、礼服、摄影摄像、布置和纸品伴手礼。具体金额要向商家逐项询价。'
  }
  if (/座位应该如何/.test(text)) body = '婚宴座位先定主桌，再按亲属和朋友分桌，并留出老人和小孩的位置。'
  if (/加一条任务/.test(text)) {
    body = '我不能直接改计划书。你可以自己加一条任务，写上名称和截止日期。'
    link = 'plan'
  }
  if (/预算改成/.test(text)) {
    body = '我不能直接改预算。你可以到预算管理本里改这一项的金额。'
    link = 'budget'
  }
  if (/彩礼/.test(text)) {
    body = '彩礼包含哪些、各地差多少，没有一个可以照搬的金额。\n以上回答仅提供参考，不作为专业意见，建议咨询对应的专业人士。'
  }
  if (/定金|法律/.test(text)) {
    body = '合同和定金是否有效，要看你们签的具体条款。建议咨询律师。\n以上回答仅提供参考，不作为专业意见，建议咨询对应的专业人士。'
  }
  if (/不确定|吉日一定/.test(text)) body = '这一点我不能确定。你可以先问两家场地同一天的空档，再决定。'
  if (/^[A-Za-z0-9\s?,.'!]{8,}$/.test(text)) {
    body = '你可以先列出婚礼当天的顺序：迎接、仪式、用餐、送客。需要的话我再展开每一步。'
  }
  if (/展开|写详细/.test(text)) {
    body = '先定日期和场地，再分预算，然后确定人员、礼服和宾客。每一步都先问清包含的项目，再付钱。'
  }
  if (link === 'plan' && !/加一条任务/.test(text)) {
    body = '我看不到你的任务清单。打开备婚计划书就能看到当前阶段和每一项。'
  }
  if (link === 'budget' && !/预算改成/.test(text)) {
    body = '我看不到各分类分了多少。打开预算管理本可以看已分配和未分配。'
  }
  if (link === 'seating') body = '我看不到宾客名单。打开婚宴座位表可以看谁还没入座。'
  return { text: body + budgetNote, link: link || undefined }
}

function beginStream(userId: number, conversation: ConversationRecord, assistant: MessageRecord) {
  clearStream()
  const result = mockReply(assistant.source, userId, assistant.has_image)
  if ('fail' in result && result.fail) {
    assistant.status = 'failed'
    assistant.error_kind = result.fail
    assistant.content = failCopy(result.fail)
    conversation.updated_at = nowIso()
    conversation.last_message_at = conversation.updated_at
    emit()
    return
  }
  const full = result.text
  assistant.module_link = result.link ?? null
  assistant.status = 'generating'
  assistant.content = ''
  emit()
  let index = 0
  streamTarget = { userId, conversationId: conversation.id, messageId: assistant.id, full }
  streamTimer = setInterval(() => {
    const target = streamTarget
    if (!target) return
    const current = messages.find((item) => item.id === target.messageId)
    const conv = conversations.find((item) => item.id === target.conversationId)
    if (!current || !conv) {
      clearStream()
      return
    }
    index = Math.min(full.length, index + 2)
    current.content = full.slice(0, index)
    if (index < full.length) {
      emit()
      return
    }
    clearStream()
    current.status = 'complete'
    current.content = full
    conv.updated_at = nowIso()
    conv.last_message_at = conv.updated_at
    emit()
  }, 28)
}

export function patchConversationModel(userId: number, conversationId: number, modelId: XiaoBeiModelId) {
  const conversation = conversations.find((item) => item.user_id === userId && item.id === conversationId)
  if (!conversation) return null
  conversation.model_id = modelId
  conversation.updated_at = nowIso()
  emit()
  return toConversationDto(conversation)
}

export function renameConversation(userId: number, conversationId: number, title: string): SendResult {
  const conversation = conversations.find((item) => item.user_id === userId && item.id === conversationId)
  if (!conversation) return { ok: false, error: '对话不存在' }
  const next = title.trim()
  if (!next) return { ok: false, error: 'empty' }
  if (codePointLength(next) > XIAO_BEI_TITLE_LIMIT) return { ok: false, error: 'too_long' }
  if (next === conversation.title) return { ok: true, conversation: toConversationDto(conversation) }
  conversation.title = next
  conversation.title_customized = true
  conversation.updated_at = nowIso()
  emit()
  return { ok: true, conversation: toConversationDto(conversation) }
}

export function deleteConversation(userId: number, conversationId: number) {
  const conversation = conversations.find((item) => item.user_id === userId && item.id === conversationId)
  if (!conversation) return { ok: false }
  if (streamTarget?.conversationId === conversationId) clearStream()
  const messageIds = messages.filter((item) => item.conversation_id === conversationId).map((item) => item.id)
  for (let i = images.length - 1; i >= 0; i -= 1) {
    const imageMessageId = images[i].message_id
    if (imageMessageId != null && messageIds.includes(imageMessageId)) images.splice(i, 1)
  }
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].conversation_id === conversationId) messages.splice(i, 1)
  }
  const at = conversations.findIndex((item) => item.id === conversationId)
  if (at >= 0) conversations.splice(at, 1)
  emit()
  return { ok: true }
}

export function setMessageFeedback(userId: number, messageId: number, value: 'like' | 'dislike') {
  const message = messages.find((item) => item.id === messageId)
  const conversation = message && conversations.find((item) => item.id === message.conversation_id && item.user_id === userId)
  if (!message || !conversation || message.role !== 'assistant') return null
  message.feedback = message.feedback === value ? 'none' : value
  emit()
  return toMessageDto(message)
}

export function stopGeneration(userId: number, conversationId: number) {
  const conversation = conversations.find((item) => item.user_id === userId && item.id === conversationId)
  if (!conversation) return null
  const assistant = messages.find(
    (item) => item.conversation_id === conversationId && item.status === 'generating',
  )
  if (!assistant) return null
  clearStream()
  if (!assistant.content) {
    const at = messages.findIndex((item) => item.id === assistant.id)
    if (at >= 0) messages.splice(at, 1)
  } else {
    assistant.status = 'stopped'
  }
  conversation.updated_at = nowIso()
  conversation.last_message_at = conversation.updated_at
  emit()
  return true
}

type SendInput = {
  text: string
  images: PendingImage[]
  files: PendingFile[]
  modelId: XiaoBeiModelId
  replaceUserId?: number
  retry?: boolean
}

export function sendChat(userId: number, conversationId: number | null, input: SendInput): SendResult {
  const modelText = chatPayload(input.text, input.files)
  if (input.modelId === XIAO_BEI_PRO_MODEL && input.images.length) {
    return { ok: false, error: '当前模型看不了图片，请改用 Flash 后再发送图片。' }
  }
  if (!codePointLength(modelText) && !input.images.length) {
    return { ok: false, error: '' }
  }
  if (codePointLength(modelText) > XIAO_BEI_MAX_TEXT) {
    return { ok: false, error: '您输入的文案太长了，请您缩减后再次发送。' }
  }

  const stamp = nowIso()
  let conversation = conversationId
    ? conversations.find((item) => item.user_id === userId && item.id === conversationId) ?? null
    : null
  const titleSeed = input.text || input.files[0]?.name || '图片'
  if (!conversation) {
    conversation = {
      id: nextConversationId,
      user_id: userId,
      title: titleSeed,
      title_customized: false,
      model_id: input.modelId,
      created_at: stamp,
      updated_at: stamp,
      last_message_at: stamp,
    }
    nextConversationId += 1
    conversations.unshift(conversation)
  }
  conversation.model_id = input.modelId

  let userMsg: MessageRecord | undefined
  if (input.replaceUserId) {
    const existing = messages.find((item) => item.id === input.replaceUserId && item.conversation_id === conversation.id)
    if (!existing) return { ok: false, error: '消息不存在' }
    userMsg = existing
    existing.content = input.text
    existing.source = modelText
    existing.has_image = input.images.length > 0
    existing.files = input.files.map((file) => ({ name: file.name, text: file.text }))
    images.filter((image) => image.message_id === existing.id).forEach((image) => {
      image.message_id = null
    })
    input.images.forEach((image) => {
      images.push({
        id: image.id || nextImageId++,
        user_id: userId,
        message_id: existing.id,
        url: image.src,
        name: image.name,
      })
    })
    const at = messages.findIndex((item) => item.id === existing.id)
    messages.splice(at + 1)
  } else if (!input.retry) {
    userMsg = {
      id: nextMessageId,
      conversation_id: conversation.id,
      role: 'user',
      status: 'complete',
      error_kind: null,
      content: input.text,
      earlier_unused: false,
      module_link: null,
      feedback: 'none',
      images: [],
      files: input.files.map((file) => ({ name: file.name, text: file.text })),
      model_id: null,
      created_at: stamp,
      source: modelText,
      has_image: input.images.length > 0,
    }
    nextMessageId += 1
    messages.push(userMsg)
    input.images.forEach((image) => {
      images.push({
        id: nextImageId,
        user_id: userId,
        message_id: userMsg!.id,
        url: image.src,
        name: image.name,
      })
      nextImageId += 1
    })
    const userCount = messages.filter((item) => item.conversation_id === conversation.id && item.role === 'user').length
    if (!conversation.title_customized && userCount === 1) conversation.title = titleSeed
  } else {
    userMsg = [...messages]
      .reverse()
      .find((item) => item.conversation_id === conversation.id && item.role === 'user')
  }

  const priorDone = messages.filter(
    (item) => item.conversation_id === conversation.id && item.role === 'assistant' && item.status === 'complete',
  ).length
  const assistant: MessageRecord = {
    id: nextMessageId,
    conversation_id: conversation.id,
    role: 'assistant',
    status: 'generating',
    error_kind: null,
    content: '',
    earlier_unused: priorDone >= 4,
    module_link: null,
    feedback: 'none',
    images: [],
    files: [],
    model_id: input.modelId,
    created_at: nowIso(),
    source: userMsg?.source || modelText,
    has_image: userMsg?.has_image || input.images.length > 0,
  }
  nextMessageId += 1
  messages.push(assistant)
  conversation.updated_at = nowIso()
  conversation.last_message_at = conversation.updated_at
  emit()
  beginStream(userId, conversation, assistant)
  return { ok: true, conversation: toConversationDto(conversation) }
}

export function retryAssistant(userId: number, messageId: number): SendResult {
  const assistant = messages.find((item) => item.id === messageId)
  const conversation = assistant && conversations.find((item) => item.id === assistant.conversation_id && item.user_id === userId)
  if (!assistant || !conversation || assistant.role !== 'assistant') return { ok: false, error: '消息不存在' }
  const prev = [...messages]
    .reverse()
    .find((item) => item.conversation_id === conversation.id && item.role === 'user' && item.id < assistant.id)
  const at = messages.findIndex((item) => item.id === assistant.id)
  messages.splice(at, 1)
  emit()
  return sendChat(userId, conversation.id, {
    text: prev?.content || '',
    images: images
      .filter((image) => image.message_id === prev?.id)
      .map((image) => ({ id: image.id, name: image.name, src: image.url })),
    files: prev ? getMessageFiles(prev.id) : [],
    modelId: conversation.model_id,
    retry: true,
  })
}

export function regenerateAssistant(userId: number, messageId: number): SendResult {
  return retryAssistant(userId, messageId)
}

export function getMessageFiles(messageId: number): PendingFile[] {
  const message = messages.find((item) => item.id === messageId)
  return message ? message.files.map((file) => ({ name: file.name, text: file.text })) : []
}

export function userMessageLong(text: string) {
  return codePointLength(text) > 160 || text.split('\n').length > 4
}

export function isImageFile(file: File) {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)
}

export function isMediaNonImage(file: File) {
  return file.type.startsWith('video/') || file.type.startsWith('audio/') || !file.type.startsWith('image/')
}
