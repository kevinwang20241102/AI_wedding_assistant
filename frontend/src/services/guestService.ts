import {
  addGuest as mockAddGuest,
  deleteGuest as mockDeleteGuest,
  getSeating as mockGetSeating,
  guestSeq,
  updateGuest as mockUpdateGuest,
} from '../mocks/seating'
import type {
  Attendance,
  GuestCreateRequest,
  GuestGroupPublic,
  GuestPublic,
  GuestUpdateRequest,
  SeatingPageData,
  SeatingStats,
  TablePublic,
} from '../mocks/seating'
import type { ApiEnvelope } from '../types/auth'
import { ApiError } from '../types/auth'
import { isMockAuth } from './authService'
import api from './api'
import { getCurrentWedding, throwApiError } from './weddingService'

type ApiSeatingStats = {
  guest_total: number
  confirmed_count: number
  seated_count: number
  unseated_count: number
}

type GuestListData = {
  seating_stats: ApiSeatingStats
  guests: GuestPublic[]
}

type GuestPatchData = {
  guest: GuestPublic
  seating_stats: ApiSeatingStats
  table: TablePublic | null
}

type DeleteGuestData = {
  ok: boolean
  seating_stats: ApiSeatingStats
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

export function mapSeatingStats(stats: ApiSeatingStats): SeatingStats {
  return {
    guest_total: stats.guest_total,
    confirmed: stats.confirmed_count,
    seated: stats.seated_count,
    unseated: stats.unseated_count,
  }
}

export function statsFromGuests(guests: GuestPublic[]): SeatingStats {
  const guest_total = guests.length
  const confirmed = guests.filter((guest) => guest.attendance === '已确认').length
  const seated = guests.filter((guest) => guest.table_id != null).length
  return { guest_total, confirmed, seated, unseated: guest_total - seated }
}

export function sortTables(tables: TablePublic[]) {
  return tables
    .slice()
    .sort((a, b) => Number(b.is_head) - Number(a.is_head) || a.table_number - b.table_number)
}

function recountTables(tables: TablePublic[], guests: GuestPublic[]) {
  return sortTables(
    tables.map((table) => ({
      ...table,
      seated_count: guests.filter((guest) => guest.table_id === table.id).length,
    })),
  )
}

export function previewAssignTable(
  page: SeatingPageData,
  guestId: number,
  tableId: number | null,
): SeatingPageData {
  const guests = page.guests.map((guest) =>
    guest.id === guestId ? { ...guest, table_id: tableId } : guest,
  )
  return {
    ...page,
    guests,
    tables: recountTables(page.tables, guests),
    seating_stats: statsFromGuests(guests),
  }
}

export function previewDeleteGuest(page: SeatingPageData, guestId: number): SeatingPageData {
  const guests = page.guests.filter((guest) => guest.id !== guestId)
  return {
    ...page,
    guests,
    tables: recountTables(page.tables, guests),
    seating_stats: statsFromGuests(guests),
  }
}

export function previewDeleteTable(page: SeatingPageData, tableId: number): SeatingPageData {
  const guests = page.guests.map((guest) =>
    guest.table_id === tableId ? { ...guest, table_id: null } : guest,
  )
  return {
    ...page,
    guests,
    tables: page.tables.filter((table) => table.id !== tableId),
    seating_stats: statsFromGuests(guests),
  }
}

export function applyGuestPatch(page: SeatingPageData, payload: GuestPatchData): SeatingPageData {
  const guests = page.guests.map((guest) => (guest.id === payload.guest.id ? payload.guest : guest))
  const tables = payload.table
    ? page.tables.map((table) => (table.id === payload.table?.id ? payload.table : table))
    : page.tables
  return {
    ...page,
    guests,
    tables: recountTables(tables, guests),
    seating_stats: mapSeatingStats(payload.seating_stats),
  }
}

export async function getSeating(userId: number): Promise<SeatingPageData> {
  if (isMockAuth()) return mockGetSeating(userId)
  try {
    const [guestResponse, groupResponse, tableResponse, wedding] = await Promise.all([
      api.get<ApiEnvelope<GuestListData>>('/guests'),
      api.get<ApiEnvelope<GuestGroupPublic[]>>('/guest_groups'),
      api.get<ApiEnvelope<TablePublic[]>>('/tables'),
      getCurrentWedding(userId),
    ])
    const guestData = unwrapData(guestResponse.status, guestResponse.data)
    return {
      seating_stats: mapSeatingStats(guestData.seating_stats),
      guests: guestData.guests,
      groups: unwrapData(groupResponse.status, groupResponse.data),
      tables: sortTables(unwrapData(tableResponse.status, tableResponse.data)),
      canvas: {
        scale: wedding.canvas_scale,
        x: wedding.canvas_offset_x,
        y: wedding.canvas_offset_y,
      },
    }
  } catch (error) {
    throwApiError(error)
  }
}

export async function listGuestGroups(userId: number): Promise<GuestGroupPublic[]> {
  if (isMockAuth()) return mockGetSeating(userId).groups
  try {
    const response = await api.get<ApiEnvelope<GuestGroupPublic[]>>('/guest_groups')
    return unwrapData(response.status, response.data)
  } catch (error) {
    throwApiError(error)
  }
}

async function createGuestGroup(name: string): Promise<GuestGroupPublic> {
  const response = await api.post<ApiEnvelope<GuestGroupPublic>>('/guest_groups', { name })
  return unwrapData(response.status, response.data)
}

async function resolveGroup(
  userId: number,
  page: SeatingPageData,
  groupId: number | null,
  groupName?: string,
): Promise<{ groupId: number; groups: GuestGroupPublic[] }> {
  const named = groupName?.trim()
  if (!named) {
    const fallback = groupId ?? page.groups[0]?.id
    if (fallback == null) throw new Error('请填写分组名称')
    return { groupId: fallback, groups: page.groups }
  }
  const existing = page.groups.find((group) => group.name === named)
  if (existing) return { groupId: existing.id, groups: page.groups }
  if (isMockAuth()) return { groupId: groupId ?? page.groups[0]?.id ?? 0, groups: page.groups }
  try {
    const created = await createGuestGroup(named)
    return { groupId: created.id, groups: [...page.groups, created] }
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const groups = await listGuestGroups(userId)
      const found = groups.find((group) => group.name === named)
      if (found) return { groupId: found.id, groups }
    }
    throwApiError(error)
  }
}

export async function addGuest(
  userId: number,
  page: SeatingPageData,
  input: GuestCreateRequest & { attendance?: Attendance },
): Promise<SeatingPageData> {
  if (isMockAuth()) {
    const result = mockAddGuest(userId, input)
    if (result.error) throw new Error(result.error)
    return result.page
  }
  try {
    const resolved = await resolveGroup(userId, page, input.group_id ?? null, input.group_name)
    const response = await api.post<ApiEnvelope<GuestPublic>>('/guests', {
      name: input.name.trim(),
      group_id: resolved.groupId,
      attendance: input.attendance ?? '待定',
      seq: guestSeq(input.seq),
    })
    const guest = unwrapData(response.status, response.data)
    const guests = [...page.guests, guest]
    return {
      ...page,
      groups: resolved.groups,
      guests,
      seating_stats: statsFromGuests(guests),
    }
  } catch (error) {
    throwApiError(error)
  }
}

export async function updateGuest(
  userId: number,
  page: SeatingPageData,
  guestId: number,
  patch: GuestUpdateRequest,
): Promise<SeatingPageData> {
  if (isMockAuth()) return mockUpdateGuest(userId, guestId, patch)
  try {
    let groups = page.groups
    let groupId = patch.group_id
    if (patch.group_name != null || patch.group_id !== undefined) {
      const resolved = await resolveGroup(userId, page, patch.group_id ?? null, patch.group_name)
      groups = resolved.groups
      groupId = resolved.groupId
    }
    const body: GuestUpdateRequest = { ...patch }
    if (groupId !== undefined) body.group_id = groupId
    delete body.group_name
    if (body.seq !== undefined) body.seq = guestSeq(body.seq)
    const response = await api.patch<ApiEnvelope<GuestPatchData>>(`/guests/${guestId}`, body)
    const payload = unwrapData(response.status, response.data)
    return { ...applyGuestPatch(page, payload), groups }
  } catch (error) {
    throwApiError(error)
  }
}

export async function deleteGuest(
  userId: number,
  page: SeatingPageData,
  guestId: number,
): Promise<SeatingPageData> {
  if (isMockAuth()) return mockDeleteGuest(userId, guestId)
  try {
    const response = await api.delete<ApiEnvelope<DeleteGuestData>>(`/guests/${guestId}`)
    const payload = unwrapData(response.status, response.data)
    return {
      ...previewDeleteGuest(page, guestId),
      seating_stats: mapSeatingStats(payload.seating_stats),
    }
  } catch (error) {
    throwApiError(error)
  }
}
