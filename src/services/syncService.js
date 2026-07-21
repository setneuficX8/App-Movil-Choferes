import { db } from "../database/dbSetup";
import { supabase, PERFIL_ID } from "../config/constanst";
import apiClient from "../api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

let isSyncing = false;

/**
 * Fase 1: Sincronización en lote FIFO de posiciones GPS regulares.
 */
const sincronizarPosicionesLocales = async (recorridoApiId) => {
  try {
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
          console.error(`[Sync GPS] Fallo API externa:`, e.message);
        }
      }

      // Supabase (historial + live para App Ciudadano)
      if (!syncSupabaseExitoso) {
        try {
          const puntoPostGIS = `SRID=4326;POINT(${pos.longitud} ${pos.latitud})`;
          const { error: gpsError } = await supabase.from("posiciones_gps").insert({
            id: pos.id,
            recorrido_id: pos.recorrido_id,
            ubicacion: puntoPostGIS,
            timestamp_captura: pos.timestamp_captura,
            sincronizado_api_externa: syncApiExitoso,
          });
          if (gpsError) throw gpsError;

          const livePayload = {
            recorrido_id: pos.recorrido_id,
            ubicacion: puntoPostGIS,
            timestamp_captura: pos.timestamp_captura,
            updated_at: new Date().toISOString(),
          };
          // Solo publicar velocidad válida; omitir null evita borrar la última
          // velocidad conocida en Realtime (GPS frío / -1 en Android).
          const velocidad =
            pos.velocidad_ms != null &&
            Number.isFinite(Number(pos.velocidad_ms)) &&
            Number(pos.velocidad_ms) >= 0
              ? Number(pos.velocidad_ms)
              : null;
          if (velocidad != null) {
            livePayload.velocidad_ms = velocidad;
          }

          const { error: liveError } = await supabase
            .from("posiciones_live")
            .upsert(livePayload, { onConflict: "recorrido_id" });
          if (liveError) {
            console.error(`[Sync GPS] Fallo posiciones_live:`, liveError.message);
            // No marcar sync exitoso si falló el live: Ciudadano depende de esto.
            throw liveError;
          }

          syncSupabaseExitoso = true;
        } catch (e) {
          console.error(`[Sync GPS] Fallo Supabase:`, e.message);
        }
      }

      // Actualización de estado en base local
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
    console.error("[Sync GPS] Error en bucle de posiciones:", error.message);
  }
};

/**
 * Fase 2 y 3: Sincronización secuencial FIFO de hitos de control.
 * CORRECCIÓN: Se eliminan las propiedades 'latitud' y 'longitud' del payload de inserción
 * para permitir que Supabase las genere nativamente mediante PostGIS sin lanzar errores de restricción.
 */
const sincronizarHitosLocales = async (recorridoApiId) => {
  try {
    const hitosPendientes = await db.getAllAsync(
      `SELECT * FROM hitos_locales 
       WHERE sincronizado_supabase = 0 OR sincronizado_api_externa = 0 
       ORDER BY numero_hito ASC LIMIT 5`,
    );

    for (const hito of hitosPendientes) {
      let syncApi = hito.sincronizado_api_externa === 1;
      let syncSupabase = hito.sincronizado_supabase === 1;
      let imagenUrlFinal = null;

      // Recuperar la URL remota previamente guardada en foto_base64 en caso de reintento
      if (hito.foto_base64 && hito.foto_base64.startsWith("CDN_URL:")) {
        imagenUrlFinal = hito.foto_base64.replace("CDN_URL:", "");
      }

      const numeroHitoSanitizado =
        typeof hito.numero_hito === "string"
          ? parseInt(hito.numero_hito.replace(/\D/g, ""), 10) || 1
          : parseInt(hito.numero_hito, 10) || 1;

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

          if (hito.tiene_foto === 1 && hito.foto_base64 && !imagenUrlFinal) {
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
          console.error(
            `[Sync Hito] Fallo al sincronizar en API externa:`,
            e.message,
          );
          continue; // Detener flujo para este hito y procesar el siguiente en la lista
        }
      }

      // Supabase
      if (syncApi && !syncSupabase) {
        try {
          // Estructura geométrica POINT(longitud latitud)
          const puntoPostGIS = `SRID=4326;POINT(${hito.longitud} ${hito.latitud})`;

          // CORRECCIÓN DE INSERCIÓN: Omitimos enviar 'latitud' y 'longitud' directamente
          const { error: sbHitoError } = await supabase
            .from("hitos_control")
            .insert({
              id: hito.id,
              recorrido_id: hito.recorrido_id,
              numero_hito: numeroHitoSanitizado,
              km_acumulado: hito.km_acumulado,
              ubicacion: puntoPostGIS,
              tiene_foto: hito.tiene_foto === 1,
              imagen_url: imagenUrlFinal,
              imagen_sincronizada: !!imagenUrlFinal,
              sincronizado_api_externa: true,
              timestamp_captura:
                hito.timestamp_captura || new Date().toISOString(),
            });

          if (sbHitoError) throw sbHitoError;
          syncSupabase = true;
        } catch (e) {
          console.error(
            `[Sync Hito] Fallo de Supabase en hito ${hito.numero_hito}:`,
            e.message,
          );

          // Salvaguarda: Guardar la CDN URL en SQLite para evitar pérdida en el siguiente ciclo
          if (imagenUrlFinal) {
            await db.runAsync(
              "UPDATE hitos_locales SET foto_base64 = ? WHERE id = ?",
              [`CDN_URL:${imagenUrlFinal}`, hito.id],
            );
          }
        }
      }

      // Actualización final de estados locales
      if (syncApi && syncSupabase) {
        await db.runAsync("DELETE FROM hitos_locales WHERE id = ?", [hito.id]);
      } else {
        await db.runAsync(
          "UPDATE hitos_locales SET sincronizado_api_externa = ?, sincronizado_supabase = ? WHERE id = ?",
          [syncApi ? 1 : 0, syncSupabase ? 1 : 0, hito.id],
        );
      }
    }
  } catch (error) {
    console.error("[Sync Hito] Error en bucle de hitos:", error.message);
  }
};

/**
 * Orquestador principal de sincronización por lotes FIFO.
 */
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
    console.error(
      "[Sync-Master] Colapso en bucle de sincronización:",
      error.message,
    );
  } finally {
    isSyncing = false;
  }
};
