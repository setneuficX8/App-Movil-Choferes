import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { iniciarTrackingGPS, detenerTrackingGPS } from '../services/geolocalizacionService';
import { obtenerMetricasLocales } from '../database/posicionesQueries';
import { STORAGE_KEYS } from '../config/constanst'; // INCLUSIÓN OBLIGATORIA

const ComponentePruebaRutas = () => {
  const [trackingActivo, setTrackingActivo] = useState(false);
  const [recorridoId, setRecorridoId] = useState('');
  const [totalLocales, setTotalLocales] = useState(0);
  const [pendientesSupabase, setPendientesSupabase] = useState(0);
  const [pendientesAPI, setPendientesAPI] = useState(0);

  const refrescarInterfaz = async () => {
    try {
      const metricas = await obtenerMetricasLocales();
      setTotalLocales(metricas.total);
      setPendientesSupabase(metricas.supPendientes);
      setPendientesAPI(metricas.apiPendientes);
    } catch (error) {
      console.error('[ComponentePrueba] Error actualizando UI:', error);
    }
  };

  useEffect(() => {
    refrescarInterfaz();
    const timer = setInterval(refrescarInterfaz, 3000); // Polling aceptable solo para modo debug
    return () => clearInterval(timer);
  }, []);

  const ejecutarInicio = async () => {
    try {
      const idSimulado = Crypto.randomUUID();
      
      await AsyncStorage.setItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID, idSimulado);
      setRecorridoId(idSimulado);
      
      await iniciarTrackingGPS();
      setTrackingActivo(true);
      Alert.alert('Iniciado', `ID asignado al viaje: ${idSimulado}`);
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const ejecutarParada = async () => {
    try {
      await detenerTrackingGPS();
     
      await AsyncStorage.removeItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID);
      setRecorridoId('');
      setTrackingActivo(false);
      Alert.alert('Detenido', 'El hilo del GPS se ha cerrado.');
    } catch (error) {
      console.error(error);
    }
  };

  // ... (El resto del render JSX se mantiene exactamente igual) ...
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Auditoría Interna SQLite</Text>
      
      <View style={styles.metricsContainer}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{totalLocales}</Text>
          <Text style={styles.metricLabel}>Total Registros</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{pendientesSupabase}</Text>
          <Text style={styles.metricLabel}>Pendientes Supabase</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Pendientes API</Text>
          <Text style={styles.metricValue}>{pendientesAPI}</Text>
        </View>
      </View>

      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          ESTADO: {trackingActivo ? '🟢 REGISTRANDO COORDENADAS' : '🔴 HARDWARE DORMIDO'}
        </Text>
        {trackingActivo && <Text style={styles.recorridoText}>Active UUID: {recorridoId}</Text>}
      </View>

      <View style={styles.buttonsContainer}>
        <TouchableOpacity 
          style={[styles.buttonStart, trackingActivo && styles.buttonDisabled]} 
          onPress={ejecutarInicio}
          disabled={trackingActivo}
        >
          <Text style={styles.buttonText}>1. ENTRAR EN RUTA (BACKGROUND)</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.buttonStop, !trackingActivo && styles.buttonDisabled]} 
          onPress={ejecutarParada}
          disabled={!trackingActivo}
        >
          <Text style={styles.buttonTextStop}>2. TERMINAR RUTA Y LIBERAR HILO</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#0C0F12', padding: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 25 },
  metricsContainer: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25 },
  metricCard: { flex: 1, backgroundColor: '#171C22', borderRadius: 8, padding: 15, marginHorizontal: 4, alignItems: 'center', borderWidth: 1, borderColor: '#242C35' },
  metricValue: { fontSize: 24, fontWeight: 'bold', color: '#10B981' },
  metricLabel: { fontSize: 10, color: '#8892B0', textAlign: 'center', marginTop: 5 },
  statusContainer: { backgroundColor: '#171C22', padding: 15, borderRadius: 6, width: '100%', alignItems: 'center', marginBottom: 25, borderWidth: 1, borderColor: '#242C35' },
  statusText: { fontSize: 13, fontWeight: 'bold', color: '#FFFFFF' },
  recorridoText: { fontSize: 10, color: '#5A6E85', marginTop: 5 },
  buttonsContainer: { width: '100%' },
  buttonStart: { backgroundColor: '#FFFFFF', paddingVertical: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  buttonStop: { backgroundColor: '#EF4444', paddingVertical: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  buttonDisabled: { opacity: 0.2 },
  buttonText: { color: '#000000', fontWeight: 'bold', fontSize: 13 },
  buttonTextStop: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 }
});

export default ComponentePruebaRutas;