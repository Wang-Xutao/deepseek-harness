/**
 * Auto-spinning two-ring mark shown while the help documentation iframe loads.
 */
import { useId } from 'react'
import { SORA_MONO_DATA_URL } from './assets/sora-mono.ts'
import css from './HelpFooterAction.module.css'

/** Side of the square user-unit canvas, matching the source raster's pixels. */
const CANVAS = 942

const LOWER_LEFT = { cx: 275.5, cy: 666.0 }
const UPPER_RIGHT = { cx: 665.5, cy: 276.0 }
const LOBE_RADIUS = 278

/** Render the splash-style BAF mark with continuous rotation (reduced-motion gated in CSS). */
export function HelpLoadingMark() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const clipId = (lobe: string) => `baf-help-mark-${uid}-${lobe}`

  return (
    <svg
      className={css.loadingMark}
      width={48}
      height={48}
      viewBox={`0 0 ${CANVAS} ${CANVAS}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={clipId('lower-left')}>
          <circle cx={LOWER_LEFT.cx} cy={LOWER_LEFT.cy} r={LOBE_RADIUS} />
        </clipPath>
        <clipPath id={clipId('upper-right')}>
          <circle cx={UPPER_RIGHT.cx} cy={UPPER_RIGHT.cy} r={LOBE_RADIUS} />
        </clipPath>
      </defs>
      <g className={css.spinCw} style={{ transformOrigin: `${LOWER_LEFT.cx}px ${LOWER_LEFT.cy}px` }}>
        <g clipPath={`url(#${clipId('lower-left')})`}>
          <image href={SORA_MONO_DATA_URL} x={0} y={0} width={CANVAS} height={CANVAS} />
        </g>
      </g>
      <g className={css.spinCcw} style={{ transformOrigin: `${UPPER_RIGHT.cx}px ${UPPER_RIGHT.cy}px` }}>
        <g clipPath={`url(#${clipId('upper-right')})`}>
          <image href={SORA_MONO_DATA_URL} x={0} y={0} width={CANVAS} height={CANVAS} />
        </g>
      </g>
    </svg>
  )
}
