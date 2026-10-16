import type { ReactNode } from 'react'

function Svg({ size = 20, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"
      stroke="currentColor" strokeWidth={1.55} strokeLinecap="round" strokeLinejoin="round">
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
  extrude: <><path d="M5 14h9v6H5z" /><path d="M9.5 14V5" /><path d="m6.5 8 3-3 3 3" /><path d="M14 14l4-2.2V17.8L14 20" opacity=".45" /></>,   // Phase1: profile + vertical pull (vs presspull face push)
  revolve: <><path d="M11 3.5v17" /><path d="M11 6.5c5.2 0 8.5 2.2 8.5 5.5S16.2 17.5 11 17.5" /><path d="m18.2 10.2 1.8 1.8-2.4.6" /><path d="M7.5 8.5v7" opacity=".4" /></>,   // Phase1: axis + revolution arc + profile
  sweep: <><path d="M3.5 18.5c3.5.2 5-6.5 8.5-9.5 2.2-1.9 4.3-2.6 7-2.6" /><rect x="14.2" y="4.2" width="5.6" height="5.6" rx="1" /><path d="M14.2 7h5.6M17 4.2v5.6" opacity=".35" /></>,   // Phase1: section + curved path
  loft: <><ellipse cx="7.5" cy="6.5" rx="4.2" ry="2.1" /><path d="M12 11.5h7.5v5H12z" /><path d="m4.2 8 8.5 8.2M10.5 5.2l8.2 11" opacity=".75" /></>,   // Phase1: dissimilar sections + blend rails
  hole: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" opacity=".35" /><path d="M12 4v2.2M12 17.8V20M4 12h2.2M17.8 12H20" opacity=".35" /></>,   // Phase1: counterbore top view
  box: <><path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" /></>,
  cylinder: <><ellipse cx="12" cy="5.8" rx="6.2" ry="2.5" /><path d="M5.8 5.8v11.6c0 1.4 2.8 2.5 6.2 2.5s6.2-1.1 6.2-2.5V5.8" /><ellipse cx="12" cy="17.4" rx="6.2" ry="2.5" opacity=".35" /></>,   // Phase1: isometric cylinder
  sphere: <><circle cx="12" cy="12" r="8" /><ellipse cx="12" cy="12" rx="8" ry="3" /></>,
  cone: <><path d="M12 3.2 5.2 17.2" /><path d="M12 3.2l6.8 14" /><ellipse cx="12" cy="17.6" rx="6.8" ry="2.5" /><path d="M8.2 10.5h7.6" opacity=".35" /></>,   // Phase1: isometric cone
  pattern: <><rect x="3.5" y="3.5" width="6" height="6" rx=".8" /><rect x="14.5" y="3.5" width="6" height="6" rx=".8" /><rect x="3.5" y="14.5" width="6" height="6" rx=".8" /><rect x="14.5" y="14.5" width="6" height="6" rx=".8" /><path d="M9.5 6.5h5M6.5 9.5v5" opacity=".35" /></>,   // Phase1: 2×2 rect grid
  mirror: <><path d="M12 3v18" strokeDasharray="2.2 2" /><path d="M4.5 8.5 9 12l-4.5 3.5z" /><path d="M19.5 8.5 15 12l4.5 3.5z" opacity=".85" /><path d="M9 12h6" opacity=".35" /></>,   // Phase1: dashed plane + reflection
  thicken: <><path d="M4 8.5h16" /><path d="M4 15.5h16" /><path d="M4 8.5c0 0 2.5 2.2 8 2.2s8-2.2 8-2.2" opacity=".45" /><path d="M12 8.5v7" /><path d="m9.5 11 2.5-2.5L14.5 11M9.5 13l2.5 2.5L14.5 13" opacity=".8" /></>,   // Phase1: surface + parallel offset thickness
  presspull: <><path d="M5 9.5h14v8.5H5z" /><path d="M5 9.5l3-4h8l3 4" /><path d="M12 5.5V2.8" /><path d="m9.8 4.3 2.2-2.2 2.2 2.2" /><path d="M12 18V21" /><path d="m9.8 19.5 2.2 2.2 2.2-2.2" /></>,   // Phase1: face + bidirectional normal arrows
  fillet: <><path d="M4.5 19.5V10a6.5 6.5 0 0 1 6.5-6.5H20" /><path d="M4.5 19.5H20V3.5" opacity=".22" /><path d="M11 10.5h3.5M11 10.5v3.5" opacity=".4" /></>,   // Phase1: sharp→radius blend
  chamfer: <><path d="M4.5 19.5V9.5L10 4h10" /><path d="M4.5 19.5H20V4" opacity=".22" /><path d="M7.2 9.5h4.2M10 6.5v4.2" opacity=".4" /></>,   // Phase1: sharp→flat cut (distinct from fillet)
  shell: <><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="1.4" /><rect x="7.6" y="7.6" width="8.8" height="8.8" rx=".8" /><path d="M7.6 7.6 3.8 3.8M16.4 7.6l3.8-3.8M7.6 16.4l-3.8 3.8M16.4 16.4l3.8 3.8" opacity=".35" /></>,   // Phase1: hollow inner shell
  draft: <><path d="M6 20 9 4h6l3 16z" /></>,
  scale: <><rect x="4" y="4" width="9" height="9" /><path d="m13 13 7 7M20 13v7h-7" /></>,
  combine: <><circle cx="9" cy="12" r="6.2" /><circle cx="15" cy="12" r="6.2" /><path d="M12 7.2a6.2 6.2 0 0 0 0 9.6" opacity=".4" /></>,   // Phase1: boolean lenses
  move: <><path d="M12 3.2v17.6M3.2 12h17.6" /><path d="m9.2 6.2 2.8-2.8 2.8 2.8M9.2 17.8l2.8 2.8 2.8-2.8M6.2 9.2l-2.8 2.8 2.8 2.8M17.8 9.2l2.8 2.8-2.8 2.8" /></>,   // Phase1: tri-axis gizmo
  align: <><path d="M4 4v16" /><rect x="8" y="7" width="9" height="4" /><rect x="8" y="14" width="6" height="3" /></>,
  trash: <><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" /></>,
  material: <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 0 0 16" /></>,
  appearance: <><circle cx="12" cy="12" r="8" /><circle cx="9" cy="9" r="1.4" /><circle cx="15" cy="10" r="1.4" /><circle cx="11" cy="15" r="1.4" /></>,

  // FISHING39 Assemble: redraw so joint/rigid/motionlink are NOT chain-link lookalikes; split contact enable vs create
  joint: <><path d="M8.5 4.5v15" strokeWidth="2.2" /><circle cx="8.5" cy="12" r="2.2" fill="currentColor" stroke="none" opacity=".35" /><path d="M8.5 12h9.5" /><path d="M18 9.5v5" /><path d="M14.2 6.8a5.2 5.2 0 0 1 0 10.4" opacity=".85" /><path d="m16.6 5.6 1.6 2.2-2.6.4" /></>,   // revolute pin + arm + rotation arc (not chain)
  jointorigin: <><circle cx="12" cy="12" r="2.2" /><path d="M12 3v5M12 16v5M3 12h5M16 12h5" /><path d="M9.2 9.2l1.6 1.6M13.2 13.2l1.6 1.6M13.2 10.8l1.6-1.6M9.2 14.8l1.6-1.6" opacity=".35" /></>,   // named frame cross
  rigid: <><rect x="3.5" y="9" width="17" height="9.5" rx="1.2" /><path d="M9.5 9V7.2a2.5 2.5 0 0 1 5 0V9" /><rect x="9.2" y="9" width="5.6" height="5.2" rx=".7" /><circle cx="12" cy="11.6" r=".7" fill="currentColor" stroke="none" /></>,   // fused block + padlock (lock, not chain)
  ground: <><path d="M6 8.5h12v7.5H6z" /><path d="M4 16h16" /><path d="M6 18.5h2.2M10.4 18.5h2.2M14.8 18.5h2.2" /><path d="M12 5.2v3.3M10.2 7l1.8 1.5L14 7" opacity=".85" /></>,   // fixed / grounded component
  asbuilt: <><rect x="3.5" y="7.5" width="7" height="9" rx=".8" /><rect x="13.5" y="7.5" width="7" height="9" rx=".8" /><path d="M10.5 12h3" /><circle cx="12" cy="12" r="1.3" /><path d="M5.5 5.5h5M15.5 5.5h3" opacity=".4" /></>,   // joint in current pose (no move)
  motionlink: <><circle cx="8" cy="12" r="3.4" /><circle cx="8" cy="12" r="1.15" /><path d="M8 7.2v1.1M8 15.7v1.1M3.2 12h1.1M11.7 12h1.1M4.6 8.6l.8.8M10.6 14.6l.8.8M10.6 9.4l.8-.8M4.6 15.4l.8-.8" /><circle cx="16.4" cy="12" r="2.5" /><circle cx="16.4" cy="12" r=".85" /><path d="M16.4 8.3v.85M16.4 14.85v.85M12.9 12h.85M19.05 12h.85" /><path d="M11.6 10.2h2.2l-.7 1.3 1.1 1.3H12" opacity=".7" /></>,   // toothed gears + ratio (not plain loops)
  contact: <><rect x="3.2" y="7" width="7.6" height="10" rx=".8" /><rect x="13.2" y="7" width="7.6" height="10" rx=".8" /><path d="M10.8 9.5v5" /><path d="M16.2 3.6v2.8" /><path d="M14.1 5.6a2.6 2.6 0 1 0 4.2 0" /></>,   // enable contact: bodies + power toggle (not plus)
  contactnew: <><rect x="3.2" y="7.5" width="7.6" height="10" rx=".8" /><rect x="13.2" y="7.5" width="7.6" height="10" rx=".8" /><path d="M10.8 10v5" /><circle cx="18.2" cy="6.2" r="3.3" /><path d="M18.2 4.6v3.2M16.6 6.2h3.2" /></>,   // new contact set: bodies + plus badge
  motionstudy: <><rect x="4" y="5" width="16" height="11" rx="1.2" /><path d="M8 9.5l5 2.5L8 14.5z" fill="currentColor" stroke="none" opacity=".55" /><path d="M6 19h2M11 19h2M16 19h2" /></>,   // study / play
  drive: <><path d="M5 12h10" /><circle cx="17.5" cy="12" r="2.3" /><path d="M8 8.5v7M5 12l2.2-2.2M5 12l2.2 2.2" /><path d="M12 8.5v7" opacity=".45" /></>,   // drive / slider

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
  cpattern: <><circle cx="12" cy="12" r="2" /><circle cx="12" cy="4.4" r="1.7" /><circle cx="18.6" cy="15.2" r="1.7" /><circle cx="5.4" cy="15.2" r="1.7" /><path d="M12 10V6.2M13.7 13.1l3.2 1.9M10.3 13.1 7.1 15" opacity=".45" /><path d="M12 4.4a7.6 7.6 0 0 1 6.6 10.8" opacity=".3" /></>,   // Phase1: circular instances around center
  pathpattern: <><path d="M3.5 16.5c4.2-9.5 12.8-9.5 17 0" opacity=".45" /><rect x="3.2" y="11.2" width="3.4" height="3.4" rx=".5" /><rect x="9.3" y="6.8" width="3.4" height="3.4" rx=".5" /><rect x="14.3" y="6.8" width="3.4" height="3.4" rx=".5" /><rect x="17.4" y="11.2" width="3.4" height="3.4" rx=".5" /></>,   // Phase1: instances along path
  surf: <><path d="M3 14c5-6 13 6 18 0" /><path d="M3 14v3c5 6 13-6 18 0v-3" opacity=".4" /></>,
  offsetsurf: <><path d="M3 12c5-6 13 6 18 0" /><path d="M3 16c5-6 13 6 18 0" opacity=".5" /></>,
  editpoles: <><path d="M4 15c5-7 11 7 16 0" /><circle cx="4" cy="15" r="1.2" /><circle cx="12" cy="11.4" r="1.2" /><circle cx="20" cy="15" r="1.2" /></>,
  newbody: <><path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" opacity=".5" /><path d="M12 8v6M9 11h6" /></>,
  bodyboolean: <><circle cx="9.5" cy="12" r="6" /><circle cx="14.5" cy="12" r="6" /><path d="M12 7.2a6 6 0 0 0 0 9.6" opacity=".5" /></>,

  newdoc: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" opacity=".5" /><path d="M12 11v6M9 14h6" /></>,
  drawing: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M8 7h8M8 10.5h5" opacity=".55" /><rect x="12.5" y="13" width="4.5" height="4.5" /></>,

  // —— 第二批专属图标（消除 section/interference/default/insert 一图多用，用户报「重复/无意义方框」）——
  param: <><path d="M4 8h16M4 16h16" /><circle cx="8" cy="8" r="2.3" fill="currentColor" stroke="none" /><circle cx="16" cy="16" r="2.3" fill="currentColor" stroke="none" /></>,   // 参数 = 滑杆
  emboss: <><rect x="3.2" y="5.5" width="17.6" height="13" rx="1.4" /><path d="M8.5 15.8 12 8.2l3.5 7.6M9.6 13.4h4.8" /><path d="M5.2 7.2h2.2M16.6 7.2h2.2" opacity=".4" /></>,   // Phase1: raised stamp letter on face
  cpoint: <><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" /><path d="M12 4v3.5M12 16.5V20M4 12h3.5M16.5 12H20" /></>,   // 构造点（实心点+十字）
  cam: <><path d="M10 3h4v6l-2 3-2-3z" /><path d="M4 19c3.5 0 3.5-3 7-3s3.5 3 7 3" /></>,   // CNC 加工：铣刀 + 加工波纹面
  stress: <><path d="M3 4v16" /><path d="M3 9h13a5 5 0 0 1 0 8" /><path d="M16 16.5v4M14 18.5l2 2 2-2" /></>,   // 受力：悬臂弯 + 力箭头
  topopt: <><path d="M4 19h16" /><path d="M5 19 12 5l7 14" /><path d="M8.2 13.5h7.6" /></>,   // 生成式：桁架三角
  thermal: <><path d="M9 3.5h6" /><path d="M10 3.5v10.2a3.2 3.2 0 1 0 4 0V3.5" /><circle cx="12" cy="16.2" r="1.2" fill="currentColor" stroke="none" /></>,   // 热分析：温度计
  moldflow: <><rect x="4" y="9" width="16" height="10" rx="1" /><path d="M12 3v6m-2.3-2.3L12 9l2.3-2.3" /><path d="M8 14h8" opacity=".45" /></>,   // 模流：型腔 + 浇口注入 + 流线
  wind: <><circle cx="7.5" cy="12" r="3.4" /><path d="M12.5 8.2c3.5 0 4.5 1 7 1M12.5 12h7M12.5 15.8c3.5 0 4.5-1 7-1" opacity=".8" /></>,   // 风洞：零件（圆）+ 绕流流线
  importmesh: <><path d="M3 19 8 9l5 10z" /><path d="M13 19l4-8 3 8z" opacity=".55" /></>,   // 网格导入：三角网
  importdxf: <><path d="M4 6h8l4 5-4 5H4z" opacity=".95" /><path d="M20 3v6m-2-2 2 2 2-2" /></>,   // 2D DXF 轮廓 + 导入箭头
  importsvg: <><path d="M3 15c3-9 15 9 18 0" /><rect x="1.7" y="13.6" width="2.6" height="2.6" fill="currentColor" stroke="none" /><rect x="19.7" y="13.6" width="2.6" height="2.6" fill="currentColor" stroke="none" /><path d="M12 3v5m-1.8-1.8L12 8l1.8-1.8" /></>,   // 矢量曲线 + 节点 + 导入
  split: <><path d="M5 6.5h14v11H5z" /><path d="M12 3.2v17.6" /><path d="M8.5 3.8 12 6.5l3.5-2.7" /><path d="M5 12h2.8M16.2 12H19" opacity=".45" /></>,   // Phase1: body cleaved by plane tool
  exportfile: <><path d="M6 3h7l5 5v13H6z" /><path d="M13 3v5h5" opacity=".5" /><path d="M9 14h7m-3-3 3 3-3 3" /></>,   // 导出：文档 + 向外箭头（区别于导入）
  overhang: <><path d="M4 20h16" /><path d="M8 20V7l9 13" /><path d="M8 14a5 5 0 0 0 4.5 0" opacity=".5" /></>,   // 悬垂：斜面 + 角度弧
  wallcheck: <><path d="M6 4v16M16 4v16" /><path d="M6 12h10m-3-3 3 3-3 3" opacity=".85" /></>,   // 壁厚：两壁 + 量度箭头
  curvature: <><path d="M3 17c5-11 13 4 18-7" /><path d="M7 12l-1.6 3.4M12 10.5l-.6 3.6M16 11l1 3.4" opacity=".55" /></>,   // 曲率梳
  torus: <><ellipse cx="12" cy="12" rx="9" ry="5.2" /><ellipse cx="12" cy="12" rx="3.4" ry="1.7" /></>,   // 圆环
  calc: <><rect x="5" y="3" width="14" height="18" rx="1.6" /><rect x="7.5" y="5.5" width="9" height="3" /><path d="M9 13h0M12.5 13h0M16 13h0M9 17h0M12.5 17h0M16 17h0" strokeWidth="2.2" /></>,   // 工程计算器
  pipeicon: <><ellipse cx="7" cy="6" rx="3.2" ry="1.4" /><path d="M3.8 6v6c0 4 8 4 12 4" /><path d="M10 16h6M16 13l3 3-3 3" opacity=".8" /></>,   // 管道（弯管+出口）

  // —— Phase1 sketch 2D icons (menus / marking menu; ribbon glyphs stay primary) ——
  line: <><path d="M5 18.5 19 5.5" /><circle cx="5" cy="18.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="19" cy="5.5" r="1.2" fill="currentColor" stroke="none" /></>,   // 直線：兩端點 + 段
  rect: <><rect x="4.5" y="6" width="15" height="12" rx="1" /><path d="M4.5 6h15M4.5 18h15" opacity=".25" /></>,   // 兩點矩形
  circle: <><circle cx="12" cy="12" r="7.2" /><path d="M12 12h7.2" /><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" /></>,   // 圓心+半徑
  arc: <><path d="M5.5 16.5a8 8 0 0 1 13-1.2" /><circle cx="5.5" cy="16.5" r="1.15" fill="currentColor" stroke="none" /><circle cx="18.5" cy="15.3" r="1.15" fill="currentColor" stroke="none" /><circle cx="12.2" cy="8.2" r="1" fill="currentColor" stroke="none" opacity=".55" /></>,   // 三點弧
  offset: <><path d="M5 8.5h11v9H5z" /><path d="M9 4.5h11v9" /><path d="M9 4.5v4M20 4.5v4M20 13.5h-4" opacity=".55" /></>,   // 平行偏移（formloop + sketch offset）

  ai: <><path d="M12 3.2 13.4 8.6 18.8 10 13.4 11.4 12 16.8 10.6 11.4 5.2 10 10.6 8.6z" /><path d="M17.5 14.5 18.2 16.8 20.5 17.5 18.2 18.2 17.5 20.5 16.8 18.2 14.5 17.5 16.8 16.8z" /></>,
  default: <><rect x="4.5" y="4.5" width="15" height="15" rx="2" /></>,
}

export function ToolIcon({ name, size = 20 }: { name: string; size?: number }) {
  // FISHING35: guard module/record .default — never read .default of undefined (icon map / interop).
  const node = (paths && (paths[name] ?? paths.default)) || null
  return <Svg size={size}>{node}</Svg>
}

/** Stable icon keys for ribbon resolve checks (Phase1). */
export const ICON_PATH_KEYS: readonly string[] = Object.freeze(Object.keys(paths))

export function hasToolIcon(name: string): boolean {
  return !!(paths && Object.prototype.hasOwnProperty.call(paths, name))
}
