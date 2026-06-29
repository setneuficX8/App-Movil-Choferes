import * as ImageManipulator from "expo-image-manipulator";
import { IMAGEN_CONFIG } from "../config/constanst";

/**
 * Procesa una imagen en bruto a través de un pipeline de optimización estricto.
 * @param {string} localUri La ruta temporal de la imagen capturada por expo-camera.
 * @returns {Promise<string>} La imagen procesada y codificada en Base64.
 */
export const procesarImagenOptimizada = async (localUri) => {
  if (!localUri) throw new Error("Violación de entrada: URI de imagen nula.");

  try {
    // 1. Ejecutar el pipeline de manipulación en el hilo nativo
    const resultadoManipulacion = await ImageManipulator.manipulateAsync(
      localUri,
      [
        {
          resize: {
            width: IMAGEN_CONFIG.MAX_LADO_PX,
            // Al omitir 'height', expo-image-manipulator mantiene la proporción isométrica
          },
        },
      ],
      {
        compress: IMAGEN_CONFIG.CALIDAD_EXPO,
        format: ImageManipulator.SaveFormat.WEBP,
        base64: true, // EXIGENCIA CRÍTICA: Retornar Base64 para evitar I/O adicional
      },
    );

    if (!resultadoManipulacion.base64) {
      throw new Error("Fallo del transcodificador: Base64 vacío.");
    }

    // El servidor y Supabase requieren frecuentemente el prefijo Data URI
    return `data:image/webp;base64,${resultadoManipulacion.base64}`;
  } catch (error) {
    console.error(
      "[camaraService] Colapso en el procesamiento de imagen:",
      error,
    );
    throw new Error("No se pudo optimizar la evidencia fotográfica.");
  }
};
