import {
  addPlanTask,
  deletePlanTask as mockDeletePlanTask,
  getPlan as mockGetPlan,
  movePlanTask as mockMovePlanTask,
  shanghaiToday,
  updatePlanTask as mockUpdatePlanTask,
} from '../mocks/plan'
import type { PlanAggregate, TaskPublic, TaskStatus } from '../mocks/plan'
import type { ApiEnvelope } from '../types/auth'
import { ApiError } from '../types/auth'
import { isMockAuth } from './authService'
import api from './api'
import { throwApiError } from './weddingService'

type PlanApiTask = Omit<TaskPublic, 'note'> & { note?: string }

type PlanApiAggregate = Omit<PlanAggregate, 'tasks' | 'wedding_date'> & {
  wedding_date: string
  tasks: PlanApiTask[]
}

export type TaskPatch = Partial<Pick<TaskPublic, 'name' | 'stage_id' | 'due_date' | 'status' | 'sort_order'>>

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

export function normalizePlan(data: PlanApiAggregate): PlanAggregate {
  return {
    ...data,
    wedding_date: String(data.wedding_date),
    tasks: data.tasks.map((task) => ({
      ...task,
      due_date: String(task.due_date),
      note: task.note ?? '',
    })),
  }
}

export function taskInsertIndex(
  plan: PlanAggregate,
  taskId: number,
  stageId: number,
  beforeId: number | null,
) {
  const siblings = plan.tasks.filter((task) => task.stage_id === stageId && task.id !== taskId)
  if (beforeId == null) return siblings.length
  const index = siblings.findIndex((task) => task.id === beforeId)
  return index < 0 ? siblings.length : index
}

export function previewMoveTask(
  plan: PlanAggregate,
  taskId: number,
  stageId: number,
  beforeId: number | null,
): PlanAggregate {
  const moving = plan.tasks.find((task) => task.id === taskId)
  if (!moving) return plan
  const rest = plan.tasks.filter((task) => task.id !== taskId)
  const relocated: TaskPublic = { ...moving, stage_id: stageId }
  const next: TaskPublic[] = []
  plan.stages.forEach((stage) => {
    const group = rest.filter((task) => task.stage_id === stage.id)
    if (stage.id !== stageId) {
      next.push(...group)
      return
    }
    if (beforeId == null) {
      next.push(...group, relocated)
      return
    }
    const at = group.findIndex((task) => task.id === beforeId)
    if (at < 0) next.push(...group, relocated)
    else next.push(...group.slice(0, at), relocated, ...group.slice(at))
  })
  return { ...plan, tasks: next }
}

export async function getPlan(userId: number): Promise<PlanAggregate> {
  if (isMockAuth()) return mockGetPlan(userId)
  try {
    const response = await api.get<ApiEnvelope<PlanApiAggregate>>('/tasks')
    return normalizePlan(unwrapData(response.status, response.data))
  } catch (error) {
    throwApiError(error)
  }
}

export async function createPlanTask(
  userId: number,
  stageId: number,
): Promise<{ plan: PlanAggregate; createdId: number }> {
  if (isMockAuth()) {
    const plan = addPlanTask(userId, stageId)
    const created = plan.tasks.find((task) => task.stage_id === stageId)
    return { plan, createdId: created?.id ?? 0 }
  }
  try {
    const response = await api.post<ApiEnvelope<PlanApiTask>>('/tasks', {
      name: '新任务',
      stage_id: stageId,
      due_date: shanghaiToday(),
    })
    const created = unwrapData(response.status, response.data)
    return { plan: await getPlan(userId), createdId: created.id }
  } catch (error) {
    throwApiError(error)
  }
}

export async function updatePlanTask(
  userId: number,
  taskId: number,
  patch: TaskPatch,
): Promise<PlanAggregate> {
  if (isMockAuth()) return mockUpdatePlanTask(userId, taskId, patch)
  try {
    await api.patch<ApiEnvelope<PlanApiTask>>(`/tasks/${taskId}`, patch)
    return await getPlan(userId)
  } catch (error) {
    throwApiError(error)
  }
}

export async function deletePlanTask(userId: number, taskId: number): Promise<PlanAggregate> {
  if (isMockAuth()) return mockDeletePlanTask(userId, taskId)
  try {
    await api.delete(`/tasks/${taskId}`)
    return await getPlan(userId)
  } catch (error) {
    throwApiError(error)
  }
}

export async function movePlanTask(
  userId: number,
  taskId: number,
  stageId: number,
  sortOrder: number,
): Promise<PlanAggregate> {
  if (isMockAuth()) {
    const plan = mockGetPlan(userId)
    const siblings = plan.tasks.filter((task) => task.stage_id === stageId && task.id !== taskId)
    const beforeId = sortOrder >= siblings.length ? null : siblings[sortOrder]?.id ?? null
    return mockMovePlanTask(userId, taskId, stageId, beforeId)
  }
  try {
    await api.patch<ApiEnvelope<PlanApiTask>>(`/tasks/${taskId}`, {
      stage_id: stageId,
      sort_order: sortOrder,
    })
    return await getPlan(userId)
  } catch (error) {
    throwApiError(error)
  }
}

export type { TaskStatus }
