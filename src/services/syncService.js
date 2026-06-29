import { db } from "../database/dbSetup";
import { supabase, PERFIL_ID } from "../config/constanst";
import apiClient from "../api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

let isSyncing = false; // Mutex en memoria para evitar ráfagas duplicadas

const sincronizarHitosLocales = async (recorridoApiId) => {
  // Leemos FIFO. Lote pequeño (5) por el peso masivo de las cadenas Base64 en memoria RAM.
  const hitosPendientes = await db.getAllAsync(
    `SELECT * FROM hitos_locales 
     WHERE sincronizado_supabase = 0 OR sincronizado_api_externa = 0 
     ORDER BY numero_hito ASC LIMIT 5`,
  );

  for (const hito of hitosPendientes) {
    let syncApi = hito.sincronizado_api_externa === 1;
    let syncSupabase = hito.sincronizado_supabase === 1;
    let imagenUrlFinal = hito.imagen_url || null; // Columna temporal si quisieras agregarla, o null

    // NODO 1 DEL GRAFO: Transmisión hacia API Externa
    if (!syncApi) {
      try {
        // A. Crear la posición ancla en la API
        const { data: posData } = await apiClient.post(
          `/recorridos/${recorridoApiId}/posiciones`,
          {
            lat: hito.latitud,
            lon: hito.longitud,
            perfil_id: PERFIL_ID,
          },
        );
        const posicionIdApi = posData.id;

        // B. Si hay foto, adjuntarla a la posición ancla creada
        if (hito.tiene_foto === 1 && hito.foto_base64) {
          const { data: imgData } = await apiClient.post(
            `/recorridos/posiciones/${posicionIdApi}/imagen`,
            {
              imagen_base64: hito.foto_base64,
            },
          );
          imagenUrlFinal = imgData.url;
        }
        syncApi = true;
      } catch (e) {
        console.error(
          `[Sync Hito] Fallo en microservicio externo para hito ${hito.id}:`,
          e.message,
        );
        continue; // Interrupción temprana del DAG. No intentar Supabase si falla la API.
      }
    }

    // NODO 2 DEL GRAFO: Consolidación Transaccional en Supabase
    if (syncApi && !syncSupabase) {
      try {
        // Geometría Estricta PostGIS (X Y = Lon Lat)
        const puntoPostGIS = `SRID=4326;POINT(${hito.longitud} ${hito.latitud})`;

        await supabase.from("hitos_control").insert({
          id: hito.id,
          recorrido_id: hito.recorrido_id,
          numero_hito: hito.numero_hito,
          km_acumulado: hito.km_acumulado,
          ubicacion: puntoPostGIS,
          tiene_foto: hito.tiene_foto === 1,
          foto_base64: null, // Nunca ensuciar Supabase con Base64.
          imagen_url: imagenUrlFinal,
          imagen_sincronizada: !!imagenUrlFinal,
          sincronizado_api_externa: true,
          // Extraer timestamp correcto o usar default NOW() dictado por BD
        });
        syncSupabase = true;
      } catch (e) {
        console.error(
          `[Sync Hito] Rechazo relacional de Supabase para hito ${hito.id}:`,
          e.message,
        );
      }
    }

    // RESOLUCIÓN: Garbage Collection del Búfer SQLite
    if (syncApi && syncSupabase) {
      await db.runAsync("DELETE FROM hitos_locales WHERE id = ?", [hito.id]);
      console.log(
        `[Sync Hito] Hito ${hito.numero_hito} sincronizado y destruido localmente.`,
      );
    } else {
      // Evitar pérdida de estado si solo un nodo del grafo triunfa
      await db.runAsync(
        "UPDATE hitos_locales SET sincronizado_api_externa = ?, sincronizado_supabase = ? WHERE id = ?",
        [syncApi ? 1 : 0, syncSupabase ? 1 : 0, hito.id],
      );
    }
  }
};

export const ejecutarSincronizacionLotes = async () => {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const recorridoApiId = await AsyncStorage.getItem(
      "recorrido_activo_id_api",
    );
    if (!recorridoApiId) {
      isSyncing = false;
      return;
    }

    // ORDEN ESTRICTO DICTADO POR LOS REQUERIMIENTOS DE ARQUITECTURA

    // 1. Drenar posiciones regulares GPS
    // (AQUÍ VA TU LÓGICA ANTERIOR DE POSICIONES)
    await sincronizarPosicionesLocales(recorridoApiId);

    // 2. Drenar Hitos Complejos (con I/O de red pesado)
    await sincronizarHitosLocales(recorridoApiId);
  } catch (error) {
    console.error("Colapso en bucle de sincronización maestro:", error.message);
  } finally {
    isSyncing = false;
  }
};

// Asegúrate de haber extraído la lógica anterior de posiciones a esta función:
const sincronizarPosicionesLocales = async (recorridoApiId) => {
  if (isSyncing) return;
  isSyncing = true;

  try {
    // 1. Lectura FIFO de posiciones no sincronizadas
    const pendientes = await db.getAllAsync(
      `SELECT * FROM posiciones_locales 
       WHERE sincronizado_supabase = 0 OR sincronizado_api_externa = 0 
       ORDER BY timestamp_captura ASC LIMIT 50`, // Lotes de 50 para no asfixiar la red
    );

    if (pendientes.length === 0) {
      isSyncing = false;
      return;
    }

    const recorridoApiId = await AsyncStorage.getItem(
      "recorrido_activo_id_api",
    );
    if (!recorridoApiId)
      throw new Error(
        "Ausencia de recorrido_id_api local. Sincronización abortada.",
      );

    for (const pos of pendientes) {
      let syncSupabaseExitoso = pos.sincronizado_supabase === 1;
      let syncApiExitoso = pos.sincronizado_api_externa === 1;

      // A. Transmisión a API Externa
      if (!syncApiExitoso) {
        try {
          await apiClient.post(`/recorridos/${recorridoApiId}/posiciones`, {
            lat: pos.latitud, // La API exige 'lat', no 'latitud'
            lon: pos.longitud, // La API exige 'lon', no 'longitud'
            perfil_id: PERFIL_ID,
          });
          syncApiExitoso = true;
        } catch (e) {
          console.error(`Fallo API en posición ${pos.id}:`, e.message);
        }
      }

      // B. Transmisión a Supabase (PostGIS)
      if (!syncSupabaseExitoso) {
        try {
          const puntoPostGIS = `SRID=4326;POINT(${pos.longitud} ${pos.latitud})`; // Orden riguroso: LON LAT
          await supabase.from("posiciones_gps").insert({
            id: pos.id,
            recorrido_id: pos.recorrido_id,
            ubicacion: puntoPostGIS,
            timestamp_captura: pos.timestamp_captura,
            sincronizado_api_externa: syncApiExitoso, // Propagación de estado
          });
          syncSupabaseExitoso = true;
        } catch (e) {
          console.error(`Fallo Supabase en posición ${pos.id}:`, e.message);
        }
      }

      // C. Limpieza / Actualización del Búfer Local
      if (syncSupabaseExitoso && syncApiExitoso) {
        await db.runAsync("DELETE FROM posiciones_locales WHERE id = ?", [
          pos.id,
        ]);
      } else {
        await db.runAsync(
          "UPDATE posiciones_locales SET sincronizado_supabase = ?, sincronizado_api_externa = ? WHERE id = ?",
          [syncSupabaseExitoso ? 1 : 0, syncApiExitoso ? 1 : 0, pos.id],
        );
      }
    }
  } catch (error) {
    console.error("Colapso en bucle de sincronización:", error.message);
  } finally {
    isSyncing = false;
  }
};
