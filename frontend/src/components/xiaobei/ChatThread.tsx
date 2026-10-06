import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { userMessageLong, type MessagePublic } from '../../mocks/xiaobei'
import { ChatGlyph, ChatToolBtn } from './ChatIcons'

const LINK_NAME = { plan: '备婚计划书', budget: '预算管理本', seating: '婚宴座位表' } as const
const LINK_HREF = { plan: '/plan', budget: '/budget', seating: '/seating' } as const

type ChatThreadProps = {
  conversationKey: string
  messages: MessagePublic[]
  pinLatest: boolean
  streaming: boolean
  onCopy: (id: number) => void
  onEdit: (id: number) => void
  onLike: (id: number) => void
  onDislike: (id: number) => void
  onRegen: (id: number) => void
  onRetry: (id: number) => void
  editingId: number | null
  editText: string
  onEditText: (value: string) => void
  onCancelEdit: () => void
  onResend: () => void
  onAwayFromLatest: (away: boolean) => void
}

function sizeEditField(el: HTMLTextAreaElement) {
  const line = 22
  const max = line * 10
  el.style.height = '0px'
  const needed = el.scrollHeight
  el.style.height = `${Math.min(max, Math.max(line, needed))}px`
  el.style.overflowY = needed > max ? 'auto' : 'hidden'
}

export default function ChatThread({
  conversationKey,
  messages,
  pinLatest,
  streaming,
  onCopy,
  onEdit,
  onLike,
  onDislike,
  onRegen,
  onRetry,
  editingId,
  editText,
  onEditText,
  onCancelEdit,
  onResend,
  onAwayFromLatest,
}: ChatThreadProps) {
  const logRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLButtonElement>(null)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const lastAssistant = [...messages]
    .reverse()
    .find((item) => item.role === 'assistant' && (item.status === 'complete' || item.status === 'stopped'))
  const lastUser = [...messages].reverse().find((item) => item.role === 'user')

  const syncThumb = useCallback(() => {
    const log = logRef.current
    const thumb = thumbRef.current
    if (!log) return
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 56
    onAwayFromLatest(!nearBottom)
    if (!thumb) return
    const overflow = log.scrollHeight - log.clientHeight
    if (overflow <= 1) {
      thumb.hidden = true
      return
    }
    const track = log.clientHeight
    const size = Math.max(48, Math.round(track * (log.clientHeight / log.scrollHeight)))
    const travel = Math.max(1, track - size)
    thumb.hidden = false
    thumb.style.height = `${size}px`
    thumb.style.transform = `translateY(${Math.round((log.scrollTop / overflow) * travel)}px)`
  }, [onAwayFromLatest])

  const jumpLatest = useCallback(() => {
    const log = logRef.current
    if (!log) return
    log.scrollTop = log.scrollHeight
    syncThumb()
  }, [syncThumb])

  useLayoutEffect(() => {
    if (pinLatest) jumpLatest()
    else syncThumb()
  }, [conversationKey, jumpLatest, messages, pinLatest, syncThumb])

  useEffect(() => {
    setExpanded({})
  }, [conversationKey])

  useEffect(() => {
    const editBox = document.querySelector<HTMLTextAreaElement>('form.chat-turn.is-editing textarea')
    if (editBox) sizeEditField(editBox)
  }, [editText, editingId])

  return (
    <>
      <div className="chat-log" ref={logRef} onScroll={syncThumb}>
        <div className="chat-stream">
          {messages.map((item) => {
            if (item.role === 'user') {
              if (editingId === item.id) {
                const hasMedia = item.images.length > 0 || item.files.length > 0
                const canResend = editText.trim().length > 0 || hasMedia
                return (
                  <form
                    className="chat-turn is-editing"
                    key={item.id}
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (!canResend) return
                      onResend()
                    }}
                  >
                    <div className="chat-user">
                      <textarea
                        name="chat"
                        aria-label="编辑消息"
                        value={editText}
                        onChange={(event) => onEditText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' || event.shiftKey) return
                          event.preventDefault()
                          if (!canResend) return
                          onResend()
                        }}
                      />
                      <span className="chat-edit-actions">
                        <button className="btn secondary" type="button" onClick={onCancelEdit}>
                          取消
                        </button>
                        <button className="btn primary" type="submit" disabled={!canResend}>
                          重新发送
                        </button>
                      </span>
                    </div>
                  </form>
                )
              }
              const canEdit = lastUser?.id === item.id && !streaming
              const long = userMessageLong(item.content)
              const open = !!expanded[item.id]
              return (
                <div className="chat-turn" key={item.id}>
                  <div className={`chat-user${long && !open ? ' is-clip' : ''}`}>
                    <div className="chat-user-body">{item.content}</div>
                    {item.images.map((image) => (
                      <span className="chat-pic" key={`img-${image.id}`}>
                        {image.name || '图片'}
                      </span>
                    ))}
                    {item.files.map((file, index) => (
                      <span className="chat-pic" key={`file-${file.name}-${index}`}>
                        {file.name || '文件'}
                      </span>
                    ))}
                    {long ? (
                      <button
                        className="chat-expand"
                        type="button"
                        onClick={() => setExpanded((current) => ({ ...current, [item.id]: !open }))}
                      >
                        {open ? '收起' : '展开'}
                      </button>
                    ) : null}
                  </div>
                  <span className="chat-turn-ops">
                    {canEdit ? (
                      <ChatToolBtn label="编辑" onClick={() => onEdit(item.id)}>
                        <ChatGlyph kind="edit" />
                      </ChatToolBtn>
                    ) : null}
                    <ChatToolBtn label="复制" onClick={() => onCopy(item.id)}>
                      <ChatGlyph kind="copy" />
                    </ChatToolBtn>
                  </span>
                </div>
              )
            }
            if (item.status === 'failed') {
              return (
                <div className="chat-bot" key={item.id}>
                  <p className="chat-text">{item.content}</p>
                  <button className="btn secondary" type="button" onClick={() => onRetry(item.id)}>
                    重试
                  </button>
                </div>
              )
            }
            const regen = lastAssistant?.id === item.id
            return (
              <div className="chat-bot" key={item.id}>
                <p className="chat-text">{item.content}</p>
                {item.module_link ? (
                  <Link className="chat-jump" to={LINK_HREF[item.module_link]}>
                    {LINK_NAME[item.module_link]}
                  </Link>
                ) : null}
                {item.earlier_unused ? <p className="chat-early">更早的内容可能没被这次回答用到</p> : null}
                {item.status === 'complete' || item.status === 'stopped' ? (
                  <span className="chat-tools">
                    <ChatToolBtn
                      label="点赞"
                      pressed={item.feedback === 'like'}
                      onClick={() => onLike(item.id)}
                    >
                      <ChatGlyph kind="like" />
                    </ChatToolBtn>
                    <ChatToolBtn
                      label="点踩"
                      pressed={item.feedback === 'dislike'}
                      onClick={() => onDislike(item.id)}
                    >
                      <ChatGlyph kind="dislike" />
                    </ChatToolBtn>
                    <ChatToolBtn label="复制" onClick={() => onCopy(item.id)}>
                      <ChatGlyph kind="copy" />
                    </ChatToolBtn>
                    {regen && !streaming ? (
                      <ChatToolBtn label="重新生成" onClick={() => onRegen(item.id)}>
                        <ChatGlyph kind="regen" />
                      </ChatToolBtn>
                    ) : null}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
      <button
        className="chat-scroll-thumb"
        type="button"
        hidden
        ref={thumbRef}
        aria-label="滚动条"
        onPointerDown={(event) => {
          const log = logRef.current
          const thumb = thumbRef.current
          if (!log || !thumb) return
          event.preventDefault()
          const startY = event.clientY
          const startTop = log.scrollTop
          const move = (ev: PointerEvent) => {
            const overflow = log.scrollHeight - log.clientHeight
            const travel = Math.max(1, log.clientHeight - thumb.offsetHeight)
            log.scrollTop = startTop + ((ev.clientY - startY) / travel) * overflow
          }
          const up = () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
          }
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', up)
        }}
      />
    </>
  )
}
