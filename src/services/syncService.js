import { db } from "../database/dbSetup";
import { supabase, PERFIL_ID } from "../config/constanst";
import apiClient from "../api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

let isSyncing = false;

// 1. NODO: Sincronización de Coordenadas
const sincronizarPosicionesLocales = async (recorridoApiId) => {
  const pendientes = await db.getAllAsync(
    `SELECT * FROM posiciones_locales 
     WHERE sincronizado_supabase = 0 OR sincronizado_api_externa = 0 
     ORDER BY timestamp_captura ASC LIMIT 50`,
  );

  if (pendientes.length === 0) return;

  for (const pos of pendientes) {
    let syncSupabaseExitoso = pos.sincronizado_supabase === 1;
    let syncApiExitoso = pos.sincronizado_api_externa === 1;

    // API Externa
    if (!syncApiExitoso) {
      try {
        await apiClient.post(`/recorridos/${recorridoApiId}/posiciones`, {
          lat: pos.latitud,
          lon: pos.longitud,
          perfil_id: PERFIL_ID,
        });
        syncApiExitoso = true;
      } catch (e) {
        console.error(`[Sync GPS] Fallo API:`, e.message);
      }
    }

    // Supabase
    if (!syncSupabaseExitoso) {
      try {
        const puntoPostGIS = `SRID=4326;POINT(${pos.longitud} ${pos.latitud})`;
        await supabase.from("posiciones_gps").insert({
          id: pos.id,
          recorrido_id: pos.recorrido_id,
          ubicacion: puntoPostGIS,
          timestamp_captura: pos.timestamp_captura,
          sincronizado_api_externa: syncApiExitoso,
        });
        syncSupabaseExitoso = true;
      } catch (e) {
        console.error(`[Sync GPS] Fallo Supabase:`, e.message);
      }
    }

    // Limpieza
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
};

// 2. NODO: Sincronización de Hitos
const sincronizarHitosLocales = async (recorridoApiId) => {
  const hitosPendientes = await db.getAllAsync(
    `SELECT * FROM hitos_locales 
     WHERE sincronizado_supabase = 0 OR sincronizado_api_externa = 0 
     ORDER BY numero_hito ASC LIMIT 5`,
  );

  for (const hito of hitosPendientes) {
    let syncApi = hito.sincronizado_api_externa === 1;
    let syncSupabase = hito.sincronizado_supabase === 1;
    let imagenUrlFinal = hito.imagen_url || null;

    // API Externa
    if (!syncApi) {
      try {
        const { data: posData } = await apiClient.post(
          `/recorridos/${recorridoApiId}/posiciones`,
          {
            lat: hito.latitud,
            lon: hito.longitud,
            perfil_id: PERFIL_ID,
          },
        );

        if (hito.tiene_foto === 1 && hito.foto_base64) {
          const { data: imgData } = await apiClient.post(
            `/recorridos/posiciones/${posData.id}/imagen`,
            {
              imagen_base64: hito.foto_base64,
            },
          );
          imagenUrlFinal = imgData.url;
        }
        syncApi = true;
      } catch (e) {
        console.error(`[Sync Hito] Fallo API:`, e.message);
        continue; // Abortar grafo
      }
    }

    // Supabase
    if (syncApi && !syncSupabase) {
      try {
        const puntoPostGIS = `SRID=4326;POINT(${hito.longitud} ${hito.latitud})`;
        await supabase.from("hitos_control").insert({
          id: hito.id,
          recorrido_id: hito.recorrido_id,
          numero_hito: hito.numero_hito,
          km_acumulado: hito.km_acumulado,
          ubicacion: puntoPostGIS,
          tiene_foto: hito.tiene_foto === 1,
          imagen_url: imagenUrlFinal,
          imagen_sincronizada: !!imagenUrlFinal,
          sincronizado_api_externa: true,
        });
        syncSupabase = true;
      } catch (e) {
        console.error(`[Sync Hito] Fallo Supabase:`, e.message);
      }
    }

    // Limpieza
    if (syncApi && syncSupabase) {
      await db.runAsync("DELETE FROM hitos_locales WHERE id = ?", [hito.id]);
    } else {
      await db.runAsync(
        "UPDATE hitos_locales SET sincronizado_api_externa = ?, sincronizado_supabase = ? WHERE id = ?",
        [syncApi ? 1 : 0, syncSupabase ? 1 : 0, hito.id],
      );
    }
  }
};

// 3. ORQUESTADOR MAESTRO (Exportación Única)
export const ejecutarSincronizacionLotes = async () => {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const recorridoApiId = await AsyncStorage.getItem(
      "recorrido_activo_id_api",
    );
    if (!recorridoApiId) return;

    await sincronizarPosicionesLocales(recorridoApiId);
    await sincronizarHitosLocales(recorridoApiId);
  } catch (error) {
    console.error("Colapso en bucle de sincronización maestro:", error.message);
  } finally {
    isSyncing = false;
  }
};
