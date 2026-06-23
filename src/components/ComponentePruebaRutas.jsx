import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { iniciarNuevoRecorrido, finalizarRecorridoActivo, auditarVigenciaRecorrido } from '../services/recorridoService';
import { iniciarTrackingGPS, detenerTrackingGPS } from '../services/geolocalizacionService';
import { obtenerMetricasLocales } from '../database/posicionesQueries';
import { useNetworkSync } from '../hooks/useNetworkSync';
import { supabase, STORAGE_KEYS, PERFIL_ID } from '../config/constanst'; 

const ComponentePruebaRutas = () => {
  const [trackingActivo, setTrackingActivo] = useState(false);
  const [recorridoIdLocal, setRecorridoIdLocal] = useState('');
  const [recorridoIdApi, setRecorridoIdApi] = useState('');
  const [procesandoHandshake, setProcesandoHandshake] = useState(false);
  const [configDinamica, setConfigDinamica] = useState(null);
  const [cargandoConfig, setCargandoConfig] = useState(true);

  const [totalLocales, setTotalLocales] = useState(0);
  const [pendientesSupabase, setPendientesSupabase] = useState(0);
  const [pendientesAPI, setPendientesAPI] = useState(0);

  // Demonio interceptor de red
  useNetworkSync();

  const refrescarMétricasBúfer = async () => {
    try {
      const metricas = await obtenerMetricasLocales();
      setTotalLocales(metricas.total);
      setPendientesSupabase(metricas.supPendientes);
      setPendientesAPI(metricas.apiPendientes);
    } catch (error) {}
  };

  const obtenerContextoDinamico = async () => {
    try {
      const { data, error } = await supabase
        .from('asignaciones')
        .select(`id, chofer_id, vehiculo_id, ruta_id, Rutas ( id_ruta ), vehiculos ( vehiculo_id_api )`)
        .limit(1)
        .single();

      if (error) throw error;
      if (!data || !data.vehiculos?.vehiculo_id_api) throw new Error("Faltan datos operacionales relacionales.");

      setConfigDinamica({
        asignacionId: data.id,
        choferId: data.chofer_id,
        vehiculoIdInterno: data.vehiculo_id,
        vehiculoIdExterno: data.vehiculos.vehiculo_id_api,
        rutaIdBigInt: data.ruta_id,
        rutaIdUuid: data.Rutas.id_ruta
      });
      
      // Restauración de sesión si la app fue cerrada forzosamente
      const recorridoGuardado = await AsyncStorage.getItem(STORAGE_KEYS.RECORRIDO_ACTIVO_ID);
      const apiGuardada = await AsyncStorage.getItem('recorrido_activo_id_api');
      if (recorridoGuardado) {
        setRecorridoIdLocal(recorridoGuardado);
        setRecorridoIdApi(apiGuardada || '');
        setTrackingActivo(true);
      }
    } catch (err) {
      console.warn("Advertencia de Configuración:", err.message);
    } finally {
      setCargandoConfig(false);
    }
  };

  // AUDITORÍA DE CICLO DE VIDA (Garbage Collector)
 useEffect(() => {
    const verificarCaducidad = async () => {
      const estadoAuditoria = await auditarVigenciaRecorrido();
      
      if (estadoAuditoria.zombie) {
        // Apagado silencioso. El usuario borró la base de datos a mano.
        await detenerTrackingGPS();
        setRecorridoIdLocal('');
        setRecorridoIdApi('');
        setTrackingActivo(false);
      } 
      else if (estadoAuditoria.expirado) {
        // Apagado con alerta. Es una expiración real de 24 horas.
        await detenerTrackingGPS();
        setRecorridoIdLocal('');
        setRecorridoIdApi('');
        setTrackingActivo(false);
        Alert.alert("Vigencia Expirada", "El recorrido excedió las 24 horas y fue suspendido automáticamente.");
      }
    };

    verificarCaducidad();

    const suscripcionAppState = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') verificarCaducidad();
    });

    return () => suscripcionAppState.remove();
  }, []);

  useEffect(() => {
    obtenerContextoDinamico();
    refrescarMétricasBúfer();
    const auditorId = setInterval(refrescarMétricasBúfer, 3000);
    return () => clearInterval(auditorId);
  }, []);

  const handleIniciarRecorridoE2E = async () => {
    if (!configDinamica) return Alert.alert("Error", "Contexto inoperante.");
    setProcesandoHandshake(true);
    try {
      const resultado = await iniciarNuevoRecorrido(configDinamica);
      setRecorridoIdLocal(resultado.localId);
      setRecorridoIdApi(resultado.apiId);
      await iniciarTrackingGPS();
      setTrackingActivo(true);
      Alert.alert('Éxito', 'Recorrido en marcha. Telemetría activa.');
    } catch (error) {
      Alert.alert('Fallo de Red/Lógica', error.message);
    } finally {
      setProcesandoHandshake(false);
    }
  };

  const handleFinalizarRecorridoE2E = async () => {
    try {
      await detenerTrackingGPS();
      await finalizarRecorridoActivo();
      setRecorridoIdLocal('');
      setRecorridoIdApi('');
      setTrackingActivo(false);
      Alert.alert('Cierre Exitoso', 'El registro ha sido consolidado remotamente.');
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  if (cargandoConfig) return <View style={styles.container}><ActivityIndicator size="large" color="#10B981" /></View>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Sistema Telemetría Chofer</Text>
      
      <View style={styles.metricsContainer}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{totalLocales}</Text>
          <Text style={styles.metricLabel}>Total SQLite</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricValue, pendientesSupabase > 0 && styles.metricPending]}>{pendientesSupabase}</Text>
          <Text style={styles.metricLabel}>Cola BD</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricValue, pendientesAPI > 0 && styles.metricPending]}>{pendientesAPI}</Text>
          <Text style={styles.metricLabel}>Cola API</Text>
        </View>
      </View>

      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>ESTADO: {trackingActivo ? '🟢 REGISTRANDO (BACKGROUND)' : '🔴 DETENIDO'}</Text>
        {trackingActivo && (
          <View style={styles.identityGroup}>
            <Text style={styles.recorridoText}>BD Interna: {recorridoIdLocal}</Text>
            <Text style={styles.recorridoText}>API Externa: {recorridoIdApi}</Text>
            <Text style={styles.perfilText}>Perfil: {PERFIL_ID}</Text>
          </View>
        )}
      </View>

      <View style={styles.buttonsContainer}>
        <TouchableOpacity style={[styles.buttonStart, (trackingActivo || procesandoHandshake) && styles.buttonDisabled]} onPress={handleIniciarRecorridoE2E} disabled={trackingActivo || procesandoHandshake}>
          {procesandoHandshake ? <ActivityIndicator color="#000000" /> : <Text style={styles.buttonText}>INICIAR RUTA</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={[styles.buttonStop, !trackingActivo && styles.buttonDisabled]} onPress={handleFinalizarRecorridoE2E} disabled={!trackingActivo}>
          <Text style={styles.buttonTextStop}>FINALIZAR RUTA</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#0C0F12', padding: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 25, letterSpacing: 0.5 },
  metricsContainer: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25 },
  metricCard: { flex: 1, backgroundColor: '#171C22', borderRadius: 8, padding: 12, marginHorizontal: 4, alignItems: 'center', borderWidth: 1, borderColor: '#242C35' },
  metricValue: { fontSize: 22, fontWeight: 'bold', color: '#10B981' },
  metricPending: { color: '#F59E0B' },
  metricLabel: { fontSize: 9, color: '#8892B0', textAlign: 'center', marginTop: 5, textTransform: 'uppercase' },
  statusContainer: { backgroundColor: '#171C22', padding: 15, borderRadius: 8, width: '100%', alignItems: 'center', marginBottom: 25, borderWidth: 1, borderColor: '#242C35' },
  statusText: { fontSize: 11, fontWeight: 'bold', color: '#FFFFFF', letterSpacing: 0.5 },
  identityGroup: { width: '100%', marginTop: 10, borderTopWidth: 1, borderTopColor: '#242C35', paddingTop: 8 },
  recorridoText: { fontSize: 9, color: '#8892B0', marginTop: 3, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  perfilText: { fontSize: 9, color: '#38BDF8', marginTop: 5, fontWeight: '600' },
  buttonsContainer: { width: '100%' },
  buttonStart: { backgroundColor: '#FFFFFF', paddingVertical: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12, height: 52, justifyContent: 'center' },
  buttonStop: { backgroundColor: '#EF4444', paddingVertical: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12, height: 52, justifyContent: 'center' },
  buttonDisabled: { opacity: 0.15 },
  buttonText: { color: '#000000', fontWeight: 'bold', fontSize: 12, letterSpacing: 0.5 },
  buttonTextStop: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12, letterSpacing: 0.5 }
});

export default ComponentePruebaRutas;