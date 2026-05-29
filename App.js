import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";

import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
} from "react-native";

import { obtenerCalles } from "./src/servicios/calleService";

export default function App() {
  const [count, setCount] = useState(0);

  const [calles, setCalles] = useState([]);

  useEffect(() => {
    cargarCalles();
  }, []);

  const cargarCalles = async () => {
    try {
      const response = await obtenerCalles();

      console.log("RESPUESTA COMPLETA:", response);
      console.log("SOLO ARRAY:", response.data);

      setCalles(response.data);
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>
          App Recolección Demo
        </Text>

        <Text style={styles.subtitle}>
          Prueba API REST
        </Text>

        <View style={styles.card}>
          <Text style={styles.counterText}>
            Contador: {count}
          </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.buttonDecrement]}
              onPress={() => setCount(count - 1)}
            >
              <Text style={styles.buttonText}>-1</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.buttonIncrement]}
              onPress={() => setCount(count + 1)}
            >
              <Text style={styles.buttonText}>+1</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          Calles desde API
        </Text>

        <FlatList
          data={calles}
          keyExtractor={(item) => item.id}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          renderItem={({ item }) => (
            <View style={styles.streetItem}>
              <Text style={styles.streetText}>
                {item.nombre}
              </Text>
            </View>
          )}
        />

      </View>

      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },

  content: {
    flex: 1,
    alignItems: "center",
    padding: 20,
    marginTop: 50,
  },

  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 10,
  },

  subtitle: {
    fontSize: 16,
    color: "#AAAAAA",
    marginBottom: 20,
  },

  card: {
    backgroundColor: "#1E1E1E",
    borderRadius: 15,
    padding: 30,
    width: "100%",
    alignItems: "center",
    marginBottom: 30,
  },

  counterText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#BB86FC",
    marginBottom: 20,
  },

  buttonContainer: {
    flexDirection: "row",
    gap: 20,
  },

  button: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 10,
    minWidth: 80,
    alignItems: "center",
  },

  buttonIncrement: {
    backgroundColor: "#03DAC6",
  },

  buttonDecrement: {
    backgroundColor: "#CF6679",
  },

  buttonText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#000000",
  },

  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 15,
  },

  streetItem: {
    width: "100%",
    backgroundColor: "#2A2A2A",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },

  streetText: {
    color: "#FFFFFF",
  },
});