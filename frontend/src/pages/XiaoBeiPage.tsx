import { useEffect, useState, useSyncExternalStore } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../stores/authContext'
import ChatComposer from '../components/xiaobei/ChatComposer'
import ChatThread from '../components/xiaobei/ChatThread'
import { ChatGlyph, ProductLogo } from '../components/xiaobei/ChatIcons'
import '../components/xiaobei/xiaobei.css'
import {
  XIAO_BEI_DEFAULT_MODEL,
  XIAO_BEI_MAX_TEXT,
  XIAO_BEI_PRO_MODEL,
  chatPayload,
  codePointLength,
  type PendingFile,
  type PendingImage,
  type XiaoBeiModelId,
} from '../mocks/xiaobei'
import {
  conversationsReady,
  getConversationDetail,
  getMessageFiles,
  getXiaobeiVersion,
  loadConversationDetail,
  patchConversationModel,
  regenerateAssistant,
  retryAssistant,
  sendChat,
  setMessageFeedback,
  stopGeneration,
  subscribeXiaobei,
} from '../services/conversationService'

export default function XiaoBeiPage() {
  const { user } = useAuth()
  const userId = user?.id ?? 0
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const conversationId = params.get('c') ? Number(params.get('c')) : null
  const version = useSyncExternalStore(subscribeXiaobei, getXiaobeiVersion, getXiaobeiVersion)
  const detail = conversationId ? getConversationDetail(userId, conversationId) : null
  const messages = detail?.messages ?? []
  const empty = messages.length === 0 && conversationId == null
  const streaming = messages.some((item) => item.status === 'generating')
  const [draft, setDraft] = useState('')
  const [images, setImages] = useState<PendingImage[]>([])
  const [files, setFiles] = useState<PendingFile[]>([])
  const [draftModel, setDraftModel] = useState<XiaoBeiModelId>(XIAO_BEI_DEFAULT_MODEL)
  const [notice, setNotice] = useState('')
  const [plusOpen, setPlusOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [pinLatest, setPinLatest] = useState(true)
  const [away, setAway] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const modelId = detail?.conversation.model_id ?? draftModel
  void version

  useEffect(() => {
    setDraft('')
    setImages([])
    setFiles([])
    setNotice('')
    setPlusOpen(false)
    setModelOpen(false)
    setEditingId(null)
    setEditText('')
    setPinLatest(true)
    setAway(false)
    if (!conversationId) setDraftModel(XIAO_BEI_DEFAULT_MODEL)
  }, [conversationId])

  useEffect(() => {
    if (!conversationId) return
    let cancelled = false
    void loadConversationDetail(userId, conversationId)
      .then((loaded) => {
        if (cancelled) return
        if (!loaded && !getConversationDetail(userId, conversationId) && conversationsReady()) {
          navigate('/xiaobei', { replace: true })
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [conversationId, navigate, userId])

  function jumpToLatest() {
    const log = document.querySelector('.chat-log')
    if (log) log.scrollTop = log.scrollHeight
  }

  useEffect(() => {
    if (pinLatest && !empty) jumpToLatest()
  }, [version, pinLatest, empty])

  async function send(text: string, nextImages: PendingImage[], nextFiles: PendingFile[], replaceUserId?: number) {
    const modelText = chatPayload(text, nextFiles)
    if (modelId === XIAO_BEI_PRO_MODEL && nextImages.length) {
      setImages([])
      setNotice('当前模型看不了图片，请改用 Flash 后再发送图片。')
      return
    }
    if (!codePointLength(modelText) && !nextImages.length) return
    if (codePointLength(modelText) > XIAO_BEI_MAX_TEXT) {
      setNotice('您输入的文案太长了，请您缩减后再次发送。')
      return
    }
    setNotice('')
    const result = await sendChat(userId, conversationId, {
      text,
      images: nextImages,
      files: nextFiles,
      modelId,
      replaceUserId,
    })
    if (!result.ok) {
      if (result.error) setNotice(result.error)
      return
    }
    setDraft('')
    setImages([])
    setFiles([])
    setEditingId(null)
    setEditText('')
    setPinLatest(true)
    if (!conversationId || conversationId !== result.conversation.id) {
      navigate(`/xiaobei?c=${result.conversation.id}`, { replace: !conversationId })
    }
  }

  return (
    <div className={`chat-page${empty ? ' is-empty' : ''}`}>
      {empty ? (
        <div className="chat-welcome">
          <h1>
            <ProductLogo />
            <span>备备能帮您做什么？</span>
          </h1>
        </div>
      ) : (
        <ChatThread
          conversationKey={String(conversationId ?? 'new')}
          messages={messages}
          pinLatest={pinLatest}
          streaming={streaming}
          editingId={editingId}
          editText={editText}
          onEditText={setEditText}
          onCancelEdit={() => {
            setEditingId(null)
            setEditText('')
          }}
          onResend={() => {
            const current = messages.find((item) => item.id === editingId)
            if (!current) return
            void send(
              editText,
              current.images.map((image) => ({ id: image.id, name: image.name, src: image.url })),
              getMessageFiles(current.id),
              current.id,
            )
          }}
          onCopy={(id) => {
            const message = messages.find((item) => item.id === id)
            if (message && navigator.clipboard) void navigator.clipboard.writeText(message.content)
          }}
          onEdit={(id) => {
            const message = messages.find((item) => item.id === id)
            if (!message || streaming) return
            setEditingId(id)
            setEditText(message.content)
          }}
          onLike={(id) => {
            void setMessageFeedback(userId, id, 'like')
          }}
          onDislike={(id) => {
            void setMessageFeedback(userId, id, 'dislike')
          }}
          onRegen={(id) => {
            setPinLatest(true)
            void regenerateAssistant(userId, id)
          }}
          onRetry={(id) => {
            setPinLatest(true)
            void retryAssistant(userId, id)
          }}
          onAwayFromLatest={(next) => {
            setAway(next)
            setPinLatest(!next)
          }}
        />
      )}
      <div className="chat-foot">
        {!empty ? (
          <button
            className="chat-jump-latest"
            type="button"
            aria-label="回到最新"
            hidden={!away}
            onClick={() => {
              setPinLatest(true)
              jumpToLatest()
              setAway(false)
            }}
          >
            <ChatGlyph kind="down" />
          </button>
        ) : null}
        <ChatComposer
          draft={draft}
          images={images}
          files={files}
          modelId={modelId}
          notice={notice}
          streaming={streaming}
          plusOpen={plusOpen}
          modelOpen={modelOpen}
          onDraft={setDraft}
          onImages={setImages}
          onFiles={setFiles}
          onModel={(next) => {
            setDraftModel(next)
            if (conversationId) void patchConversationModel(userId, conversationId, next)
          }}
          onNotice={setNotice}
          onPlusOpen={setPlusOpen}
          onModelOpen={setModelOpen}
          onSend={() => {
            void send(draft, images, files)
          }}
          onStop={() => {
            if (conversationId) {
              void stopGeneration(userId, conversationId)
              setPinLatest(true)
            }
          }}
        />
      </div>
    </div>
  )
}
