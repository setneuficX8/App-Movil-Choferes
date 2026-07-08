import React, { useEffect, useState } from "react";
import { StyleSheet, View, Text, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initLocalDatabase } from "./src/database/dbSetup";
import { supabase } from "./src/config/constanst";
import { AppNavigator } from "./src/navegacion/AppNavigator";
import "./src/tasks/locationTask";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";

const BIOMETRIA_STORAGE_KEY = "@biometria_enabled";

function MainApp() {
  const [inicializando, setInicializando] = useState(true);
  const [sesionActiva, setSesionActiva] = useState(null);
  const [requiresBiometrics, setRequiresBiometrics] = useState(false);

  useEffect(() => {
    ejecutarInicializacionDelSistema();
  }, []);

  const ejecutarInicializacionDelSistema = async () => {
    try {
      // 1. Inicializar la estructura local de SQLite
      await initLocalDatabase();

      // 2. Comprobar si existe sesión activa persistida en Supabase Auth
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        setSesionActiva(session);
        console.log(
          "[App] Sesión de Supabase activa detectada:",
          session.user.email,
        );

        // 3. Comprobar si el chofer activó la seguridad biométrica de antemano
        const biometriaFlag = await AsyncStorage.getItem(BIOMETRIA_STORAGE_KEY);
        if (biometriaFlag === "true") {
          setRequiresBiometrics(true);
        }
      }
    } catch (error) {
      console.error(
        "[App] Fallo crítico durante el arranque del sistema:",
        error,
      );
    } finally {
      setInicializando(false);
    }
  };

  const { theme } = useTheme();

  if (inicializando) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text
          style={[styles.loadingText, { color: theme.colors.textSecondary }]}
        >
          Validando Integridad de Datos e Identidad...
        </Text>
      </View>
    );
  }

  return (
    <AppNavigator
      session={sesionActiva}
      requiresBiometrics={requiresBiometrics}
    />
  );
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
