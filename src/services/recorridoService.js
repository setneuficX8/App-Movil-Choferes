import { supabase, PERFIL_ID, STORAGE_KEYS } from "../config/constanst";
import apiClient from "../api/client";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";

/**
 * Verifica la disponibilidad del adaptador de red local de forma segura.
 */
export const verificarConexionRed = async () => {
  try {
    const estado = await Network.getNetworkStateAsync();
    return estado.isConnected === true;
  } catch (e) {
    console.error(
      "[Network-Service] Error al auditar estado de red:",
      e.message,
    );
    return false;
  }
};

/**
 * Rollback Atómico: Elimina de forma física las inserciones en cascada si falla el hardware.
 */
export const abortarRecorridoFallido = async (localId, apiId) => {
  console.warn(`[Rollback] Iniciando purga de recorrido huérfano: ${localId}`);
  try {
    // 1. Purga local del contexto operativo
    await AsyncStorage.removeItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID);
    await AsyncStorage.removeItem("recorrido_activo_id_api");
    await AsyncStorage.removeItem(STORAGE_KEYS.KM_ACUMULADO);
    await AsyncStorage.removeItem(STORAGE_KEYS.ULTIMA_UBICACION);
    await AsyncStorage.removeItem(STORAGE_KEYS.ULTIMO_HITO_KM);

    // 2. Eliminación física en Supabase para evitar colisiones lógicas
    if (localId) {
      await supabase.from("posiciones_live").delete().eq("recorrido_id", localId);
      const { error } = await supabase
        .from("recorridos")
        .delete()
        .eq("id", localId);
      if (error)
        console.error(
          "[Rollback] Error al eliminar en Supabase:",
          error.message,
        );
    }

    // 3. Notificación de cancelación / finalización forzada a la API Externa
    if (apiId) {
      try {
        await apiClient.post(`/recorridos/${apiId}/finalizar`, {
          perfil_id: PERFIL_ID,
          abortado: true, // Parámetro adicional opcional para auditorías del backend
        });
      } catch (apiErr) {
        console.warn(
          "[Rollback] API externa ya se encontraba limpia o inaccesible:",
          apiErr.message,
        );
      }
    }
  } catch (err) {
    console.error(
      "[Rollback-Fatal] Error crítico durante la ejecución del rollback:",
      err.message,
    );
  }
};

/**
 * Inicia el handshake online obligatorio de un nuevo recorrido.
 */
export const iniciarNuevoRecorrido = async ({
  choferId,
  asignacionId,
  vehiculoIdInterno,
  vehiculoIdExterno,
  rutaIdBigInt,
  rutaIdUuid,
}) => {
  // Limpieza preventiva de variables de estado local
  await AsyncStorage.removeItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID);
  await AsyncStorage.removeItem("recorrido_activo_id_api");
  await AsyncStorage.removeItem(STORAGE_KEYS.KM_ACUMULADO);
  await AsyncStorage.removeItem(STORAGE_KEYS.ULTIMA_UBICACION);
  await AsyncStorage.removeItem(STORAGE_KEYS.ULTIMO_HITO_KM);

  const recorridoLocalId = Crypto.randomUUID();

  // 1. Registro transaccional en Supabase
  try {
    const { error: dbError } = await supabase.from("recorridos").insert({
      id: recorridoLocalId,
      chofer_id: choferId,
      vehiculo_id: vehiculoIdInterno,
      ruta_id: rutaIdBigInt,
      asignacion_id: asignacionId,
      estado: "en_curso",
    });

    if (dbError) throw new Error(`Supabase insert reject: ${dbError.message}`);
  } catch (err) {
    if (err.message === "Network request failed" || err.name === "TypeError") {
      throw new Error(
        "Conexión de red inestable. Se requiere internet para iniciar un recorrido.",
      );
    }
    throw err;
  }

  // 2. Handshake con API Externa
  try {
    const { data: apiResponse } = await apiClient.post("/recorridos/iniciar", {
      ruta_id: rutaIdUuid,
      vehiculo_id: vehiculoIdExterno,
      perfil_id: PERFIL_ID,
    });

    const recorridoIdApi = apiResponse.id;

    // 3. Vinculación de identidades en Supabase
    const { error: updateError } = await supabase
      .from("recorridos")
      .update({ recorrido_id_api: recorridoIdApi })
      .eq("id", recorridoLocalId);

    if (updateError) throw updateError;

    // 4. Almacenamiento seguro del contexto de persistencia local
    await AsyncStorage.setItem(
      STORAGE_KEYS.RECORRIDO_ACTIVO_ID,
      recorridoLocalId,
    );
    await AsyncStorage.setItem("recorrido_activo_id_api", recorridoIdApi);

    return { localId: recorridoLocalId, apiId: recorridoIdApi };
  } catch (apiError) {
    // Si la API externa falla, ejecutamos un borrado físico para evitar colisiones
    try {
      await supabase.from("recorridos").delete().eq("id", recorridoLocalId);
    } catch (rollbackErr) {
      console.warn(
        "[Rollback-Handshake] No se pudo limpiar la base de datos centralizada:",
        rollbackErr.message,
      );
    }

    const mensajeError = apiError.response
      ? `API externa rechazó el handshake (Código ${apiError.response.status}).`
      : `Error de red al establecer contacto con la API externa: ${apiError.message}`;

    throw new Error(mensajeError);
  }
};

/**
 * Finaliza el recorrido activo formalizando los estados remotos.
 */
export const finalizarRecorridoActivo = async () => {
  const recorridoLocalId = await AsyncStorage.getItem(
    STORAGE_KEYS.RECORRIDO_ACTIVO_ID,
  );
  const recorridoApiId = await AsyncStorage.getItem("recorrido_activo_id_api");

  if (!recorridoLocalId) {
    throw new Error(
      "Violación de estado: No hay ningún recorrido activo para finalizar.",
    );
  }

  // 1. Cierre en API Externa
  if (recorridoApiId) {
    try {
      await apiClient.post(`/recorridos/${recorridoApiId}/finalizar`, {
        perfil_id: PERFIL_ID,
      });
    } catch (apiError) {
      console.warn(
        "[Finalización] No se pudo notificar la API externa, procediendo con Supabase:",
        apiError.message,
      );
    }
  }

  const kmAcumuladoRaw = await AsyncStorage.getItem(STORAGE_KEYS.KM_ACUMULADO);
  const distanciaTotalKm = kmAcumuladoRaw
    ? Number.parseFloat(kmAcumuladoRaw)
    : null;

  // 2. Actualización de estado en Supabase
  const updatePayload = {
    estado: "completado",
    fecha_fin: new Date().toISOString(),
  };
  if (Number.isFinite(distanciaTotalKm)) {
    updatePayload.distancia_total_km = distanciaTotalKm;
  }

  const { error: dbError } = await supabase
    .from("recorridos")
    .update(updatePayload)
    .eq("id", recorridoLocalId);

  if (dbError) {
    throw new Error(
      `Fallo transaccional al cerrar el recorrido en Supabase: ${dbError.message}`,
    );
  }

  // 3. Quitar posición live (Realtime DELETE para App Ciudadano)
  const { error: liveDeleteError } = await supabase
    .from("posiciones_live")
    .delete()
    .eq("recorrido_id", recorridoLocalId);
  if (liveDeleteError) {
    console.warn(
      "[Finalización] No se pudo eliminar posiciones_live:",
      liveDeleteError.message,
    );
  }

  // 4. Purga del almacenamiento local
  await AsyncStorage.removeItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID);
  await AsyncStorage.removeItem("recorrido_activo_id_api");
  await AsyncStorage.removeItem(STORAGE_KEYS.KM_ACUMULADO);
  await AsyncStorage.removeItem(STORAGE_KEYS.ULTIMA_UBICACION);
  await AsyncStorage.removeItem(STORAGE_KEYS.ULTIMO_HITO_KM);
};

/**
 * Realiza la auditoría de vigencia temporal de 24 horas sobre el recorrido activo.
 */
export const auditarVigenciaRecorrido = async () => {
  const recorridoLocalId = await AsyncStorage.getItem(
    STORAGE_KEYS.RECORRIDO_ACTIVO_ID,
  );
  if (!recorridoLocalId) return { expirado: false, zombie: false };

  try {
    const { data, error } = await supabase
      .from("recorridos")
      .select("fecha_inicio, estado")
      .eq("id", recorridoLocalId)
      .single();

    if (error) {
      console.warn(
        "[Auditoría] Inestabilidad de red durante verificación:",
        error.message,
      );
      return { expirado: false, zombie: false };
    }

    if (!data) {
      console.warn(
        "[Auditoría] Recorrido zombi detectado en SQLite. Purgando almacenamiento local.",
      );
      await AsyncStorage.removeItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID);
      await AsyncStorage.removeItem("recorrido_activo_id_api");
      return { expirado: false, zombie: true };
    }

    const tiempoInicio = new Date(data.fecha_inicio).getTime();
    const tiempoActual = new Date().getTime();
    const horasTranscurridas = (tiempoActual - tiempoInicio) / (1000 * 60 * 60);

    if (horasTranscurridas >= 24) {
      console.warn(
        "[Auditoría] Recorrido con antigüedad >= 24 horas. Suspensión forzosa en curso.",
      );
      const kmAcumuladoRaw = await AsyncStorage.getItem(
        STORAGE_KEYS.KM_ACUMULADO,
      );
      const distanciaTotalKm = kmAcumuladoRaw
        ? Number.parseFloat(kmAcumuladoRaw)
        : null;
      const suspendPayload = {
        estado: "suspendido",
        fecha_fin: new Date().toISOString(),
      };
      if (Number.isFinite(distanciaTotalKm)) {
        suspendPayload.distancia_total_km = distanciaTotalKm;
      }
      await supabase
        .from("recorridos")
        .update(suspendPayload)
        .eq("id", recorridoLocalId);
      await supabase
        .from("posiciones_live")
        .delete()
        .eq("recorrido_id", recorridoLocalId);

      await AsyncStorage.removeItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID);
      await AsyncStorage.removeItem("recorrido_activo_id_api");
      await AsyncStorage.removeItem(STORAGE_KEYS.KM_ACUMULADO);
      await AsyncStorage.removeItem(STORAGE_KEYS.ULTIMA_UBICACION);
      await AsyncStorage.removeItem(STORAGE_KEYS.ULTIMO_HITO_KM);
      return { expirado: true, zombie: false };
    }

    return { expirado: false, zombie: false };
  } catch (err) {
    return { expirado: false, zombie: false };
  }
};
