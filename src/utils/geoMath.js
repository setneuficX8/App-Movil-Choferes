/**
 * Calcula la distancia de círculo máximo entre dos puntos en la Tierra.
 * @param {number} lat1 Latitud del punto anterior
 * @param {number} lon1 Longitud del punto anterior
 * @param {number} lat2 Latitud actual
 * @param {number} lon2 Longitud actual
 * @returns {number} Distancia diferencial en kilómetros
 */
export const calcularDistanciaHaversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radio medio volumétrico de la Tierra en km
  const rad = Math.PI / 180;

  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};
