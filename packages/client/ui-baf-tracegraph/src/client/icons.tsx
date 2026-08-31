/**
 * Inline icon set for the 轨迹图 view and the 工作流 settings section. The
 * subset reused from `@deepseek-ai/dsh-client-ui-primitives` is re-exported
 * here so the view module imports one stable path (the icons live in
 * ui-primitives, but this module is the only client boundary that needs them).
 */
import {
  IconChevronRightOutline14, IconCloseOutline16, IconThinkOutline14,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { CSSProperties } from 'react'

/** Common props every outline icon accepts. */
export interface IconProps {
  size?: number | undefined
  className?: string | undefined
  style?: CSSProperties | undefined
}

const stroke = (props: IconProps): CSSProperties => {
  const { size = 16, style } = props
  return {
    width: size,
    height: size,
    display: 'inline-block',
    flex: 'none',
    ...(style ?? {}),
  }
}

/** Outline glyph: a single user silhouette. */
export function IconUserOutline14({ size = 14, className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      className={className}
      style={stroke({ size, style })}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="4.5" r="2.4" />
      <path d="M2.5 11.5c.7-2 2.4-3 4.5-3s3.8 1 4.5 3" />
    </svg>
  )
}

/** Outline glyph: a wrench + screwdriver crossed — the tool-call affordance. */
export function IconToolsOutline14({ size = 14, className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      className={className}
      style={stroke({ size, style })}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.4 2.2a2.6 2.6 0 0 0-3.5 3.5l-3.7 3.7a1 1 0 0 0 1.4 1.4l3.7-3.7a2.6 2.6 0 0 0 3.5-3.5l-1.6 1.6-1.4-1.4 1.6-1.6z" />
      <path d="M11.5 7.5l1.4 1.4a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0L9 10" />
    </svg>
  )
}

/**
 * Outline glyph: a microchip with two pins per side — the model-call
 * affordance for the 轨迹图 header and per-turn chips. Replaces a generic
 * brain glyph that read as 'thought' rather than 'inference'.
 */
export function IconCpuOutline14({ size = 14, className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      className={className}
      style={stroke({ size, style })}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.3" />
      <rect x="5.4" y="5.4" width="3.2" height="3.2" rx="0.4" />
      <path d="M5.4 1.8v1.7" />
      <path d="M8.6 1.8v1.7" />
      <path d="M5.4 10.5v1.7" />
      <path d="M8.6 10.5v1.7" />
      <path d="M1.8 5.4h1.7" />
      <path d="M1.8 8.6h1.7" />
      <path d="M10.5 5.4h1.7" />
      <path d="M10.5 8.6h1.7" />
    </svg>
  )
}

/**
 * Outline glyph: a stopwatch with a counter inside the dial — the
 * duration/total-time affordance. Replaces a refresh glyph that read as
 * 'reload' rather than 'elapsed time'.
 */
export function IconClockOutline14({ size = 14, className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      className={className}
      style={stroke({ size, style })}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="7.6" r="4.6" />
      <path d="M7 5.2v2.4l1.7 1" />
      <path d="M9.6 1.6h-2" />
      <path d="M8.6 1.6v1.7" />
      <path d="M3.4 2.6l1.1 1.1" />
      <path d="M10.6 2.6l-1.1 1.1" />
    </svg>
  )
}

/**
 * Outline glyph: a coin stack with a hash mark on the top coin — the
 * token/usage affordance. Replaces a thumb-up glyph that read as 'like'
 * rather than 'token count'.
 */
export function IconTokensOutline14({ size = 14, className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      className={className}
      style={stroke({ size, style })}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse cx="7" cy="3.4" rx="4.2" ry="1.4" />
      <path d="M2.8 3.4v2.6c0 .8 1.9 1.4 4.2 1.4s4.2-.6 4.2-1.4V3.4" />
      <path d="M2.8 6v2.6c0 .8 1.9 1.4 4.2 1.4s4.2-.6 4.2-1.4V6" />
      <path d="M2.8 8.6v2.4c0 .8 1.9 1.4 4.2 1.4s4.2-.6 4.2-1.4V8.6" />
      <path d="M6.3 3.4h1.4" />
      <path d="M6.3 6h1.4" />
      <path d="M6.3 8.6h1.4" />
    </svg>
  )
}

/** Outline glyph: a small node-link graph for the 轨迹图 tab. */
export function IconTraceGraphOutline16({ size = 16, className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={className}
      style={stroke({ size, style })}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="3.5" cy="3.5" r="1.6" />
      <circle cx="12.5" cy="12.5" r="1.6" />
      <circle cx="12.5" cy="6.5" r="1.6" />
      <circle cx="6" cy="11.5" r="1.4" />
      <path d="M4.8 4.5l6 6.4" />
      <path d="M4.8 4.5l6.5 1.5" />
      <path d="M7 10.2l4.5-3.7" />
    </svg>
  )
}

/** Outline glyph: three connected workflow nodes for the settings nav row. */
export function IconWorkflowOutline16({ size = 16, className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={className}
      style={stroke({ size, style })}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1.5" y="2.5" width="5" height="3" rx="1" />
      <rect x="9.5" y="2.5" width="5" height="3" rx="1" />
      <rect x="5.5" y="10.5" width="5" height="3" rx="1" />
      <path d="M4 5.5v1.4c0 .8.6 1.4 1.4 1.4h1.6" />
      <path d="M12 5.5v1.4c0 .8-.6 1.4-1.4 1.4H9" />
      <path d="M8 8.3V10" />
    </svg>
  )
}

/**
 * Outline glyph: an arrow turning back on itself — the affordance for
 * per-turn chip labels that point back at the parent session (return-from-
 * child, parent-run).
 */
export function IconReturnOutline14({ size = 14, className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      className={className}
      style={stroke({ size, style })}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7h7a2.5 2.5 0 0 1 0 5h-2" />
      <path d="M5 4.5L3 7l2 2.5" />
    </svg>
  )
}

export {
  IconChevronRightOutline14, IconCloseOutline16, IconThinkOutline14,
}
