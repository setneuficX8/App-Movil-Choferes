import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform, AppState, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePreventRemove } from '@react-navigation/native';

import { iniciarNuevoRecorrido, finalizarRecorridoActivo, auditarVigenciaRecorrido } from '../services/recorridoService';
import { iniciarTrackingGPS, detenerTrackingGPS } from '../services/geolocalizacionService';
import { obtenerMetricasLocales } from '../database/posicionesQueries';
import { useNetworkSync } from '../hooks/useNetworkSync';
import { supabase, STORAGE_KEYS, EVENTOS } from '../config/constanst'; 

import Cronometro from './Cronometro';
import { ModalHito } from './ModalHito'; // Asegurar el montaje del escucha global

const PantallaOperacion = () => {
  const [trackingActivo, setTrackingActivo] = useState(false);
  const [procesandoHandshake, setProcesandoHandshake] = useState(false);
  const [configDinamica, setConfigDinamica] = useState(null);
  const [cargandoConfig, setCargandoConfig] = useState(true);
  const [fechaInicioRecorrido, setFechaInicioRecorrido] = useState(null);
  
  // Nuevo estado para telemetría de odómetro visual
  const [distanciaKm, setDistanciaKm] = useState(0);

  const [metricas, setMetricas] = useState({ total: 0, supPendientes: 0, apiPendientes: 0 });

  useNetworkSync();

  usePreventRemove(trackingActivo, () => {
    Alert.alert('Protocolo Activo', 'No puedes abandonar la cápsula de mando con telemetría encendida.');
  });

  const refrescarMétricasBúfer = async () => {
    try {
      const result = await obtenerMetricasLocales();
      setMetricas({ total: result.total, supPendientes: result.supPendientes, apiPendientes: result.apiPendientes });
      
      // EXTRACCIÓN DEL ODÓMETRO GEODÉSICO DESDE ASYNCSTORAGE
      const kmAcumuladosStr = await AsyncStorage.getItem(STORAGE_KEYS.KM_ACUMULADO);
      setDistanciaKm(kmAcumuladosStr ? parseFloat(kmAcumuladosStr) : 0);
    } catch (error) {}
  };

  const obtenerContextoYRestaurarSesion = async () => {
    try {
      const { data, error } = await supabase
        .from('asignaciones')
        .select(`id, chofer_id, vehiculo_id, ruta_id, Rutas(id_ruta), vehiculos(vehiculo_id_api)`)
        .limit(1)
        .single();

      if (!error && data?.vehiculos?.vehiculo_id_api) {
        setConfigDinamica({
          asignacionId: data.id,
          choferId: data.chofer_id,
          vehiculoIdInterno: data.vehiculo_id,
          vehiculoIdExterno: data.vehiculos.vehiculo_id_api,
          rutaIdBigInt: data.ruta_id,
          rutaIdUuid: data.Rutas.id_ruta
        });
      }

      const recorridoGuardado = await AsyncStorage.getItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID);
      if (recorridoGuardado) {
        setTrackingActivo(true);
        const { data: recData } = await supabase.from('recorridos').select('fecha_inicio').eq('id', recorridoGuardado).single();
        if (recData) setFechaInicioRecorrido(recData.fecha_inicio);
      }
    } catch (err) {
      console.warn(err.message);
    } finally {
      setCargandoConfig(false);
    }
  };

  useEffect(() => {
    const verificarCaducidad = async () => {
      const estadoAuditoria = await auditarVigenciaRecorrido();
      if (estadoAuditoria.zombie || estadoAuditoria.expirado) {
        await detenerTrackingGPS();
        setTrackingActivo(false);
        setFechaInicioRecorrido(null);
      }
    };
    verificarCaducidad();
    const suscripcionAppState = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') verificarCaducidad();
    });
    return () => suscripcionAppState.remove();
  }, []);

  useEffect(() => {
    obtenerContextoYRestaurarSesion();
    refrescarMétricasBúfer();
    const auditorId = setInterval(refrescarMétricasBúfer, 2000);
    return () => clearInterval(auditorId);
  }, []);

  const handleIniciarRecorrido = async () => {
    if (!configDinamica) return Alert.alert("Error", "Contexto inoperante.");
    setProcesandoHandshake(true);
    try {
      const ahoraISO = new Date().toISOString();
      setFechaInicioRecorrido(ahoraISO);
      await iniciarNuevoRecorrido(configDinamica);
      await iniciarTrackingGPS();
      setTrackingActivo(true);
    } catch (error) {
      setFechaInicioRecorrido(null);
      Alert.alert('Fallo', error.message);
    } finally {
      setProcesandoHandshake(false);
    }
  };

  const handleFinalizarRecorrido = async () => {
    try {
      await detenerTrackingGPS();
      await finalizarRecorridoActivo();
      setTrackingActivo(false);
      setFechaInicioRecorrido(null);
      setDistanciaKm(0);
      Alert.alert('Éxito', 'Recorrido cerrado.');
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  // INTERCEPCIÓN MANUAL DE EVENTOS (Para agilizar pruebas de QA de tu equipo)
  const handleForzarHitoManual = () => {
    const hitoFicticio = Math.ceil(distanciaKm) || 1;
    console.log(`[QA-Test] Inyectando evento forzado para Hito Kilómetro: ${hitoFicticio}`);
    DeviceEventEmitter.emit(EVENTOS.HITO_ALCANZADO, {
      numero_hito: `M-${hitoFicticio}`,
      km_acumulado: distanciaKm
    });
  };

  if (cargandoConfig) {
    return <View style={styles.containerCenter}><ActivityIndicator size="large" color="#10B981" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>CÁPSULA DE MANDO</Text>
        <View style={[styles.statusBadge, trackingActivo ? styles.badgeActive : styles.badgeInactive]}>
          <Text style={styles.statusText}>
            {trackingActivo ? ' Transmisión Activa' : '🔴 Telemetría Apagada'}
          </Text>
        </View>
      </View>

      {/* Reloj de tiempo de viaje */}
      <View style={styles.chronoContainer}>
        <Text style={styles.chronoLabel}>TIEMPO ELAPSADO</Text>
        <Cronometro fechaInicio={fechaInicioRecorrido} />
        
        {/* NUEVO: PANEL DE ODÓMETRO DIGITAL DUAL */}
        <View style={styles.odometerRow}>
          <Text style={styles.odometerValue}>{distanciaKm.toFixed(3)} KM</Text>
          <Text style={styles.odometerDivider}>|</Text>
          <Text style={styles.odometerValue}>{(distanciaKm * 1000).toFixed(0)} METROS</Text>
        </View>
      </View>

      <Text style={styles.metricsTitle}>MONITOREO DEL BÚFER SQLITE</Text>
      <View style={styles.metricsContainer}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{metricas.total}</Text>
          <Text style={styles.metricLabel}>TOTALES</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricValue, metricas.supPendientes > 0 ? styles.textWarning : styles.textSafe]}>
            {metricas.supPendientes}
          </Text>
          <Text style={styles.metricLabel}>SUPABASE</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricValue, metricas.apiPendientes > 0 ? styles.textWarning : styles.textSafe]}>
            {metricas.apiPendientes}
          </Text>
          <Text style={styles.metricLabel}>API EXT.</Text>
        </View>
      </View>

      {/* Acciones de Control */}
      <View style={styles.controlsContainer}>
        {trackingActivo && (
          <TouchableOpacity style={styles.buttonManual} onPress={handleForzarHitoManual}>
            <Text style={styles.buttonTextManual}>📸 CAPTURAR EVIDENCIA MANUAL (TEST)</Text>
          </TouchableOpacity>
        )}

        {!trackingActivo ? (
          <TouchableOpacity style={[styles.buttonPrimary, procesandoHandshake && styles.buttonDisabled]} onPress={handleIniciarRecorrido} disabled={procesandoHandshake}>
            {procesandoHandshake ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>▶ INICIAR RECORRIDO</Text>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.buttonDanger} onPress={handleFinalizarRecorrido}>
            <Text style={styles.buttonText}>■ FINALIZAR RECORRIDO</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* El portal reactivo oculto del Hito */}
      <ModalHito />
    </View>
  );
};

const styles = StyleSheet.create({
  containerCenter: { flex: 1, backgroundColor: '#0C0F12', justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#0C0F12', padding: 20 },
  header: { alignItems: 'center', marginTop: 40, marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1.5 },
  statusBadge: { marginTop: 10, paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  badgeActive: { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: '#10B981' },
  badgeInactive: { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: '#EF4444' },
  statusText: { fontSize: 11, fontWeight: 'bold', color: '#FFFFFF', letterSpacing: 0.5 },
  chronoContainer: { backgroundColor: '#171C22', borderRadius: 12, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#242C35', marginBottom: 20 },
  chronoLabel: { color: '#8892B0', fontSize: 11, fontWeight: 'bold', letterSpacing: 2 },
  odometerRow: { flexDirection: 'row', marginTop: 10, borderTopWidth: 1, borderTopColor: '#242C35', paddingTop: 10, width: '100%', justifyContent: 'center', gap: 15 },
  odometerValue: { color: '#38BDF8', fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  odometerDivider: { color: '#242C35' },
  metricsTitle: { color: '#8892B0', fontSize: 11, fontWeight: 'bold', letterSpacing: 1, marginBottom: 10, alignSelf: 'center' },
  metricsContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  metricCard: { flex: 1, backgroundColor: '#171C22', borderRadius: 8, paddingVertical: 15, marginHorizontal: 4, alignItems: 'center', borderWidth: 1, borderColor: '#242C35' },
  metricValue: { fontSize: 24, fontWeight: '900', marginBottom: 3 },
  textSafe: { color: '#10B981' },
  textWarning: { color: '#F59E0B' },
  metricLabel: { fontSize: 9, color: '#8892B0', fontWeight: 'bold' },
  controlsContainer: { flex: 1, justifyContent: 'flex-end', paddingBottom: 10 },
  buttonPrimary: { backgroundColor: '#0EA5E9', paddingVertical: 16, borderRadius: 10, alignItems: 'center' },
  buttonDanger: { backgroundColor: '#EF4444', paddingVertical: 16, borderRadius: 10, alignItems: 'center' },
  buttonManual: { backgroundColor: '#171C22', borderColor: '#38BDF8', borderWidth: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginBottom: 15 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15, letterSpacing: 1 },
  buttonTextManual: { color: '#38BDF8', fontWeight: 'bold', fontSize: 12, letterSpacing: 0.5 },
});

export default PantallaOperacion;