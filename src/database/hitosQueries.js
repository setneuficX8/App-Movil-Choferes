import { db } from "./dbSetup";

export const insertarHitoLocal = async ({
  id,
  recorrido_id,
  numero_hito,
  km_acumulado,
  latitud,
  longitud,
  tiene_foto,
  foto_base64,
}) => {
  try {
    // Inserción O(1) ultra rápida para no bloquear el hilo de interfaz
    await db.runAsync(
      `INSERT INTO hitos_locales 
      (id, recorrido_id, numero_hito, km_acumulado, latitud, longitud, tiene_foto, foto_base64, imagen_sincronizada, sincronizado_supabase, sincronizado_api_externa)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)`,
      [
        id,
        recorrido_id,
        numero_hito,
        km_acumulado,
        latitud,
        longitud,
        tiene_foto ? 1 : 0,
        foto_base64 || null,
      ],
    );
    console.log(`[SQLite] Hito ${numero_hito} encolado exitosamente.`);
  } catch (error) {
    console.error("[SQLite] Falla crítica al guardar hito:", error.message);
    throw error;
  }
};
import { db } from "./dbSetup";

export const insertarHitoLocal = async ({
  id,
  recorrido_id,
  numero_hito,
  km_acumulado,
  latitud,
  longitud,
  tiene_foto,
  foto_base64,
}) => {
  try {
    // Inserción O(1) ultra rápida para no bloquear el hilo de interfaz
    await db.runAsync(
      `INSERT INTO hitos_locales 
      (id, recorrido_id, numero_hito, km_acumulado, latitud, longitud, tiene_foto, foto_base64, imagen_sincronizada, sincronizado_supabase, sincronizado_api_externa)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)`,
      [
        id,
        recorrido_id,
        numero_hito,
        km_acumulado,
        latitud,
        longitud,
        tiene_foto ? 1 : 0,
        foto_base64 || null,
      ],
    );
    console.log(`[SQLite] Hito ${numero_hito} encolado exitosamente.`);
  } catch (error) {
    console.error("[SQLite] Falla crítica al guardar hito:", error.message);
    throw error;
  }
};
import { db } from "./dbSetup";

export const insertarHitoLocal = async ({
  id,
  recorrido_id,
  numero_hito,
  km_acumulado,
  latitud,
  longitud,
  tiene_foto,
  foto_base64,
}) => {
  try {
    // Inserción O(1) ultra rápida para no bloquear el hilo de interfaz
    await db.runAsync(
      `INSERT INTO hitos_locales 
      (id, recorrido_id, numero_hito, km_acumulado, latitud, longitud, tiene_foto, foto_base64, imagen_sincronizada, sincronizado_supabase, sincronizado_api_externa)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)`,
      [
        id,
        recorrido_id,
        numero_hito,
        km_acumulado,
        latitud,
        longitud,
        tiene_foto ? 1 : 0,
        foto_base64 || null,
      ],
    );
    console.log(`[SQLite] Hito ${numero_hito} encolado exitosamente.`);
  } catch (error) {
    console.error("[SQLite] Falla crítica al guardar hito:", error.message);
    throw error;
  }
};
