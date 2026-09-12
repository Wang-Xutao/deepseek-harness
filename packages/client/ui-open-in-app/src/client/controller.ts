/** Browser availability/choice state and the launch carrier for the split button. */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  OPEN_IN_APP_APPS_ROUTE, OPEN_IN_APP_OPEN_ROUTE,
  type OpenInAppAppsPayload, type OpenInAppOpenPayload,
} from '@deepseek-ai/dsh-host-open-in-app/shared'
import {
  DEFAULT_OPEN_IN_APP_DISABLED, OPEN_IN_APP_DISABLED_KEY,
} from './open-in-app-settings.ts'

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>

/** Resolve the browser's Host base with the connection carrier's null-origin fallback. */
function hostBase(): string {
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin
  return origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal'
}

/**
 * Owns the once-per-page availability read, the persisted last choice, the
 * persisted per-app visibility, and the launch POST. Availability, choice,
 * and visibility publish through uSES-safe sources so every Session header
 * shares one truth and the General-settings row reads the same store the
 * header subscribes to.
 */
export class OpenInAppController {
  /** Installed app ids in host menu order; null until the host answered. */
  readonly apps: SnapshotStore<readonly string[] | null> = createSnapshotStore<readonly string[] | null>(null)
  /** Last chosen app id, or empty before the first choice, shared across sessions and browser restarts. */
  readonly choice: SnapshotStore<string> = createSnapshotStore<string>('', {
    persist: { name: 'dsh.open-in-app.choice' },
  })
  /** App ids the user hid from the session-header dropdown. */
  readonly disabled: SnapshotStore<readonly string[]> = createSnapshotStore<readonly string[]>(
    [...DEFAULT_OPEN_IN_APP_DISABLED],
    { persist: { name: OPEN_IN_APP_DISABLED_KEY } },
  )

  private loading: Promise<void> | undefined

  /**
   * @param fetcher - HTTP carrier for the apps read and the launch POST.
   */
  constructor(private readonly fetcher: Fetch = (input, init) => fetch(input, init)) {}

  /**
   * Read availability once per controller life; concurrent calls share the read.
   * A failed read publishes an empty list, which renders no button at all.
   * @returns after availability is published.
   */
  load(): Promise<void> {
    this.loading ??= this.run()
    return this.loading
  }

  /**
   * Remember one picked app id.
   * @param appId - catalog id from the availability list.
   */
  choose(appId: string): void {
    this.choice.set(appId)
  }

  /**
   * Replace the hidden-app list; an empty list shows every installed app.
   * @param appIds - the full set of app ids the user wants hidden.
   */
  setDisabled(appIds: readonly string[]): void {
    this.disabled.set([...appIds])
  }

  /**
   * Toggle one app id in the hidden set; the latest list is persisted as a
   * single replace so writes do not race.
   * @param appId - the app id to show or hide.
   * @param enabled - true to show, false to hide.
   */
  setEnabled(appId: string, enabled: boolean): void {
    const current = this.disabled.getSnapshot()
    const next = enabled
      ? current.filter(id => id !== appId)
      : current.includes(appId) ? current : [...current, appId]
    if (next.length === current.length && next.every((id, i) => id === current[i])) return
    this.disabled.set(next)
  }

  /**
   * Launch one installed app on a workspace directory.
   * @param appId - catalog id from the availability list.
   * @param path - the session's absolute workspace directory.
   * @returns after the host acknowledged the launch; rejects on any failure.
   */
  async launch(appId: string, path: string): Promise<void> {
    const body: OpenInAppOpenPayload = { app: appId, path }
    const response = await this.fetcher(new URL(OPEN_IN_APP_OPEN_ROUTE, hostBase()), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`open failed: HTTP ${String(response.status)}`)
  }

  private async run(): Promise<void> {
    let apps: readonly string[] = []
    try {
      const response = await this.fetcher(new URL(OPEN_IN_APP_APPS_ROUTE, hostBase()), {
        headers: { accept: 'application/json' },
      })
      if (response.ok) {
        const payload = await response.json() as OpenInAppAppsPayload
        if (Array.isArray(payload.apps)) apps = payload.apps.filter(id => typeof id === 'string')
      }
    } catch {
      // Swallows network failures: an unreachable host reads as no apps, and
      // the header simply shows no button rather than a broken one.
    }
    this.apps.set(apps)
  }
}
