import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  useWindowDimensions
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import MapboxGL from "@rnmapbox/maps";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withRepeat 
} from "react-native-reanimated";

import { obtenerRecorridos, obtenerPosicionesGPS } from "../database/mapaQueries";
import MapaSelector from "../components/MapaSelector";
import MapaEstadisticas from "../components/MapaEstadisticas";

/**
 * Skeleton Loader Pulsante.
 * Reemplaza el ActivityIndicator tradicional ofreciendo una transición visual suave.
 */
const MapaSkeleton = ({ insets }) => {
  const pulseValue = useSharedValue(0.4);

  useEffect(() => {
    pulseValue.value = withRepeat(
      withTiming(0.85, { duration: 1000 }),
      -1, // Infinito
      true // Reversa en cada ciclo
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulseValue.value,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.skeletonMapCanvas} />
      <View style={[styles.floatingTopPanel, { top: insets.top + 10 }]}>
        <Animated.View style={[styles.skeletonHeader, animatedStyle]} />
        <Animated.View style={[styles.skeletonSelector, animatedStyle]} />
      </View>
      <Animated.View style={[styles.skeletonFab, animatedStyle]} />
    </View>
  );
};

export default function MapaRecorrido() {
  const camera = useRef(null);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

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

  // Estados del Drawer y telemetría de apoyo
  const [mostrarEstadisticas, setMostrarEstadisticas] = useState(false);
  const [cantidadPuntos, setCantidadPuntos] = useState(0);
  const [velocidadActualMs, setVelocidadActualMs] = useState(0);

  // Valor compartido para fade-in de mapa nativo
  const mapOpacity = useSharedValue(0);

  useEffect(() => {
    const inicializarModuloYDatos = async () => {
      try {
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
      await cargarRecorridos();
    };

    inicializarModuloYDatos();
  }, []);

  // Animación del mapa al finalizar la carga
  useEffect(() => {
    if (!loading && tokenValidado) {
      mapOpacity.value = withTiming(1, { duration: 500 });
    }
  }, [loading, tokenValidado]);

  const animatedMapStyle = useAnimatedStyle(() => ({
    opacity: mapOpacity.value,
    ...StyleSheet.absoluteFillObject
  }));

  async function cargarRecorridos() {
    try {
      setLoading(true);
      const lista = await obtenerRecorridos();
      setRecorridos(lista);

      if (lista.length > 0) {
        await seleccionarRecorrido(lista[0]);
      }
    } catch (e) {
      console.error("[Data-Load] Error al consultar base de datos:", e.message);
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

      if (gps.geojson?.features?.[0]?.geometry?.coordinates) {
        const coordinates = gps.geojson.features[0].geometry.coordinates;
        setCantidadPuntos(coordinates.length);
        setVelocidadActualMs(recorrido.velocidad_ms || 0);
      } else {
        setCantidadPuntos(0);
        setVelocidadActualMs(0);
      }

      setGeojsonRuta({
        type: "Feature",
        geometry: recorrido.Rutas.shape,
      });

      if (gps.inicio && gps.fin) {
        camera.current?.fitBounds(gps.inicio, gps.fin, 80, 1000);
      }
    } catch (e) {
      console.error("[Selection-Error] Error procesando coordenadas:", e.message);
    }
  }

  const abrirEstadisticasConHaptic = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMostrarEstadisticas(true);
  };

  const cerrarEstadisticasConHaptic = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMostrarEstadisticas(false);
  };

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

  // Renderizado del Skeleton animado mientras se resuelven las promesas
  if (loading || !tokenValidado) {
    return <MapaSkeleton insets={insets} />;
  }

  return (
    <View style={styles.container}>
      
      {/* CAPA MAPA: ANIMADA CON FADE-IN SUAVE EN HILO DE RENDERIZACIÓN EXCLUSIVO */}
      <Animated.View style={animatedMapStyle}>
        <MapboxGL.MapView
          style={StyleSheet.absoluteFillObject}
          logoEnabled={false}
          compassEnabled
          scaleBarEnabled
          styleURL={MapboxGL.StyleURL.Street}
        >
          <MapboxGL.Camera
            ref={camera}
            zoomLevel={14}
            centerCoordinate={[-77.0311, 3.8801]}
          />

          {/* RUTA PLANIFICADA */}
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

          {/* COORDENADAS RECOLECTADAS */}
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

          {/* INICIO */}
          {inicio && (
            <MapboxGL.PointAnnotation id="inicio" coordinate={inicio}>
              <View style={styles.inicio} />
            </MapboxGL.PointAnnotation>
          )}

          {/* FIN */}
          {fin && (
            <MapboxGL.PointAnnotation id="fin" coordinate={fin}>
              <View style={styles.fin} />
            </MapboxGL.PointAnnotation>
          )}
        </MapboxGL.MapView>
      </Animated.View>

      {/* CONTROLES SUPERIORES FLOTANTES (CORREGIDO: AJUSTADO MEDIANTE SAFE AREA INSETS) */}
      <View style={[styles.floatingTopPanel, { top: insets.top + 10 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.8}
            onPress={() => navigation.goBack()}
          >
            <MaterialCommunityIcons name="arrow-left" color="#38BDF8" size={22} />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.kicker}>HISTORIAL GPS</Text>
            <Text style={styles.titulo}>MAPA DE RECORRIDOS</Text>
          </View>
        </View>

        <View style={styles.compactSelectorCard}>
          <MapaSelector
            recorridos={recorridos}
            seleccionado={recorridoSeleccionado}
            onSeleccionar={seleccionarRecorrido}
          />
        </View>
      </View>

      {/* ACCIÓN FLOTANTE (FAB) */}
      <TouchableOpacity
        style={styles.fabButton}
        activeOpacity={0.85}
        onPress={abrirEstadisticasConHaptic}
      >
        <MaterialCommunityIcons name="chart-box-outline" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* BOTTOM SHEET/DRAWER DE TELEMETRÍA */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={mostrarEstadisticas}
        onRequestClose={cerrarEstadisticasConHaptic}
      >
        <View style={styles.drawerOverlay}>
          <TouchableOpacity 
            style={styles.drawerDismissOverlay}
            activeOpacity={1}
            onPress={cerrarEstadisticasConHaptic}
          />
          
          <View style={[styles.drawerContainer, { maxHeight: height * 0.75 }]}>
            <View style={styles.drawerHandle} />
            
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>DETALLES DEL VIAJE</Text>
              <TouchableOpacity
                style={styles.drawerCloseButton}
                onPress={cerrarEstadisticasConHaptic}
              >
                <MaterialCommunityIcons name="close" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView 
              contentContainerStyle={styles.drawerScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <MapaEstadisticas 
                recorrido={recorridoSeleccionado} 
                cantidadPuntos={cantidadPuntos}
                velocidadActualMs={velocidadActualMs}
              />

              <View style={styles.legendContainer}>
                <Text style={styles.legendTitle}>LEYENDA GEOGRÁFICA</Text>
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendCircle, { backgroundColor: "#2563eb" }]} />
                    <Text style={styles.legendText}>Ruta Oficial</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendCircle, { backgroundColor: "#10B981" }]} />
                    <Text style={styles.legendText}>Recorrido GPS</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  
  // Estructuras de Skeletons Animados
  skeletonMapCanvas: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0E1217",
  },
  skeletonHeader: {
    height: 58,
    backgroundColor: "#151B22",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#22303B",
    marginBottom: 8,
  },
  skeletonSelector: {
    height: 64,
    backgroundColor: "#151B22",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#22303B",
  },
  skeletonFab: {
    position: "absolute",
    bottom: 30,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#151B22",
    borderWidth: 1,
    borderColor: "#22303B",
  },

  // Panel Flotante Superior
  floatingTopPanel: {
    position: "absolute",
    left: "4%",
    right: "4%",
    zIndex: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(11, 16, 23, 0.88)",
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#22303B",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#11161D",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#22303B",
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: 12,
  },
  kicker: {
    color: "#38BDF8",
    fontWeight: "800",
    fontSize: 9,
    letterSpacing: 1.5,
  },
  titulo: {
    fontSize: 16,
    fontWeight: "900",
    color: "white",
    marginTop: 1,
  },
  compactSelectorCard: {
    backgroundColor: "rgba(17, 22, 29, 0.92)",
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: "#22303B",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },

  // Marcadores de Capa de Mapa
  inicio: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#10b981",
    borderWidth: 2.5,
    borderColor: "white",
  },
  fin: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#ef4444",
    borderWidth: 2.5,
    borderColor: "white",
  },

  // Botón Acción Flotante (FAB)
  fabButton: {
    position: "absolute",
    bottom: 30,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },

  // Cajón Deslizable Bottom Sheet
  drawerOverlay: {
    flex: 1,
    backgroundColor: "rgba(5, 7, 10, 0.65)",
    justifyContent: "flex-end",
  },
  drawerDismissOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  drawerContainer: {
    width: "100%",
    backgroundColor: "#11161D",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "#22303B",
    borderBottomWidth: 0,
    paddingBottom: 20,
    zIndex: 2,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
  drawerHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#374151",
    alignSelf: "center",
    marginTop: 10,
  },
  drawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  drawerTitle: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  drawerCloseButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#1F2937",
    justifyContent: "center",
    alignItems: "center",
  },
  drawerScrollContent: {
    paddingHorizontal: 8,
  },

  // Contenedor de Leyendas
  legendContainer: {
    backgroundColor: "#151B22",
    marginHorizontal: 15,
    marginTop: 4,
    marginBottom: 20,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#22303B",
  },
  legendTitle: {
    color: "#9CA3AF",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 10,
    textAlign: "center",
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 30,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendText: {
    color: "#D1D5DB",
    fontSize: 12,
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