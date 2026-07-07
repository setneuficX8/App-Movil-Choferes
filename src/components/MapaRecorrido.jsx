import React, { useEffect, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Text, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../config/constanst';
import { obtenerRutaGeoJSON } from '../database/posicionesQueries';
import { openStreetMapStyle } from '../utils/mapStyle';
import MapboxGL from '@rnmapbox/maps';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

// Validación defensiva para evitar hard-crashes nativos
if (!MAPBOX_TOKEN) {
  console.error("CRÍTICO: El token de Mapbox no se inyectó en el APK.");
  // Mostramos una alerta en lugar de dejar que el mapa rompa la app
  setTimeout(() => Alert.alert("Error de Sistema", "Token de Mapbox no encontrado. Revisa el archivo .env"), 1000);
} else {
  MapboxGL.setAccessToken(MAPBOX_TOKEN);
}

export default function MapaRecorrido() {
  const [rutaGeoJSON, setRutaGeoJSON] = useState(null);
  const [coordenadaInicial, setCoordenadaInicial] = useState([
  -77.0282,
  3.8772,
  ]);
  
  // 2. Estado para controlar si el mapa se ve o no
  const [mostrarMapa, setMostrarMapa] = useState(false); 

  useEffect(() => {
    // Solo cargamos la ruta si el mapa se va a mostrar
    if (mostrarMapa) {
      cargarRuta();
    }
  }, [mostrarMapa]);

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
      
      {/* 3. Botón para alternar la visibilidad */}
      <TouchableOpacity 
        style={styles.botonToggle} 
        onPress={() => setMostrarMapa(!mostrarMapa)}
      >
        <Text style={styles.textoBoton}>
          {mostrarMapa ? 'Ocultar Mapa' : 'Ver Mapa'}
        </Text>
      </TouchableOpacity>

      {/* 4. Renderizado condicional del Mapa */}
      {mostrarMapa && (
        <MapboxGL.MapView
          style={styles.map}
          styleURL={MapboxGL.StyleURL.Street} // Usamos el estilo por defecto de Mapbox
          logoEnabled={false}
        >
          <MapboxGL.Camera
            zoomLevel={15}
            centerCoordinate={coordenadaInicial}
            animationDuration={1000}
          />

          
          {/* Capa de la ruta del GPS */}
          {rutaGeoJSON && rutaGeoJSON.features[0].geometry.coordinates.length > 1 && (
            <MapboxGL.ShapeSource id="rutaSource" shape={rutaGeoJSON}>
              <MapboxGL.LineLayer
                id="rutaLayer"
                style={{
                  lineColor: '#10b981', // El verde de tu UI
                  lineWidth: 5,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            </MapboxGL.ShapeSource>
          )}
        </MapboxGL.MapView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    backgroundColor: '#f9fafb' // Un fondo claro para cuando el mapa esté oculto
  },
  map: { 
    flex: 1 
  },
  botonToggle: {
    backgroundColor: '#10b981',
    padding: 15,
    margin: 15,
    borderRadius: 8,
    alignItems: 'center',
    elevation: 3, // Sombra en Android
    shadowColor: '#000', // Sombra en iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
  },
  textoBoton: { 
    color: 'white', 
    fontWeight: 'bold', 
    fontSize: 16 
  },
});