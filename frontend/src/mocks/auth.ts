import { ApiError } from '../types/auth'
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

type MockUserRecord = {
  id: number
  username: string
  phone: string
  password: string
  has_wedding: boolean
}

const PHONE_PATTERN = /^1[3-9]\d{9}$/
const MOCK_RESET_CODE = '123456'

let nextId = 3
const users: MockUserRecord[] = [
  {
    id: 1,
    username: '林夏',
    phone: '13800010001',
    password: 'Wedding1a',
    has_wedding: true,
  },
  {
    id: 2,
    username: 'alice',
    phone: '13800138000',
    password: 'Wedding1a',
    has_wedding: false,
  },
]

const lastCodeSentAt = new Map<string, number>()
const issuedCodes = new Map<string, { code: string; expiresAt: number }>()

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

function failEnvelope(error: string, error_code: string): ApiEnvelope<null> {
  return {
    success: false,
    data: null,
    error,
    error_code,
    message: null,
    timestamp: nowIso(),
    request_id: requestId(),
    metadata: { mock: true },
  }
}

function fail(status: number, error: string, error_code: string): never {
  throw new ApiError(status, failEnvelope(error, error_code))
}

export function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function isValidPassword(password: string) {
  return password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)
}

export function isValidPhone(phone: string) {
  return PHONE_PATTERN.test(phone)
}

function usernameCodePoints(username: string) {
  return Array.from(username).length
}

function isValidUsername(username: string) {
  if (username !== username.trim()) return false
  const length = usernameCodePoints(username)
  if (length < 2 || length > 32) return false
  if ([...username].some((ch) => ch.charCodeAt(0) < 32)) return false
  return /^[\p{Script=Han}A-Za-z0-9]+(?: [\p{Script=Han}A-Za-z0-9]+)*$/u.test(username)
}

function passwordRuleError(password: string) {
  if (password.length < 8) return '密码至少 8 位'
  if (!/[A-Z]/.test(password)) return '密码需包含大写字母'
  if (!/[a-z]/.test(password)) return '密码需包含小写字母'
  if (!/\d/.test(password)) return '密码需包含数字'
  return '密码需同时包含大写字母、小写字母和数字'
}

function toRegisterDto(user: MockUserRecord): RegisterSuccessData {
  return {
    id: user.id,
    username: user.username,
    phone: user.phone,
    has_wedding: user.has_wedding,
  }
}

function toLoginDto(user: MockUserRecord): LoginSuccessData {
  return {
    id: user.id,
    username: user.username,
    phone: user.phone,
    has_wedding: user.has_wedding,
  }
}

export async function mockRegister(input: RegisterRequest): Promise<RegisterSuccessData> {
  const username = input.username.trim()
  const password = input.password
  const phone = input.phone.trim()

  if (!username) fail(400, '请填写用户名', 'VALIDATION_ERROR')
  if (!isValidUsername(username)) fail(400, '用户名需为 2～32 个字符，可含汉字、字母、数字和中间空格', 'VALIDATION_ERROR')
  if (!isValidPassword(password)) fail(400, passwordRuleError(password), 'VALIDATION_ERROR')
  if (!phone) fail(400, '未填手机号', 'VALIDATION_ERROR')
  if (!isValidPhone(phone)) fail(400, '手机号格式不正确', 'VALIDATION_ERROR')

  if (users.some((user) => user.username === username)) {
    fail(409, '这个用户名已经注册', 'CONFLICT')
  }
  if (users.some((user) => user.phone === phone)) {
    fail(409, '这个手机号已经注册', 'CONFLICT')
  }

  const created: MockUserRecord = {
    id: nextId,
    username,
    phone,
    password,
    has_wedding: false,
  }
  nextId += 1
  users.push(created)
  const data = toRegisterDto(created)
  return successEnvelope(data, '注册成功').data as RegisterSuccessData
}

export async function mockLogin(input: LoginRequest): Promise<LoginSuccessData> {
  const username = input.username.trim()
  const password = input.password
  if (!username || !password) fail(400, '请填写用户名和密码', 'VALIDATION_ERROR')

  const user = users.find((item) => item.username === username && item.password === password)
  if (!user) fail(401, '用户名或密码不正确', 'UNAUTHORIZED')
  const data = toLoginDto(user)
  return successEnvelope(data, 'success').data as LoginSuccessData
}

export async function mockSendResetCode(input: SendResetCodeRequest): Promise<SendResetCodeSuccessData> {
  const phone = input.phone.trim()
  if (!phone) fail(400, '请填写手机号', 'VALIDATION_ERROR')
  if (!isValidPhone(phone)) fail(400, '手机号格式不正确', 'VALIDATION_ERROR')

  const user = users.find((item) => item.phone === phone)
  if (!user) fail(404, '该手机号未注册', 'NOT_FOUND')

  const lastSent = lastCodeSentAt.get(phone) ?? 0
  const elapsed = Date.now() - lastSent
  if (elapsed < 60_000) {
    const remain = Math.ceil((60_000 - elapsed) / 1000)
    fail(400, `${remain} 秒后可重发`, 'VALIDATION_ERROR')
  }

  lastCodeSentAt.set(phone, Date.now())
  issuedCodes.set(phone, { code: MOCK_RESET_CODE, expiresAt: Date.now() + 300_000 })
  const data: SendResetCodeSuccessData = {
    expires_in_seconds: 300,
    resend_after_seconds: 60,
  }
  return successEnvelope(data, 'success').data as SendResetCodeSuccessData
}

export function setUserHasWedding(userId: number, hasWedding: boolean) {
  const user = users.find((item) => item.id === userId)
  if (user) user.has_wedding = hasWedding
}

export async function mockCurrentUser(userId: number | null): Promise<LoginSuccessData> {
  if (userId == null) fail(401, '未登录', 'UNAUTHORIZED')
  const user = users.find((item) => item.id === userId)
  if (!user) fail(401, '未登录', 'UNAUTHORIZED')
  const data = toLoginDto(user)
  return successEnvelope(data, 'success').data as LoginSuccessData
}

export async function mockLogout(): Promise<{ ok: true }> {
  const data = { ok: true as const }
  return successEnvelope(data, 'success').data as { ok: true }
}

export async function mockConfirmReset(input: ConfirmResetRequest): Promise<ConfirmResetSuccessData> {
  const phone = input.phone.trim()
  const code = input.code.trim()
  const newPassword = input.new_password

  if (!phone) fail(400, '请填写手机号', 'VALIDATION_ERROR')
  if (!isValidPhone(phone)) fail(400, '手机号格式不正确', 'VALIDATION_ERROR')
  if (!isValidPassword(newPassword)) fail(400, passwordRuleError(newPassword), 'VALIDATION_ERROR')

  const issued = issuedCodes.get(phone)
  if (!issued || issued.code !== code || issued.expiresAt < Date.now()) {
    fail(400, '验证码不正确', 'VALIDATION_ERROR')
  }

  const user = users.find((item) => item.phone === phone)
  if (!user) fail(404, '该手机号未注册', 'NOT_FOUND')

  user.password = newPassword
  issuedCodes.delete(phone)
  const data: ConfirmResetSuccessData = { ok: true }
  return successEnvelope(data, 'success').data as ConfirmResetSuccessData
}
