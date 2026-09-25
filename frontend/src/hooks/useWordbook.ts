import { useState, useCallback, useEffect } from 'react'
import type { Wordbook } from '@/types'

/**
 * 每个学生各自记住「当前词本」。
 * ------------------------------------------------------------------
 * 旧版把选择存在单个全局 key（word_master_wordbook）里，导致切换学生后
 * 仍然是上一个学生选中的词本。这里改成按 studentId 隔离的一张映射表，
 * 切换学生时自然切换到该学生自己的选择（没有就是 null，页面提示去选）。
 *
 * 兼容旧版：首次使用时把原来的全局选择迁移给当前学生，再删除旧 key。
 */
const STORAGE_KEY = 'word_master_wordbooks'
const LEGACY_KEY = 'word_master_wordbook'

type WordbookMap = Record<string, Wordbook>

function readMap(): WordbookMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as WordbookMap) : {}
  } catch {
    return {}
  }
}

function writeMap(byStudentId: WordbookMap) {
  try {
    if (Object.keys(byStudentId).length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(byStudentId))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    /* 隐私模式等写入失败，忽略 */
  }
}

/** 取出旧版全局选择（取出即删除，保证只迁移一次） */
function takeLegacy(): Wordbook | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    localStorage.removeItem(LEGACY_KEY)
    return JSON.parse(raw) as Wordbook
  } catch {
    return null
  }
}

export function useWordbook(studentId: number | null) {
  const [byStudentId, setByStudentId] = useState<WordbookMap>(readMap)
  const key = studentId != null ? String(studentId) : null
  const wordbook = key ? (byStudentId[key] ?? null) : null

  // 兼容旧版：把全局「当前词本」迁移给当前学生（只做一次）
  useEffect(() => {
    if (!key || byStudentId[key]) return
    const legacy = takeLegacy()
    if (legacy) setByStudentId(prev => ({ ...prev, [key]: legacy }))
  }, [key, byStudentId])

  // 持久化（副作用放在 effect 里，保持 updater 纯净）
  useEffect(() => {
    writeMap(byStudentId)
  }, [byStudentId])

  const setWordbook = useCallback((wb: Wordbook | null) => {
    if (!key) return
    setByStudentId(prev => {
      const next = { ...prev }
      if (wb) next[key] = wb
      else delete next[key]
      return next
    })
  }, [key])

  /** 词本被删除时，清掉「所有学生」对它的引用，避免悬空选择 */
  const forgetWordbook = useCallback((wordbookId: number) => {
    setByStudentId(prev => {
      const next: WordbookMap = {}
      let changed = false
      for (const [k, v] of Object.entries(prev)) {
        if (v.id === wordbookId) {
          changed = true
          continue
        }
        next[k] = v
      }
      return changed ? next : prev
    })
  }, [])

  return { wordbook, setWordbook, forgetWordbook }
}
