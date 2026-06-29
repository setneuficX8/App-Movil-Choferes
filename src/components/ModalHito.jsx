import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, DeviceEventEmitter } from 'react-native';
import { EVENTOS } from '../config/constanst';

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

  const handleTomarFoto = () => {
    // Aquí implementaremos la Tarea 6 (Cámara) en el futuro
    console.log("Procediendo a módulo de cámara para el hito:", datosHito.numero_hito);
    setIsVisible(false);
  };

  const handleOmitir = () => {
    // Tarea 7: Registrar el hito en SQLite sin foto
    console.log("Hito omitido. Registrando hito sin foto en SQLite...");
    setIsVisible(false);
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