import * as TaskManager from "expo-task-manager";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";
import { TASK_GPS, STORAGE_KEYS, EVENTOS } from "../config/constanst";
import { insertarPosicionLocal } from "../database/posicionesQueries";
import { calcularDistanciaHaversine } from "../utils/geoMath";

const UMBRAL_PRECISION_METROS = 20;

TaskManager.defineTask(TASK_GPS, async ({ data, error }) => {
  if (error) return;

  if (data) {
    try {
      const recorridoIdLocal = await AsyncStorage.getItem(
        STORAGE_KEYS.RECORRIDO_ACTIVO_ID,
      );
      if (!recorridoIdLocal) return;

      const location = data.locations[data.locations.length - 1];

      if (location.coords.accuracy > UMBRAL_PRECISION_METROS) {
        return; // Rechazo de ruido
      }

      const latitud = location.coords.latitude;
      const longitud = location.coords.longitude;
      const timestamp_captura = new Date(location.timestamp).toISOString();
      const idCriptografico = Crypto.randomUUID();

      // --- INICIO DE LÓGICA DIFERENCIAL ---
      let kmAcumulado =
        parseFloat(await AsyncStorage.getItem(STORAGE_KEYS.KM_ACUMULADO)) || 0;
      let ultimoHitoKm =
        parseInt(await AsyncStorage.getItem(STORAGE_KEYS.ULTIMO_HITO_KM)) || 0;
      const ultimaUbicacionStr = await AsyncStorage.getItem(
        STORAGE_KEYS.ULTIMA_UBICACION,
      );

      if (ultimaUbicacionStr) {
        const ultimaUbicacion = JSON.parse(ultimaUbicacionStr);
        const deltaKm = calcularDistanciaHaversine(
          ultimaUbicacion.latitud,
          ultimaUbicacion.longitud,
          latitud,
          longitud,
        );
        kmAcumulado += deltaKm;
      }

      // Persistir nuevo estado
      await AsyncStorage.setItem(
        STORAGE_KEYS.KM_ACUMULADO,
        kmAcumulado.toString(),
      );
      await AsyncStorage.setItem(
        STORAGE_KEYS.ULTIMA_UBICACION,
        JSON.stringify({ latitud, longitud }),
      );

      // EVALUACIÓN DEL HITO (¿Cruzamos el umbral del siguiente kilómetro entero?)
      const kmEnteroActual = Math.floor(kmAcumulado);
      if (kmEnteroActual > ultimoHitoKm) {
        // Actualizamos el candado para no disparar dos veces en el mismo kilómetro
        await AsyncStorage.setItem(
          STORAGE_KEYS.ULTIMO_HITO_KM,
          kmEnteroActual.toString(),
        );

        // Disparamos la señal a la interfaz gráfica a través de las fronteras de los hilos
        DeviceEventEmitter.emit(EVENTOS.HITO_ALCANZADO, {
          numero_hito: kmEnteroActual,
          km_acumulado: kmAcumulado,
        });
      }
      // --- FIN DE LÓGICA DIFERENCIAL ---

      await insertarPosicionLocal({
        id: idCriptografico,
        recorrido_id: recorridoIdLocal,
        latitud,
        longitud,
        timestamp_captura,
      });
    } catch (e) {
      console.error("[LocationTask] Falla estructural:", e.message);
    }
  }
});
