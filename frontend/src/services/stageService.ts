import {
  addPlanStage,
  deletePlanStage as mockDeletePlanStage,
  getPlan as mockGetPlan,
  movePlanStage as mockMovePlanStage,
  updatePlanStage as mockUpdatePlanStage,
} from '../mocks/plan'
import type { PlanAggregate, StagePublic } from '../mocks/plan'
import type { ApiEnvelope } from '../types/auth'
import { ApiError } from '../types/auth'
import { isMockAuth } from './authService'
import api from './api'
import { getPlan } from './taskService'
import { throwApiError } from './weddingService'

type StageSaveResult =
  | { ok: true; error: null; data: PlanAggregate }
  | { ok: false; error: string; data: PlanAggregate }

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

export function stageInsertIndex(plan: PlanAggregate, stageId: number, beforeId: number | null) {
  const others = plan.stages.filter((stage) => stage.id !== stageId)
  if (beforeId == null) return others.length
  const index = others.findIndex((stage) => stage.id === beforeId)
  return index < 0 ? others.length : index
}

export function previewMoveStage(
  plan: PlanAggregate,
  stageId: number,
  beforeId: number | null,
): PlanAggregate {
  const moving = plan.stages.find((stage) => stage.id === stageId)
  if (!moving) return plan
  const others = plan.stages.filter((stage) => stage.id !== stageId)
  let next: StagePublic[]
  if (beforeId == null) next = [...others, moving]
  else {
    const at = others.findIndex((stage) => stage.id === beforeId)
    next = at < 0 ? [...others, moving] : [...others.slice(0, at), moving, ...others.slice(at)]
  }
  return {
    ...plan,
    stages: next.map((stage, index) => ({ ...stage, sort_order: index })),
  }
}

export async function createPlanStage(
  userId: number,
): Promise<{ plan: PlanAggregate; createdId: number }> {
  if (isMockAuth()) {
    const plan = addPlanStage(userId)
    const created = plan.stages[plan.stages.length - 1]
    return { plan, createdId: created?.id ?? 0 }
  }
  try {
    const response = await api.post<ApiEnvelope<StagePublic>>('/stages', { name: '新阶段' })
    const created = unwrapData(response.status, response.data)
    return { plan: await getPlan(userId), createdId: created.id }
  } catch (error) {
    throwApiError(error)
  }
}

export async function updatePlanStage(
  userId: number,
  stageId: number,
  name: string,
): Promise<StageSaveResult> {
  const trimmed = name.trim()
  if (!trimmed) {
    const data = isMockAuth() ? mockGetPlan(userId) : await getPlan(userId)
    return { ok: false, error: '请填写阶段名称', data }
  }
  if (isMockAuth()) return mockUpdatePlanStage(userId, stageId, trimmed)
  try {
    await api.patch<ApiEnvelope<StagePublic>>(`/stages/${stageId}`, { name: trimmed })
    return { ok: true, error: null, data: await getPlan(userId) }
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return { ok: false, error: error.error, data: await getPlan(userId) }
    }
    throwApiError(error)
  }
}

export async function deletePlanStage(userId: number, stageId: number): Promise<PlanAggregate> {
  if (isMockAuth()) return mockDeletePlanStage(userId, stageId)
  try {
    await api.delete(`/stages/${stageId}`)
    return await getPlan(userId)
  } catch (error) {
    throwApiError(error)
  }
}

export async function movePlanStage(
  userId: number,
  stageId: number,
  sortOrder: number,
): Promise<PlanAggregate> {
  if (isMockAuth()) {
    const plan = mockGetPlan(userId)
    const others = plan.stages.filter((stage) => stage.id !== stageId)
    const beforeId = sortOrder >= others.length ? null : others[sortOrder]?.id ?? null
    return mockMovePlanStage(userId, stageId, beforeId)
  }
  try {
    await api.patch<ApiEnvelope<StagePublic>>(`/stages/${stageId}`, { sort_order: sortOrder })
    return await getPlan(userId)
  } catch (error) {
    throwApiError(error)
  }
}
