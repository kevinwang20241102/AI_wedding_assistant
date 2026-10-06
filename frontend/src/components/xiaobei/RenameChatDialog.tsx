import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { XIAO_BEI_TITLE_LIMIT, codePointLength } from '../../mocks/xiaobei'

type RenameChatDialogProps = {
  open: boolean
  title: string
  customized: boolean
  onCancel: () => void
  onConfirm: (title: string) => void
}

export default function RenameChatDialog({ open, title, customized, onCancel, onConfirm }: RenameChatDialogProps) {
  const [value, setValue] = useState(title)
  const cap =
    customized || codePointLength(title) <= XIAO_BEI_TITLE_LIMIT ? XIAO_BEI_TITLE_LIMIT : codePointLength(title)

  useEffect(() => {
    if (open) setValue(title)
  }, [open, title])

  if (!open) return null

  return createPortal(
    <div
      className="modal-back is-front"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <form
        className="modal rename-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-chat-title"
        onSubmit={(event) => {
          event.preventDefault()
          const next = value.trim()
          if (!next) return
          onConfirm(next)
        }}
      >
        <div className="rename-head">
          <div className="modal-title" id="rename-chat-title">
            编辑对话名称
          </div>
          <button className="rename-close" type="button" aria-label="关闭" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="rename-field">
          <textarea
            name="title"
            rows={3}
            maxLength={cap}
            aria-label="对话名称"
            value={value}
            onChange={(event) => {
              const next = event.target.value
              if (codePointLength(next) > cap) {
                setValue([...next].slice(0, cap).join(''))
                return
              }
              setValue(next)
            }}
          />
        </div>
        <div className="modal-actions rename-actions">
          <button className="btn rename-cancel" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="btn rename-confirm" type="submit" disabled={!value.trim()}>
            确认
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
