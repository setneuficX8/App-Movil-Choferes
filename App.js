import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, View, Text } from "react-native";
import { initLocalDatabase } from "./src/database/dbSetup";
import ComponentePruebaRutas from "./src/components/ComponentePruebaRutas";

export default function App() {
  const [dbLista, setDbLista] = useState(false);

  useEffect(() => {
    prepararBaseDeDatos();
  }, []);

  const prepararBaseDeDatos = async () => {
    try {
      await initLocalDatabase();
      setDbLista(true);
    } catch (error) {
      console.error("Fallo al inicializar la base de datos:", error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {dbLista ? (
        <ComponentePruebaRutas />
      ) : (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>
            Inicializando Almacenamiento Local...
          </Text>
        </View>
      )}
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0C0F12" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { color: "#FFFFFF", fontSize: 16, fontWeight: "bold" },
});
