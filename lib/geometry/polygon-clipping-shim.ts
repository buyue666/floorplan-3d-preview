/**
 * polygon-clipping v0.15 ships an ESM build whose only export is a default
 * object, while its bundled .d.ts only declares named exports. Going through
 * a namespace import keeps the types accurate and this shim keeps the runtime
 * working whether the bundler resolves the ESM or the CJS build.
 */
import * as polygonClippingModule from "polygon-clipping";

type PolygonClippingModule = typeof polygonClippingModule;

const resolved = ((polygonClippingModule as unknown as { default?: PolygonClippingModule }).default ??
  polygonClippingModule) as PolygonClippingModule;

export default resolved;
