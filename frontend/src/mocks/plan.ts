import { getMockWedding } from './wedding'

export const TASK_STATUSES = ['未开始', '进行中', '已完成', '已超期'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export type StageKey = 'start' | 'mid' | 'rush' | 'month' | 'week'

export type StagePublic = {
  id: number
  name: string
  sort_order: number
}

export type TaskPublic = {
  id: number
  name: string
  stage_id: number
  due_date: string
  status: TaskStatus
  due_date_customized: boolean
  sort_order: number
  note: string
}

export type PlanProgress = {
  completed: number
  in_progress: number
  total: number
}

export type PlanAggregate = {
  wedding_date: string
  countdown_days: number
  progress: PlanProgress
  current_stage: number | null
  stages: StagePublic[]
  tasks: TaskPublic[]
}

type StageRecord = StagePublic & { key?: StageKey }
type TaskRecord = Omit<TaskPublic, 'sort_order'> & { sort_order: number }

type PlanStore = {
  stages: StageRecord[]
  tasks: TaskRecord[]
}

const STAGE_DEFS: { key: StageKey; name: string; tasks: string[] }[] = [
  {
    key: 'start',
    name: '备婚启动期',
    tasks: [
      '确定婚礼日期',
      '选择婚礼策划师',
      '制定婚礼预算及预算划分',
      '估算宾客人数',
      '选择婚礼场地',
      '预定婚礼场地',
      '选择四大专业人员（摄影、摄像、主持、化妆）',
      '搜集婚礼灵感',
      '测量婚礼场地',
    ],
  },
  {
    key: 'mid',
    name: '正式筹备期',
    tasks: [
      '制定婚宴设计初稿',
      '确定婚宴设计终稿',
      '租赁 / 定做新娘婚纱',
      '租赁 / 定制新郎西装',
      '确定伴郎 / 伴娘服饰',
      '购买 / 定制父母服饰',
      '拍摄婚纱照',
      '购买婚礼对戒',
      '甜品方案确定',
    ],
  },
  {
    key: 'rush',
    name: '婚前冲刺期',
    tasks: [
      '设计婚礼邀请函',
      '发邀请函正式邀请宾客',
      '购买 / 定制婚礼纸品（誓言本 / 桌号牌 / 宾客名牌 / 菜单 / 感谢卡等）',
      '购买喜糖盒',
      '购买 / 定制伴手礼',
      '购买新人物品（签到本、签到笔、新娘房装饰物品、堵门道具、烟酒茶糖等）',
      '确定婚宴菜单和试菜',
    ],
  },
  {
    key: 'month',
    name: '婚礼月',
    tasks: [
      '见主持人确定婚礼流程',
      '选择婚礼暖场 / 仪式 / 用餐音乐',
      '与摄影师沟通拍摄方案',
      '与摄像师沟通拍摄方案',
      '确定婚礼当日流程',
      '写誓词',
      '确定宾客名单',
      '安排宾客交通 / 住宿',
      '安排宾客座位',
    ],
  },
  {
    key: 'week',
    name: '婚礼周',
    tasks: ['新娘试妆', '新娘做指甲 / 染发', '新郎修剪头发', '确定现场工作人员的工作职责', '取婚纱礼服西装', '运送新人方物料到酒店', '彩排'],
  },
]

const stores = new Map<number, PlanStore>()
const counters = new Map<number, { stage: number; task: number }>()

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatIso(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`
}

function parseIso(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

function addMonths(iso: string, delta: number) {
  const { year, month, day } = parseIso(iso)
  const index = month - 1 + delta
  const nextYear = year + Math.floor(index / 12)
  const nextMonth = ((index % 12) + 12) % 12
  const last = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate()
  return formatIso(nextYear, nextMonth + 1, Math.min(day, last))
}

function addDays(iso: string, days: number) {
  const { year, month, day } = parseIso(iso)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return formatIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

export function shanghaiToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function daysBetween(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00+08:00`)
  const end = Date.parse(`${to}T00:00:00+08:00`)
  return Math.round((end - start) / 86400000)
}

export function slashDate(iso: string) {
  const { year, month, day } = parseIso(iso)
  if (!year || !month || !day) return ''
  return `${year}/${month}/${day}`
}

function dueFor(key: StageKey, wedding: string) {
  if (key === 'start') return addMonths(wedding, -6)
  if (key === 'mid') return addMonths(wedding, -3)
  if (key === 'rush') return addMonths(wedding, -1)
  if (key === 'month') return addDays(wedding, -7)
  return wedding
}

function currentStageKey(wedding: string, today: string): StageKey | null {
  const until = daysBetween(today, wedding)
  if (until < 0) return null
  if (until <= 7) return 'week'
  const w = parseIso(wedding)
  const t = parseIso(today)
  if (w.year === t.year && w.month === t.month) return 'month'
  let months = (w.year - t.year) * 12 + (w.month - t.month)
  if (t.day > w.day) months -= 1
  if (months <= 3) return 'rush'
  if (months <= 6) return 'mid'
  return 'start'
}

function seedStore(weddingDate: string): PlanStore {
  const stages: StageRecord[] = STAGE_DEFS.map((stage, index) => ({
    id: index + 1,
    name: stage.name,
    sort_order: index,
    key: stage.key,
  }))
  const tasks: TaskRecord[] = []
  let taskId = 1
  STAGE_DEFS.forEach((stage, stageIndex) => {
    stage.tasks.forEach((name, order) => {
      tasks.push({
        id: taskId,
        name,
        stage_id: stageIndex + 1,
        due_date: dueFor(stage.key, weddingDate),
        status: '未开始',
        due_date_customized: false,
        sort_order: order,
        note: '',
      })
      taskId += 1
    })
  })
  return { stages, tasks }
}

function ensureStore(userId: number, weddingDate: string) {
  let store = stores.get(userId)
  if (!store) {
    store = seedStore(weddingDate)
    stores.set(userId, store)
    counters.set(userId, { stage: store.stages.length + 1, task: store.tasks.length + 1 })
  }
  return store
}

function nextIds(userId: number) {
  const current = counters.get(userId) ?? { stage: 1, task: 1 }
  counters.set(userId, current)
  return current
}

function applyOverdue(tasks: TaskRecord[], today: string) {
  tasks.forEach((task) => {
    if (task.due_date && task.due_date < today && task.status !== '已完成' && task.status !== '已超期') {
      task.status = '已超期'
    }
  })
}

function rewriteOrders(store: PlanStore) {
  store.stages.forEach((stage, index) => {
    stage.sort_order = index
  })
  const counts = new Map<number, number>()
  store.tasks.forEach((task) => {
    const order = counts.get(task.stage_id) ?? 0
    task.sort_order = order
    counts.set(task.stage_id, order + 1)
  })
}

function toTaskDto(task: TaskRecord): TaskPublic {
  return {
    id: task.id,
    name: task.name,
    stage_id: task.stage_id,
    due_date: task.due_date,
    status: task.status,
    due_date_customized: task.due_date_customized,
    sort_order: task.sort_order,
    note: task.note,
  }
}

function toStageDto(stage: StageRecord): StagePublic {
  return { id: stage.id, name: stage.name, sort_order: stage.sort_order }
}

function snapshot(userId: number): PlanAggregate {
  const wedding = getMockWedding(userId)
  const weddingDate = wedding?.wedding_date ?? '2027-10-20'
  const store = ensureStore(userId, weddingDate)
  const today = shanghaiToday()
  applyOverdue(store.tasks, today)
  rewriteOrders(store)
  const key = currentStageKey(weddingDate, today)
  const current = key ? (store.stages.find((stage) => stage.key === key)?.id ?? null) : null
  const tasks = store.stages.flatMap((stage) =>
    store.tasks.filter((task) => task.stage_id === stage.id).sort((a, b) => a.sort_order - b.sort_order),
  )
  const completed = tasks.filter((task) => task.status === '已完成').length
  const inProgress = tasks.filter((task) => task.status === '进行中').length
  return {
    wedding_date: weddingDate,
    countdown_days: daysBetween(today, weddingDate),
    progress: { completed, in_progress: inProgress, total: tasks.length },
    current_stage: current,
    stages: store.stages.map(toStageDto),
    tasks: tasks.map(toTaskDto),
  }
}

export function getPlan(userId: number) {
  return snapshot(userId)
}

export function addPlanTask(userId: number, stageId: number) {
  const store = ensureStore(userId, snapshot(userId).wedding_date)
  const ids = nextIds(userId)
  const task: TaskRecord = {
    id: ids.task,
    name: '新任务',
    stage_id: stageId,
    due_date: shanghaiToday(),
    status: '未开始',
    due_date_customized: true,
    sort_order: 0,
    note: '',
  }
  ids.task += 1
  const at = store.tasks.findIndex((item) => item.stage_id === stageId)
  if (at >= 0) store.tasks.splice(at, 0, task)
  else store.tasks.push(task)
  return snapshot(userId)
}

export function updatePlanTask(
  userId: number,
  taskId: number,
  patch: Partial<Pick<TaskPublic, 'name' | 'stage_id' | 'due_date' | 'status' | 'sort_order'>>,
) {
  const store = ensureStore(userId, snapshot(userId).wedding_date)
  const task = store.tasks.find((item) => item.id === taskId)
  if (!task) return snapshot(userId)
  if (patch.name !== undefined) task.name = patch.name
  if (patch.stage_id !== undefined) task.stage_id = patch.stage_id
  if (patch.status !== undefined) task.status = patch.status
  if (patch.due_date !== undefined) {
    if (patch.due_date !== task.due_date) task.due_date_customized = true
    task.due_date = patch.due_date
  }
  if (patch.sort_order !== undefined) task.sort_order = patch.sort_order
  return snapshot(userId)
}

export function deletePlanTask(userId: number, taskId: number) {
  const store = ensureStore(userId, snapshot(userId).wedding_date)
  store.tasks = store.tasks.filter((task) => task.id !== taskId)
  return snapshot(userId)
}

export function addPlanStage(userId: number) {
  const store = ensureStore(userId, snapshot(userId).wedding_date)
  const ids = nextIds(userId)
  const stage: StageRecord = {
    id: ids.stage,
    name: '新阶段',
    sort_order: store.stages.length,
  }
  ids.stage += 1
  store.stages.push(stage)
  return snapshot(userId)
}

export function updatePlanStage(userId: number, stageId: number, name: string) {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false as const, error: '请填写阶段名称', data: snapshot(userId) }
  const store = ensureStore(userId, snapshot(userId).wedding_date)
  const stage = store.stages.find((item) => item.id === stageId)
  if (stage) stage.name = trimmed
  return { ok: true as const, error: null, data: snapshot(userId) }
}

export function deletePlanStage(userId: number, stageId: number) {
  const store = ensureStore(userId, snapshot(userId).wedding_date)
  store.stages = store.stages.filter((stage) => stage.id !== stageId)
  store.tasks = store.tasks.filter((task) => task.stage_id !== stageId)
  return snapshot(userId)
}

export function movePlanTask(userId: number, taskId: number, stageId: number, beforeId: number | null) {
  const store = ensureStore(userId, snapshot(userId).wedding_date)
  const task = store.tasks.find((item) => item.id === taskId)
  if (!task) return snapshot(userId)
  const kept = {
    name: task.name,
    due_date: task.due_date,
    status: task.status,
    due_date_customized: task.due_date_customized,
    note: task.note,
  }
  store.tasks.splice(store.tasks.indexOf(task), 1)
  task.stage_id = stageId
  if (beforeId != null) {
    const at = store.tasks.findIndex((item) => item.id === beforeId)
    if (at >= 0) store.tasks.splice(at, 0, task)
    else store.tasks.push(task)
  } else {
    let at = store.tasks.length
    for (let i = store.tasks.length - 1; i >= 0; i -= 1) {
      if (store.tasks[i].stage_id === stageId) {
        at = i + 1
        break
      }
    }
    store.tasks.splice(at, 0, task)
  }
  task.name = kept.name
  task.due_date = kept.due_date
  task.status = kept.status
  task.due_date_customized = kept.due_date_customized
  task.note = kept.note
  return snapshot(userId)
}

export function movePlanStage(userId: number, stageId: number, beforeId: number | null) {
  const store = ensureStore(userId, snapshot(userId).wedding_date)
  const stage = store.stages.find((item) => item.id === stageId)
  if (!stage) return snapshot(userId)
  const taskKeep = store.tasks.map((task) => ({
    id: task.id,
    stage_id: task.stage_id,
    name: task.name,
    due_date: task.due_date,
    status: task.status,
    note: task.note,
  }))
  store.stages.splice(store.stages.indexOf(stage), 1)
  if (beforeId != null) {
    const at = store.stages.findIndex((item) => item.id === beforeId)
    if (at >= 0) store.stages.splice(at, 0, stage)
    else store.stages.push(stage)
  } else store.stages.push(stage)
  taskKeep.forEach((item) => {
    const task = store.tasks.find((row) => row.id === item.id)
    if (!task) return
    task.stage_id = item.stage_id
    task.name = item.name
    task.due_date = item.due_date
    task.status = item.status
    task.note = item.note
  })
  return snapshot(userId)
}

export function stageNo(index: number) {
  return `STAGE-${String(index + 1).padStart(2, '0')}`
}

export function statusTone(status: TaskStatus) {
  if (status === '进行中') return 'doing'
  if (status === '已完成') return 'done'
  if (status === '已超期') return 'expired'
  return ''
}
