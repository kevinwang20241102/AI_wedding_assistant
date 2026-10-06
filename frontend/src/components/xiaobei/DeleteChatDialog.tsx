import { createPortal } from 'react-dom'

type DeleteChatDialogProps = {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}

export default function DeleteChatDialog({ open, onCancel, onConfirm }: DeleteChatDialogProps) {
  if (!open) return null
  return createPortal(
    <div
      className="modal-back"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-chat">
        <div className="modal-title" id="delete-chat">
          您是否确认删除？
        </div>
        <div className="modal-actions">
          <button className="btn secondary" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="btn primary" type="button" onClick={onConfirm}>
            确认
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
