import { supabase, PERFIL_ID, STORAGE_KEYS } from "../config/constanst";
import apiClient from "../api/client";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";

// SEPARACIÓN ESTRICTA DE IDs: vehiculoIdSupabase vs vehiculoIdApi
export const iniciarNuevoRecorrido = async ({
  choferId,
  asignacionId,
  vehiculoIdInterno, // UUID para la relación FK en Supabase
  vehiculoIdExterno, // text para el payload de la API externa
  rutaIdBigInt,
  rutaIdUuid,
}) => {
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

// Añadir al final de src/services/recorridoService.js

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
  if (!recorridoLocalId) return true; // No hay estado activo, por ende, no hay infracción temporal.

  try {
    // Consulta a la fuente de verdad (Supabase)
    const { data, error } = await supabase
      .from("recorridos")
      .select("fecha_inicio, estado")
      .eq("id", recorridoLocalId)
      .single();

    if (error || !data) return false;

    // Cálculo del límite de validez
    const tiempoInicio = new Date(data.fecha_inicio).getTime();
    const tiempoActual = new Date().getTime();
    const horasTranscurridas = (tiempoActual - tiempoInicio) / (1000 * 60 * 60);

    if (horasTranscurridas >= 24) {
      console.warn(
        "[Auditoría] El recorrido ha excedido el umbral de 24 horas. Ejecutando suspensión forzosa.",
      );

      // Aplicación estricta de la regla de negocio
      await supabase
        .from("recorridos")
        .update({
          estado: "suspendido",
          fecha_fin: new Date().toISOString(),
        })
        .eq("id", recorridoLocalId);

      await AsyncStorage.removeItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID);
      await AsyncStorage.removeItem("recorrido_activo_id_api");

      return false; // Retorna false para notificar a la UI que el hardware GPS debe ser apagado.
    }

    return true;
  } catch (err) {
    console.error("Fallo durante la auditoría temporal:", err.message);
    return true; // En caso de fallo de red, asumimos que el hardware debe seguir recopilando datos en SQLite.
  }
};
