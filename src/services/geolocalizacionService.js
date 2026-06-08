import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { insertarPosicionLocal } from "../database/posicionesQueries";

export const LOCATION_TASK_NAME = "BACKGROUND_LOCATION_TASK";

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("[LocationTask] Error nativo en background:", error.message);
    return;
  }

  if (data) {
    const { locations } = data;
    if (!locations || locations.length === 0) return;

    try {
      const location = locations[0];
      const latitud = location.coords.latitude;
      const longitud = location.coords.longitude;
      const timestamp_captura = new Date(location.timestamp).toISOString();

      // Recuperamos el ID del recorrido almacenado en el inicio de la prueba
      const recorridoIdLocal = await AsyncStorage.getItem(
        "recorrido_activo_id",
      );
      if (!recorridoIdLocal) return;

      const idCriptografico = Crypto.randomUUID(); // Formato UUID estricto para evitar colisiones

      // REGLA DE COHERENCIA: Insertamos omitiendo velocidad_ms para no romper tu SQLite
      await insertarPosicionLocal({
        id: idCriptografico,
        recorrido_id: recorridoIdLocal,
        latitud,
        longitud,
        timestamp_captura,
      });

      console.log(
        `[LocationTask] SQLite exitoso -> Lat: ${latitud}, Lon: ${longitud}`,
      );
    } catch (e) {
      console.error(
        "[LocationTask] Fallo crítico de inserción en SQLite:",
        e.message,
      );
    }
  }
});

export const iniciarTrackingGPS = async () => {
  try {
    const isRegistered =
      await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) return;

    const { status: fgStatus } =
      await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== "granted")
      throw new Error("Permisos foreground denegados.");

    const { status: bgStatus } =
      await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== "granted")
      throw new Error("Permisos background denegados.");

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.BestForNavigation, // Máxima precisión
      distanceInterval: 15, // Cada 15 metros reales
      deferredUpdatesInterval: 5000,
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false, // Bloquea la suspensión en iOS/Android
      foregroundService: {
        notificationTitle: "Recorrido de Prueba Activo",
        notificationBody:
          "Escribiendo coordenadas directamente en reco_sombra.db...",
        notificationColor: "#10b981",
      },
    });
    console.log("[GPS-Service] Hilo nativo en ejecución.");
  } catch (err) {
    console.error("[GPS-Service] Error al inicializar:", err.message);
    throw err;
  }
};

export const detenerTrackingGPS = async () => {
  const isRegistered =
    await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    console.log("[GPS-Service] Hilo nativo liberado.");
  }
};
