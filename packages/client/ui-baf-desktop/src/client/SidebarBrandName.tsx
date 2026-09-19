/**
 * Sidebar brand name slot — BAF DSH product name + version badge.
 *
 * Overrides `ui-brand-official`'s "DeepSeek Harness" wordmark so the title row
 * reads "BAF DSH" + a version capsule instead of the upstream product label.
 * The version comes from the Electron `bafDesktop.getVersions()` bridge — the
 * same source the Settings「版本与更新」page renders — so the sidebar and the
 * Settings card cannot drift apart across bumps.
 *
 * Outside Electron (web build, dev server) the version resolves to `undefined`
 * and the capsule is hidden; only the product name renders.
 */
import { useEffect, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { readBafDshVersion } from './bridge.ts'
import css from './SidebarBrandName.module.css'

export type SidebarBrandNameProps = PropsRuntime<'sidebar.brand.name'>

/**
 * Render the BAF DSH product name with its shipped version.
 *
 * The version rides the same inverted capsule the official wordmark uses for
 * its build label (`ui-primitives/BrandWordmark`: a `rx=2` pill filled with
 * the label ink, glyphs knocked out in `--dsw-alias-label-primary-inverted`).
 */
export function SidebarBrandName(_props: SidebarBrandNameProps) {
  const [version, setVersion] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void readBafDshVersion().then((next) => {
      if (!cancelled) setVersion(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <span className={css.name}>BAF DSH</span>
      {version !== undefined && version.length > 0 && (
        <span className={css.version}>v{version}</span>
      )}
    </>
  )
}
