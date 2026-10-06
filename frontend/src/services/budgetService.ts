import {
  addBudgetCategory as mockAddBudgetCategory,
  CAT_COLORS,
  deleteBudgetCategory as mockDeleteBudgetCategory,
  getBudget as mockGetBudget,
  moveBudgetCategory as mockMoveBudgetCategory,
  updateBudgetCategory as mockUpdateBudgetCategory,
} from '../mocks/budget'
import type {
  BudgetCategoryCreateRequest,
  BudgetCategoryUpdateRequest,
  BudgetListData,
  BudgetPageData,
} from '../mocks/budget'
import type { ApiEnvelope } from '../types/auth'
import { ApiError } from '../types/auth'
import { isMockAuth } from './authService'
import api from './api'
import { throwApiError } from './weddingService'

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

function withColors(data: BudgetListData): BudgetPageData {
  return {
    ...data,
    categories: data.categories.map((category) => ({
      ...category,
      color: CAT_COLORS[(category.id - 1) % CAT_COLORS.length],
    })),
  }
}

export function categoryInsertIndex(
  budget: BudgetPageData,
  categoryId: number,
  beforeId: number | null,
) {
  const siblings = budget.categories.filter((item) => item.id !== categoryId)
  if (beforeId == null) return siblings.length
  const index = siblings.findIndex((item) => item.id === beforeId)
  return index < 0 ? siblings.length : index
}

export function previewMoveCategory(
  budget: BudgetPageData,
  categoryId: number,
  beforeId: number | null,
): BudgetPageData {
  const moving = budget.categories.find((item) => item.id === categoryId)
  if (!moving) return budget
  const rest = budget.categories.filter((item) => item.id !== categoryId)
  let next
  if (beforeId == null) {
    next = [...rest, moving]
  } else {
    const at = rest.findIndex((item) => item.id === beforeId)
    if (at < 0) next = [...rest, moving]
    else next = [...rest.slice(0, at), moving, ...rest.slice(at)]
  }
  return {
    ...budget,
    categories: next.map((item, index) => ({ ...item, sort_order: index })),
  }
}

export async function getBudget(userId: number): Promise<BudgetPageData> {
  if (isMockAuth()) return mockGetBudget(userId)
  try {
    const response = await api.get<ApiEnvelope<BudgetListData>>('/budget_categories')
    return withColors(unwrapData(response.status, response.data))
  } catch (error) {
    throwApiError(error)
  }
}

export async function addBudgetCategory(
  userId: number,
  input: BudgetCategoryCreateRequest,
): Promise<BudgetPageData> {
  if (isMockAuth()) return mockAddBudgetCategory(userId, input).page
  try {
    await api.post('/budget_categories', {
      name: input.name,
      amount_fen: input.amount_fen ?? 0,
      status: input.status ?? '未确定',
      note: input.note ?? '',
    })
    return await getBudget(userId)
  } catch (error) {
    throwApiError(error)
  }
}

export async function updateBudgetCategory(
  userId: number,
  categoryId: number,
  patch: BudgetCategoryUpdateRequest,
): Promise<BudgetPageData> {
  if (isMockAuth()) return mockUpdateBudgetCategory(userId, categoryId, patch)
  try {
    await api.patch(`/budget_categories/${categoryId}`, patch)
    return await getBudget(userId)
  } catch (error) {
    throwApiError(error)
  }
}

export async function deleteBudgetCategory(userId: number, categoryId: number): Promise<BudgetPageData> {
  if (isMockAuth()) return mockDeleteBudgetCategory(userId, categoryId)
  try {
    await api.delete(`/budget_categories/${categoryId}`)
    return await getBudget(userId)
  } catch (error) {
    throwApiError(error)
  }
}

export async function moveBudgetCategory(
  userId: number,
  categoryId: number,
  sortOrder: number,
): Promise<BudgetPageData> {
  if (isMockAuth()) {
    const budget = mockGetBudget(userId)
    const siblings = budget.categories.filter((item) => item.id !== categoryId)
    const beforeId = sortOrder >= siblings.length ? null : siblings[sortOrder]?.id ?? null
    return mockMoveBudgetCategory(userId, categoryId, beforeId)
  }
  try {
    await api.patch(`/budget_categories/${categoryId}`, { sort_order: sortOrder })
    return await getBudget(userId)
  } catch (error) {
    throwApiError(error)
  }
}
