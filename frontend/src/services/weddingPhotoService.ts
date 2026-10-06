import {
  mockListWeddingPhotos,
  mockReplaceWeddingPhoto,
  mockUploadWeddingPhoto,
} from '../mocks/wedding'
import type { WeddingPhotoListItem, WeddingPhotoUploadData } from '../mocks/wedding'
import type { ApiEnvelope } from '../types/auth'
import { ApiError } from '../types/auth'
import { isMockAuth } from './authService'
import api from './api'
import { throwApiError } from './weddingService'

const PHOTO_TIMEOUT_MS = 30000

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

function photoForm(file: File) {
  const form = new FormData()
  form.append('file', file)
  return form
}

export async function listWeddingPhotos(userId: number): Promise<WeddingPhotoListItem[]> {
  if (isMockAuth()) {
    return mockListWeddingPhotos(userId)
  }
  try {
    const response = await api.get<ApiEnvelope<WeddingPhotoListItem[]>>('/wedding_photos')
    return unwrapData(response.status, response.data)
  } catch (error) {
    throwApiError(error)
  }
}

export async function uploadWeddingPhoto(
  userId: number,
  file: File,
): Promise<WeddingPhotoUploadData> {
  if (isMockAuth()) {
    return mockUploadWeddingPhoto(userId, file)
  }
  try {
    const response = await api.post<ApiEnvelope<WeddingPhotoUploadData>>(
      '/wedding_photos',
      photoForm(file),
      { timeout: PHOTO_TIMEOUT_MS },
    )
    return unwrapData(response.status, response.data)
  } catch (error) {
    throwApiError(error)
  }
}

export async function replaceWeddingPhoto(
  userId: number,
  photoId: number,
  file: File,
): Promise<WeddingPhotoUploadData> {
  if (isMockAuth()) {
    return mockReplaceWeddingPhoto(userId, photoId, file)
  }
  try {
    const response = await api.put<ApiEnvelope<WeddingPhotoUploadData>>(
      `/wedding_photos/${photoId}`,
      photoForm(file),
      { timeout: PHOTO_TIMEOUT_MS },
    )
    return unwrapData(response.status, response.data)
  } catch (error) {
    throwApiError(error)
  }
}
