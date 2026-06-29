import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, DeviceEventEmitter } from 'react-native';
import { EVENTOS,STORAGE_KEYS } from '../config/constanst';
import { insertarHitoLocal } from "../database/hitosQueries";

export const ModalHito = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [datosHito, setDatosHito] = useState(null);

  useEffect(() => {
    // Suscripción al evento del hilo en segundo plano
    const suscripcion = DeviceEventEmitter.addListener(EVENTOS.HITO_ALCANZADO, (payload) => {
      setDatosHito(payload);
      setIsVisible(true);
    });

    return () => suscripcion.remove(); // Prevención de fugas de memoria
  }, []);

 const persistirHito = async (base64Optimizada = null) => {
  try {
    const recorridoIdLocal = await AsyncStorage.getItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID);
    const ultimaUbicacionStr = await AsyncStorage.getItem(STORAGE_KEYS.ULTIMA_UBICACION);
    if (!recorridoIdLocal || !ultimaUbicacionStr) return;

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
  } catch (error) {
    console.error("Fallo al persistir el hito:", error);
  } finally {
    setIsVisible(false); // Liberar interfaz gráfica inmediatamente
  }
};

const handleTomarFoto = async () => {
  // Asumiendo que invocas el flujo de tu stub PruebaCamaraHito y obtienes la cadena
  const base64Optimizada = await abrirCamaraYProcesar(); 
   await persistirHito(base64Optimizada);
  console.log("Integra aquí la cámara de la Tarea 6. Cuando devuelva el base64, llama a persistirHito(base64).");
};

const handleOmitir = async () => {
  await persistirHito(null);
};

  if (!isVisible) return null;

  return (
    <Modal transparent={true} animationType="fade" visible={isVisible}>
      <View style={styles.overlay}>
        <View style={styles.dialogBox}>
          <Text style={styles.title}>📍 Punto de Control Alcanzado</Text>
          <Text style={styles.text}>Has acumulado {datosHito?.km_acumulado.toFixed(2)} km.</Text>
          <Text style={styles.text}>Hito correspondiente al kilómetro: {datosHito?.numero_hito}</Text>

          <Text style={styles.instruction}>¿Deseas capturar evidencia fotográfica de la ruta?</Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.btnSkip} onPress={handleOmitir}>
              <Text style={styles.btnText}>OMITIR</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnCamera} onPress={handleTomarFoto}>
              <Text style={styles.btnText}>📸 TOMAR FOTO</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  dialogBox: { backgroundColor: '#171C22', padding: 25, borderRadius: 12, borderWidth: 1, borderColor: '#38BDF8', width: '85%' },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  text: { color: '#8892B0', fontSize: 14, textAlign: 'center', marginBottom: 5 },
  instruction: { color: '#D1D5DB', fontSize: 14, textAlign: 'center', marginVertical: 20, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  btnSkip: { flex: 1, paddingVertical: 12, backgroundColor: '#4B5563', borderRadius: 6, alignItems: 'center' },
  btnCamera: { flex: 1, paddingVertical: 12, backgroundColor: '#0EA5E9', borderRadius: 6, alignItems: 'center' },
  btnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
});