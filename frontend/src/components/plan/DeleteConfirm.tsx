type DeleteConfirmProps = {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}

export default function DeleteConfirm({ open, onCancel, onConfirm }: DeleteConfirmProps) {
  if (!open) return null
  return (
    <div className="modal-back" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-ask">
        <div className="modal-title" id="delete-ask">
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
    </div>
  )
}
