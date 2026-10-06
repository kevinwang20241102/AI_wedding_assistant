import {
  addTable as mockAddTable,
  deleteTable as mockDeleteTable,
  updateTable as mockUpdateTable,
} from '../mocks/seating'
import type { SeatingPageData, TablePublic, TableUpdateRequest } from '../mocks/seating'
import type { PatchWeddingRequest } from '../mocks/wedding'
import type { ApiEnvelope } from '../types/auth'
import { ApiError } from '../types/auth'
import { isMockAuth } from './authService'
import api from './api'
import { mapSeatingStats, previewDeleteTable, sortTables } from './guestService'
import { updateWedding, throwApiError } from './weddingService'

type DeleteTableData = {
  ok: boolean
  seating_stats: {
    guest_total: number
    confirmed_count: number
    seated_count: number
    unseated_count: number
  }
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

function nextTableNumber(page: SeatingPageData) {
  return page.tables.reduce((max, table) => Math.max(max, table.table_number), 0) + 1
}

export async function addTable(userId: number, page: SeatingPageData): Promise<SeatingPageData> {
  if (isMockAuth()) return mockAddTable(userId)
  try {
    const tableNumber = nextTableNumber(page)
    const response = await api.post<ApiEnvelope<TablePublic>>('/tables', {
      pos_x: 40 + (tableNumber % 4) * 200,
      pos_y: 40 + Math.floor(tableNumber / 4) * 180,
    })
    const table = unwrapData(response.status, response.data)
    return { ...page, tables: sortTables([...page.tables, table]) }
  } catch (error) {
    throwApiError(error)
  }
}

export async function updateTable(
  userId: number,
  page: SeatingPageData,
  tableId: number,
  patch: TableUpdateRequest,
): Promise<SeatingPageData> {
  if (isMockAuth()) return mockUpdateTable(userId, tableId, patch)
  try {
    const response = await api.patch<ApiEnvelope<TablePublic>>(`/tables/${tableId}`, patch)
    const table = unwrapData(response.status, response.data)
    const tables = page.tables.map((item) => {
      if (item.id === table.id) return table
      if (patch.is_head === true) return { ...item, is_head: false }
      return item
    })
    return { ...page, tables: sortTables(tables) }
  } catch (error) {
    throwApiError(error)
  }
}

export async function persistTablePosition(tableId: number, x: number, y: number): Promise<void> {
  if (isMockAuth()) return
  try {
    await api.patch(`/tables/${tableId}`, { pos_x: x, pos_y: y })
  } catch (error) {
    throwApiError(error)
  }
}

export async function deleteTable(
  userId: number,
  page: SeatingPageData,
  tableId: number,
): Promise<SeatingPageData> {
  if (isMockAuth()) return mockDeleteTable(userId, tableId)
  try {
    const response = await api.delete<ApiEnvelope<DeleteTableData>>(`/tables/${tableId}`)
    const payload = unwrapData(response.status, response.data)
    return {
      ...previewDeleteTable(page, tableId),
      seating_stats: mapSeatingStats(payload.seating_stats),
    }
  } catch (error) {
    throwApiError(error)
  }
}

export async function persistCanvasView(
  userId: number,
  canvas: { scale: number; x: number; y: number },
): Promise<void> {
  const patch: PatchWeddingRequest = {
    canvas_scale: canvas.scale,
    canvas_offset_x: canvas.x,
    canvas_offset_y: canvas.y,
  }
  await updateWedding(userId, patch)
}
