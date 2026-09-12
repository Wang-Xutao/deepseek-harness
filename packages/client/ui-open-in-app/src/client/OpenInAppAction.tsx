import { useEffect, useRef, useState } from 'react'
import { IconChevronDownOutline14, Menu, Tooltip, type MenuItem } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { NS, type OpenInAppKey } from './locales.ts'
import css from './OpenInAppAction.module.css'

/** Browser operations and state injected into the Session Header contribution. */
export interface OpenInAppActionInjected {
  hooks: {
    openInAppApps: ObservableSnapshot<readonly string[] | null>
    openInAppChoice: ObservableSnapshot<string>
    openInAppDisabled: ObservableSnapshot<readonly string[]>
  }
  launch: (appId: string, path: string) => Promise<void>
  choose: (appId: string) => void
  iconUrl: (appId: string) => string
}

/** Full props for the Session-header open-in-app split button. */
export type OpenInAppActionProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & InjectFace<OpenInAppActionInjected>

/**
 * Label keys per catalog id: the browser renders only ids it can name, so a
 * host catalog extension without a matching dictionary entry stays invisible
 * instead of showing a raw id.
 */
const APP_LABEL_KEY: Record<string, OpenInAppKey | undefined> = {
  finder: 'app.finder',
  explorer: 'app.explorer',
  filemanager: 'app.filemanager',
  cursor: 'app.cursor',
  vscode: 'app.vscode',
  vscodeinsiders: 'app.vscodeinsiders',
  windsurf: 'app.windsurf',
  zed: 'app.zed',
  sublimetext: 'app.sublimetext',
  xcode: 'app.xcode',
  androidstudio: 'app.androidstudio',
  intellij: 'app.intellij',
  pycharm: 'app.pycharm',
  webstorm: 'app.webstorm',
  phpstorm: 'app.phpstorm',
  goland: 'app.goland',
  rider: 'app.rider',
  rustrover: 'app.rustrover',
  fork: 'app.fork',
  sourcetree: 'app.sourcetree',
  github: 'app.github',
  tower: 'app.tower',
  gitkraken: 'app.gitkraken',
  smartgit: 'app.smartgit',
  sublimemerge: 'app.sublimemerge',
  ghostty: 'app.ghostty',
  warp: 'app.warp',
  iterm: 'app.iterm',
  kitty: 'app.kitty',
  terminal: 'app.terminal',
  windowsterminal: 'app.windowsterminal',
  gitbash: 'app.gitbash',
  cmd: 'app.cmd',
  powershell: 'app.powershell',
  gnometerminal: 'app.gnometerminal',
  konsole: 'app.konsole',
}

/** App ids whose icon image already failed this page; a 404 icon is fetched once, not per menu open. */
const failedIcons = new Set<string>()

/**
 * App ids whose shipped glyph is preferred over the host PNG because the
 * Windows shell icon APIs return a known-wrong mark for their exe: Git for
 * Windows' git-bash.exe yields a non-Git multicolor icon (and git.exe a
 * generic console), never the orange Git logo users expect.
 */
const PREFERRED_FALLBACK_ICONS = new Set(['gitbash'])

/**
 * Inline SVG glyphs shipped for the apps whose host icon extraction is
 * unreliable on Windows (system-level apps like explorer.exe and bash.exe
 * fail `ExtractAssociatedIcon` or return null/garbage icons). Each glyph is
 * sized to 16 to match the menu itemIcon slot — the host PNGs are scaled
 * with the same `size` so the row never has mismatched icons.
 */
const FALLBACK_ICONS: Record<string, React.JSX.Element> = {
  // Windows File Explorer — folder-with-window glyph in OS accent color.
  explorer: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 6.5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5Z" fill="#FCE100" />
      <path d="M3 9.5h18v5.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5Z" fill="#FFB900" />
      <rect x="5.5" y="11.5" width="3" height="3" rx="0.4" fill="#1B6FC9" />
      <rect x="9.5" y="11.5" width="3" height="3" rx="0.4" fill="#1B6FC9" opacity="0.55" />
    </svg>
  ),
  // Cursor — the editor's official triangle-on-square mark.
  cursor: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect width="24" height="24" rx="5" fill="#000" />
      <path d="M7 5.5 18 11l-4.2 1.4L12.4 17 7 5.5Z" fill="#fff" />
    </svg>
  ),
  // VS Code — the blue swoosh mark.
  vscode: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M17.7 3.4 21 6v12l-3.3 2.6L8.6 13.2 6 15.4V18l3.4 2.4 8.3-7.7V19l-3 2.4L4 13.8V10L14.7 2.5l3 0.9Z" fill="#0078D4" />
      <path d="M17.7 3.4 21 6v12l-3.3 2.6L8.6 13.2 6 15.4V18l3.4 2.4 8.3-7.7V19l-3 2.4L4 13.8V10L14.7 2.5l3 0.9Z" fill="#fff" fillOpacity="0.18" />
    </svg>
  ),
  // Git Bash — MINGW64 console chrome with the Git branch glyph.
  gitbash: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="3" width="20" height="18" rx="3" fill="#1B2A3A" />
      <rect x="2" y="3" width="20" height="3.5" fill="#0F1A26" />
      <circle cx="11" cy="9" r="1.1" fill="#F1502F" />
      <circle cx="11" cy="15" r="1.1" fill="#F1502F" />
      <path d="M11 10.2v3.6" stroke="#F1502F" strokeWidth="1.2" />
      <path d="M11 13.8c1.2 0 2-.8 2-2" stroke="#F1502F" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M5 16.5h2.5" stroke="#7EE787" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M5 18.4h5" stroke="#7EE787" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  ),
  // macOS Finder — the iconic two-tone face glyph.
  finder: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="3" fill="#1E90FF" />
      <path d="M3 12h18" stroke="#fff" strokeWidth="0.8" />
      <path d="M9 8c0 1.5 1.2 2.5 3 2.5S15 9.5 15 8" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <circle cx="9" cy="8" r="0.9" fill="#fff" />
      <circle cx="15" cy="8" r="0.9" fill="#fff" />
    </svg>
  ),
  // Generic terminal glyph for terminal-family apps.
  terminal: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2.5" y="4" width="19" height="16" rx="2.5" fill="#1f2328" />
      <path d="M6.5 9.5 9 12l-2.5 2.5" stroke="#7ee787" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M11 14.8h5" stroke="#7ee787" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </svg>
  ),
  // Windows Command Prompt — black console with C: prompt glyph and cursor block.
  cmd: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="3" width="20" height="18" rx="2" fill="#000" />
      <rect x="2" y="3" width="20" height="4" fill="#1a1a1a" />
      <circle cx="4.5" cy="5" r="0.6" fill="#FF5F56" />
      <circle cx="6.8" cy="5" r="0.6" fill="#FFBD2E" />
      <circle cx="9.1" cy="5" r="0.6" fill="#27C93F" />
      {/* C letter shape */}
      <path d="M7 11.2a2.8 2.8 0 0 1 5.4-.6" stroke="#fff" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M7 11.2v1.6a2.8 2.8 0 0 0 5.4.6" stroke="#fff" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      {/* backslash + greater-than as prompt arrow */}
      <path d="M13.8 9.6 16 12l-2.2 2.4" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M16.8 9.6 14.6 14.4" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" />
      {/* cursor block */}
      <rect x="18" y="11" width="1.6" height="2.6" fill="#fff" />
      <path d="M4 17h12" stroke="#7EE787" strokeWidth="1" strokeLinecap="round" />
    </svg>
  ),
  // Windows PowerShell — navy window with the chevron-and-underscore prompt.
  powershell: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="3" width="20" height="18" rx="2" fill="#012456" />
      <rect x="2" y="3" width="20" height="4" fill="#000" />
      <circle cx="4.5" cy="5" r="0.6" fill="#FF5F56" />
      <circle cx="6.8" cy="5" r="0.6" fill="#FFBD2E" />
      <circle cx="9.1" cy="5" r="0.6" fill="#27C93F" />
      {/* chevron prompt arrow */}
      <path d="M4 10 7 12.4 4 14.8" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* underscore cursor */}
      <rect x="8.2" y="14.4" width="6" height="1.4" fill="#fff" />
      {/* status bar */}
      <rect x="4" y="17.6" width="14" height="0.8" fill="#39A0ED" />
    </svg>
  ),
  // Windows Terminal — the official tabbed-terminal glyph.
  windowsterminal: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="3" width="20" height="18" rx="2" fill="#000" />
      <rect x="2" y="3" width="20" height="4" fill="#1a1a1a" />
      <rect x="4" y="9" width="16" height="11" rx="1" fill="#0c0c0c" stroke="#3a3a3a" strokeWidth="0.5" />
      <path d="M5.5 11.5 7.5 13.5l-2 1.8" stroke="#80BCFF" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M9 15h4" stroke="#80BCFF" strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  ),
}

/** App ids that have a shipped inline glyph; others use the generic square. */
function fallbackIcon(id: string, size: number): React.JSX.Element | null {
  const glyph = FALLBACK_ICONS[id]
  if (glyph === undefined) return null
  return (
    <span
      className={css.icon}
      aria-hidden
      style={{ display: 'inline-flex', width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      {glyph}
    </span>
  )
}

/**
 * One application's real bundle icon (host-served PNG) with an inline
 * per-app glyph when the host has none or the exe's extracted mark is
 * known-wrong (Windows icon extraction is unreliable for system apps), then a
 * generic square as the last resort.
 * @param props - catalog id, host icon URL, and rendered size.
 * @returns the icon image or its fallback glyph.
 */
function AppIcon({ id, url, size }: { id: string; url: string; size: number }): React.JSX.Element {
  const [failed, setFailed] = useState(failedIcons.has(id))
  if (failed || (PREFERRED_FALLBACK_ICONS.has(id) && FALLBACK_ICONS[id] !== undefined)) {
    return fallbackIcon(id, size) ?? (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className={css.icon}
        aria-hidden
      >
        <rect x={3} y={3} width={18} height={18} rx={5} />
      </svg>
    )
  }
  return (
    <img
      src={url}
      width={size}
      height={size}
      className={css.icon}
      alt=""
      aria-hidden
      draggable={false}
      onError={() => {
        failedIcons.add(id)
        setFailed(true)
      }}
    />
  )
}

/**
 * Quick launches settle well under this delay, so their busy dress never
 * paints — the visible dim-and-wait treatment is reserved for launches that
 * are actually taking a while, instead of flashing on every click.
 */
const BUSY_DRESS_DELAY_MS = 250

/**
 * Session-header split button: the main button opens the session's workspace
 * directory in the remembered application, the chevron opens the menu of
 * every application the host probed as installed. It renders nothing until
 * the host reported at least one nameable application and the session has a
 * known workspace directory, so a host without the capability never grows
 * the control.
 * @param props - session runtime, injected controller face, and localized copy.
 * @returns the split button and its menu, or null when there is nothing to offer.
 */
export function OpenInAppAction(props: OpenInAppActionProps): React.JSX.Element | null {
  const { sessionId, useSessions, useOpenInAppApps, useOpenInAppChoice, useOpenInAppDisabled, t } = props
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const available = useOpenInAppApps(apps => apps)
  const choice = useOpenInAppChoice(id => id)
  const disabled = useOpenInAppDisabled(ids => ids)
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'busy' | 'error'>('idle')
  const inFlight = useRef(false)
  const busyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => {
    clearTimeout(busyTimer.current)
    clearTimeout(errorTimer.current)
  }, [])

  const disabledSet = new Set(disabled)
  const apps = (available ?? [])
    .filter(id => !disabledSet.has(id))
    .map(id => ({ id, labelKey: APP_LABEL_KEY[id] }))
    .filter((entry): entry is { id: string; labelKey: OpenInAppKey } => entry.labelKey !== undefined)
  const currentEntry = apps.find(entry => entry.id === choice) ?? apps[0]
  if (currentEntry === undefined || cwd === undefined || cwd === '') return null

  const current = currentEntry.id
  const currentLabel = t(currentEntry.labelKey)
  const title = phase === 'error' ? t('open.error') : t('open.title', { app: currentLabel })

  const launch = (appId: string): void => {
    if (inFlight.current) return
    inFlight.current = true
    // A pending error decay must not flip the button back to idle mid-launch.
    clearTimeout(errorTimer.current)
    clearTimeout(busyTimer.current)
    busyTimer.current = setTimeout(() => { setPhase('busy') }, BUSY_DRESS_DELAY_MS)
    props.launch(appId, cwd).then(() => {
      inFlight.current = false
      clearTimeout(busyTimer.current)
      setPhase('idle')
    }, () => {
      inFlight.current = false
      clearTimeout(busyTimer.current)
      setPhase('error')
      clearTimeout(errorTimer.current)
      errorTimer.current = setTimeout(() => { setPhase('idle') }, 2_000)
    })
  }

  const items: MenuItem[] = apps.map(entry => ({
    id: entry.id,
    label: t(entry.labelKey),
    // The menu's itemIcon slot is 16×16 (see Menu.module.css); 18 overflowed
    // the row and clipped host PNGs that were extracted at 16/32 px.
    icon: <AppIcon id={entry.id} url={props.iconUrl(entry.id)} size={16} />,
  }))

  return (
    <Menu
      open={open}
      align="end"
      dense
      selection="fill"
      onClose={() => { setOpen(false) }}
      items={items}
      selectedId={current}
      onSelect={(id) => {
        setOpen(false)
        // A pick while a launch is in flight is ignored whole: persisting the
        // choice without launching would leave the button naming an app the
        // gesture never opened.
        if (inFlight.current) return
        props.choose(id)
        launch(id)
      }}
      anchor={(
        <div className={css.split}>
          <Tooltip label={phase === 'error' ? t('open.error') : t('open.tooltip')} side="bottom">
            <button
              type="button"
              className={css.main}
              data-state={phase}
              disabled={phase === 'busy'}
              aria-label={title}
              onClick={() => { launch(current) }}
            >
              <AppIcon id={current} url={props.iconUrl(current)} size={15} />
            </button>
          </Tooltip>
          <button
            type="button"
            className={css.chevron}
            aria-expanded={open}
            aria-haspopup="menu"
            title={t('menu.toggle')}
            aria-label={t('menu.toggle')}
            onClick={() => { setOpen(value => !value) }}
          >
            <IconChevronDownOutline14 size={11} />
          </button>
        </div>
      )}
    />
  )
}
