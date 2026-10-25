/** Folded Conversation Views, the panels held in More, and plugin creation. */
import {
  IconCheckOutlineRegular, IconPluginPinwheelOutlineRegular, IconPlusOutlineRegular, MenuItemButton,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './EntryMenu.module.css'

/** Navigation region whose More menu hosts one registration. */
export type EntryRegion = 'sidebar' | 'conversation' | 'rightbar'

/** Region identity and footer actions injected into each registration. */
export interface EntryMenuInjected {
  /** Region of this registration; selects analytics attributes and the Creator prompt. */
  readonly region: EntryRegion
  readonly hooks: {
    /** Whether the Plugins page navigation service is present; the discovery row shows only while it is. */
    readonly pluginNavigation: HostObservable<boolean>
  }
  /** Open the Plugins main list. */
  readonly browsePlugins: () => void
  /** Start a Creator draft with this region's prompt without sending it. */
  readonly createPlugin: () => void
}

// The three region owners declare the same fields; the sidebar's slot names them.
type EntryMenuContentProps = PropsRuntime<'sidebar.panellist.actions'>
  & PropsLocale<'entryCustomization'> & InjectFace<EntryMenuInjected>

/**
 * Render the region's More-menu rows: the entries that live in More, then the
 * Creator action.
 *
 * 【变更】2026-10-25 (批次二十四 3): the sidebar's More menu now carries the
 * panel launchers that live there — 自动化任务 is one of them — so a launcher
 * moved out of the rail is still one click away. The plugin-discovery row is
 * gone from this region: 浏览更多插件 duplicated the fixed 插件 launcher, which
 * the rail already shows.
 * @param props - Owner dismissal callback, injected actions, and localized copy.
 * @returns Menu rows for the region's More menu.
 */
export function EntryMenuContent({
  entries, onOpen, region, onDismiss, usePluginNavigation, browsePlugins, createPlugin, t,
}: EntryMenuContentProps) {
  // The sidebar lists the launchers held in More (unpinned ones); the
  // conversation lists the Views its header folded into More.
  const moreEntries = region === 'sidebar'
    ? entries.filter(entry => entry.pinned !== true)
    : region === 'conversation' ? entries : []
  const browsable = region !== 'sidebar' && usePluginNavigation(present => present)
  return <>
    {moreEntries.map(entry => <MenuItemButton key={entry.id} current={entry.active === true}
      icon={entry.icon?.()}
      onSelect={() => { onDismiss(); onOpen(entry.id) }}>
      <span className={css.entryName}>
        <span className={css.entryTitle}>{entry.label}</span>
        {entry.active === true && <IconCheckOutlineRegular size={16} className={css.activeMark} />}
      </span>
    </MenuItemButton>)}
    {browsable && <MenuItemButton separatorBefore={moreEntries.length > 0} icon={<IconPluginPinwheelOutlineRegular size={16} />}
      onSelect={() => { onDismiss(); browsePlugins() }}>
      {t('install')}
    </MenuItemButton>}
    <MenuItemButton icon={<IconPlusOutlineRegular size={16} />} separatorBefore={!browsable && moreEntries.length > 0}
      onSelect={() => { onDismiss(); createPlugin() }}>
      {t('create')}
    </MenuItemButton>
  </>
}
