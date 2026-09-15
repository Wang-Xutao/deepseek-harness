/**
 * Trailing BAF two-ring mark for the blank-session hero headline.
 *
 * Renders the very same raster the sidebar brand slot uses (`sora-mono.png`)
 * rather than redrawing it, so the two marks cannot drift apart: the hero mark
 * is the sidebar mark, one canvas scaled up.
 *
 * The hover spin is the only thing on top of that. The artwork is two tangent
 * rings, each one a disc whose ink never reaches past its own rim, so the mark
 * splits cleanly into two layers along the (imaginary) line between the ring
 * centres — a clip circle per lobe. Each lobe is then rotated about its own
 * centre. Rotation keeps every point at its original distance from the centre,
 * so no part of one ring can ever spin into the other's space, and since a ring
 * band is itself rotationally symmetric, what visibly turns is the weave
 * texture inside it.
 */
import { useId } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SORA_MONO_DATA_URL } from './assets/sora-mono.ts'
import css from './HeroTrailingMark.module.css'

export type HeroTrailingMarkProps = PropsRuntime<'conversation.hero.brand.trailing'>

/** Side of the square user-unit canvas, matching the source raster's pixels. */
const CANVAS = 942

/**
 * The two ring centres in source-raster pixels, measured off the artwork.
 *
 * They sit on the anti-diagonal at 70.6%/29.3% and 29.3%/70.6% of the canvas,
 * 551.5px apart — exactly the sum of the two outer radii, so the rings meet at
 * a single point and the pair fills the square corner to corner.
 */
const LOWER_LEFT = { cx: 275.5, cy: 666.0 }
const UPPER_RIGHT = { cx: 665.5, cy: 276.0 }

/**
 * Clip radius of each lobe, in source-raster pixels.
 *
 * The measured outer radius is 276.7 and the artwork carries no ink outside it,
 * so a circle a hair above that takes the whole band of one ring and nothing
 * belonging to the other.
 */
const LOBE_RADIUS = 278

/**
 * Render the BAF two-ring mark after the hero headline.
 * @param props - brand-mark owner props from the conversation shell.
 */
export function HeroTrailingMark({ size, className }: HeroTrailingMarkProps) {
  const edge = size > 0 ? size : 28
  // `useId` yields characters that are awkward inside an SVG fragment
  // reference, so keep only the alphanumerics.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const clipId = (lobe: string) => `baf-mark-${uid}-${lobe}`

  return (
    <svg
      className={className ? `${css.mark} ${className}` : css.mark}
      width={edge}
      height={edge}
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
      {/* Lower-left lobe first, upper-right over it: the clipped disc rotates
          with its own clip window, so the lobe turns as one rigid piece. */}
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
