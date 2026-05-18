// Aquí se ponen cosas como el perfil_id, supabase, la api del profe y lo que falte.
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native"; // para detectar cuando la app pasa a segundo plano o vuelve a primer plano
import "react-native-url-polyfill/auto"; // para que supabase funcione correctamente en React Native
import AsyncStorage from "@react-native-async-storage/async-storage"; // para almacenar el token de autenticación de supabase

// credenciales de supabase (usando variables de entorno de Expo)
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Cliente de Supabase para interactuar con la base de datos
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}), // usar AsyncStorage en React Native, y el almacenamiento por defecto en web
    autoRefreshToken: true, // refrescar automáticamente el token de autenticación
    persistSession: true, // persistir la sesión entre recargas de la app
    detectSessionInUrl: false, // no detectar la sesión en la URL (relevante para web)
  },
});

// Escuchar los cambios en el estado de la aplicación para pausar o reanudar el auto-refresh del token de autenticación
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
