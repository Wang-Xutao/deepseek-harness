/** Shared provider display order for the composer and command model pickers. */

/** Display rank per provider id; lower sorts first. */
function providerRank(id: string): number {
  // 【变更】2026-10-05 (多模型路由 auto 批): the baf-route pseudo group (the
  // Auto model) leads the picker — "let routing decide" is the entry point.
  if (id === 'baf-route') return 0
  if (id === 'deepseek-account') return 1
  if (id === 'deepseek-official') return 2
  return 3
}

/**
 * Put the Auto, account and official providers first (in that order),
 * preserving every other relative order.
 * @param groups - Provider groups in catalog order.
 * @returns a sorted copy; model order within each group is unchanged.
 */
export function orderModelProviders<T extends { readonly id: string }>(groups: readonly T[]): T[] {
  return groups.toSorted((left, right) => providerRank(left.id) - providerRank(right.id))
}
