import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { procesarImagenOptimizada } from '../services/camaraService';

// ESTE ES UN COMPONENTE DE EJEMPLO PARA CONECTAR EL PIPELINE
// Tu equipo deberá integrar esta lógica en el flujo del Modal de la Tarea 4.
export const PruebaCamaraHito = ({ onFotoCapturada, onCancelar }) => {
  const [permiso, solicitarPermiso] = useCameraPermissions();
  const [procesando, setProcesando] = useState(false);
  const cameraRef = useRef(null);

  if (!permiso) {
    return <View style={styles.center}><ActivityIndicator color="#0ea5e9" /></View>;
  }

  if (!permiso.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.texto}>Acceso a la cámara denegado.</Text>
        <TouchableOpacity style={styles.boton} onPress={solicitarPermiso}>
          <Text style={styles.textoBoton}>Otorgar Permisos</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleTomarFoto = async () => {
    if (!cameraRef.current) return;

    setProcesando(true);
    try {
      // 1. Captura asíncrona nativa
      const fotoCruda = await cameraRef.current.takePictureAsync({
        quality: 1, // Se toma con máxima calidad aquí, se comprime en el pipeline
        base64: false, // NO pedir base64 aquí, colapsaría la RAM antes de manipularla
        exif: false, // Evitar metadata basura
      });

      // 2. Transición de la señal cruda hacia el pipeline de optimización (Tarea 6)
      console.log("[Cámara] Foto bruta capturada. Iniciando reducción...");
      const base64Optimizada = await procesarImagenOptimizada(fotoCruda.uri);
      
      console.log("[Cámara] Optimización exitosa. Tamaño Base64 truncado.");
      
      // 3. Devolver la cadena procesada al componente padre
      onFotoCapturada(base64Optimizada);

    } catch (error) {
      console.error("[Cámara] Error en la secuencia de captura:", error);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" ref={cameraRef}>
        <View style={styles.controls}>
          <TouchableOpacity style={styles.botonSecundario} onPress={onCancelar} disabled={procesando}>
            <Text style={styles.textoBoton}>Cancelar</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.botonCaptura} onPress={handleTomarFoto} disabled={procesando}>
            {procesando ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.textoCaptura}>◉</Text>
            )}
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0C0F12' },
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1, justifyContent: 'flex-end' },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', padding: 30, backgroundColor: 'rgba(0,0,0,0.6)' },
  botonCaptura: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#0EA5E9' },
  textoCaptura: { fontSize: 30, color: '#0EA5E9' },
  botonSecundario: { padding: 15, backgroundColor: '#374151', borderRadius: 8 },
  textoBoton: { color: '#FFFFFF', fontWeight: 'bold' },
  texto: { color: '#fff', marginBottom: 15 }
});