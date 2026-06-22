// Aquí se ponen cosas como el perfil_id, supabase, la api del profe y lo que falte.
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native"; // para detectar cuando la app pasa a segundo plano o vuelve a primer plano
import "react-native-url-polyfill/auto"; // para que supabase funcione correctamente en React Native
import AsyncStorage from "@react-native-async-storage/async-storage"; // para almacenar el token de autenticación de supabase

// credenciales de supabase (usando variables de entorno de Expo)
const supabaseUrl = "https://yktyfiapcjsqdtrtmtqb.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrdHlmaWFwY2pzcWR0cnRtdHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMzEyMTYsImV4cCI6MjA3NDYwNzIxNn0.xeRt11ehYqHdwy9FHBw4cdZhsWcj8X3pYBWS-Vq4azY";

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

export const PERFIL_ID = "4380dc46-398b-441c-a1f1-2567795e8234";
export const TASK_GPS = "BACKGROUND_LOCATION_TASK";

export const STORAGE_KEYS = {
  RECORRIDO_ACTIVO_ID: "recorrido_activo_id",
  CHOFER_ACTIVO_ID: "chofer_activo_id",
};
