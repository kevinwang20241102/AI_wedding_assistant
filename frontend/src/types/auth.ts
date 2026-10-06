export type ApiEnvelope<T> = {
  success: boolean
  data: T | null
  error: string | null
  error_code: string | null
  message: string | null
  timestamp: string
  request_id: string
  metadata: Record<string, unknown> | null
}

export class ApiError extends Error {
  readonly status: number
  readonly error: string
  readonly error_code: string
  readonly envelope: ApiEnvelope<null>

  constructor(status: number, envelope: ApiEnvelope<null>) {
    super(envelope.error ?? '请求失败')
    this.name = 'ApiError'
    this.status = status
    this.error = envelope.error ?? '请求失败'
    this.error_code = envelope.error_code ?? 'INTERNAL_ERROR'
    this.envelope = envelope
  }
}

export type RegisterRequest = {
  username: string
  password: string
  phone: string
}

export type LoginRequest = {
  username: string
  password: string
  remember: boolean
}

export type SendResetCodeRequest = {
  phone: string
}

export type ConfirmResetRequest = {
  phone: string
  code: string
  new_password: string
}

export type RegisterSuccessData = {
  id: number
  username: string
  phone: string
  has_wedding: boolean
}

export type LoginSuccessData = {
  id: number
  username: string
  phone: string
  has_wedding: boolean
}

export type SendResetCodeSuccessData = {
  expires_in_seconds: number
  resend_after_seconds: number
}

export type ConfirmResetSuccessData = {
  ok: true
}
