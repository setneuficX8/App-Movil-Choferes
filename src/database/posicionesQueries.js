import { db } from "./dbSetup";

/**
 * Inserta una nueva posición GPS respetando escrupulosamente los campos reales de dbSetup.js
 */
export const insertarPosicionLocal = async ({
  id,
  recorrido_id,
  latitud,
  longitud,
  timestamp_captura,
}) => {
  return await db.runAsync(
    `INSERT INTO posiciones_locales 
      (id, recorrido_id, latitud, longitud, timestamp_captura, sincronizado_supabase, sincronizado_api_externa)
     VALUES (?, ?, ?, ?, ?, 0, 0)`,
    [id, recorrido_id, latitud, longitud, timestamp_captura],
  );
};

/**
 * Obtiene las métricas en un solo paso para el panel de pruebas
 */
export const obtenerMetricasLocales = async () => {
  const registros = await db.getAllAsync(
    "SELECT sincronizado_supabase, sincronizado_api_externa FROM posiciones_locales",
  );

  let total = registros.length;
  let supPendientes = 0;
  let apiPendientes = 0;

  registros.forEach((row) => {
    if (row.sincronizado_supabase === 0) supPendientes++;
    if (row.sincronizado_api_externa === 0) apiPendientes++;
  });

  return { total, supPendientes, apiPendientes };
};

export const obtenerRutaGeoJSON = async (recorrido_id) => {
  const posiciones = await db.getAllAsync(
    `SELECT longitud, latitud FROM posiciones_locales WHERE recorrido_id = ? ORDER BY timestamp_captura ASC`,
    [recorrido_id]
  );

  const coordenadas = posiciones.map(pos => [pos.longitud, pos.latitud]);

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coordenadas,
        },
      },
    ],
  };
};