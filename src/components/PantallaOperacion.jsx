import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { iniciarNuevoRecorrido, finalizarRecorridoActivo, auditarVigenciaRecorrido } from '../services/recorridoService';
import { iniciarTrackingGPS, detenerTrackingGPS } from '../services/geolocalizacionService';
import { obtenerMetricasLocales } from '../database/posicionesQueries';
import { useNetworkSync } from '../hooks/useNetworkSync';
import { supabase, STORAGE_KEYS, PERFIL_ID } from '../config/constanst'; 
import { usePreventRemove } from '@react-navigation/native';
import Cronometro from './Cronometro';

const PantallaOperacion = () => {
  const [trackingActivo, setTrackingActivo] = useState(false);
  const [procesandoHandshake, setProcesandoHandshake] = useState(false);
  const [configDinamica, setConfigDinamica] = useState(null);
  const [cargandoConfig, setCargandoConfig] = useState(true);
  const [fechaInicioRecorrido, setFechaInicioRecorrido] = useState(null);

  // Estados de Telemetría SQLite
  const [metricas, setMetricas] = useState({ total: 0, supPendientes: 0, apiPendientes: 0 });

  useNetworkSync();

  // GUARDIA DE NAVEGACIÓN
  usePreventRemove(trackingActivo, ({ data }) => {
    Alert.alert(
      'Infracción de Protocolo Detectada',
      'No puedes abandonar la cápsula de mando mientras la telemetría esté activa. Finaliza el recorrido ordenadamente.',
      [{ text: 'Entendido', style: 'cancel' }]
    );
  });

  const refrescarMétricasBúfer = async () => {
    try {
      const result = await obtenerMetricasLocales();
      setMetricas({ total: result.total, supPendientes: result.supPendientes, apiPendientes: result.apiPendientes });
    } catch (error) { /* Silencio operativo */ }
  };

  const obtenerContextoYRestaurarSesion = async () => {
    try {
      // 1. Obtener contexto dinámico de asignación
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

      // 2. Restauración del estado en caso de reinicio de la App
      const recorridoGuardado = await AsyncStorage.getItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID);
      if (recorridoGuardado) {
        setTrackingActivo(true);
        // Buscar la fecha de inicio real en la base de datos para el cronómetro
        const { data: recData } = await supabase.from('recorridos').select('fecha_inicio').eq('id', recorridoGuardado).single();
        if (recData) setFechaInicioRecorrido(recData.fecha_inicio);
      }
    } catch (err) {
      console.warn("Advertencia de Arranque:", err.message);
    } finally {
      setCargandoConfig(false);
    }
  };

  // AUDITORÍA DE CICLO DE VIDA (Garbage Collector 24h)
  useEffect(() => {
    const verificarCaducidad = async () => {
      const estadoAuditoria = await auditarVigenciaRecorrido();
      if (estadoAuditoria.zombie || estadoAuditoria.expirado) {
        await detenerTrackingGPS();
        setTrackingActivo(false);
        setFechaInicioRecorrido(null);
        if (estadoAuditoria.expirado) {
          Alert.alert("Vigencia Expirada", "El recorrido excedió las 24 horas y fue suspendido automáticamente.");
        }
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
    const auditorId = setInterval(refrescarMétricasBúfer, 3000); // Polling de UI a 3Hz
    return () => clearInterval(auditorId);
  }, []);

  const handleIniciarRecorrido = async () => {
    if (!configDinamica) return Alert.alert("Error", "Contexto de asignación inoperante.");
    setProcesandoHandshake(true);
    try {
      const ahoraISO = new Date().toISOString();
      setFechaInicioRecorrido(ahoraISO); // Iniciar reloj visual inmediatamente

      await iniciarNuevoRecorrido(configDinamica);
      await iniciarTrackingGPS();
      setTrackingActivo(true);
    } catch (error) {
      setFechaInicioRecorrido(null); // Rollback visual
      Alert.alert('Fallo de Inicialización', error.message);
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
      Alert.alert('Transmisión Cerrada', 'El recorrido ha sido finalizado con éxito.');
    } catch (error) {
      Alert.alert('Error Estructural', error.message);
    }
  };

  if (cargandoConfig) {
    return <View style={styles.containerCenter}><ActivityIndicator size="large" color="#10B981" /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Header Operativo */}
      <View style={styles.header}>
        <Text style={styles.title}>CÁPSULA DE MANDO</Text>
        <View style={[styles.statusBadge, trackingActivo ? styles.badgeActive : styles.badgeInactive]}>
          <Text style={styles.statusText}>
            {trackingActivo ? '🟢 TRANSMISIÓN EN CURSO' : '🔴 TELEMETRÍA DETENIDA'}
          </Text>
        </View>
      </View>

      {/* Reloj y Cronómetro Memorizado */}
      <View style={styles.chronoContainer}>
        <Text style={styles.chronoLabel}>TIEMPO TRANSCURRIDO</Text>
        <Cronometro fechaInicio={fechaInicioRecorrido} />
      </View>

      {/* Panel de Sensores (Métricas SQLite) */}
      <Text style={styles.metricsTitle}>MONITOREO DE RED Y BÚFER (SQLite)</Text>
      <View style={styles.metricsContainer}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{metricas.total}</Text>
          <Text style={styles.metricLabel}>POSICIONES{"\n"}TOTALES</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricValue, metricas.supPendientes > 0 ? styles.textWarning : styles.textSafe]}>
            {metricas.supPendientes}
          </Text>
          <Text style={styles.metricLabel}>COLA{"\n"}SUPABASE</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricValue, metricas.apiPendientes > 0 ? styles.textWarning : styles.textSafe]}>
            {metricas.apiPendientes}
          </Text>
          <Text style={styles.metricLabel}>COLA{"\n"}API EXT.</Text>
        </View>
      </View>

      {/* Panel de Ignición */}
      <View style={styles.controlsContainer}>
        {!trackingActivo ? (
          <TouchableOpacity 
            style={[styles.buttonPrimary, procesandoHandshake && styles.buttonDisabled]} 
            onPress={handleIniciarRecorrido}
            disabled={procesandoHandshake}
          >
            {procesandoHandshake ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>▶ INICIAR RECORRIDO</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={styles.buttonDanger} 
            onPress={handleFinalizarRecorrido}
          >
            <Text style={styles.buttonText}>■ FINALIZAR RECORRIDO</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// --- ESTRUCTURA VISUAL DE ALTO RENDIMIENTO ---
const styles = StyleSheet.create({
  containerCenter: { flex: 1, backgroundColor: '#0C0F12', justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#0C0F12', padding: 20 },
  header: { alignItems: 'center', marginTop: 40, marginBottom: 30 },
  title: { fontSize: 24, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1.5, fontFamily: Platform.OS === 'ios' ? 'Helvetica' : 'Roboto' },
  statusBadge: { marginTop: 10, paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  badgeActive: { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: '#10B981' },
  badgeInactive: { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: '#EF4444' },
  statusText: { fontSize: 12, fontWeight: 'bold', color: '#FFFFFF', letterSpacing: 1 },
  
  chronoContainer: { backgroundColor: '#171C22', borderRadius: 12, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#242C35', marginBottom: 30 },
  chronoLabel: { color: '#8892B0', fontSize: 12, fontWeight: 'bold', letterSpacing: 2 },
  
  metricsTitle: { color: '#8892B0', fontSize: 12, fontWeight: 'bold', letterSpacing: 1, marginBottom: 15, alignSelf: 'center' },
  metricsContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 40 },
  metricCard: { flex: 1, backgroundColor: '#171C22', borderRadius: 8, paddingVertical: 20, marginHorizontal: 5, alignItems: 'center', borderWidth: 1, borderColor: '#242C35' },
  metricValue: { fontSize: 26, fontWeight: '900', marginBottom: 5 },
  textSafe: { color: '#10B981' },
  textWarning: { color: '#F59E0B' },
  metricLabel: { fontSize: 10, color: '#8892B0', textAlign: 'center', fontWeight: 'bold', letterSpacing: 1 },
  
  controlsContainer: { flex: 1, justifyContent: 'flex-end', paddingBottom: 20 },
  buttonPrimary: { backgroundColor: '#0EA5E9', paddingVertical: 18, borderRadius: 10, alignItems: 'center', shadowColor: '#0EA5E9', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 },
  buttonDanger: { backgroundColor: '#EF4444', paddingVertical: 18, borderRadius: 10, alignItems: 'center', shadowColor: '#EF4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16, letterSpacing: 1 },
});

export default PantallaOperacion;