// Aero Design Lab — three built-in design-space templates (propeller/fan, wing, streamlined shell).
// Units in specs: lengths mm, angles deg, speed m/s, rpm, mass kg (wing), volume L (shell).
import type { AeroKind, DesignSpec } from './designSpace'

export function propTemplate(): DesignSpec {
  return {
    kind: 'prop', title: '120mm 靜音風扇 / 螺旋槳', source: 'template',
    fixed: { diameter: 120, rpm: 2500, V: 0, fluid: 'air', hubRatio: 0.3, material: 1240 },
    vars: [
      { key: 'blades', min: 2, max: 9, int: true, value: 5 },
      { key: 'pitchRatio', min: 0.3, max: 1.4, value: 0.8 },
      { key: 'chord25', min: 0.12, max: 0.6, value: 0.35 },
      { key: 'chord60', min: 0.12, max: 0.6, value: 0.35 },
      { key: 'chord95', min: 0.08, max: 0.5, value: 0.25 },
      { key: 'twistOffset', min: -6, max: 6, value: 0 },
      { key: 'camber', min: 0, max: 7, value: 4 },
      { key: 'thickness', min: 6, max: 14, value: 9 },
    ],
    objectives: [{ key: 'eff', sense: 'max' }, { key: 'noise', sense: 'min' }],
    constraints: [{ key: 'thrust', op: '>=', value: 0.08 }, { key: 'stalled', op: '<=', value: 0.3 }],
  }
}

export function wingTemplate(): DesignSpec {
  return {
    kind: 'wing', title: '滑翔機翼 1.2 m 翼展', source: 'template',
    fixed: { span: 1200, V: 10, fluid: 'air', massKg: 0.6, planform: 'trapezoid' },
    vars: [
      { key: 'rootChord', min: 100, max: 300, value: 200 },
      { key: 'taper', min: 0.3, max: 1, value: 0.6 },
      { key: 'sweep', min: 0, max: 15, value: 2 },
      { key: 'dihedral', min: 0, max: 8, value: 3 },
      { key: 'twistTip', min: -5, max: 1, value: -2 },
      { key: 'camber', min: 0, max: 6, value: 2 },
      { key: 'camberPos', min: 25, max: 60, value: 40 },
      { key: 'thickness', min: 7, max: 15, value: 10 },
    ],
    objectives: [{ key: 'LD', sense: 'max' }, { key: 'mass', sense: 'min' }],
    constraints: [{ key: 'stallMargin', op: '>=', value: 0.15 }, { key: 'alpha', op: '<=', value: 10 }],
  }
}

export function shellTemplate(): DesignSpec {
  return {
    kind: 'shell', title: '水底推進器殼 — 最低水阻', source: 'template',
    fixed: { V: 2, fluid: 'water', wall: 2 },
    vars: [
      { key: 'length', min: 150, max: 700, value: 300 },
      { key: 'diameter', min: 70, max: 160, value: 110 },
      { key: 'xMax', min: 0.2, max: 0.6, value: 0.4 },
      { key: 'noseExp', min: 1.2, max: 3.5, value: 2 },
      { key: 'tailExp', min: 1, max: 3, value: 2 },
      { key: 'baseFrac', min: 0, max: 0.4, value: 0.2 },
    ],
    objectives: [{ key: 'drag', sense: 'min' }],
    constraints: [{ key: 'volumeL', op: '>=', value: 1.5 }],
  }
}

export function templateOf(kind: AeroKind): DesignSpec {
  return kind === 'prop' ? propTemplate() : kind === 'wing' ? wingTemplate() : shellTemplate()
}
