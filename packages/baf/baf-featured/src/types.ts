/** Public featured-plugins records shared with clients. */
import type { IncompatiblePlugin, ManagementError } from '@deepseek-ai/dsh-plugin-manager'
export type { IncompatiblePlugin, ManagementError } from '@deepseek-ai/dsh-plugin-manager'

/** One curated entry of `featured-plugins.json`. */
export interface FeaturedManifestPlugin {
  /** Stable card key, unique in the manifest. */
  readonly id: string
  /** Registry package name the entry installs. */
  readonly package: string
  /** Verified package range the entry installs and updates within. */
  readonly version: string
  readonly nameZh: string
  readonly nameEn: string
  readonly descriptionZh: string
  readonly descriptionEn: string
  readonly homepage: string
  /** Registry URL the installation asks first; absent, the profile's own plan. */
  readonly registryFirst?: string
  /** Whether auto-update is on for this entry until the person overrides it. */
  readonly autoUpdateDefault?: boolean
  /** Whether the entry's DSH peer ranges are known to trip the compatibility gate. */
  readonly peerExemptionExpected?: boolean
  /** Whether the exact pinned range was verified against the current runtime. */
  readonly verified?: boolean
}

/** The whole `featured-plugins.json` document. */
export interface FeaturedManifest {
  readonly schemaVersion: 1
  /** Monotone edit counter; bumped with every manifest change. */
  readonly revision: number
  readonly plugins: readonly FeaturedManifestPlugin[]
}

/** Whether a card is usable at all, and where it sits in its lifecycle. */
export type FeaturedPluginState = 'not-installed' | 'enabled' | 'disabled' | 'unavailable'

/** One manifest entry joined with profile state, for the settings section. */
export interface FeaturedPluginCard extends FeaturedManifestPlugin {
  readonly state: FeaturedPluginState
  /** Version installed in the profile, when the bundle's package is present. */
  readonly installedVersion?: string
  /** Newest registry version the last check saw, when it saw one. */
  readonly latestKnown?: string
  /** `latestKnown` differs from `installedVersion` while staying inside `version`. */
  readonly updateAvailable: boolean
  /** Effective auto-update choice: the person's override, else `autoUpdateDefault`. */
  readonly autoUpdate: boolean
  /** Whether the profile exposes the plugin manager this service drives. */
  readonly manageable: boolean
}

/** One featured operation's outcome, folded the way `ChangeResult` folds pnpm runs. */
export interface FeaturedResult {
  readonly ok: boolean
  /** The underlying change outcome, present when the operation reached the manager. */
  readonly application?: 'applied' | 'restart-required' | 'overridden' | 'failed' | 'cancelled'
  /** Manager refusal, when one happened; locale renders the code. */
  readonly error?: ManagementError
  /** Present when the compatibility gate refused: confirm to re-run with an exemption. */
  readonly needsRiskAck?: readonly IncompatiblePlugin[]
  /** Packages whose build scripts pnpm held, when that is what stopped the install. */
  readonly pendingBuilds?: readonly string[]
}

/** What `list` reports besides the cards. */
export interface FeaturedListResult {
  readonly plugins: readonly FeaturedPluginCard[]
  /** Manifest revision the cards came from, when one was readable. */
  readonly revision?: number
  /** Why the manifest could not be read or accepted, when it could not. */
  readonly manifestError?: string
}

/** One entry's outcome inside a bulk operation. */
export interface FeaturedBulkOutcome {
  readonly id: string
  readonly result: FeaturedResult
}

/** What a bulk operation reports: per-entry outcomes, in manifest order. */
export interface FeaturedBulkResult {
  readonly outcomes: readonly FeaturedBulkOutcome[]
}

/** What an install or update accepts from its caller. */
export interface FeaturedInstallOptions {
  /** Cancellation id forwarded to the plugin manager's install control. */
  readonly requestId?: string
  /** Pending build-script packages to approve before pnpm runs. */
  readonly approvedBuilds?: readonly string[]
  /**
   * Whether the caller accepted the compatibility-risk refusal: grants the
   * exemption the refusal described, then retries the install once.
   */
  readonly acceptRisk?: boolean
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * The featured set or one of its entries changed: an operation completed
     * or a version check updated what the cards say. Clients re-read `list`.
     * @mode emit
     */
    'featured-plugins/changed'(): void
  }
}
