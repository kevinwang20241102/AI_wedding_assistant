import { pinyin } from 'pinyin-pro'

const LATIN = /^[A-Za-z]$/
const CJK_START = '\u4e00'
const CJK_END = '\u9fff'

export function avatarInitial(username: string) {
  const trimmed = username.trim()
  const ch = Array.from(trimmed)[0] || ''
  if (!ch) return ''
  if (LATIN.test(ch)) return ch.toUpperCase()
  if (ch >= CJK_START && ch <= CJK_END) {
    const letter = pinyin(ch, { pattern: 'first', toneType: 'none' })
    const initial = Array.from(letter)[0] || ''
    if (LATIN.test(initial)) return initial.toUpperCase()
    return ch
  }
  return ch
}
