import { supabase } from "../config/constanst";
import { STORAGE_KEYS } from "../config/constanst";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Este servicio se encarga de la autentificacion a supabase
export const authService = {
  /**
   *
   * @param {string} email
   * @param {string} password
   * @returns {Promise<Object>} Datos del usuario autenticado.
   */
  iniciarSesion: async (email, password) => {
    //  Limpieza de entradas básicas (Seguridad preventiva)
    if (!email || !password) {
      throw new Error(
        "El correo electrónico y la contraseña son obligatorios.",
      );
    }

    const emailLimpio = email.trim().toLowerCase();

    //  Ejecución del puente nativo de Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailLimpio,
      password: password,
    });

    // Si Supabase devuelve un error (credenciales inválidas, usuario inexistente), abortamos inmediatamente
    if (error) {
      throw new Error(`Error de autenticación: ${error.message}`);
    }

    const usuario = data.user;
    if (!usuario) {
      throw new Error(
        "Estructura de respuesta inválida: No se recibió un objeto de usuario.",
      );
    }

    await AsyncStorage.setItem(STORAGE_KEYS.CHOFER_ACTIVO_ID, usuario.id);

    console.log(
      `[AuthService] Chofer autenticado y guardado en almacenamiento persistente: ${usuario.id}`,
    );
    return usuario;
  },

  //
  cerrarSesion: async () => {
    try {
      await supabase.auth.signOut();
      await AsyncStorage.removeItem(STORAGE_KEYS.CHOFER_ACTIVO_ID);
      await AsyncStorage.removeItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID); // Limpieza preventiva ante cierres forzados
      console.log("[AuthService] Sesión destruida limpiamente.");
    } catch (error) {
      console.error(
        "[AuthService] Error durante el cierre de sesión:",
        error.message,
      );
    }
  },
};
