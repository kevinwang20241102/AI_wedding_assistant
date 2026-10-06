import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { ApiError } from '../types/auth'
import {
  listWeddingPhotos,
  replaceWeddingPhoto,
  uploadWeddingPhoto,
} from '../services/weddingPhotoService'
import type { WeddingPhotoListItem } from '../mocks/wedding'

type WeddingPhotoPaneProps = {
  userId: number
}

function displayPhoto(item: WeddingPhotoListItem): WeddingPhotoListItem {
  if (item.url.startsWith('blob:')) return item
  const base = item.url.split('?')[0]
  return { id: item.id, url: `${base}?t=${Date.now()}` }
}

export default function WeddingPhotoPane({ userId }: WeddingPhotoPaneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const replaceId = useRef<number | null>(null)
  const [photos, setPhotos] = useState<WeddingPhotoListItem[]>([])
  const [notice, setNotice] = useState('')
  const photo = photos[0] ?? null

  useEffect(() => {
    let cancelled = false
    void listWeddingPhotos(userId)
      .then((items) => {
        if (!cancelled) setPhotos(items.map(displayPhoto))
      })
      .catch((error) => {
        if (cancelled) return
        setNotice(error instanceof ApiError ? error.error : '合影读取失败，请稍后再试。')
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  function openPicker(id: number | null) {
    replaceId.current = id
    inputRef.current?.click()
  }

  async function handleFile(file: File) {
    const currentId = replaceId.current
    replaceId.current = null
    try {
      const next =
        currentId != null
          ? await replaceWeddingPhoto(userId, currentId, file)
          : await uploadWeddingPhoto(userId, file)
      setPhotos([displayPhoto(next)])
      setNotice('')
    } catch (error) {
      if (error instanceof ApiError) setNotice(error.error)
      else setNotice('这张照片没有保存上，请再试一次。')
    }
  }

  function onPickChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void handleFile(file)
  }

  return (
    <section className={`archive-col photo-col${photo ? ' has-photo' : ''}`}>
      {photo ? null : <h2>上传婚纱照/新人合照</h2>}
      {notice ? <p className="error">{notice}</p> : null}
      {photo ? (
        <div className="photo-fill">
          <img src={photo.url} alt="婚礼档案照片" />
          <button
            className="btn secondary photo-replace"
            type="button"
            onClick={() => openPicker(photo.id)}
          >
            更换合影
          </button>
        </div>
      ) : (
        <div className="photo-empty">
          <button className="btn secondary photo-upload" type="button" onClick={() => openPicker(null)}>
            上传照片
          </button>
        </div>
      )}
      <input
        id="archive-photo"
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onPickChange}
      />
    </section>
  )
}
