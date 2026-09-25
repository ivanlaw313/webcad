// Live wiring of the AI Copilot aero_* tools (lazy-imported by store.aiTool so the Copilot bundle
// only pulls the Aero Lab code when one of these tools is actually called).
import type { AiConfig } from '../ai/providers'
import { PROVIDER_DEFAULTS } from '../ai/providers'
import { runAeroTool } from './aeroTools'
import { specFromBrief } from './brief'
import { templateOf } from './templates'
import { requestAeroSpec, openAeroLab, useAeroUi } from './aeroUiStore'
import { startAutoLoop, stopAutoLoop, currentLoop } from './autoLoopStore'

export function runAeroToolLive(name: string, args: Record<string, unknown>, ai: AiConfig | null): Promise<string | null> {
  const hasKey = !!ai && (!PROVIDER_DEFAULTS[ai.provider]?.needsKey || !!ai.apiKey)
  return runAeroTool(name, args, {
    specFromBrief: (brief) => specFromBrief(brief, hasKey ? ai : null),
    templateSpec: (kind) => templateOf(kind),
    currentSpec: () => useAeroUi.getState().labSpec ?? null,
    openLab: (spec, brief) => { if (spec) requestAeroSpec(spec, brief); else openAeroLab() },
    startLoop: (spec, cfg) => startAutoLoop(spec, cfg),
    getLoop: () => currentLoop(),
    stopLoop: () => stopAutoLoop(),
  })
}
