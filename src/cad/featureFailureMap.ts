export type KernelFailure = { id: string; type: string; msg: string }
export type TimelineFeatureRef = { id: string; type: string }

/** Map kernel-only Hole children back to their visible parent timeline chip. */
export function mapKernelFailuresToTimeline(failures: readonly KernelFailure[] | undefined, features: readonly TimelineFeatureRef[]) {
  const holeIds = features.filter((f) => f.type === 'hole').map((f) => f.id)
  const parentFor = (id: string) => holeIds.find((parent) => id.startsWith(parent + ':')) ?? id
  const errors: Record<string, string> = {}
  for (const failure of failures ?? []) {
    const parent = parentFor(failure.id)
    errors[parent] = errors[parent] ? `${errors[parent]}；${failure.msg}` : failure.msg
  }
  return { ids: Object.keys(errors), errors }
}
