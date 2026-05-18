import React, { useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}> App Recolección Demo</Text>
        <Text style={styles.subtitle}>Prueba de Configuración Android</Text>

        <View style={styles.card}>
          <Text style={styles.counterText}>Contador: {count}</Text>
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

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>Por fin funcionas HDP</Text>
        </View>
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
    justifyContent: "center",
    padding: 20,
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
    marginBottom: 40,
  },
  card: {
    backgroundColor: "#1E1E1E",
    borderRadius: 15,
    padding: 30,
    width: "100%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  counterText: {
    fontSize: 48,
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
  infoBox: {
    marginTop: 40,
    padding: 15,
    backgroundColor: "#333333",
    borderRadius: 8,
  },
  infoText: {
    color: "#FFFFFF",
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
});
