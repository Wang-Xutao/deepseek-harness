// @vitest-environment jsdom
/**
 * The shipped BAF preset reaches the same read-only guide as the other built-in
 * presets, and every language the package ships carries that guide's copy.
 */

import { describe, expect, it } from 'vitest'
import { presetGuide } from '../src/client/PresetGuideDialog.tsx'
import {
  guideDe, guideEn, guideEs, guideFr, guideJa, guidePt, guideRu, guideZh,
} from '../src/client/guide-locales.ts'

/** Every dictionary the guide file ships, keyed by language. */
const dictionaries: Readonly<Record<string, Record<string, string>>> = {
  en: guideEn, zh: guideZh, ja: guideJa, es: guideEs, fr: guideFr, de: guideDe, ru: guideRu, pt: guidePt,
}

/** The locale keys one preset guide is made of. */
const BAF_GUIDE_KEYS = ['guideBafIntro', 'guideBafExplanation', 'guideBafUsage'] as const

describe('the shipped BAF guide', () => {
  it('resolves the shipped preset id to a guide', () => {
    expect(presetGuide('baf', 'system')).toEqual({
      name: 'presetBafName',
      intro: 'guideBafIntro',
      explanation: 'guideBafExplanation',
      usage: 'guideBafUsage',
    })
  })

  it('withholds the guide from a preset the customer owns', () => {
    expect(presetGuide('baf', 'user')).toBeUndefined()
  })

  it.each(Object.keys(dictionaries))('carries its copy in %s', (language) => {
    const dictionary = dictionaries[language]!
    for (const key of BAF_GUIDE_KEYS) {
      expect(dictionary[key], `${language}.${key}`).toBeTypeOf('string')
      expect(dictionary[key]!.trim(), `${language}.${key}`).not.toBe('')
    }
  })

  it('gives every language the same key set as English', () => {
    const english = Object.keys(dictionaries.en!).sort()
    for (const [language, dictionary] of Object.entries(dictionaries)) {
      expect(Object.keys(dictionary).sort(), language).toEqual(english)
    }
  })
})
