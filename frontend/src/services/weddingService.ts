import axios from 'axios'
import { mockGetCurrentWedding, mockUpdateWedding } from '../mocks/wedding'
import type { PatchWeddingRequest, WeddingCurrentData } from '../mocks/wedding'
import type { ApiEnvelope } from '../types/auth'
import { ApiError } from '../types/auth'
import { isMockAuth } from './authService'
import api from './api'

function unwrapData<T>(status: number, envelope: ApiEnvelope<T> | undefined): T {
  if (!envelope || envelope.success === false || envelope.data == null) {
    throw new ApiError(status, (envelope ?? fallbackEnvelope()) as ApiEnvelope<null>)
  }
  return envelope.data
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

export function throwApiError(error: unknown): never {
  if (axios.isAxiosError(error) && error.response) {
    const envelope = error.response.data as ApiEnvelope<null> | undefined
    throw new ApiError(error.response.status, envelope ?? fallbackEnvelope())
  }
  throw error instanceof Error ? error : new Error('请求失败')
}

export async function getCurrentWedding(userId: number): Promise<WeddingCurrentData> {
  if (isMockAuth()) {
    return mockGetCurrentWedding(userId)
  }
  try {
    const response = await api.get<ApiEnvelope<WeddingCurrentData>>('/weddings/current')
    return unwrapData(response.status, response.data)
  } catch (error) {
    throwApiError(error)
  }
}

export async function updateWedding(
  userId: number,
  input: PatchWeddingRequest,
): Promise<WeddingCurrentData> {
  if (isMockAuth()) {
    return mockUpdateWedding(userId, input)
  }
  try {
    const response = await api.patch<ApiEnvelope<WeddingCurrentData>>('/weddings/current', input)
    return unwrapData(response.status, response.data)
  } catch (error) {
    throwApiError(error)
  }
}
