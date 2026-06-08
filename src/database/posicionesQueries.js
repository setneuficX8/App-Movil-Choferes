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
