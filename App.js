import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
} from "react-native";
import { initLocalDatabase } from "./src/database/dbSetup";
import { supabase } from "./src/config/constanst";
import LoginScreen from "./src/components/LoginScreen";
import ComponentePruebaRutas from "./src/components/ComponentePruebaRutas";

export default function App() {
  const [inicializando, setInicializando] = useState(true);
  const [sesionActiva, setSesionActiva] = useState(null);

  useEffect(() => {
    ejecutarInicializacionDelSistema();
  }, []);

  const ejecutarInicializacionDelSistema = async () => {
    try {
      // Inicializar la estructura SQLite local
      await initLocalDatabase();

      //  Verificar de forma síncrona/asíncrona si Supabase retuvo la sesión previa en AsyncStorage
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        setSesionActiva(session.user);
        console.log(
          "[App] Sesión previa recuperada con éxito. Usuario:",
          session.user.email,
        );
      }
    } catch (error) {
      console.error("[App] Fallo crítico durante la inicialización:", error);
    } finally {
      setInicializando(false); // Apagamos la pantalla global de carga
    }
  };

  if (inicializando) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.loadingText}>
          Verificando Integridad de Datos e Identidad...
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {sesionActiva ? (
        // Si hay una sesión válida, cargamos el panel de control para que pueda iniciar los recorridos con RLS habilitado
        <ComponentePruebaRutas />
      ) : (
        // Si no hay sesión, forzamos el paso por la Capa de Identidad
        <LoginScreen onLoginSuccess={(user) => setSesionActiva(user)} />
      )}
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0C0F12" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0C0F12",
  },
  loadingText: {
    color: "#8892B0",
    fontSize: 13,
    marginTop: 15,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
});
