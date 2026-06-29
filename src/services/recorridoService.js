import { supabase, PERFIL_ID, STORAGE_KEYS } from "../config/constanst";
import apiClient from "../api/client";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";

// SEPARACIÓN ESTRICTA DE IDs: vehiculoIdSupabase vs vehiculoIdApi
export const iniciarNuevoRecorrido = async ({
  choferId,
  asignacionId,
  vehiculoIdInterno,
  vehiculoIdExterno,
  rutaIdBigInt,
  rutaIdUuid,
}) => {
  // Limpieza preventiva de contexto previo
  await AsyncStorage.removeItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID);
  await AsyncStorage.removeItem("recorrido_activo_id_api");
  await AsyncStorage.removeItem(STORAGE_KEYS.KM_ACUMULADO);
  await AsyncStorage.removeItem(STORAGE_KEYS.ULTIMA_UBICACION);
  await AsyncStorage.removeItem(STORAGE_KEYS.ULTIMO_HITO_KM);

  const recorridoLocalId = Crypto.randomUUID();

  // 1. Persistencia inicial en Supabase (Usando la clave interna UUID)
  try {
    const { error: dbError } = await supabase.from("recorridos").insert({
      id: recorridoLocalId,
      chofer_id: choferId,
      vehiculo_id: vehiculoIdInterno, // Clave foránea interna obligatoria
      ruta_id: rutaIdBigInt,
      asignacion_id: asignacionId,
      estado: "en_curso",
    });

    if (dbError) throw new Error(`Rechazo de Supabase: ${dbError.message}`);
  } catch (err) {
    if (err.message === "Network request failed" || err.name === "TypeError") {
      throw new Error(
        "Conexión física rechazada. Debes tener internet para INICIAR un recorrido.",
      );
    }
    throw err;
  }

  // 2. Negociación con API Externa (Usando la clave externa text)
  try {
    const { data: apiResponse } = await apiClient.post("/recorridos/iniciar", {
      ruta_id: rutaIdUuid,
      vehiculo_id: vehiculoIdExterno, // CORRECCIÓN: Se envía el identificador externo real
      perfil_id: PERFIL_ID,
    });

    const recorridoIdApi = apiResponse.id;

    // 3. Consolidación de Identidades en Supabase
    await supabase
      .from("recorridos")
      .update({ recorrido_id_api: recorridoIdApi })
      .eq("id", recorridoLocalId);

    // 4. Inyección en el contexto de persistencia local
    await AsyncStorage.setItem(
      STORAGE_KEYS.RECORRIDO_ACTIVO_ID,
      recorridoLocalId,
    );
    await AsyncStorage.setItem("recorrido_activo_id_api", recorridoIdApi);

    return { localId: recorridoLocalId, apiId: recorridoIdApi };
  } catch (apiError) {
    try {
      await supabase
        .from("recorridos")
        .update({ estado: "suspendido" })
        .eq("id", recorridoLocalId);
    } catch (rollbackErr) {
      console.warn("Rollback fallido por inestabilidad de red.");
    }

    const mensajeError = apiError.response
      ? `La API rechazó los datos (Código ${apiError.response.status}). Mensaje: ${JSON.stringify(apiError.response.data)}`
      : `Fallo de red al contactar API externa: ${apiError.message}`;

    throw new Error(mensajeError);
  }
};

export const finalizarRecorridoActivo = async () => {
  const recorridoLocalId = await AsyncStorage.getItem(
    STORAGE_KEYS.RECORRIDO_ACTIVO_ID,
  );
  const recorridoApiId = await AsyncStorage.getItem("recorrido_activo_id_api");

  if (!recorridoLocalId) {
    throw new Error(
      "Violación de estado: No hay recorrido activo en la memoria para finalizar.",
    );
  }

  // 1. Notificación HTTP al microservicio externo
  if (recorridoApiId) {
    try {
      await apiClient.post(`/recorridos/${recorridoApiId}/finalizar`, {
        perfil_id: PERFIL_ID,
      });
    } catch (apiError) {
      console.warn(
        "La API externa rechazó la finalización. Procediendo con el cierre local en Supabase.",
      );
    }
  }

  // 2. Mutación de estado transaccional en Supabase
  const { error: dbError } = await supabase
    .from("recorridos")
    .update({
      estado: "completado",
      fecha_fin: new Date().toISOString(),
    })
    .eq("id", recorridoLocalId);

  if (dbError)
    throw new Error(`Fallo relacional al cerrar recorrido: ${dbError.message}`);

  // 3. Destrucción del contexto local
  await AsyncStorage.removeItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID);
  await AsyncStorage.removeItem("recorrido_activo_id_api");
};

export const auditarVigenciaRecorrido = async () => {
  const recorridoLocalId = await AsyncStorage.getItem(
    STORAGE_KEYS.RECORRIDO_ACTIVO_ID,
  );

  // Caso 1: No hay recorrido en curso. Todo está en orden.
  if (!recorridoLocalId) return { expirado: false, zombie: false };

  try {
    const { data, error } = await supabase
      .from("recorridos")
      .select("fecha_inicio, estado")
      .eq("id", recorridoLocalId)
      .single();

    // Caso 2: Caída de red. No podemos auditar. Confiamos en el hardware temporalmente.
    if (error) {
      console.warn(
        "[Auditoría] Falla de red al verificar Supabase:",
        error.message,
      );
      return { expirado: false, zombie: false };
    }

    // Caso 3: El ID existe en el teléfono pero fue borrado de Supabase (Estado Zombi)
    if (!data) {
      console.warn(
        "[Auditoría] ID Zombi detectado. Purgando almacenamiento local.",
      );
      await AsyncStorage.removeItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID);
      await AsyncStorage.removeItem("recorrido_activo_id_api");
      return { expirado: false, zombie: true };
    }

    // Caso 4: Evaluación Temporal Matemática
    const tiempoInicio = new Date(data.fecha_inicio).getTime();
    const tiempoActual = new Date().getTime();
    const horasTranscurridas = (tiempoActual - tiempoInicio) / (1000 * 60 * 60);

    if (horasTranscurridas >= 24) {
      console.warn("[Auditoría] Límite de 24h excedido. Suspensión forzosa.");
      await supabase
        .from("recorridos")
        .update({ estado: "suspendido", fecha_fin: new Date().toISOString() })
        .eq("id", recorridoLocalId);

      await AsyncStorage.removeItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID);
      await AsyncStorage.removeItem("recorrido_activo_id_api");
      return { expirado: true, zombie: false };
    }

    // Caso 5: Recorrido válido y dentro del tiempo.
    return { expirado: false, zombie: false };
  } catch (err) {
    return { expirado: false, zombie: false };
  }
};
