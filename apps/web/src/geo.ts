import type { Airport } from '@rtw/shared';

/** Great-circle arc as [lon,lat] points, longitudes unwrapped so the line
 *  renders correctly across the antimeridian. */
export function greatCircleArc(a: Airport, b: Airport, steps = 64): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(a.lat), λ1 = toRad(a.lon);
  const φ2 = toRad(b.lat), λ2 = toRad(b.lon);
  const Δ = Math.acos(
    Math.min(1, Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1)),
  );
  const pts: [number, number][] = [];
  if (Δ < 1e-9) return [[a.lon, a.lat], [b.lon, b.lat]];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * Δ) / Math.sin(Δ);
    const B = Math.sin(f * Δ) / Math.sin(Δ);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    pts.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.hypot(x, y)))]);
  }
  // Unwrap longitudes for antimeridian-crossing arcs.
  for (let i = 1; i < pts.length; i++) {
    let lon = pts[i][0];
    while (lon - pts[i - 1][0] > 180) lon -= 360;
    while (lon - pts[i - 1][0] < -180) lon += 360;
    pts[i][0] = lon;
  }
  return pts;
}
