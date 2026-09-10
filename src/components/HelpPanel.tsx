import { useState, useRef, useEffect } from 'react'
import { useApp } from '../store'

// GM-W6 E：帮助小标题旁嘅「指给我看」掣 —— 撳咗即喺真工具栏用弹跳箭头指出该命令（复用 teachCommand）。
function ShowMe({ q }: { q: string }) {
  const teach = useApp((s) => s.teachCommand)
  const toggle = useApp((s) => s.toggleHelp)
  return (
    <button onClick={(e) => { e.stopPropagation(); const hit = teach(q); if (hit) toggle() }}
      title="喺工具栏指出呢个掣畀你睇"
      style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#fff', background: '#ff9500', border: 'none', borderRadius: 9, padding: '1px 8px', cursor: 'pointer', verticalAlign: 'middle' }}>
      👉 指给我看
    </button>
  )
}

// In-app quick help: workflows, shortcuts, and the full feature list — for first-time use.
export default function HelpPanel() {
  const open = useApp((s) => s.helpOpen)
  const toggle = useApp((s) => s.toggleHelp)
  const openIntro = useApp((s) => s.openIntro)
  const [query, setQuery] = useState('')   // GM-W6 E：搜索过滤
  const gridRef = useRef<HTMLDivElement>(null)
  // GM-W6 E：按子串过滤 —— 逐个 <h4> 连住其后嘅段落做一组，唔匹配就收埋（DOM 层面做，唔改内容结构）。
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const q = query.trim().toLowerCase()
    grid.querySelectorAll('section').forEach((secEl) => {
      const sec = secEl as HTMLElement
      let anyVisible = false
      let group: HTMLElement[] = []
      const flush = () => {
        if (!group.length) return
        const text = group.map((e) => e.textContent || '').join(' ').toLowerCase()
        const match = !q || text.includes(q)
        group.forEach((e) => { e.style.display = match ? '' : 'none' })
        if (match) anyVisible = true
        group = []
      }
      Array.from(sec.children).forEach((child) => {
        const el = child as HTMLElement
        if (el.tagName === 'H4') { flush(); group = [el] } else group.push(el)
      })
      flush()
      sec.style.display = anyVisible ? '' : 'none'
    })
  }, [query, open])
  if (!open) return null
  return (
    <div className="drawing-overlay" onClick={toggle}>
      <div className="help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dw-head">❓ 使用帮助 / 快捷键<span className="dw-x" onClick={toggle}>✕</span></div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔍 搜索帮助（打「圆角」「拉伸」「导出」… 只显示相关段落）"
          style={{ width: '100%', boxSizing: 'border-box', margin: '10px 0 4px', padding: '7px 10px', fontSize: 13, border: '1px solid #cfd8e0', borderRadius: 6 }} />
        <button className="cs-btn" onClick={() => { useApp.getState().setDebugMode(true); toggle() }}>开启诊断录制</button>
        <div className="help-grid" ref={gridRef}>
          <section>
            <h4>⓪ 最快上手：载入模板改一改</h4>
            <p>顶栏「<b>示例</b>」下拉（<b>17 种</b>）：底板 / 外壳盒 / 法兰盘 / L 角铁 / 六角螺母 / 阶梯轴 / 垫圈 / 螺栓法兰 / 渐开线齿轮 / 钣金支架 / <b>齿轮组</b> / 螺栓 / <b>内齿圈</b> / <b>滚珠轴承</b> / <b>齿轮齿条</b> / <b>行星齿轮组</b> →「<b>载入</b>」→ 再用 <b>ƒx 参数</b> 改尺寸，整模型自动联动。新手最适合先玩这个。<br />冇头绪？空白画布上有 <b>✏️画草图 / 📦长方体 / ⚙️齿轮组示例 / 🔍搜索命令</b> 一键掣。或<b>按 <kbd>/</kbd> 搜索任何命令</b>。</p>
            <h4>⓪ b 直接放原始形状</h4>
            <p>CREATE 有现成原语免画草图：<b>长方体 / 圆柱 / 球 / 圆环 / 圆管(衬套) / 棱柱(六角等) / 螺旋弹簧 / 螺纹杆 / 渐开线齿轮 / 齿条 / V带轮</b> — 设参数即出实体。</p>
            <p><b>Esc 安全取消</b>：一次只取消最上层选单／命令／当前绘制，或清除选择；不会自动完成或退出草图。请用「完成草图」离开。长按 Esc 不会连续取消。浏览器可能用 Esc 退出全屏，模型会保留。</p>
            <h4>① 画一个零件（Fusion 流程）<ShowMe q="sketch" /></h4>
            <p>「创建草图」→ <b>先在 3D 里揀一个基准面</b>：点高亮的 <b style={{ color: '#d6694e' }}>红 XY</b>（水平）/ <b style={{ color: '#4e9e5e' }}>绿 XZ</b>（前）/ <b style={{ color: '#4e7fd6' }}>蓝 YZ</b>（右），<b>或直接点实体的任一平面</b>当基准（datum）→ 选工具（矩形/中心矩形/圆/三点圆/多边形/槽/圆弧槽/圆角矩形/椭圆/样条/圆弧…）画 → 设「高度」→「完成草图」→ ribbon「拉伸」。<br />一个草图可画<b>多个轮廓</b>：里面的圈自动变成孔。<kbd>Esc</kbd> 取消选面。</p>
            <h4>① b 基准面小技巧</h4>
            <p>选竖直面（前 XZ / 右 YZ）可做 L 形件、加强筋、侧壁。<br />点实体面建草图时：加料叠<b>凸台</b>；选「切割」可<b>打通孔</b>或勾「按深度挖」做<b>盲槽/凹台</b>。<br />进草图后还可用草图栏「<b>面</b>」下拉中途换面、「<b>偏移</b>」平移基准面。也可直接点左侧树「<b>原点</b>」下的 XY/XZ/YZ 面建草图。</p>
            <h4>① c 画草图帮手（似 Fusion）</h4>
            <p><b>打数字 = 精确尺寸</b>：画时直接打数（矩形 宽 <kbd>Tab</kbd> 高 <kbd>Enter</kbd>；圆 半径 <kbd>Enter</kbd>）。<br /><b>吸附</b>：游标自动吸到已有点（橙圈）；画折线时方向自动锁 <b>水平/竖直/45°</b>。<br /><b>尺寸标签</b>：画好的轮廓上会显蓝色尺寸（宽/高/Ø），<b>点标签即可改尺寸</b>。<br />闭合轮廓会<b>淡蓝填充</b>（提示可拉伸的区域，里面的圈自动镂空）。画完直接点草图栏蓝色「<b>⬆ 拉伸</b>」按钮出实体。</p>
            <h4>① d 约束 / 尺寸 / ƒx（草图内建，似 Fusion 完全定义）</h4>
            <p>主草图直接有齐（旧「约束草图」已并入）：<kbd>D</kbd> <b>尺寸工具</b>（边长 / Ø / R / 角度 / 点点距离 / 点边垂距 / 位置尺寸，蓝标签点击改值）+ <b>约束面板</b>（重合 / 水平 / 竖直 / 平行 / 垂直 / 相等 / 相切 / 同心 / 共线 / 中点 / 对称 / 固定）→ <b>完全定义=黑、欠定义=蓝</b>，可直接<b>拖几何</b>实时求解。<br /><b>ƒx 参数尺寸</b>：点尺寸标签打「<b>参数名</b>」即绑定（标签变 ƒx名=值）— 之后改参数 / 切设计表配置，草图重解 + 全树重建。打数字即解绑。<br /><b>修改</b>：∪合并轮廓 / ∖剪走轮廓（两个重叠闭合轮廓布尔，真圆弧保持）· 圆角 / 倒角 / 偏移 / 镜像 / 阵列 / 移动旋转复制 · ┄构造线。<br /><b>重开编辑</b>：双击时间轴特征（或浏览器树「草图」节）→ 轮廓+约束+尺寸完整还原 → 改完全树重建。</p>
            <h4>② 改尺寸（参数化）+ 时间轴回放<ShowMe q="params" /></h4>
            <p>底部时间轴点任一特征 → <b>模型回放到该步</b>并可改参数 → 自动重建。<br />时间轴左侧 <b>⏮ ◂ ▷ ▸ ⏭</b> 可<b>回退/逐步/播放</b>整个建模过程（回放历史，编辑任意特征即回到最新）。<br /><b>ƒx 参数</b>：定义命名变量（可写表达式 d1*2），把特征尺寸绑定到它，改一处全联动。<br />表达式支持 <code>+ − * / ^ %</code>、括号、常量 <code>pi / e / tau</code>、函数 <code>sqrt abs round floor ceil sin cos tan asin acos atan ln exp log min max pow hypot mod sign</code>（三角函数用<b>度</b>）。例：<code>d1*pi</code>、<code>sqrt(d1^2+d2^2)</code>、<code>max(d1,10)</code>。</p>
            <h4>③ 修改 / 高级造型<ShowMe q="fillet" /></h4>
            <p>圆角/倒角（可选顶/底/竖直/全部棱，尺寸无法生成时提示失败并保留原模型）· 抽壳（先抽壳后倒角）· 拔模 · 缩放 · 合并/切割 · 分割实体 · 移动/复制（含绕 X/Y/Z 转）· 镜像 · 阵列。<br /><b>孔</b>：通孔 / 沉头 / 埋头（顶栏选孔型）。<br /><b>多截面放样</b>：在 XY/XZ/YZ 或任意参考面画轮廓→「＋放样截面」→选择下一个截面平面继续画→按加入次序「放样」。<br /><b>沿路径扫掠</b>：用折线/样条画开放路径→「沿路径扫掠」出圆管。</p>
          </section>
          <section>
            <h4>④ 装配 + 传动 + 机构</h4>
            <p>「新建组件」固化实体 → <b>在树里点组件，或直接喺 3D 场景点零件即选中</b> → 底部面板改 <b>X/Y/Z 位置</b>和<b>绕 X/Y/Z 旋转</b>（同时显示该组件<b>单件 体积/质量/尺寸</b>，按其材质算）。树行 <b>🎯</b>、移动栏「🎯聚焦」或<b>双击零件</b>可镜头放大该件；点空白处取消选中。选中组件后移动栏仲有 <b>📏间隙</b>（量到最近邻件 clearance）同 <b>📥STL</b>（单独导出该零件、自然朝向，方便净打印一件；右键菜单亦有）。<br />右下「<b>关节</b>」面板连接（旋转/滑动/球/平面…）+「<b>运动连接</b>」设齿比 → 撳 <b>▷运动</b> 自动转。组件可配色/孤立/爆炸；「干涉检查」查碰撞，无碰撞时报<b>最近两件间隙</b>（clearance，顶点采样近似）。<br /><b>传动模板自动识郁</b>：载入「齿轮组」「齿轮齿条」即自动接好关节+运动连接，撳 ▷运动 睇啮合。<br /><b>机构</b>（ASSEMBLE）：「<b>四连杆</b>」「<b>滑块曲柄(活塞)</b>」闭环约束求解 — 拖曲柄角滑杆驱动，杆长刚性保持。</p>
            <h4>⑤ 检查 / 出图 / 导入导出<ShowMe q="exportstl" /></h4>
            <p>「测量」点两点显距离 + ΔX/ΔY/ΔZ；<b>「📐量边」</b>点棱显长度、点圆孔棱显<b>直径Ø/半径</b>；<b>「▦量面」</b>显<b>面积</b>与类型；<b>「∠量角」</b>点两面显<b>夹角</b>；右下属性显尺寸/体积/表面积/质心/<b>质量</b>（选密度），撳「<b>⊕ 重心</b>」喺 3D 显质心十字标记（装配为体积加权）。「剖切」裁剪看内部。<br /><b>装配出图</b>：撳「<b>📋 导出BOM</b>」出材料清单 CSV（各零件 数量/体积/质量/合计）。「工程图」生成<b>三视图 + 立体图</b>（带尺寸/标题栏）→ 导出 SVG。<br /><b>导入</b> STL/STEP；<b>导出</b> STL/STEP/装配STL/<b>单件STL</b>(选中组件→📥)/glTF(含色)/草图<b>DXF</b>/钣金<b>展开DXF</b>(激光下料)。保存/打开（自动保存防丢失）。</p>
            <h4>⑥ 工程估算 / 仿真（解析·示意，非 3D 有限元）</h4>
            <p>选中组件（或单一实体）→ 底栏「<b>🔩受力估算</b>」：设 <b>力 N / 支撑(悬臂·简支) / 扭矩 / 截面(矩形·圆)</b> → 一次过得 <b>弯曲应力 σ · 挠度 δ · 安全系数 · 压杆屈曲临界载荷 · 扭转剪应力+扭转角 · 一阶固有频率(避共振) · 许用载荷 · 刚度 L/δ · 截面模量 Z · 热膨胀</b>，撳「<b>📄报告</b>」导出完整 .txt。适合 beam-like 件（支架/臂/轴），blobby 件会提示误差。<br /><b>弹簧</b>模板报 刚度 k + Wahl + 最大安全载荷；<b>螺丝</b>插入报推荐拧紧扭矩；质量栏报<b>打印时间/料费/水密性/床身适配</b>。</p>
            <p>测量栏「<b>🧮 工程计算 ▾</b>」下拉一撳即算（机械设计速查）：<b>过盈配合压装力 · 皮带长度 · 钻铣转速 RPM · O 形圈密封槽 · 功率·扭矩·转速 · 约束热应力 · 螺纹规格速查 · ISO 公差配合（H7/g6… 孔轴偏差+间隙） · 螺栓夹紧力（扭矩→预紧力+应力） · 齿轮啮合参数（分度/齿顶/齿根圆·中心距·传动比） · 压缩弹簧刚度（k·Wahl·剪应力） · 轴承寿命 L10（ISO 281） · 钣金折弯展开（K 因子 BA/BD）</b>。下拉已按 紧固/传动/加工 分组。</p>
            <h4>⑦ 平滑曲面 + maker 模板</h4>
            <p>用「<b>样条</b>」画轮廓 → 拉伸/旋转/扫掠/管道 = <b>真平滑 B 样条曲面</b>（花瓶/弯管/导流件）。模板下拉分类（基础/机械传动/紧固/maker电子/曲面管件）：键槽轴·平键·弹簧·散热片·2020铝型材·L角铁·分度盘·蜂窝板·花瓶·弯管；齿轮组/行星/齿轮齿条/轴承/分度盘<b>可输入参数</b>（任意传动比/尺寸/孔数）。装配多件可「<b>堆叠/排版到床/全落地/镜像</b>」一键摆位。</p>
            <h4>⚖ 开源声明（关于）</h4>
            <p style={{ fontSize: 11, lineHeight: 1.5 }}>
              几何内核：<b>Open CASCADE Technology (OCCT) 7.6.2</b> — © Open Cascade SAS，授权 <b>LGPL-2.1</b>（附 OCCT 例外条款）。OCCT 以<b>独立 .wasm 文件</b>动态加载（非静态链入本应用），符合 LGPL 替换要求；经 <a href="https://github.com/donalffons/opencascade.js" target="_blank" rel="noreferrer">opencascade.js</a>（MIT）同 <a href="https://github.com/sgenoud/replicad" target="_blank" rel="noreferrer">replicad</a>（MIT）封装。
              草图求解器 <a href="https://github.com/Salusoft89/planegcs" target="_blank" rel="noreferrer">planegcs</a>（FreeCAD GCS 移植，LGPL-2.1+）。其余主要依赖：three.js（MIT）、React（MIT）、manifold-3d（Apache-2.0）。
              许可证文本同来源链接见 <a href="/THIRD_PARTY_LICENSES.txt" target="_blank" rel="noreferrer">THIRD_PARTY_LICENSES.txt</a>。OCCT 源码：<a href="https://github.com/Open-Cascade-SAS/OCCT" target="_blank" rel="noreferrer">github.com/Open-Cascade-SAS/OCCT</a>。
            </p>
            <h4>⌨ 快捷键</h4>
            <ul className="help-keys">
              <li><kbd>S</kbd> 草图　<kbd>E</kbd> 拉伸　<kbd>F</kbd> 圆角　<kbd>C</kbd> 倒角（实体）/ 圆（草图）</li>
              <li><kbd>M</kbd> 移动　<kbd>D</kbd> 工程图　<kbd>P</kbd> 参数</li>
              <li>选中组件后 <kbd>←</kbd><kbd>→</kbd> 移 X、<kbd>↑</kbd><kbd>↓</kbd> 移 Z（按住 <kbd>Shift</kbd> 每步 10mm）</li>
              <li>草图中（对齐 Fusion）：<kbd>L</kbd> 直线　<kbd>R</kbd> 矩形　<kbd>C</kbd> 圆　<kbd>A</kbd> 圆弧</li>
              <li><kbd>Ctrl</kbd>+<kbd>Z</kbd>/<kbd>Y</kbd> 撤销/重做　<kbd>Ctrl</kbd>+<kbd>S</kbd> 保存　<kbd>Ctrl</kbd>+<kbd>O</kbd> 打开　<kbd>Esc</kbd> 退出　<kbd>Del</kbd> 删特征/组件　<kbd>Ctrl</kbd>+<kbd>D</kbd> 复制组件　<kbd>F1</kbd> 本帮助</li>
              <li><kbd>/</kbd> <b>搜索命令</b>（打字搵任何工具/模板，例如 齿轮/倒角/导出）· 顶栏 🔍 同样</li>
              <li>视图：滚轮<b>向光标</b>缩放 · 左键旋转 · 中/右键平移 · <b>右键弹菜单</b>（常用命令）</li>
            </ul>
          </section>
        </div>
        <div className="dw-foot"><button className="cs-btn" onClick={openIntro}>▶ 重睇快速开始</button><button className="cs-btn" onClick={toggle}>知道了</button></div>
      </div>
    </div>
  )
}
