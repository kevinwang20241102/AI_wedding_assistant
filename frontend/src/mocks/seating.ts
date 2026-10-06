import type { ApiEnvelope } from '../types/auth'

export const PRESET_GROUP_NAMES = [
  '新郎',
  '新娘',
  '男方亲属',
  '女方亲属',
  '男方朋友',
  '女方朋友',
  '男方同事',
  '女方同事',
] as const

export const ATTENDANCES = ['待定', '已确认', '已婉拒'] as const
export type Attendance = (typeof ATTENDANCES)[number]

export type GuestGroupPublic = {
  id: number
  name: string
  is_preset: boolean
}

export type GuestPublic = {
  id: number
  name: string
  group_id: number
  attendance: Attendance
  seq: number
  note: string
  table_id: number | null
}

export type TablePublic = {
  id: number
  table_number: number
  name: string
  capacity: number
  is_head: boolean
  pos_x: number
  pos_y: number
  seated_count: number
}

export type SeatingStats = {
  guest_total: number
  confirmed: number
  seated: number
  unseated: number
}

export type CanvasView = {
  scale: number
  x: number
  y: number
}

export type GuestCreateRequest = {
  name: string
  group_id?: number | null
  group_name?: string
  attendance?: Attendance
  seq?: number | string | null
  note?: string | null
}

export type GuestUpdateRequest = {
  name?: string
  group_id?: number | null
  group_name?: string
  attendance?: Attendance
  seq?: number | string | null
  table_id?: number | null
}

export type TableUpdateRequest = {
  name?: string
  capacity?: number
  is_head?: boolean
  pos_x?: number
  pos_y?: number
}

export type SeatingPageData = {
  seating_stats: SeatingStats
  guests: GuestPublic[]
  groups: GuestGroupPublic[]
  tables: TablePublic[]
  canvas: CanvasView
}

type GuestRecord = GuestPublic
type GroupRecord = GuestGroupPublic
type TableRecord = Omit<TablePublic, 'seated_count'>

type SeatingStore = {
  groups: GroupRecord[]
  guests: GuestRecord[]
  tables: TableRecord[]
  canvas: CanvasView
}

type SeatingCounter = {
  group: number
  guest: number
  table: number
}

const stores = new Map<number, SeatingStore>()
const counters = new Map<number, SeatingCounter>()

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

export function guestSeq(value: number | string | null | undefined) {
  if (value === '' || value == null) return 0
  const n = Number(String(value).trim())
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

export function compareGuestSeq(a: { seq: number; id: number }, b: { seq: number; id: number }) {
  const diff = guestSeq(a.seq) - guestSeq(b.seq)
  return diff !== 0 ? diff : a.id - b.id
}

export function attendKind(value: string) {
  if (value === '已确认') return 'yes'
  if (value === '已婉拒') return 'no'
  return 'wait'
}

function seatedCount(store: SeatingStore, tableId: number) {
  return store.guests.filter((guest) => guest.table_id === tableId).length
}

function statsOf(store: SeatingStore): SeatingStats {
  const guest_total = store.guests.length
  const confirmed = store.guests.filter((guest) => guest.attendance === '已确认').length
  const seated = store.guests.filter((guest) => guest.table_id != null).length
  return { guest_total, confirmed, seated, unseated: guest_total - seated }
}

function toGuestDto(guest: GuestRecord): GuestPublic {
  return {
    id: guest.id,
    name: guest.name,
    group_id: guest.group_id,
    attendance: guest.attendance,
    seq: guestSeq(guest.seq),
    note: guest.note,
    table_id: guest.table_id,
  }
}

function toGroupDto(group: GroupRecord): GuestGroupPublic {
  return { id: group.id, name: group.name, is_preset: group.is_preset }
}

function toTableDto(table: TableRecord, store: SeatingStore): TablePublic {
  return {
    id: table.id,
    table_number: table.table_number,
    name: table.name,
    capacity: table.capacity,
    is_head: table.is_head,
    pos_x: table.pos_x,
    pos_y: table.pos_y,
    seated_count: seatedCount(store, table.id),
  }
}

function sortedTables(store: SeatingStore) {
  return store.tables
    .slice()
    .sort((a, b) => Number(b.is_head) - Number(a.is_head) || a.table_number - b.table_number)
}

function snapshot(store: SeatingStore): SeatingPageData {
  return {
    seating_stats: statsOf(store),
    guests: store.guests.map(toGuestDto),
    groups: store.groups.map(toGroupDto),
    tables: sortedTables(store).map((table) => toTableDto(table, store)),
    canvas: { ...store.canvas },
  }
}

function emptyStore(): SeatingStore {
  return {
    groups: PRESET_GROUP_NAMES.map((name, index) => ({
      id: index + 1,
      name,
      is_preset: true,
    })),
    guests: [],
    tables: [],
    canvas: { scale: 1, x: 0, y: 0 },
  }
}

function demoStore(): SeatingStore {
  const store = emptyStore()
  store.groups.push({ id: 9, name: '其他', is_preset: false })
  store.guests.push(
    {
      id: 1,
      name: '张三',
      group_id: 9,
      attendance: '待定',
      seq: 0,
      note: '',
      table_id: null,
    },
    {
      id: 2,
      name: '李四',
      group_id: 6,
      attendance: '待定',
      seq: 0,
      note: '',
      table_id: null,
    },
  )
  store.tables.push({
    id: 1,
    table_number: 1,
    name: '第 1 桌',
    capacity: 10,
    is_head: true,
    pos_x: 40,
    pos_y: 40,
  })
  return store
}

function ensureStore(userId: number) {
  let store = stores.get(userId)
  if (!store) {
    store = userId === 1 ? demoStore() : emptyStore()
    stores.set(userId, store)
    const maxGroup = store.groups.reduce((max, group) => Math.max(max, group.id), 0)
    const maxGuest = store.guests.reduce((max, guest) => Math.max(max, guest.id), 0)
    const maxTable = store.tables.reduce((max, table) => Math.max(max, table.id), 0)
    counters.set(userId, { group: maxGroup + 1, guest: maxGuest + 1, table: maxTable + 1 })
  }
  return store
}

function nextIds(userId: number) {
  ensureStore(userId)
  return counters.get(userId) as SeatingCounter
}

function findGroup(store: SeatingStore, groupId?: number | null, groupName?: string) {
  if (groupName) {
    const named = store.groups.find((group) => group.name === groupName)
    if (named) return named
  }
  if (groupId != null) return store.groups.find((group) => group.id === groupId) ?? null
  return store.groups.find((group) => group.name === '新郎') ?? store.groups[0] ?? null
}

function ensureGroup(userId: number, groupId?: number | null, groupName?: string) {
  const store = ensureStore(userId)
  const existing = findGroup(store, groupId, groupName)
  if (existing && (!groupName || existing.name === groupName)) return existing
  const name = (groupName || '').trim()
  if (!name) return findGroup(store, null) as GroupRecord
  const ids = nextIds(userId)
  const created: GroupRecord = { id: ids.group, name, is_preset: false }
  ids.group += 1
  store.groups.push(created)
  return created
}

export function groupNameOf(groups: GuestGroupPublic[], groupId: number) {
  return groups.find((group) => group.id === groupId)?.name ?? ''
}

export function getSeating(userId: number): SeatingPageData {
  return snapshot(ensureStore(userId))
}

export function listGuestsEnvelope(userId: number) {
  const page = getSeating(userId)
  return successEnvelope({ seating_stats: page.seating_stats, guests: page.guests }, 'success')
}

export function addGuest(userId: number, input: GuestCreateRequest) {
  const name = input.name.trim()
  if (!name) return { error: '请填写姓名', page: getSeating(userId) }
  if (input.group_name != null && !input.group_name.trim() && input.group_id == null) {
    return { error: '请填写分组名称', page: getSeating(userId) }
  }
  const store = ensureStore(userId)
  const group = ensureGroup(userId, input.group_id, input.group_name)
  const ids = nextIds(userId)
  const attendance = ATTENDANCES.includes(input.attendance as Attendance) ? (input.attendance as Attendance) : '待定'
  const record: GuestRecord = {
    id: ids.guest,
    name,
    group_id: group.id,
    attendance,
    seq: guestSeq(input.seq),
    note: input.note?.trim() ?? '',
    table_id: null,
  }
  ids.guest += 1
  store.guests.push(record)
  return {
    error: null,
    guest: toGuestDto(record),
    page: snapshot(store),
  }
}

export function updateGuest(userId: number, guestId: number, patch: GuestUpdateRequest) {
  const store = ensureStore(userId)
  const guest = store.guests.find((item) => item.id === guestId)
  if (!guest) return getSeating(userId)
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) return getSeating(userId)
    guest.name = name
  }
  if (patch.group_name !== undefined || patch.group_id !== undefined) {
    const group = ensureGroup(userId, patch.group_id, patch.group_name)
    guest.group_id = group.id
  }
  if (patch.attendance !== undefined) {
    guest.attendance = ATTENDANCES.includes(patch.attendance) ? patch.attendance : '待定'
  }
  if (patch.seq !== undefined) guest.seq = guestSeq(patch.seq)
  if (patch.table_id !== undefined) {
    if (patch.table_id == null) guest.table_id = null
    else if (store.tables.some((table) => table.id === patch.table_id)) guest.table_id = patch.table_id
  }
  return snapshot(store)
}

export function deleteGuest(userId: number, guestId: number) {
  const store = ensureStore(userId)
  store.guests = store.guests.filter((guest) => guest.id !== guestId)
  return snapshot(store)
}

export function addTable(userId: number) {
  const store = ensureStore(userId)
  const ids = nextIds(userId)
  const tableNumber = store.tables.reduce((max, table) => Math.max(max, table.table_number), 0) + 1
  const record: TableRecord = {
    id: ids.table,
    table_number: tableNumber,
    name: `第 ${tableNumber} 桌`,
    capacity: 10,
    is_head: false,
    pos_x: 40 + (tableNumber % 4) * 200,
    pos_y: 40 + Math.floor(tableNumber / 4) * 180,
  }
  ids.table += 1
  store.tables.push(record)
  return snapshot(store)
}

export function updateTable(userId: number, tableId: number, patch: TableUpdateRequest) {
  const store = ensureStore(userId)
  const table = store.tables.find((item) => item.id === tableId)
  if (!table) return getSeating(userId)
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (name) table.name = name
  }
  if (patch.capacity !== undefined) table.capacity = Math.max(1, Number(patch.capacity) || 1)
  if (patch.pos_x !== undefined) table.pos_x = patch.pos_x
  if (patch.pos_y !== undefined) table.pos_y = patch.pos_y
  if (patch.is_head === true) {
    store.tables.forEach((item) => {
      item.is_head = item.id === tableId
    })
  }
  return snapshot(store)
}

export function deleteTable(userId: number, tableId: number) {
  const store = ensureStore(userId)
  store.guests.forEach((guest) => {
    if (guest.table_id === tableId) guest.table_id = null
  })
  store.tables = store.tables.filter((table) => table.id !== tableId)
  return snapshot(store)
}

export function clampScale(value: number) {
  return Math.round(Math.min(2, Math.max(0.5, value)) * 100) / 100
}

export function updateCanvas(userId: number, patch: Partial<CanvasView>) {
  const store = ensureStore(userId)
  if (patch.scale !== undefined) store.canvas.scale = clampScale(patch.scale)
  if (patch.x !== undefined) store.canvas.x = patch.x
  if (patch.y !== undefined) store.canvas.y = patch.y
  return snapshot(store)
}

export function zoomCanvas(userId: number, dir: number) {
  const store = ensureStore(userId)
  store.canvas.scale = clampScale(store.canvas.scale + dir * 0.1)
  return snapshot(store)
}
