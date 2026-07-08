import * as LocalAuthentication from "expo-local-authentication";

/**
 * Comprueba si el dispositivo cuenta con hardware biométrico compatible.
 * Aplica tolerancia adaptativa para reconocimiento facial de Clase 2 (Android)
 * y políticas de seguridad restrictivas en iOS.
 *
 * @returns {Promise<boolean>} True si el dispositivo es apto para operar con biometría o PIN de respaldo.
 */
export const verificarHardware = async () => {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) {
      console.warn(
        "[BiometriaService] El dispositivo carece de hardware biométrico compatible.",
      );
      return false;
    }

    // Consultamos qué tipos de autenticación admite físicamente el dispositivo
    const tiposSoportados =
      await LocalAuthentication.supportedAuthenticationTypesAsync();
    const soportaFacial = tiposSoportados.includes(
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
    );

    const tieneRegistros = await LocalAuthentication.isEnrolledAsync();

    // REFACTORIZACIÓN DE COMPENSACIÓN:
    // Si isEnrolledAsync() devuelve false pero el dispositivo soporta identificación facial,
    // permitimos continuar. Esto evita el bloqueo en dispositivos donde el escaneo facial es
    // considerado "Débil" por el S.O. pero es totalmente válido para el prompt nativo con fallback a PIN.
    if (!tieneRegistros) {
      if (soportaFacial) {
        console.warn(
          "[BiometriaService] isEnrolledAsync devolvió false pero el hardware admite identificación facial. " +
            "Se habilita el acceso delegando el control de verificación y fallback al prompt nativo del S.O.",
        );
        return true;
      }
      console.warn(
        "[BiometriaService] El dispositivo no tiene huellas ni rostros registrados.",
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "[BiometriaService] Error durante la auditoría de hardware biométrico:",
      error.message,
    );
    return false;
  }
};

/**
 * Ejecuta la pasarela nativa de autenticación del sistema operativo.
 * Si la biometría falla o no está completamente enrolada a nivel fuerte,
 * se despliega de forma transparente el PIN, Patrón o Contraseña del dispositivo.
 *
 * @returns {Promise<{success: boolean, error: string | null}>} Objeto de control de estado.
 */
export const autenticarChofer = async () => {
  try {
    const options = {
      promptMessage:
        "Identifíquese para acceder al panel de control del vehículo",
      fallbackLabel: "Ingresar PIN de seguridad",
      disableDeviceFallback: false, // OBLIGATORIO: Permite usar el PIN/Patrón si el rostro/huella falla
      cancelLabel: "Cancelar",
    };

    const result = await LocalAuthentication.authenticateAsync(options);

    if (result.success) {
      return { success: true, error: null };
    } else {
      return {
        success: false,
        error: result.error || "Proceso de autenticación cancelado o fallido.",
      };
    }
  } catch (error) {
    console.error(
      "[BiometriaService] Error crítico durante la lectura nativa:",
      error.message,
    );
    return {
      success: false,
      error: error.message || "Error interno del módulo biométrico.",
    };
  }
};
