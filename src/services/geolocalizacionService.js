import * as Location from "expo-location";
import { TASK_GPS } from "../config/constanst";

/**
 * Realiza una consulta pasiva sobre los permisos concedidos, SIN desplegar ventanas nativas.
 * Diseñado específicamente para loops de polling (setInterval) para evitar el bloqueo del UI Thread.
 *
 * @returns {Promise<boolean>} True si el GPS está habilitado y el permiso de primer plano fue concedido.
 */
export const comprobarPermisosExistentesGPS = async () => {
  try {
    const gpsActivado = await Location.hasServicesEnabledAsync();
    if (!gpsActivado) return false;

    // Solo se audita el estado actual; no se solicita interacción del usuario
    const { status: foreStatus } =
      await Location.getForegroundPermissionsAsync();

    // Si el usuario concedió "Solo esta vez", foreStatus es 'granted' en el ciclo actual.
    return foreStatus === "granted";
  } catch (error) {
    console.warn(
      "[GPS-Pasivo] Error al comprobar permisos existentes:",
      error.message,
    );
    return false;
  }
};

/**
 * Interroga síncronamente al S.O. y solicita los permisos de localización de forma activa.
 * Solo debe ejecutarse tras una acción directa del chofer o en el montaje inicial del componente.
 * Support nativo para la opción temporal "Solo esta vez".
 *
 * @returns {Promise<boolean>} True si se obtienen los permisos mínimos en primer plano para operar.
 */
export const verificarHardwareGPS = async () => {
  try {
    const gpsActivado = await Location.hasServicesEnabledAsync();
    if (!gpsActivado) return false;

    let { status: foreStatus, canAskAgain } =
      await Location.getForegroundPermissionsAsync();

    // Solicitar activamente primer plano si no está concedido y es posible preguntar de nuevo
    if (foreStatus !== "granted" && canAskAgain) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      foreStatus = status;
    }

    if (foreStatus !== "granted") return false;

    // Se intenta solicitar el permiso en segundo plano de manera no bloqueante.
    // Si el chofer lo rechaza pero otorgó primer plano ("Solo esta vez"), la aplicación operará
    // a través de la notificación persistente del Foreground Service configurada en Location.startLocationUpdatesAsync.
    try {
      const { status: backStatus, canAskAgain: canAskAgainBg } =
        await Location.getBackgroundPermissionsAsync();
      if (backStatus !== "granted" && canAskAgainBg) {
        await Location.requestBackgroundPermissionsAsync();
      }
    } catch (bgError) {
      console.warn(
        "[GPS-Hardware] Error no-bloqueante al gestionar permisos en segundo plano:",
        bgError.message,
      );
    }

    return foreStatus === "granted";
  } catch (error) {
    console.error(
      "[GPS-Hardware] Error crítico al verificar hardware e interactuar con permisos:",
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

    // Se asume que las validaciones previas ya garantizaron los permisos requeridos
    await Location.startLocationUpdatesAsync(TASK_GPS, {
      accuracy: Location.Accuracy.BestForNavigation,
      distanceInterval: 10,
      deferredUpdatesInterval: 5000,
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

/**
 * Detiene el tracking de geolocalización liberando recursos de hardware.
 */
export const detenerTrackingGPS = async () => {
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(TASK_GPS);
  if (hasStarted) {
    await Location.stopLocationUpdatesAsync(TASK_GPS);
    console.log("[GPS-Service] Hilo nativo liberado.");
  }
};
