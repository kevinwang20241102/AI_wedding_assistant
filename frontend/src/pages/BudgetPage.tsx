import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '../stores/authContext'
import type { BudgetCategoryCreateRequest, BudgetCategoryStatus, BudgetPageData } from '../mocks/budget'
import BudgetBoard from '../components/budget/BudgetBoard'
import CategoryRow from '../components/budget/CategoryRow'
import NewBudgetDialog from '../components/budget/NewBudgetDialog'
import { useBudgetDrag } from '../components/budget/useBudgetDrag'
import {
  addBudgetCategory,
  categoryInsertIndex,
  deleteBudgetCategory,
  getBudget,
  moveBudgetCategory,
  previewMoveCategory,
  updateBudgetCategory,
} from '../services/budgetService'
import '../components/budget/budget.css'

export default function BudgetPage() {
  const { user } = useAuth()
  const userId = user?.id ?? 0
  const [budget, setBudget] = useState<BudgetPageData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [openCat, setOpenCat] = useState<number | null>(null)
  const [addCat, setAddCat] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pendingScroll = useRef<{ budget: number; content: number } | null>(null)
  const budgetRef = useRef<BudgetPageData | null>(null)

  const applyBudget = useCallback((next: BudgetPageData) => {
    const content = document.querySelector('.content-scroll')
    pendingScroll.current = {
      budget: scrollRef.current?.scrollTop ?? 0,
      content: content instanceof HTMLElement ? content.scrollTop : 0,
    }
    budgetRef.current = next
    setBudget(next)
    setLoadError('')
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const next = await getBudget(userId)
        if (cancelled) return
        budgetRef.current = next
        setBudget(next)
        setLoadError('')
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : '请求失败')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [userId])

  useLayoutEffect(() => {
    const snap = pendingScroll.current
    if (!snap) return
    if (scrollRef.current) scrollRef.current.scrollTop = snap.budget
    const content = document.querySelector('.content-scroll')
    if (content instanceof HTMLElement) content.scrollTop = snap.content
    pendingScroll.current = null
  }, [budget])

  const categoryName = useCallback(
    (id: number) => budget?.categories.find((item) => item.id === id)?.name ?? '',
    [budget],
  )

  const { drag, startPress, ghost } = useBudgetDrag({
    scrollRef,
    categoryName,
    onMove: (categoryId, drop) => {
      const current = budgetRef.current
      if (!current) return
      const sortOrder = categoryInsertIndex(current, categoryId, drop.beforeId)
      applyBudget(previewMoveCategory(current, categoryId, drop.beforeId))
      void moveBudgetCategory(userId, categoryId, sortOrder)
        .then(applyBudget)
        .catch(() => applyBudget(current))
    },
  })

  function saveCategory(
    id: number,
    patch: { amount_fen: number; status: BudgetCategoryStatus; note: string },
  ) {
    void updateBudgetCategory(userId, id, patch)
      .then((next) => {
        applyBudget(next)
        setOpenCat(null)
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : '请求失败')
      })
    return null
  }

  function saveNew(input: BudgetCategoryCreateRequest) {
    void addBudgetCategory(userId, input)
      .then((next) => {
        applyBudget(next)
        setAddCat(false)
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : '请求失败')
      })
    return null
  }

  if (!budget) {
    return (
      <div className="budget-page">
        <p role="status">{loadError || '正在加载'}</p>
      </div>
    )
  }

  return (
    <div className="budget-page">
      <BudgetBoard
        totalFen={budget.total_budget_fen}
        allocatedFen={budget.allocated_fen}
        unallocatedFen={budget.unallocated_fen}
        over={budget.is_over_allocated}
      />
      <div className="budget-scroll" ref={scrollRef}>
        <div className="budget-body">
          <div className="cat-tools">
            <p className="stage-hint">* 温馨提示：点击长按拖动可调换预算位置哦~</p>
            <button className="btn primary" type="button" onClick={() => setAddCat(true)}>
              新增预算
            </button>
          </div>
          <div className="cat-list">
            {budget.categories.map((category) => {
              const showLine = drag?.drop?.beforeId === category.id
              return (
                <Fragment key={category.id}>
                  {showLine ? <div className="budget-drop-line" /> : null}
                  <CategoryRow
                    category={category}
                    totalFen={budget.total_budget_fen}
                    open={openCat === category.id}
                    lifted={drag?.id === category.id}
                    onPointerDown={(event, id) => startPress(id, event)}
                    onEdit={(id) => setOpenCat((current) => (current === id ? null : id))}
                    onDelete={(id) => {
                      void deleteBudgetCategory(userId, id).then((next) => {
                        applyBudget(next)
                        if (openCat === id) setOpenCat(null)
                      })
                    }}
                    onSave={saveCategory}
                  />
                </Fragment>
              )
            })}
            {drag?.drop?.beforeId === null ? <div className="budget-drop-line" /> : null}
          </div>
        </div>
      </div>
      {ghost}
      {addCat ? (
        <NewBudgetDialog onClose={() => setAddCat(false)} onSave={saveNew} />
      ) : null}
    </div>
  )
}
