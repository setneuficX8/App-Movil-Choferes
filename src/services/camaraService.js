import * as ImageManipulator from "expo-image-manipulator";
import { IMAGEN_CONFIG } from "../config/constanst";

export const procesarImagenOptimizada = async (localUri) => {
  if (!localUri) throw new Error("Violación de entrada: URI de imagen nula.");

  try {
    const resultadoManipulacion = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: IMAGEN_CONFIG.MAX_LADO_PX } }],
      {
        compress: IMAGEN_CONFIG.CALIDAD_EXPO,
        format: ImageManipulator.SaveFormat.WEBP,
        base64: true, // Retorna el string alfanumérico directo
      },
    );

    if (!resultadoManipulacion.base64) {
      throw new Error("Fallo del transcodificador: Base64 vacío.");
    }

    // RETORNO DE CADENA PURA: Se remueve el prefijo data:image para cumplir con la API
    return resultadoManipulacion.base64;
  } catch (error) {
    console.error(
      "[camaraService] Colapso en el procesamiento de imagen:",
      error,
    );
    throw new Error("No se pudo optimizar la evidencia fotográfica.");
  }
};
