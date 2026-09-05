// HDRI 环境预设列表 — 对标 Fusion「Render 环境库」。
//
// 来源 / License：呢 10 个 preset 名同 drei `<Environment preset=...>` / `useEnvironment({ preset })`
// 完全对齐，drei 内部由 pmndrs 嘅 drei-assets CDN（raw.githack.com/pmndrs/drei-assets/.../hdri/）
// 加载，全部系 Poly Haven 出品嘅 **CC0**（公共领域，可商用、无署名要求）HDRI，1k 分辨率。
// CC0 完全符合 webcad「MIT/Apache/LGPL，无 GPL/AGPL」license 铁律。
//
// 自定 HDRI：用 HdriEnvironment 嘅 `url` prop 喂任何 .hdr 文件（自托管或第三方 CDN）—
// 只要你确认嗰个文件嘅 license 同样合规（建议继续用 Poly Haven CC0，或自家拍摄）。
//
// 注意：呢度只係「名 + 显示标签 + 大概光照特征」嘅元数据，唔含任何受版权 HDR 二进制，
// 所以呢个文件本身无 license 负担。实际 .hdr 由 drei CDN 运行时拉取（见 HdriEnvironment 接线说明）。

import type { PresetsType } from '@react-three/drei/helpers/environment-assets'

export type HdriPresetId = PresetsType  // = 'apartment'|'city'|'dawn'|'forest'|'lobby'|'night'|'park'|'studio'|'sunset'|'warehouse'

export interface HdriPreset {
  id: HdriPresetId
  /** 显示用中文标签（render 面板下拉用） */
  label: string
  /** 一句光照特征描述（tooltip 用） */
  hint: string
}

// drei 官方支持嘅全部 10 个 CC0 preset（次序按由「中性影棚」到「室外/特殊」排）。
export const HDRI_PRESETS: readonly HdriPreset[] = [
  { id: 'studio',    label: '影棚 Studio',       hint: '柔和均匀，中性白 — 产品/工业件展示首选' },
  { id: 'apartment', label: '室内 Apartment',    hint: '暖调室内漫射光，柔反射' },
  { id: 'lobby',     label: '大堂 Lobby',        hint: '室内大空间，多向柔光 + 暖木色' },
  { id: 'warehouse', label: '仓库 Warehouse',    hint: '空旷工业室内，冷顶光' },
  { id: 'city',      label: '城市 City',         hint: '都市广场，中性偏冷，多反射细节' },
  { id: 'park',      label: '公园 Park',         hint: '室外绿地天光，自然柔和' },
  { id: 'forest',    label: '森林 Forest',       hint: '林间斜光，绿色环境反射' },
  { id: 'dawn',      label: '黎明 Dawn',         hint: '低角度暖橙日出光，长阴影' },
  { id: 'sunset',    label: '日落 Sunset',       hint: '威尼斯日落，强暖调 + 高对比' },
  { id: 'night',     label: '夜晚 Night',        hint: '低照度夜空，需调高曝光' },
] as const

export const DEFAULT_HDRI_PRESET: HdriPresetId = 'studio'

export function isHdriPreset(v: unknown): v is HdriPresetId {
  return typeof v === 'string' && HDRI_PRESETS.some((p) => p.id === v)
}
