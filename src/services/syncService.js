import { db } from "../database/dbSetup";
import { supabase, PERFIL_ID } from "../config/constanst";
import apiClient from "../api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

let isSyncing = false; // Mutex en memoria para evitar ráfagas duplicadas

export const ejecutarSincronizacionLotes = async () => {
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
