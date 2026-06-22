import * as Location from "expo-location";
import { TASK_GPS } from "../config/constanst";

export const iniciarTrackingGPS = async () => {
  try {
    // CORRECCIÓN CRÍTICA: Validar si el sensor de ubicación está activo, NO si la tarea está definida.
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(TASK_GPS);
    if (hasStarted) {
      console.log("[GPS-Service] El tracking ya estaba en ejecución.");
      return;
    }

    const { status: fgStatus } =
      await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== "granted")
      throw new Error("Permisos foreground denegados.");

    const { status: bgStatus } =
      await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== "granted")
      throw new Error("Permisos background denegados.");

    await Location.startLocationUpdatesAsync(TASK_GPS, {
      accuracy: Location.Accuracy.High, // NOTA: "High" es el nivel más preciso, pero consume más batería.
      distanceInterval: 10, // NOTA: Tienes que moverte físicamente 15 metros para que esto dispare
      deferredUpdatesInterval: 5000, // NOTA: Si el dispositivo no se mueve, esto asegura que al menos cada 5 segundos se intente obtener una ubicación (útil para detectar paradas)
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: "Recorrido Activo",
        notificationBody: "Escribiendo coordenadas en SQLite...",
        notificationColor: "#10b981",
      },
    });
    console.log("[GPS-Service] Sensor nativo de ubicación inicializado.");
  } catch (err) {
    console.error("[GPS-Service] Error al inicializar:", err.message);
    throw err;
  }
};

export const detenerTrackingGPS = async () => {
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(TASK_GPS);
  if (hasStarted) {
    await Location.stopLocationUpdatesAsync(TASK_GPS);
    console.log("[GPS-Service] Hilo nativo liberado.");
  }
};
