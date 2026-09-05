import type { ReactNode } from 'react'

function Svg({ size = 20, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"
      stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

const paths: Record<string, ReactNode> = {
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  save: <><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7" /><rect x="8" y="13" width="8" height="6" /></>,
  undo: <><path d="M9 7 4 12l5 5" /><path d="M4 12h10a5 5 0 0 1 0 10" /></>,
  redo: <><path d="m15 7 5 5-5 5" /><path d="M20 12H10a5 5 0 0 0 0 10" /></>,
  home: <><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /></>,

  component: <><path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" /></>,
  sketch: <><rect x="4" y="4" width="12" height="12" rx="1" /><path d="m8 16 11-11" /><path d="m17 3 4 0 0 4" /></>,
  extrude: <><rect x="5" y="13" width="8" height="6" /><path d="M9 13V4" /><path d="m6 7 3-3 3 3" /></>,
  revolve: <><path d="M12 3v18" /><path d="M8 6a6 5 0 1 0 0 12" /><path d="m8 6-2 1 2 1" /></>,
  sweep: <><path d="M4 19c5 0 4-11 10-11" /><rect x="13" y="5" width="6" height="6" rx="1" /></>,
  loft: <><ellipse cx="8" cy="7" rx="4" ry="2" /><ellipse cx="16" cy="17" rx="4" ry="2" /><path d="m5 8 8 9M11 6l8 10" /></>,
  hole: <><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="3" /></>,
  box: <><path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" /></>,
  cylinder: <><ellipse cx="12" cy="6" rx="6" ry="2.4" /><path d="M6 6v12c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4V6" /></>,
  sphere: <><circle cx="12" cy="12" r="8" /><ellipse cx="12" cy="12" rx="8" ry="3" /></>,
  pattern: <><rect x="4" y="4" width="5" height="5" /><rect x="15" y="4" width="5" height="5" /><rect x="4" y="15" width="5" height="5" /><rect x="15" y="15" width="5" height="5" /></>,
  mirror: <><path d="M12 3v18" /><path d="M9 7 4 12l5 5z" /><path d="m15 7 5 5-5 5z" /></>,
  thicken: <><rect x="4" y="6" width="16" height="12" rx="1" /><path d="M8 10h8" /></>,

  presspull: <><rect x="6" y="11" width="12" height="8" rx="1" /><path d="M12 11V4" /><path d="m9 7 3-3 3 3" /></>,
  fillet: <><path d="M5 20v-9a6 6 0 0 1 6-6h9" /></>,
  chamfer: <><path d="M5 20V9l5-5h10" /></>,
  shell: <><rect x="3.5" y="3.5" width="17" height="17" rx="1" /><rect x="8" y="8" width="8" height="8" /></>,
  draft: <><path d="M6 20 9 4h6l3 16z" /></>,
  scale: <><rect x="4" y="4" width="9" height="9" /><path d="m13 13 7 7M20 13v7h-7" /></>,
  combine: <><circle cx="9.5" cy="12" r="6" /><circle cx="14.5" cy="12" r="6" /></>,
  move: <><path d="M12 3v18M3 12h18" /><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" /></>,
  align: <><path d="M4 4v16" /><rect x="8" y="7" width="9" height="4" /><rect x="8" y="14" width="6" height="3" /></>,
  trash: <><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" /></>,
  material: <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 0 0 16" /></>,
  appearance: <><circle cx="12" cy="12" r="8" /><circle cx="9" cy="9" r="1.4" /><circle cx="15" cy="10" r="1.4" /><circle cx="11" cy="15" r="1.4" /></>,

  joint: <><circle cx="8" cy="12" r="3" /><circle cx="16" cy="12" r="3" /><path d="M11 12h2" /></>,
  jointorigin: <><circle cx="12" cy="12" r="2.2" /><path d="M12 3v5M12 16v5M3 12h5M16 12h5" /></>,
  rigid: <><rect x="5" y="9" width="6" height="6" /><rect x="13" y="9" width="6" height="6" /><path d="M11 12h2" /></>,

  plane: <><path d="m3 8 12-4 6 4-12 4z" /><path d="m3 8 0 4 12 4 6-4 0-4" opacity=".4" /></>,
  axis: <><path d="M5 19 19 5" /><circle cx="5" cy="19" r="1.6" /><circle cx="19" cy="5" r="1.6" /></>,
  point: <><circle cx="12" cy="12" r="2.4" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /></>,

  measure: <><path d="M4 16 16 4l4 4L8 20z" /><path d="m8 8 2 2M11 5l2 2M14 8l2 2" /></>,
  // 干涉：两件相叠 + 填色重叠区（撞料）— 唔再同 section 撞样
  interference: <><rect x="3" y="7" width="11" height="10" rx="1" /><rect x="10" y="7" width="11" height="10" rx="1" /><rect x="10" y="7" width="4" height="10" rx="0" fill="currentColor" stroke="none" opacity=".3" /></>,
  // 剖切：方块中线切开 + 下半剖面线
  section: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M4 12h16" /><path d="M6 16l2.5-2.5M10 16l2.5-2.5M14 16l2.5-2.5" opacity=".6" /></>,
  insert: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M12 8v8M8 12h8" /></>,
  select: <><path d="m5 3 7 17 2.5-7L22 10.5z" /></>,
  // Fusion viewport-navigation toolbar: compact monochrome counterparts for orbit/pan/zoom/fit/display/grid.
  orbit: <><path d="M5 12a7 7 0 0 1 12-4" /><path d="m17 4 .5 4-4 .4" /><path d="M19 12A7 7 0 0 1 7 16" /><path d="m7 20-.5-4 4-.4" /><circle cx="12" cy="12" r="2" /></>,
  pan: <><path d="M7 21V11a1.7 1.7 0 0 1 3.4 0v3" /><path d="M10.4 14V7.5a1.7 1.7 0 0 1 3.4 0V14" /><path d="M13.8 14V9.5a1.7 1.7 0 0 1 3.4 0v5" /><path d="M17.2 14v-2a1.7 1.7 0 0 1 3.4 0v4.5c0 2.5-2 4.5-4.5 4.5H11" /><path d="M7 14 5.4 12.4a1.7 1.7 0 0 0-2.4 2.4L7 19" /></>,
  zoom: <><circle cx="10" cy="10" r="5.8" /><path d="m14.5 14.5 5.2 5.2M10 7v6M7 10h6" /></>,
  fit: <><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /><rect x="8" y="8" width="8" height="8" rx="1" /></>,
  display: <><rect x="3" y="4" width="18" height="13" rx="1" /><path d="M8 21h8M12 17v4" /><path d="m16 8 3 3-3 3" /></>,
  grid: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" /></>,

  // —— 专属图标（消除「default 方框」+ loft/shell/pattern 一图多用）——
  gear: <><circle cx="12" cy="12" r="4.2" /><circle cx="12" cy="12" r="1.5" /><path d="M12 3.6v2.4M12 18v2.4M3.6 12h2.4M18 12h2.4M6 6l1.7 1.7M16.3 16.3 18 18M18 6l-1.7 1.7M6 18l1.7-1.7" /></>,
  rack: <><path d="M3 15h18v4H3z" /><path d="M6 15v-2.5h2V15M11 15v-2.5h2V15M16 15v-2.5h2V15" /></>,
  pulley: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /><path d="M4.5 9.5h15M4.5 14.5h15" opacity=".45" /></>,
  worm: <><rect x="3" y="8" width="18" height="8" rx="4" /><path d="M7 8.3 9.7 15.7M11 8.3l2.7 7.4M15 8.3l2.7 7.4" opacity=".7" /></>,
  crowngear: <><ellipse cx="12" cy="14" rx="8" ry="3.4" /><path d="M5 12.4v-2.2M8 11.2v-2.4M12 10.8v-2.6M16 11.2v-2.4M19 12.4v-2.2" /></>,
  coil: <><ellipse cx="12" cy="6" rx="5.5" ry="1.7" /><ellipse cx="12" cy="10" rx="5.5" ry="1.7" /><ellipse cx="12" cy="14" rx="5.5" ry="1.7" /><ellipse cx="12" cy="18" rx="5.5" ry="1.7" /></>,
  thread: <><rect x="9" y="3" width="6" height="18" rx="1" /><path d="M9 6.5h6M9 9.5h6M9 12.5h6M9 15.5h6M9 18.5h6" opacity=".6" /></>,
  rib: <><path d="M6 4v16M6 20h13" /><path d="M6 9 17 20" /></>,
  text: <><path d="M5 20 12 4l7 16" /><path d="M8 14h8" /></>,
  sheetmetal: <><path d="M3 15h9l5-6h4" /><path d="M3 18h9l5-6h4" opacity=".5" /></>,
  cylpatch: <><ellipse cx="12" cy="6" rx="6" ry="2.2" /><path d="M6 6v12c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V6" /><rect x="9" y="10" width="6" height="5" rx="1" opacity=".75" /></>,
  splitface: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M4 14 20 9" /></>,
  replaceface: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M8 11h7M13 8l3 3-3 3" /></>,
  delface: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  cpattern: <><circle cx="12" cy="12" r="1.9" /><circle cx="12" cy="4.6" r="1.6" /><circle cx="18.4" cy="15" r="1.6" /><circle cx="5.6" cy="15" r="1.6" /><path d="M12 12V6.2M12 12l5 2.9M12 12l-5 2.9" opacity=".4" /></>,
  pathpattern: <><path d="M4 16c4-9 12-9 16 0" opacity=".5" /><circle cx="5" cy="13.3" r="1.3" /><circle cx="10" cy="8.8" r="1.3" /><circle cx="14" cy="8.8" r="1.3" /><circle cx="19" cy="13.3" r="1.3" /></>,
  surf: <><path d="M3 14c5-6 13 6 18 0" /><path d="M3 14v3c5 6 13-6 18 0v-3" opacity=".4" /></>,
  offsetsurf: <><path d="M3 12c5-6 13 6 18 0" /><path d="M3 16c5-6 13 6 18 0" opacity=".5" /></>,
  editpoles: <><path d="M4 15c5-7 11 7 16 0" /><circle cx="4" cy="15" r="1.2" /><circle cx="12" cy="11.4" r="1.2" /><circle cx="20" cy="15" r="1.2" /></>,
  newbody: <><path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" opacity=".5" /><path d="M12 8v6M9 11h6" /></>,
  bodyboolean: <><circle cx="9.5" cy="12" r="6" /><circle cx="14.5" cy="12" r="6" /><path d="M12 7.2a6 6 0 0 0 0 9.6" opacity=".5" /></>,

  newdoc: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" opacity=".5" /><path d="M12 11v6M9 14h6" /></>,
  drawing: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M8 7h8M8 10.5h5" opacity=".55" /><rect x="12.5" y="13" width="4.5" height="4.5" /></>,

  // —— 第二批专属图标（消除 section/interference/default/insert 一图多用，用户报「重复/无意义方框」）——
  param: <><path d="M4 8h16M4 16h16" /><circle cx="8" cy="8" r="2.3" fill="currentColor" stroke="none" /><circle cx="16" cy="16" r="2.3" fill="currentColor" stroke="none" /></>,   // 参数 = 滑杆
  emboss: <><rect x="3" y="6" width="18" height="12" rx="1.5" /><path d="M9 15.5 12 8l3 7.5M10.2 13.2h3.6" /></>,   // 凸字：板上凸起「A」
  cpoint: <><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" /><path d="M12 4v3.5M12 16.5V20M4 12h3.5M16.5 12H20" /></>,   // 构造点（实心点+十字）
  cam: <><path d="M10 3h4v6l-2 3-2-3z" /><path d="M4 19c3.5 0 3.5-3 7-3s3.5 3 7 3" /></>,   // CNC 加工：铣刀 + 加工波纹面
  stress: <><path d="M3 4v16" /><path d="M3 9h13a5 5 0 0 1 0 8" /><path d="M16 16.5v4M14 18.5l2 2 2-2" /></>,   // 受力：悬臂弯 + 力箭头
  moldflow: <><rect x="4" y="9" width="16" height="10" rx="1" /><path d="M12 3v6m-2.3-2.3L12 9l2.3-2.3" /><path d="M8 14h8" opacity=".45" /></>,   // 模流：型腔 + 浇口注入 + 流线
  wind: <><circle cx="7.5" cy="12" r="3.4" /><path d="M12.5 8.2c3.5 0 4.5 1 7 1M12.5 12h7M12.5 15.8c3.5 0 4.5-1 7-1" opacity=".8" /></>,   // 风洞：零件（圆）+ 绕流流线
  importmesh: <><path d="M3 19 8 9l5 10z" /><path d="M13 19l4-8 3 8z" opacity=".55" /></>,   // 网格导入：三角网
  importdxf: <><path d="M4 6h8l4 5-4 5H4z" opacity=".95" /><path d="M20 3v6m-2-2 2 2 2-2" /></>,   // 2D DXF 轮廓 + 导入箭头
  importsvg: <><path d="M3 15c3-9 15 9 18 0" /><rect x="1.7" y="13.6" width="2.6" height="2.6" fill="currentColor" stroke="none" /><rect x="19.7" y="13.6" width="2.6" height="2.6" fill="currentColor" stroke="none" /><path d="M12 3v5m-1.8-1.8L12 8l1.8-1.8" /></>,   // 矢量曲线 + 节点 + 导入
  split: <><rect x="5" y="6" width="14" height="12" rx="1" /><path d="M12 3v18" /><path d="M8 12H5.5M18.5 12H16" opacity=".5" /></>,   // 分割：实体 + 切面
  exportfile: <><path d="M6 3h7l5 5v13H6z" /><path d="M13 3v5h5" opacity=".5" /><path d="M9 14h7m-3-3 3 3-3 3" /></>,   // 导出：文档 + 向外箭头（区别于导入）
  overhang: <><path d="M4 20h16" /><path d="M8 20V7l9 13" /><path d="M8 14a5 5 0 0 0 4.5 0" opacity=".5" /></>,   // 悬垂：斜面 + 角度弧
  wallcheck: <><path d="M6 4v16M16 4v16" /><path d="M6 12h10m-3-3 3 3-3 3" opacity=".85" /></>,   // 壁厚：两壁 + 量度箭头
  curvature: <><path d="M3 17c5-11 13 4 18-7" /><path d="M7 12l-1.6 3.4M12 10.5l-.6 3.6M16 11l1 3.4" opacity=".55" /></>,   // 曲率梳
  torus: <><ellipse cx="12" cy="12" rx="9" ry="5.2" /><ellipse cx="12" cy="12" rx="3.4" ry="1.7" /></>,   // 圆环
  calc: <><rect x="5" y="3" width="14" height="18" rx="1.6" /><rect x="7.5" y="5.5" width="9" height="3" /><path d="M9 13h0M12.5 13h0M16 13h0M9 17h0M12.5 17h0M16 17h0" strokeWidth="2.2" /></>,   // 工程计算器
  pipeicon: <><ellipse cx="7" cy="6" rx="3.2" ry="1.4" /><path d="M3.8 6v6c0 4 8 4 12 4" /><path d="M10 16h6M16 13l3 3-3 3" opacity=".8" /></>,   // 管道（弯管+出口）

  default: <><rect x="4.5" y="4.5" width="15" height="15" rx="2" /></>,
}

export function ToolIcon({ name, size = 20 }: { name: string; size?: number }) {
  return <Svg size={size}>{paths[name] ?? paths.default}</Svg>
}
