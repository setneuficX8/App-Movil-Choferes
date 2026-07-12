import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

/**
 * Componente MapaSelector.
 * Provee la interfaz para alternar entre diferentes recorridos con confirmación háptica.
 */
export default function MapaSelector({ recorridos, seleccionado, onSeleccionar }) {
  const [visible, setVisible] = useState(false);

  function obtenerTitulo(recorrido) {
    if (!recorrido) return "Seleccione un recorrido";
    const ruta = recorrido.Rutas?.nombre_ruta ?? "Ruta";
    const fecha = new Date(recorrido.fecha_inicio);
    return `${ruta} • ${fecha.toLocaleDateString()}`;
  }

  function calcularTiempo(recorrido) {
    if (!recorrido.fecha_fin) {
      return "EN CURSO";
    }
    const inicio = new Date(recorrido.fecha_inicio);
    const fin = new Date(recorrido.fecha_fin);
    const total = Math.floor((fin - inicio) / 1000);
    const horas = Math.floor(total / 3600);
    const minutos = Math.floor((total % 3600) / 60);
    return `${horas}h ${minutos}m`;
  }

  const abrirSelector = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVisible(true);
  };

  const cerrarSelector = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVisible(false);
  };

  const confirmarSeleccion = async (item) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSeleccionar(item);
    setVisible(false);
  };

  function renderItem({ item }) {
    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => confirmarSeleccion(item)}
      >
        <View style={styles.icono}>
          <MaterialCommunityIcons
            name="map-marker-path"
            color="#10b981"
            size={22}
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.nombre}>
            {item.Rutas?.nombre_ruta}
          </Text>
          <Text style={styles.fecha}>
            {new Date(item.fecha_inicio).toLocaleString()}
          </Text>
        </View>

        <View>
          <Text style={[
            styles.estado, 
            { color: item.estado === 'en_curso' ? '#38BDF8' : '#10b981' }
          ]}>
            {item.estado.toUpperCase()}
          </Text>
          <Text style={styles.tiempo}>
            {calcularTiempo(item)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={styles.selector}
        onPress={abrirSelector}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>RECORRIDO</Text>
          <Text style={styles.valor}>{obtenerTitulo(seleccionado)}</Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-down"
          size={24}
          color="#10b981"
        />
      </TouchableOpacity>

      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={cerrarSelector}
      >
        <View style={styles.fondo}>
          <View style={styles.modal}>
            <View style={styles.encabezado}>
              <Text style={styles.titulo}>Seleccione un recorrido</Text>
              <TouchableOpacity onPress={cerrarSelector}>
                <MaterialCommunityIcons
                  name="close"
                  size={24}
                  color="white"
                />
              </TouchableOpacity>
            </View>

            <FlatList
              data={recorridos}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              ItemSeparatorComponent={() => (
                <View style={styles.separator} />
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  selector: {
    backgroundColor: "#11161D",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#23303B",
    flexDirection: "row",
    alignItems: "center"
  },
  label: {
    fontSize: 9,
    fontWeight: "800",
    color: "#38BDF8",
    marginBottom: 4,
    letterSpacing: 1
  },
  valor: {
    fontSize: 13,
    fontWeight: "700",
    color: "white"
  },
  fondo: {
    flex: 1,
    backgroundColor: "rgba(5, 7, 10, 0.75)",
    justifyContent: "flex-end"
  },
  modal: {
    backgroundColor: "#0A0D11",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "#23303B",
    padding: 20,
    height: "75%"
  },
  encabezado: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20
  },
  titulo: {
    fontSize: 16,
    fontWeight: "900",
    color: "white",
    letterSpacing: 0.5
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14
  },
  icono: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    marginRight: 15
  },
  nombre: {
    fontSize: 14,
    fontWeight: "700",
    color: "white"
  },
  fecha: {
    marginTop: 4,
    fontSize: 11,
    color: "#94A3B8"
  },
  estado: {
    fontSize: 10,
    fontWeight: "900",
    textAlign: "right",
    letterSpacing: 0.5
  },
  tiempo: {
    marginTop: 4,
    fontSize: 11,
    color: "#94A3B8",
    textAlign: "right"
  },
  separator: {
    height: 1,
    backgroundColor: "#1F2937"
  }
});