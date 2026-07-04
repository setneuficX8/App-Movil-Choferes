import * as Location from "expo-location";
import { TASK_GPS } from "../config/constanst";

/**
 * Realiza una auditoría estricta sobre el estado físico del sensor GPS.
 * @returns {Promise<boolean>} True si el hardware está encendido y autorizado.
 */
export const verificarHardwareGPS = async () => {
  try {
    const gpsActivado = await Location.hasServicesEnabledAsync();
    if (!gpsActivado) return false;

    let { status: foreStatus } = await Location.getForegroundPermissionsAsync();
    if (foreStatus !== "granted") {
      const { status } = await Location.requestForegroundPermissionsAsync();
      foreStatus = status;
    }
    if (foreStatus !== "granted") return false;

    let { status: backStatus } = await Location.getBackgroundPermissionsAsync();
    if (backStatus !== "granted") {
      const { status } = await Location.requestBackgroundPermissionsAsync();
      backStatus = status;
    }
    return backStatus === "granted";
  } catch (error) {
    console.error(
      "[GPS-Hardware-Check] Error durante la auditoría:",
      error.message,
    );
    return false;
  }
};

/**
 * Inicializa el tracking de geolocalización nativo en segundo plano.
 */
export const iniciarTrackingGPS = async () => {
  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(TASK_GPS);
    if (hasStarted) {
      console.log("[GPS-Service] El tracking ya estaba en ejecución.");
      return;
    }

    const { status: fgStatus } =
      await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== "granted")
      throw new Error("Permisos de primer plano denegados.");

    const { status: bgStatus } =
      await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== "granted")
      throw new Error("Permisos de segundo plano denegados.");

    await Location.startLocationUpdatesAsync(TASK_GPS, {
      accuracy: Location.Accuracy.BestForNavigation,
      distanceInterval: 10, // Notificación de movimiento cada 10 metros
      deferredUpdatesInterval: 5000, // Forzar muestreo periódico cada 5 segundos
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
    console.error(
      "[GPS-Service] Fallo al inicializar servicio nativo:",
      err.message,
    );
    throw err;
  }
};

/**
 * Detiene el tracking de geolocalización liberando recursos de hardware.
 */
export const detenerTrackingGPS = async () => {
  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(TASK_GPS);
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(TASK_GPS);
      console.log("[GPS-Service] Hilo nativo liberado de forma correcta.");
    }
  } catch (err) {
    console.error(
      "[GPS-Service] Error al detener el tracking nativo:",
      err.message,
    );
  }
};
