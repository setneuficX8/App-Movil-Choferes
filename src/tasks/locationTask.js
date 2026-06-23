import * as TaskManager from "expo-task-manager";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TASK_GPS, STORAGE_KEYS } from "../config/constanst";
import { insertarPosicionLocal } from "../database/posicionesQueries";

// UMBRAL DE TOLERANCIA ESTRICTA: Se descarta cualquier punto con un margen de error superior a 20 metros.
const UMBRAL_PRECISION_METROS = 20;

TaskManager.defineTask(TASK_GPS, async ({ data, error }) => {
  if (error) return; // Silencio en errores de hardware

  if (data) {
    try {
      const recorridoIdLocal = await AsyncStorage.getItem(
        STORAGE_KEYS.RECORRIDO_ACTIVO_ID,
      );
      if (!recorridoIdLocal) return;

      // Extraer siempre la coordenada más reciente del lote del sensor
      const location = data.locations[data.locations.length - 1];

      // FILTRO DE RUIDO GEOMÉTRICO (Signal Noise Rejection)
      if (location.coords.accuracy > UMBRAL_PRECISION_METROS) {
        console.warn(
          `[Hardware GPS] Coordenada rechazada. Nivel de ruido inaceptable: ${location.coords.accuracy}m`,
        );
        return;
      }

      const latitud = location.coords.latitude;
      const longitud = location.coords.longitude;
      const timestamp_captura = new Date(location.timestamp).toISOString();
      const idCriptografico = Crypto.randomUUID();

      await insertarPosicionLocal({
        id: idCriptografico,
        recorrido_id: recorridoIdLocal,
        latitud,
        longitud,
        timestamp_captura,
      });
    } catch (e) {
      console.error("[LocationTask] Excepción de subproceso:", e.message);
    }
  }
});
