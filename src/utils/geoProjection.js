/**
 * Utilidades de Proyección Geoespacial para el Desdibujado Progresivo de Rutas.
 * Opera en coordenadas WGS84 [longitud, latitud] (formato Mapbox/GeoJSON).
 */

/**
 * Proyecta un punto sobre un segmento de línea definido por dos vértices.
 * Retorna el punto proyectado y el factor de interpolación (t ∈ [0,1]).
 *
 * @param {number[]} point - [lng, lat] del punto a proyectar
 * @param {number[]} segStart - [lng, lat] del inicio del segmento
 * @param {number[]} segEnd - [lng, lat] del final del segmento
 * @returns {{ projected: number[], t: number }}
 */
const projectOnSegment = (point, segStart, segEnd) => {
  const dx = segEnd[0] - segStart[0];
  const dy = segEnd[1] - segStart[1];
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return { projected: [...segStart], t: 0 };
  }

  // Factor de interpolación clampeado al rango [0, 1]
  let t = ((point[0] - segStart[0]) * dx + (point[1] - segStart[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return {
    projected: [segStart[0] + t * dx, segStart[1] + t * dy],
    t,
  };
};

/**
 * Calcula la distancia euclidiana al cuadrado entre dos coordenadas.
 * Se usa la versión al cuadrado para evitar la raíz cuadrada innecesaria en comparaciones.
 *
 * @param {number[]} a - [lng, lat]
 * @param {number[]} b - [lng, lat]
 * @returns {number}
 */
const distanceSq = (a, b) => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
};

/**
 * Encuentra la proyección perpendicular más cercana de un punto sobre una polilínea.
 *
 * @param {number[]} point - [lng, lat] posición actual del chofer
 * @param {number[][]} lineCoords - Array de coordenadas [lng, lat] de la polilínea
 * @returns {{ index: number, projected: number[], distance: number }}
 *   - index: Índice del segmento donde se encontró la proyección más cercana
 *   - projected: Coordenada [lng, lat] del punto proyectado sobre la línea
 *   - distance: Distancia euclidiana entre el punto original y la proyección
 */
export const projectPointOnLineString = (point, lineCoords) => {
  if (!lineCoords || lineCoords.length < 2) {
    return { index: 0, projected: point, distance: Infinity };
  }

  let bestIndex = 0;
  let bestProjected = lineCoords[0];
  let bestDistSq = distanceSq(point, lineCoords[0]);

  for (let i = 0; i < lineCoords.length - 1; i++) {
    const { projected } = projectOnSegment(point, lineCoords[i], lineCoords[i + 1]);
    const dSq = distanceSq(point, projected);

    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestProjected = projected;
      bestIndex = i;
    }
  }

  return {
    index: bestIndex,
    projected: bestProjected,
    distance: Math.sqrt(bestDistSq),
  };
};

/**
 * Divide una polilínea en dos segmentos: la porción ya recorrida y la pendiente.
 *
 * @param {number[][]} lineCoords - Coordenadas completas de la ruta [lng, lat]
 * @param {number} index - Índice del segmento donde se proyectó el punto
 * @param {number[]} projected - Coordenada del punto proyectado [lng, lat]
 * @returns {{ traveled: number[][], remaining: number[][] }}
 *   - traveled: Coordenadas de la porción ya recorrida (incluye el punto proyectado)
 *   - remaining: Coordenadas de la porción pendiente (inicia en el punto proyectado)
 */
export const splitLineAtProjection = (lineCoords, index, projected) => {
  if (!lineCoords || lineCoords.length < 2) {
    return { traveled: [], remaining: lineCoords || [] };
  }

  // La porción recorrida: desde el inicio hasta el vértice del segmento + el punto proyectado
  const traveled = [...lineCoords.slice(0, index + 1), projected];

  // La porción pendiente: desde el punto proyectado hasta el final de la ruta
  const remaining = [projected, ...lineCoords.slice(index + 1)];

  return { traveled, remaining };
};
