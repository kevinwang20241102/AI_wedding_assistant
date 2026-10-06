import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ATTENDANCES } from '../../mocks/seating'
import type { Attendance, GuestGroupPublic } from '../../mocks/seating'

const NEW_GROUP = '__new'

type AddGuestDialogProps = {
  groups: GuestGroupPublic[]
  onClose: () => void
  onSave: (input: {
    name: string
    groupId: number | null
    groupName?: string
    attendance: Attendance
    seq: string
  }) => string | null
}

export default function AddGuestDialog({ groups, onClose, onSave }: AddGuestDialogProps) {
  const [name, setName] = useState('')
  const [group, setGroup] = useState(groups[0] ? String(groups[0].id) : NEW_GROUP)
  const [newGroup, setNewGroup] = useState('')
  const [attendance, setAttendance] = useState<Attendance>('待定')
  const [seq, setSeq] = useState('')
  const [errors, setErrors] = useState<{ name?: string; newGroup?: string }>({})
  const nameRef = useRef<HTMLInputElement>(null)
  const creating = group === NEW_GROUP

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: { name?: string; newGroup?: string } = {}
    if (!name.trim()) next.name = '请填写姓名'
    if (creating && !newGroup.trim()) next.newGroup = '请填写分组名称'
    setErrors(next)
    if (next.name || next.newGroup) return
    const message = onSave({
      name: name.trim(),
      groupId: creating ? null : Number(group),
      groupName: creating ? newGroup.trim() : undefined,
      attendance,
      seq,
    })
    if (message) setErrors({ name: message })
  }

  return (
    <div className="modal-back" role="presentation" onClick={onClose}>
      <form
        className="modal"
        data-form="guest"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-guest-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="modal-title" id="add-guest-title">
          添加宾客
        </div>
        <div className="field">
          <label htmlFor="add-guest-name">姓名</label>
          <input
            id="add-guest-name"
            ref={nameRef}
            name="name"
            type="text"
            value={name}
            className={errors.name ? 'invalid' : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          {errors.name ? <div className="error">{errors.name}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="add-guest-group">分组</label>
          <select
            id="add-guest-group"
            name="group"
            value={group}
            onChange={(event) => setGroup(event.target.value)}
          >
            {groups.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
            <option value={NEW_GROUP}>新建分组</option>
          </select>
        </div>
        <div className="field" data-new-group="" hidden={!creating}>
          <label htmlFor="add-guest-new-group">新分组名称</label>
          <input
            id="add-guest-new-group"
            name="newGroup"
            type="text"
            value={newGroup}
            className={errors.newGroup ? 'invalid' : undefined}
            onChange={(event) => setNewGroup(event.target.value)}
          />
          {errors.newGroup ? <div className="error">{errors.newGroup}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="add-guest-attend">出席</label>
          <select
            id="add-guest-attend"
            name="attendance"
            value={attendance}
            onChange={(event) => setAttendance(event.target.value as Attendance)}
          >
            {ATTENDANCES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="add-guest-seq">宾客序号</label>
          <input
            id="add-guest-seq"
            name="seq"
            type="text"
            inputMode="numeric"
            value={seq}
            placeholder="0"
            onChange={(event) => setSeq(event.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button className="btn secondary" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="submit">
            添加宾客
          </button>
        </div>
      </form>
    </div>
  )
}
