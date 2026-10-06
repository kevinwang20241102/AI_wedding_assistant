import { ApiError } from '../types/auth'
import type { ApiEnvelope } from '../types/auth'
import { delay } from './auth'
import { getSeating } from './seating'

export type CreateWeddingRequest = {
  start_date: string
  wedding_date: string
  city: string
  total_budget_fen: number
  guest_estimate: number
}

export type WeddingPublic = {
  id: number
  start_date: string
  wedding_date: string
  city: string
  total_budget_fen: number
  guest_estimate: number
  groom_nickname: string | null
  groom_birthday: string | null
  bride_nickname: string | null
  bride_birthday: string | null
  other_preference: string | null
  canvas_scale: number
  canvas_offset_x: number
  canvas_offset_y: number
}

export type SeatingStatsPublic = {
  guest_total: number
  confirmed_count: number
  seated_count: number
  unseated_count: number
}

export type WeddingCurrentData = WeddingPublic & {
  seating_stats: SeatingStatsPublic
}

export type PatchWeddingRequest = {
  start_date?: string
  wedding_date?: string
  city?: string
  total_budget_fen?: number
  guest_estimate?: number
  groom_nickname?: string | null
  groom_birthday?: string | null
  bride_nickname?: string | null
  bride_birthday?: string | null
  other_preference?: string | null
  canvas_scale?: number
  canvas_offset_x?: number
  canvas_offset_y?: number
}

export type WeddingPhotoListItem = {
  id: number
  url: string
}

export type WeddingPhotoUploadData = {
  id: number
  url: string
}

type WeddingRecord = WeddingPublic & { user_id: number }

type WeddingPhotoRecord = {
  id: number
  user_id: number
  wedding_id: number
  url: string
}

let nextWeddingId = 2
const weddings: WeddingRecord[] = [
  {
    id: 1,
    user_id: 1,
    start_date: '2026-10-02',
    wedding_date: '2027-10-20',
    city: '杭州',
    total_budget_fen: 20000000,
    guest_estimate: 80,
    groom_nickname: null,
    groom_birthday: null,
    bride_nickname: null,
    bride_birthday: null,
    other_preference: null,
    canvas_scale: 1,
    canvas_offset_x: 0,
    canvas_offset_y: 0,
  },
]

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const PHOTO_LIMIT = 5242880
let nextPhotoId = 1
const photos: WeddingPhotoRecord[] = []

function nowIso() {
  return new Date().toISOString()
}

function requestId() {
  return `mock-${Math.random().toString(36).slice(2, 10)}`
}

function successEnvelope<T>(data: T, message: string): ApiEnvelope<T> {
  return {
    success: true,
    data,
    error: null,
    error_code: null,
    message,
    timestamp: nowIso(),
    request_id: requestId(),
    metadata: { mock: true },
  }
}

function failEnvelope(error: string, error_code: string): ApiEnvelope<null> {
  return {
    success: false,
    data: null,
    error,
    error_code,
    message: null,
    timestamp: nowIso(),
    request_id: requestId(),
    metadata: { mock: true },
  }
}

function fail(status: number, error: string, error_code: string): never {
  throw new ApiError(status, failEnvelope(error, error_code))
}

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function toPublic(record: WeddingRecord): WeddingPublic {
  return {
    id: record.id,
    start_date: record.start_date,
    wedding_date: record.wedding_date,
    city: record.city,
    total_budget_fen: record.total_budget_fen,
    guest_estimate: record.guest_estimate,
    groom_nickname: record.groom_nickname,
    groom_birthday: record.groom_birthday,
    bride_nickname: record.bride_nickname,
    bride_birthday: record.bride_birthday,
    other_preference: record.other_preference,
    canvas_scale: record.canvas_scale,
    canvas_offset_x: record.canvas_offset_x,
    canvas_offset_y: record.canvas_offset_y,
  }
}

export function getMockWedding(userId: number) {
  const record = weddings.find((item) => item.user_id === userId)
  return record ? toPublic(record) : null
}

export async function mockCreateWedding(userId: number, input: CreateWeddingRequest) {
  await delay(250)
  if (!input.start_date) fail(400, '请填写开始备婚日期', 'VALIDATION_ERROR')
  if (!input.wedding_date) fail(400, '请填写婚礼日期', 'VALIDATION_ERROR')
  if (!input.city.trim()) fail(400, '请填写城市', 'VALIDATION_ERROR')
  if (!isValidDate(input.start_date) || !isValidDate(input.wedding_date)) {
    fail(400, '日期不合法', 'VALIDATION_ERROR')
  }
  if (input.wedding_date < input.start_date) fail(400, '婚礼日期不能早于开始备婚日期', 'VALIDATION_ERROR')
  if (!Number.isInteger(input.total_budget_fen) || input.total_budget_fen < 0) {
    fail(400, '请填写总预算', 'VALIDATION_ERROR')
  }
  if (!Number.isInteger(input.guest_estimate) || input.guest_estimate < 0) {
    fail(400, '请填写总人数', 'VALIDATION_ERROR')
  }
  if (weddings.some((item) => item.user_id === userId)) {
    fail(409, '你已经有一个婚礼项目', 'CONFLICT')
  }

  const created: WeddingRecord = {
    id: nextWeddingId,
    user_id: userId,
    start_date: input.start_date,
    wedding_date: input.wedding_date,
    city: input.city.trim(),
    total_budget_fen: input.total_budget_fen,
    guest_estimate: input.guest_estimate,
    groom_nickname: null,
    groom_birthday: null,
    bride_nickname: null,
    bride_birthday: null,
    other_preference: null,
    canvas_scale: 1,
    canvas_offset_x: 0,
    canvas_offset_y: 0,
  }
  nextWeddingId += 1
  weddings.push(created)
  return successEnvelope(toPublic(created), 'success').data as WeddingPublic
}

function seatingStatsOf(userId: number): SeatingStatsPublic {
  const stats = getSeating(userId).seating_stats
  return {
    guest_total: stats.guest_total,
    confirmed_count: stats.confirmed,
    seated_count: stats.seated,
    unseated_count: stats.unseated,
  }
}

function toCurrent(record: WeddingRecord): WeddingCurrentData {
  return {
    ...toPublic(record),
    seating_stats: seatingStatsOf(record.user_id),
  }
}

function toPhotoItem(record: WeddingPhotoRecord): WeddingPhotoListItem {
  return { id: record.id, url: record.url }
}

function optionalText(value: string | null | undefined) {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function optionalDate(value: string | null | undefined, label: string) {
  if (value == null || value === '') return null
  if (!isValidDate(value)) fail(400, `${label}不合法`, 'VALIDATION_ERROR')
  return value
}

function isWeddingPhoto(bytes: Uint8Array) {
  if (bytes.length < 12) return false
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const gif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38
  const webp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  return jpeg || png || gif || webp
}

function photosOf(userId: number, weddingId: number) {
  return photos.filter((item) => item.user_id === userId && item.wedding_id === weddingId)
}

async function readPhotoFile(file: File) {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  if (!isWeddingPhoto(bytes) || !file.size) {
    fail(400, '请上传 JPEG、PNG、GIF 或 WebP 图片。', 'VALIDATION_ERROR')
  }
  if (file.size > PHOTO_LIMIT) {
    fail(400, '这张照片超过 5MB，请压缩后再上传。', 'VALIDATION_ERROR')
  }
  const blob = new Blob([bytes], { type: file.type || 'application/octet-stream' })
  return URL.createObjectURL(blob)
}

export function mockGetCurrentWedding(userId: number) {
  const record = weddings.find((item) => item.user_id === userId)
  if (!record) fail(404, '尚无婚礼项目', 'NOT_FOUND')
  return successEnvelope(toCurrent(record), 'success').data as WeddingCurrentData
}

export async function mockUpdateWedding(userId: number, input: PatchWeddingRequest) {
  await delay(250)
  const record = weddings.find((item) => item.user_id === userId)
  if (!record) fail(404, '尚无婚礼项目', 'NOT_FOUND')
  const next = { ...record }
  if (input.start_date !== undefined) {
    if (!input.start_date) fail(400, '请填写开始备婚日期', 'VALIDATION_ERROR')
    if (!isValidDate(input.start_date)) fail(400, '日期不合法', 'VALIDATION_ERROR')
    next.start_date = input.start_date
  }
  if (input.wedding_date !== undefined) {
    if (!input.wedding_date) fail(400, '请填写婚礼日期', 'VALIDATION_ERROR')
    if (!isValidDate(input.wedding_date)) fail(400, '日期不合法', 'VALIDATION_ERROR')
    next.wedding_date = input.wedding_date
  }
  if (next.wedding_date < next.start_date) fail(400, '婚礼日期不能早于开始备婚日期', 'VALIDATION_ERROR')
  if (input.city !== undefined) {
    if (!input.city.trim()) fail(400, '请填写城市', 'VALIDATION_ERROR')
    next.city = input.city.trim()
  }
  if (input.total_budget_fen !== undefined) {
    if (!Number.isInteger(input.total_budget_fen) || input.total_budget_fen < 0) {
      fail(400, '请填写总预算', 'VALIDATION_ERROR')
    }
    next.total_budget_fen = input.total_budget_fen
  }
  if (input.guest_estimate !== undefined) {
    if (!Number.isInteger(input.guest_estimate) || input.guest_estimate < 0) {
      fail(400, '请填写总人数', 'VALIDATION_ERROR')
    }
    next.guest_estimate = input.guest_estimate
  }
  if (input.groom_nickname !== undefined) next.groom_nickname = optionalText(input.groom_nickname)
  if (input.bride_nickname !== undefined) next.bride_nickname = optionalText(input.bride_nickname)
  if (input.groom_birthday !== undefined) next.groom_birthday = optionalDate(input.groom_birthday, '新郎生日')
  if (input.bride_birthday !== undefined) next.bride_birthday = optionalDate(input.bride_birthday, '新娘生日')
  if (input.other_preference !== undefined) {
    next.other_preference = input.other_preference == null ? null : input.other_preference
  }
  if (input.canvas_scale !== undefined) next.canvas_scale = input.canvas_scale
  if (input.canvas_offset_x !== undefined) next.canvas_offset_x = input.canvas_offset_x
  if (input.canvas_offset_y !== undefined) next.canvas_offset_y = input.canvas_offset_y
  Object.assign(record, next)
  return successEnvelope(toCurrent(record), 'success').data as WeddingCurrentData
}

export function mockListWeddingPhotos(userId: number): WeddingPhotoListItem[] {
  const record = weddings.find((item) => item.user_id === userId)
  if (!record) fail(409, '尚无婚礼项目', 'CONFLICT')
  return successEnvelope(
    photosOf(userId, record.id).map(toPhotoItem),
    'success',
  ).data as WeddingPhotoListItem[]
}

export async function mockUploadWeddingPhoto(userId: number, file: File) {
  const record = weddings.find((item) => item.user_id === userId)
  if (!record) fail(409, '尚无婚礼项目', 'CONFLICT')
  if (photosOf(userId, record.id).length) fail(409, '已有 1 张合影', 'CONFLICT')
  const url = await readPhotoFile(file)
  const created: WeddingPhotoRecord = {
    id: nextPhotoId,
    user_id: userId,
    wedding_id: record.id,
    url,
  }
  nextPhotoId += 1
  photos.push(created)
  return successEnvelope(toPhotoItem(created), 'success').data as WeddingPhotoUploadData
}

export async function mockReplaceWeddingPhoto(userId: number, photoId: number, file: File) {
  const record = weddings.find((item) => item.user_id === userId)
  if (!record) fail(409, '尚无婚礼项目', 'CONFLICT')
  const current = photosOf(userId, record.id).find((item) => item.id === photoId)
  if (!current) fail(404, '找不到这张照片', 'NOT_FOUND')
  const url = await readPhotoFile(file)
  URL.revokeObjectURL(current.url)
  current.url = url
  return successEnvelope(toPhotoItem(current), 'success').data as WeddingPhotoUploadData
}
