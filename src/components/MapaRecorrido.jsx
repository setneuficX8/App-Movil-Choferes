import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Text,
  TouchableOpacity,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import MapboxGL from "@rnmapbox/maps";
import { useNavigation } from "@react-navigation/native";
import {
  obtenerRecorridos,
  obtenerPosicionesGPS,
} from "../database/mapaQueries";

import MapaSelector from "../components/MapaSelector";
import MapaEstadisticas from "../components/MapaEstadisticas";

export default function MapaRecorrido() {
  const camera = useRef(null);
  const navigation = useNavigation();

  // Estados de control para aserciones JIT de Mapbox
  const [tokenValidado, setTokenValidado] = useState(false);
  const [errorToken, setErrorToken] = useState(false);

  // Estados de carga de datos y geometrías
  const [loading, setLoading] = useState(true);
  const [recorridos, setRecorridos] = useState([]);
  const [recorridoSeleccionado, setRecorridoSeleccionado] = useState(null);
  const [geojsonRecorrido, setGeojsonRecorrido] = useState(null);
  const [geojsonRuta, setGeojsonRuta] = useState(null);
  const [inicio, setInicio] = useState(null);
  const [fin, setFin] = useState(null);

  useEffect(() => {
    const inicializarModuloYDatos = async () => {
      try {
        // 1. Aserción y seteo JIT del Token de Mapbox
        const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
        if (!token || token.trim() === "") {
          throw new Error("El token de acceso de Mapbox no está configurado.");
        }
        await MapboxGL.setAccessToken(token);
        setTokenValidado(true);
      } catch (err) {
        console.error("[Mapbox-Init] Error de inicialización asíncrona:", err.message);
        setErrorToken(true);
      }

      // 2. Cargar datos locales de recorridos
      await cargarRecorridos();
    };

    inicializarModuloYDatos();
  }, []);

  async function cargarRecorridos() {
    try {
      setLoading(true);
      const lista = await obtenerRecorridos();
      setRecorridos(lista);

      if (lista.length > 0) {
        await seleccionarRecorrido(lista[0]);
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }

  async function seleccionarRecorrido(recorrido) {
    setRecorridoSeleccionado(recorrido);
    try {
      const gps = await obtenerPosicionesGPS(recorrido.id);
      setGeojsonRecorrido(gps.geojson);
      setInicio(gps.inicio);
      setFin(gps.fin);

      setGeojsonRuta({
        type: "Feature",
        geometry: recorrido.Rutas.shape,
      });

      if (gps.inicio && gps.fin) {
        camera.current?.fitBounds(gps.inicio, gps.fin, 80, 1000);
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }

  // Intercepción JIT: Si falla la inicialización nativa de Mapbox, se muestra un fallback seguro
  if (errorToken) {
    return (
      <View style={styles.loading}>
        <MaterialCommunityIcons name="alert-circle-outline" size={54} color="#EF4444" />
        <Text style={[styles.titulo, { textAlign: "center", marginTop: 10 }]}>MAPA INHABILITADO</Text>
        <Text style={styles.errorText}>
          No se ha podido inicializar el SDK de Mapbox. El token de acceso es inválido o no está configurado en las variables de entorno.
        </Text>
        <TouchableOpacity
          style={[styles.backButton, { marginTop: 24, marginRight: 0 }]}
          activeOpacity={0.8}
          onPress={() => navigation.goBack()}
        >
          <MaterialCommunityIcons name="arrow-left" color="#38BDF8" size={24} />
        </TouchableOpacity>
      </View>
    );
  }

  // Control de carga unificado
  if (loading || !tokenValidado) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 12, fontWeight: '700' }}>
          {!tokenValidado ? "Sincronizando mapas satelitales..." : "Cargando recorridos locales..."}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.backgroundOrbTop} />
      <View style={styles.backgroundOrbBottom} />

      {/* 1. ENCABEZADO */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.8}
          onPress={() => navigation.goBack()}
        >
          <MaterialCommunityIcons name="arrow-left" color="#38BDF8" size={24} />
        </TouchableOpacity>

        <View>
          <Text style={styles.kicker}>HISTORIAL GPS</Text>
          <Text style={styles.titulo}>MAPA DE RECORRIDOS</Text>
        </View>
      </View>

      {/* 2. CARD DE SELECCIÓN */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>SELECCIÓN</Text>
        <MapaSelector
          recorridos={recorridos}
          seleccionado={recorridoSeleccionado}
          onSeleccionar={seleccionarRecorrido}
        />
      </View>

      {/* 3. CARD DEL MAPA NATIVO */}
      <View style={styles.mapCard}>
        <MapboxGL.MapView
          style={styles.map}
          logoEnabled={false}
          compassEnabled
          scaleBarEnabled
          styleURL={MapboxGL.StyleURL.Street}
        >
          {/* Cámara nativa con cierre automático correcto */}
          <MapboxGL.Camera
            ref={camera}
            zoomLevel={14}
            centerCoordinate={[-77.0311, 3.8801]}
          />

          {/* RUTA OFICIAL */}
          {geojsonRuta && (
            <MapboxGL.ShapeSource id="ruta" shape={geojsonRuta}>
              <MapboxGL.LineLayer
                id="lineaRuta"
                style={{
                  lineColor: "#2563eb",
                  lineWidth: 5,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </MapboxGL.ShapeSource>
          )}

          {/* RECORRIDO */}
          {geojsonRecorrido && (
            <MapboxGL.ShapeSource id="gps" shape={geojsonRecorrido}>
              <MapboxGL.LineLayer
                id="lineaGps"
                style={{
                  lineColor: "#10b981",
                  lineWidth: 5,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </MapboxGL.ShapeSource>
          )}

          {/* MARCADOR INICIO */}
          {inicio && (
            <MapboxGL.PointAnnotation id="inicio" coordinate={inicio}>
              <View style={styles.inicio} />
            </MapboxGL.PointAnnotation>
          )}

          {/* MARCADOR FIN */}
          {fin && (
            <MapboxGL.PointAnnotation id="fin" coordinate={fin}>
              <View style={styles.fin} />
            </MapboxGL.PointAnnotation>
          )}
        </MapboxGL.MapView>
      </View>

      {/* 4. LEYENDA DEL MAPA */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendCircle, { backgroundColor: "#2563eb" }]} />
          <Text style={styles.legendText}>Ruta Oficial</Text>
        </View>

        <View style={styles.legendItem}>
          <View style={[styles.legendCircle, { backgroundColor: "#10B981" }]} />
          <Text style={styles.legendText}>Recorrido GPS</Text>
        </View>
      </View>

      {/* 5. CONTROL DE ESTADÍSTICAS */}
      <MapaEstadisticas recorrido={recorridoSeleccionado} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0D11",
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0A0D11",
    padding: 24,
  },
  header: {
    marginTop: 50,
    marginHorizontal: 20,
    marginBottom: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#11161D",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
    borderWidth: 1,
    borderColor: "#22303B",
  },
  kicker: {
    color: "#38BDF8",
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 2,
  },
  titulo: {
    fontSize: 26,
    fontWeight: "900",
    color: "white",
    marginTop: 5,
  },
  card: {
    marginHorizontal: 15,
    backgroundColor: "#11161D",
    borderRadius: 18,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#22303B",
  },
  cardTitle: {
    color: "#9CA3AF",
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 10,
  },
  backgroundOrbTop: {
    position: "absolute",
    top: -60,
    right: -70,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(56,189,248,.08)",
  },
  backgroundOrbBottom: {
    position: "absolute",
    bottom: 40,
    left: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(16,185,129,.06)",
  },
  mapCard: {
    flex: 1,
    marginHorizontal: 15,
    marginBottom: 15,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#22303B",
    backgroundColor: "#11161D",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 15,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 8,
  },
  map: {
    flex: 1,
  },
  inicio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#10b981",
    borderWidth: 3,
    borderColor: "white",
  },
  fin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ef4444",
    borderWidth: 3,
    borderColor: "white",
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    paddingBottom: 15,
    gap: 30,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    color: "#D1D5DB",
    fontSize: 13,
    fontWeight: "600",
  },
  errorText: {
    color: "#9CA3AF",
    fontSize: 12,
    textAlign: "center",
    marginTop: 10,
    paddingHorizontal: 40,
    lineHeight: 18,
  },
});