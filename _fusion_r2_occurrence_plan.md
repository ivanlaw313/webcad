# R2 装配 occurrence/多体架构落地方案（只读调查产出，2026-07-11）

**核心策略 = 镜像不变量（mirror invariant）**：`components[]` 保留做「实例数组」，键名/读形状 100% 不变（233 读点零改）；新增共享 `componentDefs[]`；occurrence 的 `mesh`/`src` 变成 def 的**引用镜像**，由单一 `reconcileDefs()` 维持 → 改一个 def→reconcile→全实例跟新。

## 现状（线号已按当前 store.ts 核实，任务简报的旧号已漂移）
- Component 记录：`store.ts:1402` 内联对象类型 `{id,name,mesh:MeshData,pos,rot?(euler°),hidden?,color?,material?,groupId?,src?{features,sketchSources}}`。
- 渗透：`.components` 233 处 + `.mesh` 149 处（store.ts）；Viewport 11/SketchLayer 4/BrowserTree 4/JointsPanel 2/i18n 5。
- 渲染 `Viewport.tsx:3559`：`components.filter(!hidden).map(c=><KernelBody mesh={c.mesh} pos rot motion.../>)`，key=c.id。
- 世界变换 `compWorldMatrix store.ts:708`：`group·fk·T(pos)·[T(gc)R(euler)T(-gc)]·Rx(-90)`，gc=meshCenter3(c.mesh)。**pos+euler 非 4×4**。
- `componentCenter store.ts:9497`（旧号 8993 漂移）。
- 关节 `kinematics.ts:7`：parent/child = occurrence **id 字符串**，anchor/axis 世界系 → **已按 id 引用实例，不绑 mesh**。
- 序列化 `buildProjectPayload store.ts:17635`（mesh 内联）；`docSnap store.ts:2531`；4 loader（restoreAutosave 15353+openProject+版本史+分享链接）。
- duplicate/阵列/镜像（8309/8447/8460/8480/9128）：`{...src,id,pos}` 浅拷 → mesh&src 已按引用共享，但 `finishComponentEdit` 重建 JSON-clone 全新 mesh 写回单件→断链→**现无 edit-one-update-all**。
- **A1/A2 已落地**（`kinematics.ts:43 JointOrigin`+resolveJointOrigin；Joint.offset/originAngle/flip/rest；jointOrigins[] 入 docSnap 2537+payload 17639+restore 15373）。gap 表标「未做」过时——它们是当前信心最高的已交付装配特性，与 occurrence 正交。

## 数据模型（TS 伪码）
```ts
type BodyEntry = { id:string; name:string; mesh:MeshData; hidden?:boolean; color?:string }  // P3 才多条
type ComponentDef = {
  id:string;              // 'D1'…独立命名空间
  name:string;            // 共享定义名
  bodies:BodyEntry[];     // P1=[单体], P3=多体
  src?:{features:Feature[]; sketchSources};  // 从 component 上移到此
  origin?:{o,xd,n};       // P3 def-local
  mesh:MeshData;          // 派生缓存 P1=bodies[0].mesh
  rev:number;             // 编辑+1→实例据此重镜像
}
// component 记录 = occurrence（键名不变，加可选字段）：
//   id 不变（关节/mates 引用零改）; defId?:string; matrix?:number[](P2 4×4,present 盖过 pos/rot);
//   suppress?; opacity?; 保留 pos/rot/mesh/src(镜像)/_rev
componentDefs: ComponentDef[]   // 新状态
```
```ts
function reconcileDefs(s){  // P1 引入,所有 def 编辑后+载入后调一次
  const byId=new Map(s.componentDefs.map(d=>[d.id,d]))
  return { components: s.components.map(c=>{
    if(!c.defId) return c                        // 匿名单例:旧行为零改
    const d=byId.get(c.defId); if(!d) return c
    if(c._rev===d.rev && c.mesh===d.mesh) return c
    return {...c, mesh:d.mesh, src:d.src, _rev:d.rev}   // 重镜像→共享实例齐更新
  })}
}
```
- **edit-one-update-all**（P2）：finishComponentEdit 写 def(rev++)+reconcileDefs → 全 occurrence mesh 换新。
- **Copy（共享）**=新 occurrence 同 defId；**Paste-New/独立化**=cloneDef 深拷出新 defId。

## 旧档字节兼容
- 载入检测 `data.componentDefs`：有→载 defs+reconcile；无（旧档）→每件内联 mesh **合成匿名 def** `D_<compId>`（mesh/src 移入 def.bodies[0]/src, c.defId='D_'+id），幂等。
- 写出 version:3 起带 componentDefs；求稳可过渡一版保留 occurrence 内联 mesh 冗余。
- **docSnap 必须一并存 componentDefs**（否则撤销 def 编辑→镜像 stale）。

## Anchor 改动清单（14 处，~220/233 读点被镜像隔离）
1. `store.ts:1402` 类型+componentDefs 状态+ComponentDef/BodyEntry+occurrence defId/suppress/matrix?
2. `store.ts:2531` docSnap 加 componentDefs
3. `store.ts:17635` buildProjectPayload 序列化 componentDefs; version→3
4. `store.ts:15353` restoreAutosave +openProject+版本史+分享链接：反序列化/无则合成匿名 def（migrate 函数，4 loader）【中】
5. `store.ts:15413` newComponent + imports(15441+)：建 def+1 occurrence 而非内联 mesh【中】
6. `store.ts:8309` duplicateComponent：Copy=新 occurrence 同 defId（spread 去 mesh/src 交 reconcile）【行为变】
7. `store.ts:8447/8460/8480` 三阵列：副本共享 defId
8. `store.ts:9128` mirrorComponent：反射 mesh 建独立 def（几何不同不共享）
9. `store.ts:5950` finishComponentEdit：写回 def(rev++)+reconcileDefs →**edit-all 核心**【中】
10. `store.ts:5916` editComponent：读 c.src(镜像)不改,语义=编辑共享 def
11. `store.ts:708` compWorldMatrix/`9497` componentCenter：读镜像 P1 不改;P2 加 if(c.matrix)4×4 分支
12. `Viewport.tsx:3559` 渲染：读镜像 P1 不改;filter 加 !c.suppress;P2 传 matrix
13. `store.ts:9142` deleteComponent：删最后引用可选 GC def
14. `store.ts:8748/8802/8970` separateMesh/scaleXYZ/convertMesh：作用于 def（共享先独立化）逐 op 定语义【中】

## 分期
- **P1** 数据层+渲染+旧档迁移（隐形零回归地基；anchor 1-5,10-13）
- **P2 ★headline 可见价值**：edit-one-update-all + Copy/Paste-New + BrowserTree occurrence 归 def 下打「×N」徽章（anchor 6-9,14 + 11/12 matrix 分支）。**P1+P2=第一个可见交付**。
- **P3** 多体子容器 A5/A6（bodies[]+New Component from bodies+嵌套 Bodies/Origin/Sketches 树；UI+内核合并最重放最后）
- **P4** 关节引用 occurrence 收尾(本已 OK)+suppress 传播 FK/干涉+A11 external 另轨可豁免

## 风险
1. 镜像 stale：组件创建全走 helper,开发期断言 c.mesh===def.mesh。
2. undo 脱同步：docSnap 必含 componentDefs（anchor #2 必做）。
3. 几何变异单件语义（scale/separate/convert）：共享 def「改一个变全部」意外→默认作用全部+「独立化」逃生门,逐 op 定。
4. 4×4 后旋转 pivot 处理要改。
5. version:3 旧 build 读不到（单 app 可接受）。
6. 共享 MeshData 引用已存在;KernelBody 按 c.id key→无渲染冲突,是 InstancedMesh-per-def 性能优化伏笔。

**底线**：P1 匿名-def 迁移令旧档零改载入；镜像不变量令 233 读点不动；P2 只碰~9 锚点交付 headline。真落地、旧档不崩。
**A1/A2 结论**：已落地且与 occurrence 正交，无需重做。
