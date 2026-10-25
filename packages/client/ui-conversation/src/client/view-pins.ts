/** In-memory pin choices for the Conversation View tabs. */
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

/** View whose tab always shows and never enters the customization list. */
export const FIXED_VIEW_ID = 'chat'

/**
 * The Views that keep a tab in the Session header strip.
 *
 * 【变更】2026-10-25 (批次二十四 4): the strip carries the five views a user
 * opens constantly — 对话 / 轨迹 / 轨迹图 / 工作流图 / 测试流图 — and every other
 * View folds into the 更多会话视图 menu. A plugin View therefore no longer adds
 * a tab to the header; it stays one click away in the menu.
 */
export const PRIMARY_VIEW_IDS: readonly string[] = [
  FIXED_VIEW_ID, 'trajectory', 'trace-graph', 'baf-workflow', 'baf-test-flow',
]

const NO_VIEWS: readonly string[] = []

/** Unpinned View ids and their only mutation. */
export interface ViewPins {
  /** Unpinned View ids; ids of Views that are not registered stay listed. */
  readonly unpinned: ObservableSnapshot<readonly string[]>
  /**
   * Pin or unpin one View tab; the fixed View is ignored. A pinned tab still
   * enters More when the header's width budget cannot hold it.
   * @param id - View id.
   * @param pinned - Whether the tab is manually pinned.
   */
  readonly setPinned: (id: string, pinned: boolean) => void
}

/**
 * Create the in-memory View pin list; the snapshot keeps its reference until the list changes.
 * @returns Unpinned View ids and the pin mutation.
 */
export function createViewPins(): ViewPins {
  const store = createSnapshotStore<{ readonly unpinned: readonly string[] }>({ unpinned: NO_VIEWS })
  return {
    unpinned: { getSnapshot: () => store.getSnapshot().unpinned, subscribe: listener => store.subscribe(listener) },
    setPinned: (id, pinned) => {
      const current = store.getSnapshot().unpinned
      if (id === FIXED_VIEW_ID || pinned !== current.includes(id)) return
      store.set({ unpinned: pinned ? current.filter(entry => entry !== id) : [...current, id] })
    },
  }
}
