/**
 * BAF core Cordis service: shared types, baseline loader, and adapter stubs.
 *
 * Agent Note:
 * - .agents/notes/implemented/feature/2026-09-06-baf-core-phase2.md
 *
 * @module @deepseek-ai/dsh-baf-core
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createUnavailableAdapters, type BafAdapters } from './adapters.ts'
import { loadBaselineFile, parseBaselineManifest, type BaselineManifest } from './baseline.ts'
import { BAF_VERSION } from './compatibility.ts'
import { BafError } from './errors.ts'

export * from './adapters.ts'
export * from './baseline.ts'
export * from './compatibility.ts'
export * from './errors.ts'
export * from './events.ts'
export * from './identity.ts'
export * from './intake.ts'
export * from './result.ts'
export * from './route-policy.ts'
export * from './workflow.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** BAF core domain service (entry-local realm under bafDomain isolate). */
    bafCore: BafCore
  }
}

/** Composition config for {@link BafCore}. */
export interface Config {
  /**
   * Running BAF version used for baseline compatibility checks.
   * Defaults to the package version.
   */
  bafVersion: string
}

/**
 * Doctor/status snapshot for slash/CLI/desktop read surfaces.
 */
export interface BafDoctorReport {
  readonly bafVersion: string
  readonly adapters: {
    readonly openspec: 'unavailable' | 'ready'
    readonly stack: 'unavailable' | 'ready'
    readonly guard: 'unavailable' | 'ready'
    readonly workflow: 'unavailable' | 'ready'
  }
  readonly baselineLoaded: boolean
  readonly baselineId?: string
}

/**
 * Owns BAF shared vocabulary, baseline loading, and adapter registration.
 * Does not execute OpenSpec/C tools or drive the go state machine.
 */
export class BafCore extends Service {
  static Config: z<Config> = z.object({
    bafVersion: z.string().default(BAF_VERSION),
  })

  readonly bafVersion: string
  readonly adapters: BafAdapters
  private baseline: BaselineManifest | undefined

  constructor(ctx: Context, config: Config) {
    super(ctx, 'bafCore')
    this.bafVersion = config.bafVersion
    this.adapters = createUnavailableAdapters()
  }

  /**
   * Package / configured BAF version string.
   * @returns version used for compatibility checks.
   */
  version(): string {
    return this.bafVersion
  }

  /**
   * One-line help pointer for slash/CLI.
   * @returns help summary.
   */
  help(): string {
    return 'BAF core: baseline loader, adapter contracts, and RouteStatusView types. Use baf-workflow for resolveRoute.'
  }

  /**
   * Readiness snapshot for doctor/status commands.
   * @returns adapter and baseline state.
   */
  doctor(): BafDoctorReport {
    return {
      bafVersion: this.bafVersion,
      adapters: {
        openspec: 'unavailable',
        stack: 'unavailable',
        guard: 'unavailable',
        workflow: 'unavailable',
      },
      baselineLoaded: this.baseline !== undefined,
      ...this.baseline === undefined ? {} : { baselineId: this.baseline.baselineId },
    }
  }

  /**
   * Last successfully loaded baseline, if any.
   * @returns baseline or undefined.
   */
  currentBaseline(): BaselineManifest | undefined {
    return this.baseline
  }

  /**
   * Parse and install a baseline from already-loaded YAML/JSON data.
   * @param raw - parsed document.
   * @param path - optional path for error details.
   * @returns validated manifest (also retained on the service).
   */
  loadBaselineData(raw: unknown, path?: string): BaselineManifest {
    const manifest = parseBaselineManifest(raw, this.bafVersion, path)
    this.baseline = manifest
    return manifest
  }

  /**
   * Load a baseline YAML file and retain it on the service.
   * @param path - filesystem path.
   * @returns validated manifest.
   */
  async loadBaseline(path: string): Promise<BaselineManifest> {
    const manifest = await loadBaselineFile(path, this.bafVersion)
    this.baseline = manifest
    return manifest
  }

  /**
   * Status alias for doctor (Phase 8 command surface).
   * @returns the same report as {@link doctor}.
   */
  status(): BafDoctorReport {
    return this.doctor()
  }
}

export { BafError }
export default BafCore
