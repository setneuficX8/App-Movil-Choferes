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
import { AppNavigator } from "./src/navegacion/AppNavigator";
import "./src/tasks/locationTask";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";

function MainApp() {
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

  const { theme } = useTheme();

  if (inicializando) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
          Verificando Integridad de Datos e Identidad...
        </Text>
      </View>
    );
  }

  return <AppNavigator />;
}

export default function App() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 13,
    marginTop: 15,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
});
