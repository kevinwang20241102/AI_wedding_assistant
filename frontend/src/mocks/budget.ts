import { getMockWedding } from './wedding'
import type { ApiEnvelope } from '../types/auth'

export const PRESET_CATEGORY_NAMES = [
  '婚礼场地费',
  '婚宴餐费',
  '策划设计费',
  '四大-摄影师费',
  '四大-摄像师费',
  '四大-主持人费',
  '四大-化妆师费',
  '甜品台费',
  '现场布置费',
  '新娘婚纱费',
  '新娘婚鞋费',
  '新郎西服费',
  '新郎皮鞋费',
  '宾客伴手礼费',
  '宾客邀请函费',
  '烟/酒/茶/喜糖费',
  '宾客住宿费',
] as const

export const CAT_COLORS = [
  '#D43774',
  '#3F6F5C',
  '#C4924A',
  '#8E4E86',
  '#E07A9A',
  '#B4234A',
  '#D4A0A8',
  '#6E8F78',
  '#A67C6D',
  '#8A756E',
] as const

export const BUDGET_STATUSES = ['未确定', '已确定', '已支付'] as const
export type BudgetCategoryStatus = (typeof BUDGET_STATUSES)[number]

export type BudgetCategoryPublic = {
  id: number
  name: string
  amount_fen: number
  status: BudgetCategoryStatus
  note: string
  sort_order: number
}

export type BudgetListData = {
  total_budget_fen: number
  allocated_fen: number
  unallocated_fen: number
  is_over_allocated: boolean
  categories: BudgetCategoryPublic[]
}

export type BudgetCategoryCreateRequest = {
  name: string
  amount_fen?: number
  status?: BudgetCategoryStatus
  note?: string
}

export type BudgetCategoryUpdateRequest = {
  name?: string
  amount_fen?: number
  status?: BudgetCategoryStatus
  note?: string
  sort_order?: number
}

export type BudgetCategoryRow = BudgetCategoryPublic & { color: string }

export type BudgetPageData = Omit<BudgetListData, 'categories'> & {
  categories: BudgetCategoryRow[]
}

type CategoryRecord = BudgetCategoryPublic & { color_index: number }

type BudgetStore = {
  categories: CategoryRecord[]
}

type BudgetCounter = { category: number }

const stores = new Map<number, BudgetStore>()
const counters = new Map<number, BudgetCounter>()

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

function seedStore(): BudgetStore {
  return {
    categories: PRESET_CATEGORY_NAMES.map((name, index) => ({
      id: index + 1,
      name,
      amount_fen: 0,
      status: '未确定',
      note: '',
      sort_order: index,
      color_index: index % CAT_COLORS.length,
    })),
  }
}

function ensureStore(userId: number) {
  let store = stores.get(userId)
  if (!store) {
    store = seedStore()
    stores.set(userId, store)
    counters.set(userId, { category: store.categories.length + 1 })
  }
  return store
}

function nextIds(userId: number) {
  const current = counters.get(userId) ?? { category: 1 }
  counters.set(userId, current)
  return current
}

function rewriteOrders(store: BudgetStore) {
  store.categories.forEach((category, index) => {
    category.sort_order = index
  })
}

function toCategoryDto(category: CategoryRecord): BudgetCategoryPublic {
  return {
    id: category.id,
    name: category.name,
    amount_fen: category.amount_fen,
    status: category.status,
    note: category.note,
    sort_order: category.sort_order,
  }
}

function categoryColor(colorIndex: number) {
  return CAT_COLORS[colorIndex % CAT_COLORS.length]
}

function totals(userId: number) {
  const wedding = getMockWedding(userId)
  const total_budget_fen = wedding?.total_budget_fen ?? 0
  const store = ensureStore(userId)
  rewriteOrders(store)
  const allocated_fen = store.categories.reduce((sum, category) => sum + category.amount_fen, 0)
  const unallocated_fen = total_budget_fen - allocated_fen
  return {
    total_budget_fen,
    allocated_fen,
    unallocated_fen,
    is_over_allocated: allocated_fen > total_budget_fen,
  }
}

function listData(userId: number): BudgetListData {
  const store = ensureStore(userId)
  rewriteOrders(store)
  return {
    ...totals(userId),
    categories: store.categories.map(toCategoryDto),
  }
}

export function yuan(fen: number) {
  return (fen / 100).toFixed(2)
}

export function toFen(text: string) {
  const n = Number(String(text).replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

export function budgetShare(amountFen: number, totalFen: number) {
  if (!totalFen) return '0.00%'
  return ((amountFen / totalFen) * 100).toFixed(2) + '%'
}

export function statusClass(status: BudgetCategoryStatus) {
  if (status === '已支付') return 'doing'
  if (status === '已确定') return 'done'
  return ''
}

export function getBudget(userId: number): BudgetPageData {
  const data = listData(userId)
  const store = ensureStore(userId)
  return {
    ...data,
    categories: data.categories.map((category) => {
      const record = store.categories.find((item) => item.id === category.id)
      return {
        ...category,
        color: categoryColor(record?.color_index ?? category.sort_order),
      }
    }),
  }
}

export function listBudgetEnvelope(userId: number) {
  return successEnvelope(listData(userId), 'success')
}

export function addBudgetCategory(userId: number, input: BudgetCategoryCreateRequest) {
  const store = ensureStore(userId)
  const ids = nextIds(userId)
  const record: CategoryRecord = {
    id: ids.category,
    name: input.name,
    amount_fen: input.amount_fen ?? 0,
    status: input.status ?? '未确定',
    note: input.note ?? '',
    sort_order: store.categories.length,
    color_index: store.categories.length % CAT_COLORS.length,
  }
  ids.category += 1
  store.categories.push(record)
  return {
    envelope: successEnvelope(toCategoryDto(record), 'success'),
    page: getBudget(userId),
  }
}

export function updateBudgetCategory(userId: number, categoryId: number, patch: BudgetCategoryUpdateRequest) {
  const store = ensureStore(userId)
  const record = store.categories.find((item) => item.id === categoryId)
  if (!record) return getBudget(userId)
  if (patch.name !== undefined) record.name = patch.name
  if (patch.amount_fen !== undefined) record.amount_fen = patch.amount_fen
  if (patch.status !== undefined) record.status = patch.status
  if (patch.note !== undefined) record.note = patch.note
  if (patch.sort_order !== undefined) record.sort_order = patch.sort_order
  return getBudget(userId)
}

export function deleteBudgetCategory(userId: number, categoryId: number) {
  const store = ensureStore(userId)
  store.categories = store.categories.filter((item) => item.id !== categoryId)
  return getBudget(userId)
}

export function moveBudgetCategory(userId: number, categoryId: number, beforeId: number | null) {
  const store = ensureStore(userId)
  const cat = store.categories.find((item) => item.id === categoryId)
  if (!cat) return getBudget(userId)
  const kept = {
    name: cat.name,
    amount_fen: cat.amount_fen,
    status: cat.status,
    note: cat.note,
    color_index: cat.color_index,
  }
  store.categories.splice(store.categories.indexOf(cat), 1)
  if (beforeId != null) {
    const at = store.categories.findIndex((item) => item.id === beforeId)
    if (at >= 0) store.categories.splice(at, 0, cat)
    else store.categories.push(cat)
  } else {
    store.categories.push(cat)
  }
  cat.name = kept.name
  cat.amount_fen = kept.amount_fen
  cat.status = kept.status
  cat.note = kept.note
  cat.color_index = kept.color_index
  return getBudget(userId)
}
