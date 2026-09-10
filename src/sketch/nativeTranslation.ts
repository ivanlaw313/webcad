export {prepareNativeTranslation,type NativeTranslation} from './nativeCoordinates'
import {solveSketch} from './solver'
import type {SketchPrimitive,SketchParam} from '@salusoft89/planegcs'
export const solveTranslatedSketch=(primitives:(SketchPrimitive|SketchParam)[],offset?:[number,number])=>solveSketch(primitives,{offset})
