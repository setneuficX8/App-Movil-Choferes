import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import * as Location from 'expo-location';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { projectPointOnLineString, splitLineAtProjection } from '../utils/geoProjection';

// Intervalo de polling para posición del chofer (ms)
const POSICION_POLL_INTERVAL = 3000;

/**
 * Mapa embebido para la Pantalla de Operación.
 * Muestra la ruta asignada con un efecto de desdibujado progresivo:
 * - La porción ya recorrida se atenúa (gris, opacidad baja)
 * - La porción pendiente se mantiene sólida (azul, opacidad completa)
 * - Un marcador pulsante indica la posición actual del chofer
 *
 * @param {{ rutaShape: object, isActive: boolean, style: object }} props
 */
const MapaOperacion = ({ rutaShape, isActive, style }) => {
  const camera = useRef(null);
  const [tokenListo, setTokenListo] = useState(false);
  const [posicionActual, setPosicionActual] = useState(null);

  // GeoJSON Features para las dos porciones de la ruta
  const [geojsonRecorrida, setGeojsonRecorrida] = useState(null);
  const [geojsonPendiente, setGeojsonPendiente] = useState(null);

  // Animación del marcador pulsante
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withTiming(2.2, { duration: 1200, easing: Easing.out(Easing.ease) }),
      -1,
      true
    );
    pulseOpacity.value = withRepeat(
      withTiming(0, { duration: 1200, easing: Easing.out(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  // Inicializar token de Mapbox
  useEffect(() => {
    const init = async () => {
      try {
        const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
        if (token && token.trim() !== '') {
          await MapboxGL.setAccessToken(token);
          setTokenListo(true);
        }
      } catch (err) {
        console.error('[MapaOperacion] Error al configurar token Mapbox:', err.message);
      }
    };
    init();
  }, []);

  /**
   * Extraer las coordenadas del shape de la ruta.
   * El shape puede venir como GeoJSON geometry directamente o como Feature.
   */
  const extraerCoordenadas = useCallback(() => {
    if (!rutaShape) return null;

    // Si es directamente una geometry con coordinates
    if (rutaShape.coordinates) {
      return rutaShape.coordinates;
    }

    // Si es un Feature
    if (rutaShape.geometry && rutaShape.geometry.coordinates) {
      return rutaShape.geometry.coordinates;
    }

    // Si es un FeatureCollection (tomamos la primera feature)
    if (rutaShape.features && rutaShape.features[0]?.geometry?.coordinates) {
      return rutaShape.features[0].geometry.coordinates;
    }

    return null;
  }, [rutaShape]);

  /**
   * Actualizar la proyección del desdibujado cada vez que la posición cambia.
   */
  const actualizarDesdibujado = useCallback((coords, position) => {
    if (!coords || coords.length < 2 || !position) {
      // Sin posición válida: mostrar toda la ruta como pendiente
      if (coords && coords.length >= 2) {
        setGeojsonRecorrida(null);
        setGeojsonPendiente({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
        });
      }
      return;
    }

    const punto = [position.longitude, position.latitude];
    const { index, projected } = projectPointOnLineString(punto, coords);
    const { traveled, remaining } = splitLineAtProjection(coords, index, projected);

    setGeojsonRecorrida(
      traveled.length >= 2
        ? { type: 'Feature', geometry: { type: 'LineString', coordinates: traveled } }
        : null
    );

    setGeojsonPendiente(
      remaining.length >= 2
        ? { type: 'Feature', geometry: { type: 'LineString', coordinates: remaining } }
        : null
    );
  }, []);

  // Polling de posición del chofer
  useEffect(() => {
    if (!isActive || !tokenListo) return;

    let interval = null;
    let mounted = true;

    const obtenerPosicion = async () => {
      try {
        const location = await Location.getLastKnownPositionAsync();
        if (location && mounted) {
          const pos = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          setPosicionActual(pos);

          // Centrar cámara suavemente
          camera.current?.setCamera({
            centerCoordinate: [pos.longitude, pos.latitude],
            zoomLevel: 15,
            animationDuration: 800,
          });
        }
      } catch (err) {
        console.warn('[MapaOperacion] Error al obtener posición:', err.message);
      }
    };

    // Primera obtención inmediata
    obtenerPosicion();

    // Polling periódico
    interval = setInterval(obtenerPosicion, POSICION_POLL_INTERVAL);

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
    };
  }, [isActive, tokenListo]);

  // Recalcular desdibujado cuando cambia la posición o la ruta
  useEffect(() => {
    const coords = extraerCoordenadas();
    actualizarDesdibujado(coords, posicionActual);
  }, [posicionActual, rutaShape, extraerCoordenadas, actualizarDesdibujado]);

  // Inicialización: mostrar ruta completa como pendiente si no hay posición aún
  useEffect(() => {
    if (!posicionActual) {
      const coords = extraerCoordenadas();
      if (coords && coords.length >= 2) {
        setGeojsonPendiente({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
        });

        // Centrar cámara en el primer punto de la ruta
        if (coords[0]) {
          camera.current?.setCamera({
            centerCoordinate: coords[0],
            zoomLevel: 14,
            animationDuration: 500,
          });
        }
      }
    }
  }, [rutaShape, tokenListo]);

  if (!tokenListo || !rutaShape) {
    return (
      <View style={[styles.container, styles.skeleton, style]}>
        <View style={styles.skeletonPulse} />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <MapboxGL.MapView
        style={StyleSheet.absoluteFillObject}
        logoEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        styleURL={MapboxGL.StyleURL.Street}
        attributionEnabled={false}
      >
        <MapboxGL.Camera
          ref={camera}
          zoomLevel={14}
          centerCoordinate={extraerCoordenadas()?.[0] || [-77.0311, 3.8801]}
          animationDuration={0}
        />

        {/* PORCIÓN YA RECORRIDA — Atenuada */}
        {geojsonRecorrida && (
          <MapboxGL.ShapeSource id="rutaRecorrida" shape={geojsonRecorrida}>
            <MapboxGL.LineLayer
              id="lineaRecorrida"
              style={{
                lineColor: '#6B7280',
                lineWidth: 5,
                lineCap: 'round',
                lineJoin: 'round',
                lineOpacity: 0.25,
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* PORCIÓN PENDIENTE — Sólida */}
        {geojsonPendiente && (
          <MapboxGL.ShapeSource id="rutaPendiente" shape={geojsonPendiente}>
            <MapboxGL.LineLayer
              id="lineaPendiente"
              style={{
                lineColor: '#2563EB',
                lineWidth: 5,
                lineCap: 'round',
                lineJoin: 'round',
                lineOpacity: 1.0,
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* MARCADOR DE POSICIÓN ACTUAL */}
        {posicionActual && (
          <MapboxGL.PointAnnotation
            id="posicionChofer"
            coordinate={[posicionActual.longitude, posicionActual.latitude]}
          >
            <View style={styles.markerContainer}>
              <Animated.View style={[styles.markerPulse, pulseAnimatedStyle]} />
              <View style={styles.markerDot} />
            </View>
          </MapboxGL.PointAnnotation>
        )}
      </MapboxGL.MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  skeleton: {
    backgroundColor: '#0E1217',
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeletonPulse: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1F2937',
  },

  // Marcador pulsante
  markerContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerPulse: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(37, 99, 235, 0.35)',
  },
  markerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#2563EB',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});

export default React.memo(MapaOperacion);
