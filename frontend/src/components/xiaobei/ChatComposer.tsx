import { useEffect, useRef } from 'react'
import {
  MODEL_OPTIONS,
  XIAO_BEI_PRO_MODEL,
  chatPayload,
  codePointLength,
  isImageFile,
  modelName,
  type PendingFile,
  type PendingImage,
  type XiaoBeiModelId,
  XIAO_BEI_IMAGE_LIMIT,
  XIAO_BEI_MAX_TEXT,
} from '../../mocks/xiaobei'
import { FileIcon, ImageIcon, ModelCheck, ModelChevron, PlusIcon, SendArrow } from './ChatIcons'

type ChatComposerProps = {
  draft: string
  images: PendingImage[]
  files: PendingFile[]
  modelId: XiaoBeiModelId
  notice: string
  streaming: boolean
  plusOpen: boolean
  modelOpen: boolean
  onDraft: (value: string) => void
  onImages: (images: PendingImage[]) => void
  onFiles: (files: PendingFile[]) => void
  onModel: (modelId: XiaoBeiModelId) => void
  onNotice: (notice: string) => void
  onPlusOpen: (open: boolean) => void
  onModelOpen: (open: boolean) => void
  onSend: () => void
  onStop: () => void
}

function sizeChatField(el: HTMLTextAreaElement) {
  const line = 24
  const min = line * 2
  const max = line * 7
  el.style.height = '0px'
  const needed = el.scrollHeight
  el.style.height = `${Math.min(max, Math.max(min, needed))}px`
  el.style.overflowY = needed > max ? 'auto' : 'hidden'
}

export default function ChatComposer({
  draft,
  images,
  files,
  modelId,
  notice,
  streaming,
  plusOpen,
  modelOpen,
  onDraft,
  onImages,
  onFiles,
  onModel,
  onNotice,
  onPlusOpen,
  onModelOpen,
  onSend,
  onStop,
}: ChatComposerProps) {
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLFormElement>(null)
  const ready = images.length > 0 || files.length > 0 || draft.trim().length > 0

  useEffect(() => {
    if (fieldRef.current) sizeChatField(fieldRef.current)
  }, [draft])

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        onPlusOpen(false)
        onModelOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onModelOpen, onPlusOpen])

  function pickImage(file: File) {
    if (modelId === XIAO_BEI_PRO_MODEL) {
      onImages([])
      onNotice('当前模型看不了图片，请改用 Flash 后再发送图片。')
      return
    }
    if (!isImageFile(file)) return
    if (!file.size) {
      onNotice('您上传的图片无法识别，请换一张再发送。')
      return
    }
    if (file.size > XIAO_BEI_IMAGE_LIMIT) {
      onNotice('您上传的图片超过5M，请压缩后再发送。')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      onNotice('')
      onImages([...images, { id: Date.now(), name: file.name || '图片', src: String(reader.result || '') }])
      onPlusOpen(false)
    }
    reader.readAsDataURL(file)
  }

  function pickMarkdown(file: File) {
    if (!/\.md$/i.test(file.name || '')) {
      onNotice('只能上传 md 格式的文件。')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '').replace(/^\uFEFF/, '')
      if (!text.trim()) {
        onNotice('这份 Markdown 没有可发送的文字。')
        return
      }
      const next = files.concat([{ name: file.name, text }])
      if (codePointLength(chatPayload(draft, next)) > XIAO_BEI_MAX_TEXT) {
        onNotice('您输入的文案太长了，请您缩减后再次发送。')
        return
      }
      onNotice('')
      onFiles(next)
      onPlusOpen(false)
    }
    reader.readAsText(file)
  }

  return (
    <form
      className="chat-dock"
      ref={wrapRef}
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready || streaming) return
        onSend()
      }}
    >
      <div className="chat-box">
        {images.length + files.length > 0 ? (
          <div className="chat-shots">
            {images.map((image, index) => (
              <span className="chat-shot" key={`img-${image.id}-${index}`}>
                {image.src ? (
                  <img src={image.src} alt={image.name || '图片'} />
                ) : (
                  <span className="chat-shot-fallback">{image.name || '图片'}</span>
                )}
                <button
                  className="chat-shot-x"
                  type="button"
                  aria-label="移除图片"
                  disabled={streaming}
                  onClick={() => onImages(images.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </span>
            ))}
            {files.map((file, index) => (
              <span className="chat-doc" key={`file-${file.name}-${index}`}>
                <span>{file.name || '文件'}</span>
                <button
                  className="chat-shot-x"
                  type="button"
                  aria-label="移除文件"
                  disabled={streaming}
                  onClick={() => onFiles(files.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <textarea
          ref={fieldRef}
          name="chat"
          aria-label="发送给备备"
          placeholder="向备备提问"
          disabled={streaming}
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return
            event.preventDefault()
            if (!ready || streaming) return
            onSend()
          }}
        />
        <div className="chat-bar">
          <div className="chat-plus-wrap">
            <button
              className="chat-plus"
              type="button"
              aria-label="添加图片、文件等"
              aria-expanded={plusOpen ? 'true' : 'false'}
              disabled={streaming}
              onClick={() => {
                onPlusOpen(!plusOpen)
                if (!plusOpen) onModelOpen(false)
              }}
            >
              <PlusIcon />
            </button>
            <span className="chat-plus-tip" aria-hidden="true">
              添加图片、文件等
            </span>
            {plusOpen ? (
              <div className="chat-plus-menu" role="menu">
                <button
                  type="button"
                  onClick={() => {
                    onPlusOpen(false)
                    imageRef.current?.click()
                  }}
                >
                  <ImageIcon />
                  <span>上传图片</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onPlusOpen(false)
                    fileRef.current?.click()
                  }}
                >
                  <FileIcon />
                  <span>上传文件</span>
                </button>
              </div>
            ) : null}
            <input
              ref={imageRef}
              type="file"
              accept="image/*,video/*,audio/*"
              tabIndex={-1}
              disabled={streaming}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) pickImage(file)
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept=".md"
              tabIndex={-1}
              disabled={streaming}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) pickMarkdown(file)
              }}
            />
          </div>
          <span className="chat-bar-split" />
          <div className={`chat-model${modelOpen ? ' is-open' : ''}`}>
            <button
              className="chat-model-btn"
              type="button"
              aria-label="切换模型"
              aria-expanded={modelOpen ? 'true' : 'false'}
              disabled={streaming}
              onClick={() => {
                onModelOpen(!modelOpen)
                if (!modelOpen) onPlusOpen(false)
              }}
            >
              <span>{modelName(modelId)}</span>
              <ModelChevron />
            </button>
            <span className="chat-model-tip" aria-hidden="true">
              切换模型
            </span>
            {modelOpen ? (
              <div className="chat-model-menu" role="listbox">
                {MODEL_OPTIONS.map((item) => (
                  <button
                    className="chat-model-option"
                    type="button"
                    key={item.id}
                    aria-pressed={modelId === item.id}
                    onClick={() => {
                      onModel(item.id)
                      onModelOpen(false)
                      if (item.id === XIAO_BEI_PRO_MODEL && images.length) {
                        onImages([])
                        onNotice('当前模型看不了图片，请改用 Flash 后再发送图片。')
                      }
                    }}
                  >
                    <span className="chat-model-copy">
                      <span className="chat-model-name">{item.name}</span>
                      <span className="chat-model-note">{item.note}</span>
                    </span>
                    {modelId === item.id ? <ModelCheck /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {streaming ? (
            <button className="chat-send is-stop" type="button" aria-label="停止" onClick={onStop}>
              <span />
            </button>
          ) : (
            <button className="chat-send" type="submit" aria-label="发送" disabled={!ready}>
              <SendArrow />
            </button>
          )}
        </div>
      </div>
      {notice ? <p className="chat-notice">{notice}</p> : null}
      <p className="chat-note">回答仅供备婚参考，具体以商家合同和当地习俗为准。</p>
    </form>
  )
}
