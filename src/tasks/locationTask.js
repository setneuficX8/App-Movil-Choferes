import * as TaskManager from "expo-task-manager";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TASK_GPS, STORAGE_KEYS } from "../config/constanst";
import { insertarPosicionLocal } from "../database/posicionesQueries";

TaskManager.defineTask(TASK_GPS, async ({ data, error }) => {
  if (error) {
    console.error("[LocationTask] ERROR NATIVO DEL OS:", error.message);
    return;
  }

  if (data) {
    try {
      // Intentamos leer el ID
      const recorridoIdLocal = await AsyncStorage.getItem(
        STORAGE_KEYS.RECORRIDO_ACTIVO_ID,
      );

      if (!recorridoIdLocal) {
        console.warn(
          "[LocationTask] ⚠️ ABORTO: No hay ID de recorrido. ¡Verifica el botón de iniciar recorrido en la UI!",
        );
        return; // <--- Aquí es donde apuesto que tu código estaba muriendo.
      }

      const location = data.locations[0];
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
      console.error("[LocationTask] ❌ EXCEPCIÓN CRÍTICA:", e);
    }
  }
});
