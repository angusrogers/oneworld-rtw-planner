/** Great-circle distance in statute miles (haversine). Approximates GDS TPM. */
export function haversineMiles(
  lat1: number, lon1: number, lat2: number, lon2: number,
): number {
  const R = 3958.7613; // mean Earth radius, statute miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}
