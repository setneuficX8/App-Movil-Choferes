import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, DeviceEventEmitter } from 'react-native';
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { EVENTOS, STORAGE_KEYS } from '../config/constanst';
import { insertarHitoLocal } from "../database/hitosQueries";
import { PruebaCamaraHito } from './PruebaCamaraHito'; // Importación crítica de la cámara
import { useTheme } from '../context/ThemeContext';

export const ModalHito = () => {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  const [isVisible, setIsVisible] = useState(false);
  const [datosHito, setDatosHito] = useState(null);
  const [modoCamara, setModoCamara] = useState(false); // Switch de estado de la interfaz

  useEffect(() => {
    const suscripcion = DeviceEventEmitter.addListener(EVENTOS.HITO_ALCANZADO, (payload) => {
      setDatosHito(payload);
      setModoCamara(false); // Asegurar que inicie en el diálogo
      setIsVisible(true);
    });

    return () => suscripcion.remove();
  }, []);

  // Función de Persistencia Transaccional (Búfer Offline)
  const persistirHito = async (base64Optimizada = null) => {
    try {
      const recorridoIdLocal = await AsyncStorage.getItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID);
      const ultimaUbicacionStr = await AsyncStorage.getItem(STORAGE_KEYS.ULTIMA_UBICACION);
      
      if (!recorridoIdLocal || !ultimaUbicacionStr) {
        throw new Error("Pérdida de contexto geográfico.");
      }

      const { latitud, longitud } = JSON.parse(ultimaUbicacionStr);
      const hitoId = Crypto.randomUUID();

      await insertarHitoLocal({
        id: hitoId,
        recorrido_id: recorridoIdLocal,
        numero_hito: datosHito.numero_hito,
        km_acumulado: datosHito.km_acumulado,
        latitud,
        longitud,
        tiene_foto: !!base64Optimizada,
        foto_base64: base64Optimizada
      });

      console.log(`[ModalHito] Hito ${datosHito.numero_hito} guardado en SQLite.`);
    } catch (error) {
      console.error("[ModalHito] Fallo estructural al persistir el hito:", error);
    } finally {
      // Liberación de recursos y desmontaje visual
      setModoCamara(false);
      setIsVisible(false);
    }
  };

  if (!isVisible) return null;

  // ESTADO B: CÁMARA ACTIVA
  if (modoCamara) {
    return (
      <Modal transparent={false} animationType="slide" visible={isVisible}>
        <PruebaCamaraHito 
          onFotoCapturada={(base64) => persistirHito(base64)} // Inyección del Callback 1
          onCancelar={() => setModoCamara(false)}             // Inyección del Callback 2
        />
      </Modal>
    );
  }

  // ESTADO A: DIÁLOGO DE DECISIÓN
  return (
    <Modal transparent={true} animationType="fade" visible={isVisible}>
      <View style={styles.overlay}>
        <View style={styles.dialogBox}>
          <View style={styles.titleRow}>
            <MaterialCommunityIcons name="map-marker-radius" size={22} color="#38BDF8" />
            <Text style={styles.title}>Punto de Control Alcanzado</Text>
          </View>
          <Text style={styles.text}>Has acumulado {datosHito?.km_acumulado.toFixed(2)} km.</Text>
          <Text style={styles.text}>Hito correspondiente al kilómetro: {datosHito?.numero_hito}</Text>

          <Text style={styles.instruction}>¿Deseas capturar evidencia fotográfica de la ruta?</Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.btnSkip} onPress={() => persistirHito(null)}>
              <View style={styles.btnContentRow}>
                <MaterialCommunityIcons name="close-circle-outline" size={16} color="#FFFFFF" />
                <Text style={styles.btnText}>OMITIR</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnCamera} onPress={() => setModoCamara(true)}>
              <View style={styles.btnContentRow}>
                <MaterialCommunityIcons name="camera-outline" size={16} color="#FFFFFF" />
                <Text style={styles.btnText}>TOMAR FOTO</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (theme) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  dialogBox: { backgroundColor: theme.colors.card, padding: 25, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.primary, width: '85%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10, gap: 8 },
  title: { color: theme.colors.text, fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  text: { color: theme.colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 5 },
  instruction: { color: theme.colors.text, fontSize: 14, textAlign: 'center', marginVertical: 20, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  btnSkip: { flex: 1, paddingVertical: 12, backgroundColor: theme.colors.border, borderRadius: 6, alignItems: 'center' },
  btnCamera: { flex: 1, paddingVertical: 12, backgroundColor: '#0EA5E9', borderRadius: 6, alignItems: 'center' },
  btnText: { color: theme.colors.text, fontWeight: 'bold', fontSize: 13 },
  btnContentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});