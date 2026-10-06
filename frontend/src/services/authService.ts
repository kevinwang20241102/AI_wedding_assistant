import axios from 'axios'
import {
  delay,
  isValidPassword,
  mockConfirmReset,
  mockCreateWedding,
  mockLogin,
  mockRegister,
  mockSendResetCode,
} from '../mocks'
import type { CreateWeddingRequest, WeddingPublic } from '../mocks'
import type {
  ApiEnvelope,
  ConfirmResetRequest,
  ConfirmResetSuccessData,
  LoginRequest,
  LoginSuccessData,
  RegisterRequest,
  RegisterSuccessData,
  SendResetCodeRequest,
  SendResetCodeSuccessData,
} from '../types/auth'
import { ApiError } from '../types/auth'
import api from './api'

export { isValidPassword }

const SAVE_DELAY_MS = 250

export function isMockAuth() {
  return String(import.meta.env.VITE_USE_MOCK ?? '') === 'true'
}

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

function throwApiError(error: unknown): never {
  if (axios.isAxiosError(error) && error.response) {
    const envelope = error.response.data as ApiEnvelope<null> | undefined
    throw new ApiError(error.response.status, envelope ?? fallbackEnvelope())
  }
  throw error instanceof Error ? error : new Error('请求失败')
}

export async function registerAccount(input: RegisterRequest): Promise<RegisterSuccessData> {
  if (isMockAuth()) {
    await delay(SAVE_DELAY_MS)
    return mockRegister(input)
  }
  try {
    const response = await api.post<ApiEnvelope<RegisterSuccessData>>('/users', input)
    return unwrapData(response.status, response.data)
  } catch (error) {
    throwApiError(error)
  }
}

export async function loginAccount(input: LoginRequest): Promise<LoginSuccessData> {
  if (isMockAuth()) {
    await delay(SAVE_DELAY_MS)
    return mockLogin(input)
  }
  try {
    const response = await api.post<ApiEnvelope<LoginSuccessData>>('/users/login', input)
    return unwrapData(response.status, response.data)
  } catch (error) {
    throwApiError(error)
  }
}

export async function sendPasswordResetCode(
  input: SendResetCodeRequest,
): Promise<SendResetCodeSuccessData> {
  if (isMockAuth()) {
    return mockSendResetCode(input)
  }
  try {
    const response = await api.post<ApiEnvelope<SendResetCodeSuccessData>>(
      '/users/password-reset/send-code',
      input,
    )
    return unwrapData(response.status, response.data)
  } catch (error) {
    throwApiError(error)
  }
}

export async function confirmPasswordReset(
  input: ConfirmResetRequest,
): Promise<ConfirmResetSuccessData> {
  if (isMockAuth()) {
    await delay(SAVE_DELAY_MS)
    return mockConfirmReset(input)
  }
  try {
    const response = await api.post<ApiEnvelope<ConfirmResetSuccessData>>(
      '/users/password-reset/confirm',
      input,
    )
    return unwrapData(response.status, response.data)
  } catch (error) {
    throwApiError(error)
  }
}

export async function fetchCurrentUser(): Promise<LoginSuccessData | null> {
  try {
    const response = await api.get<ApiEnvelope<LoginSuccessData>>('/users/me', {
      validateStatus: (status) => status === 401 || (status >= 200 && status < 300),
    })
    if (response.status === 401) return null
    return unwrapData(response.status, response.data)
  } catch (error) {
    throwApiError(error)
  }
}

export async function logoutAccount(): Promise<void> {
  try {
    await api.post<ApiEnvelope<{ ok: true }>>('/users/logout')
  } catch (error) {
    throwApiError(error)
  }
}

export async function createWeddingProject(
  userId: number,
  input: CreateWeddingRequest,
): Promise<WeddingPublic> {
  if (isMockAuth()) {
    return mockCreateWedding(userId, input)
  }
  try {
    const response = await api.post<ApiEnvelope<WeddingPublic>>('/weddings', input)
    return unwrapData(response.status, response.data)
  } catch (error) {
    throwApiError(error)
  }
}
