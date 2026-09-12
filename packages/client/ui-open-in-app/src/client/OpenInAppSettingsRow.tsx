/**
 * General-settings row: per-app visibility for the open-in-app dropdown.
 * The list of installed apps is owned by `OpenInAppController`; the row
 * shows the union of the host catalog and any locally remembered name so
 * the user can pre-hide apps the host has not reported yet.
 */

import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { NS, type OpenInAppKey } from './locales.ts'
import css from './OpenInAppSettingsRow.module.css'

/** Known catalog ids; the user can toggle each in settings, and the host
 * still decides which are actually installed. */
const KNOWN_IDS: readonly string[] = [
  'explorer', 'filemanager', 'finder',
  'cursor', 'vscode', 'vscodeinsiders', 'windsurf', 'zed',
  'sublimetext', 'xcode', 'androidstudio',
  'intellij', 'pycharm', 'webstorm', 'phpstorm', 'goland', 'rider', 'rustrover',
  'fork', 'sourcetree', 'github', 'tower', 'gitkraken', 'smartgit', 'sublimemerge',
  'ghostty', 'warp', 'iterm', 'kitty',
  'terminal', 'windowsterminal', 'gitbash', 'cmd', 'powershell',
  'gnometerminal', 'konsole',
]

const APP_LABEL_KEY: Record<string, OpenInAppKey | undefined> = {
  explorer: 'app.explorer',
  filemanager: 'app.filemanager',
  finder: 'app.finder',
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

/** Browser operations and state injected into the Settings-row slot. */
export interface OpenInAppSettingsRowInjected {
  hooks: {
    /** Hidden app ids from `OpenInAppController.disabled`. */
    disabled: ObservableSnapshot<readonly string[]>
    /** Installed app ids, or null while the host has not answered. */
    installed: ObservableSnapshot<readonly string[] | null>
  }
  /** Persist the enabled/disabled state for one app id. */
  setEnabled: (appId: string, enabled: boolean) => void
}

/** Full props for the General-settings open-in-app row. */
export type OpenInAppSettingsRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<typeof NS>
  & InjectFace<OpenInAppSettingsRowInjected>

/**
 * Render the per-app visibility grid inside General settings.
 * @param props - composed slot + inject props.
 * @returns the preference row with a checkbox per catalog id.
 */
export function OpenInAppSettingsRow({ useDisabled, useInstalled, setEnabled, t }: OpenInAppSettingsRowProps): React.JSX.Element {
  const disabled = useDisabled(value => value)
  const installed = useInstalled(value => value)
  const installedSet = new Set(installed ?? [])
  const disabledSet = new Set(disabled)
  return (
    <div className={css.row} data-testid="open-in-app-row">
      <div className={css.rowText}>
        <div className={css.title}>{t('settings.title')}</div>
        <div className={css.desc}>{t('settings.description')}</div>
      </div>
      <div className={css.grid} role="group" aria-label={t('settings.title')}>
        {KNOWN_IDS.map((id) => {
          const labelKey = APP_LABEL_KEY[id]
          if (labelKey === undefined) return null
          const isInstalled = installedSet.has(id) || installed === null
          const isEnabled = !disabledSet.has(id)
          return (
            <label
              key={id}
              className={css.item}
              data-state={isEnabled ? 'on' : 'off'}
              data-installed={isInstalled ? 'yes' : 'no'}
            >
              <input
                type="checkbox"
                className={css.checkbox}
                checked={isEnabled}
                onChange={(event) => { setEnabled(id, event.target.checked) }}
                disabled={!isInstalled && installed !== null}
              />
              <span className={css.itemLabel}>{t(labelKey)}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
