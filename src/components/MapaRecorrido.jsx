import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../config/constanst';
import { obtenerRutaGeoJSON } from '../database/posicionesQueries';
import { openStreetMapStyle } from '../utils/mapStyle';

// MapLibre no requiere token si usas proveedores abiertos
MapLibreGL.setAccessToken(null);

export default function MapaRecorrido() {
  const [rutaGeoJSON, setRutaGeoJSON] = useState(null);
  const [coordenadaInicial, setCoordenadaInicial] = useState([-74.0060, 40.7128]); // Default

  useEffect(() => {
    cargarRuta();
  }, []);

  const cargarRuta = async () => {
    const recorridoId = await AsyncStorage.getItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID);
    if (!recorridoId) return;

    const geojson = await obtenerRutaGeoJSON(recorridoId);
    setRutaGeoJSON(geojson);

    // Si hay puntos en la ruta, centramos la cámara en el último punto
    const coords = geojson.features[0].geometry.coordinates;
    if (coords.length > 0) {
      setCoordenadaInicial(coords[coords.length - 1]);
    }
  };

  return (
    <View style={styles.container}>
      <MapLibreGL.MapView
        style={styles.map}
        styleJSON={JSON.stringify(openStreetMapStyle)}
        logoEnabled={false}
      >
        <MapLibreGL.Camera
          zoomLevel={15}
          centerCoordinate={coordenadaInicial}
          animationDuration={1000}
        />

        {/* Capa de la ruta del GPS */}
        {rutaGeoJSON && rutaGeoJSON.features[0].geometry.coordinates.length > 0 && (
          <MapLibreGL.ShapeSource id="rutaSource" shape={rutaGeoJSON}>
            <MapLibreGL.LineLayer
              id="rutaLayer"
              style={{
                lineColor: '#10b981', // El verde de tu UI
                lineWidth: 5,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapLibreGL.ShapeSource>
        )}
      </MapLibreGL.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});