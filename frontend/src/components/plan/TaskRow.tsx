import type { FormEvent, PointerEvent } from 'react'
import { TASK_STATUSES, statusTone } from '../../mocks/plan'
import type { TaskPublic, TaskStatus } from '../../mocks/plan'

type TaskRowProps = {
  task: TaskPublic
  today: string
  editing: boolean
  lifted: boolean
  onPointerDown: (event: PointerEvent<HTMLDivElement>, taskId: number) => void
  onEdit: (taskId: number) => void
  onSaveName: (taskId: number, name: string) => void
  onStatus: (taskId: number, status: TaskStatus) => void
  onDue: (taskId: number, dueDate: string) => void
  onDelete: (taskId: number) => void
}

function rowClass(task: TaskPublic, today: string, lifted: boolean) {
  const classes = ['task']
  if (lifted) classes.push('is-lifted')
  if (task.due_date === today) classes.push('today')
  if (task.due_date < today && task.status !== '已完成') classes.push('overdue')
  return classes.join(' ')
}

export default function TaskRow({
  task,
  today,
  editing,
  lifted,
  onPointerDown,
  onEdit,
  onSaveName,
  onStatus,
  onDue,
  onDelete,
}: TaskRowProps) {
  const tone = statusTone(task.status)

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const value = String(new FormData(form).get('name') ?? '')
    onSaveName(task.id, value)
  }

  return (
    <div
      className={rowClass(task, today, lifted)}
      data-task={String(task.id)}
      onPointerDown={(event) => onPointerDown(event, task.id)}
    >
      <span className="task-dot" aria-hidden="true" />
      {editing ? (
            <form className="edit-name" onSubmit={handleSave} key={`${task.id}-edit`}>
          <input
                name="name"
                type="text"
                defaultValue={task.name}
                aria-label="任务名称"
                autoFocus
                onFocus={(event) => event.currentTarget.select()}
              />
          <button className="btn secondary" type="submit">
            保存
          </button>
        </form>
      ) : (
        <div className="name">{task.name}</div>
      )}
      <div className="due-line">
        <span className="due-label">截止日期</span>
        <label className="due-chip">
          <span>{task.due_date}</span>
          <input
            type="date"
            value={task.due_date}
            aria-label="修改截止日期"
            onChange={(event) => {
              if (event.target.value) onDue(task.id, event.target.value)
            }}
          />
        </label>
      </div>
      <div className="note-clip">{task.note || ''}</div>
      <span className={`status-wrap ${tone}`}>
        <select
          className={`status-pick ${tone}`}
          aria-label="状态"
          value={task.status}
          onChange={(event) => onStatus(task.id, event.target.value as TaskStatus)}
        >
          {TASK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </span>
      <span className="row">
        <button className="btn danger" type="button" onClick={() => onEdit(task.id)}>
          编辑
        </button>
        <button className="btn danger" type="button" onClick={() => onDelete(task.id)}>
          删除
        </button>
      </span>
    </div>
  )
}
