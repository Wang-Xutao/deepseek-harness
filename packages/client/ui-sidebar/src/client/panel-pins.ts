/** In-memory pin choices for the global panel launchers. */
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

/** Panel whose launcher always shows and never enters the customization list. */
export const FIXED_PANEL_ID = 'plugins'

/**
 * Panel launchers that start in the More menu instead of the sidebar rail.
 *
 * 【变更】2026-10-25 (批次二十四 3): 自动化任务 moved out of the rail — the rail
 * keeps the surfaces a user opens constantly (插件 / 工作流) while the task
 * manager lives one click away in 更多. A launcher here stays unpinned until
 * the user pins it back; the More menu lists exactly these launchers.
 */
const DEFAULT_UNPINNED_PANELS: readonly string[] = ['schedules']

/** Unpinned panel ids and their only mutation. */
export interface PanelPins {
  /** Unpinned panel ids; ids of panels that are not registered stay listed. */
  readonly unpinned: ObservableSnapshot<readonly string[]>
  /**
   * Pin or unpin one panel launcher; the fixed panel is ignored.
   * @param id - Panel id.
   * @param pinned - Whether the launcher is manually pinned.
   */
  readonly setPinned: (id: string, pinned: boolean) => void
}

/**
 * Create the in-memory panel pin list; the snapshot keeps its reference until the list changes.
 * @returns Unpinned panel ids and the pin mutation.
 */
export function createPanelPins(): PanelPins {
  const store = createSnapshotStore<{ readonly unpinned: readonly string[] }>({ unpinned: DEFAULT_UNPINNED_PANELS })
  return {
    unpinned: { getSnapshot: () => store.getSnapshot().unpinned, subscribe: listener => store.subscribe(listener) },
    setPinned: (id, pinned) => {
      const current = store.getSnapshot().unpinned
      if (id === FIXED_PANEL_ID || pinned !== current.includes(id)) return
      store.set({ unpinned: pinned ? current.filter(entry => entry !== id) : [...current, id] })
    },
  }
}
