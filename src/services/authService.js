import { supabase } from "../config/constanst"; // REGLA 12: Usar la instancia unificada
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Servicio encargado de gestionar el ciclo de vida de la autenticación de los choferes.
 */
export const authService = {
  /**
   * Autentica al usuario contra Supabase Auth y persiste su ID de perfil localmente.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<Object>} Datos del usuario autenticado.
   */
  iniciarSesion: async (email, password) => {
    // 1. Limpieza de entradas básicas (Seguridad preventiva)
    if (!email || !password) {
      throw new Error(
        "El correo electrónico y la contraseña son obligatorios.",
      );
    }

    const emailLimpio = email.trim().toLowerCase();

    // 2. Ejecución del puente nativo de Supabase Auth
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

    // 3. Persistencia Síncrona del Contexto para Hilos Nativos
    // Supabase gestiona el JWT de forma interna a través del almacenamiento de constants.js,
    // pero el ID del chofer lo extraemos para evitar que el TaskManager nativo en segundo plano
    // gaste recursos intentando recuperar la sesión asíncronamente en hilos suspendidos.
    await AsyncStorage.setItem("chofer_activo_id", usuario.id);

    console.log(
      `[AuthService] Chofer autenticado y guardado en almacenamiento persistente: ${usuario.id}`,
    );
    return usuario;
  },

  /**
   * Destruye la sesión en el servidor y limpia las banderas locales.
   */
  cerrarSesion: async () => {
    try {
      await supabase.auth.signOut();
      await AsyncStorage.removeItem("chofer_activo_id");
      await AsyncStorage.removeItem("recorrido_activo_id"); // Limpieza preventiva ante cierres forzados
      console.log("[AuthService] Sesión destruida limpiamente.");
    } catch (error) {
      console.error(
        "[AuthService] Error durante el cierre de sesión:",
        error.message,
      );
    }
  },
};
