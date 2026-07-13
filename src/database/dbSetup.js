import * as SQLite from 'expo-sqlite';
export const db = SQLite.openDatabaseSync('reco_sombra.db');


export const initLocalDatabase = async () => {
  try {
    // El execAsync es para ejecutar múltiples sentencias SQL de una vez
    await db.execAsync(`
      PRAGMA journal_mode = WAL; -- Optimiza el rendimiento de lectura/escritura en SQLite

      -- Creación del Búfer para Posiciones GPS
      CREATE TABLE IF NOT EXISTS posiciones_locales (
        id TEXT PRIMARY KEY NOT NULL,
        recorrido_id TEXT NOT NULL,
        latitud REAL NOT NULL,
        longitud REAL NOT NULL,
        timestamp_captura TEXT NOT NULL,
        velocidad_ms REAL,
        sincronizado_supabase INTEGER DEFAULT 0,
        sincronizado_api_externa INTEGER DEFAULT 0
      );

      -- Creación del Búfer para Evidencias e Hitos
      CREATE TABLE IF NOT EXISTS hitos_locales (
        id TEXT PRIMARY KEY NOT NULL,
        recorrido_id TEXT NOT NULL,
        numero_hito INTEGER NOT NULL,
        km_acumulado REAL NOT NULL,
        latitud REAL NOT NULL,
        longitud REAL NOT NULL,
        tiene_foto INTEGER DEFAULT 0,
        foto_base64 TEXT,
        imagen_sincronizada INTEGER DEFAULT 0,
        sincronizado_supabase INTEGER DEFAULT 0,
        sincronizado_api_externa INTEGER DEFAULT 0
      );
    `);

    // Migración idempotente: velocidad del GPS para App Ciudadano (posiciones_live)
    try {
      await db.execAsync(
        `ALTER TABLE posiciones_locales ADD COLUMN velocidad_ms REAL`,
      );
    } catch (migrationError) {
      const mensaje = migrationError?.message || "";
      if (!mensaje.includes("duplicate column name")) {
        throw migrationError;
      }
    }

    console.log('Base de datos local inicializada correctamente.');
  } catch (error) {
    console.error('Error al intentar inicializar SQLite:', error);
    throw error;
  }
};