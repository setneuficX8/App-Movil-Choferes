import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform, AppState, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePreventRemove, useNavigation } from '@react-navigation/native';
import { iniciarNuevoRecorrido, finalizarRecorridoActivo, auditarVigenciaRecorrido } from '../services/recorridoService';
import { iniciarTrackingGPS, detenerTrackingGPS } from '../services/geolocalizacionService';
import { obtenerMetricasLocales } from '../database/posicionesQueries';
import { useNetworkSync } from '../hooks/useNetworkSync';
import { supabase, STORAGE_KEYS, EVENTOS } from '../config/constanst'; 

import Cronometro from './Cronometro';
import { ModalHito } from './ModalHito'; // Asegurar el montaje del escucha global

const PantallaOperacion = () => {
  const navigation = useNavigation();
  const [trackingActivo, setTrackingActivo] = useState(false);
  const [procesandoHandshake, setProcesandoHandshake] = useState(false);
  const [configDinamica, setConfigDinamica] = useState(null);
  const [cargandoConfig, setCargandoConfig] = useState(true);
  const [fechaInicioRecorrido, setFechaInicioRecorrido] = useState(null);
  
  // Nuevo estado para telemetría de odómetro visual
  const [distanciaKm, setDistanciaKm] = useState(0);

  const [metricas, setMetricas] = useState({ total: 0, supPendientes: 0, apiPendientes: 0 });
  const estadoRuta = trackingActivo ? 'EN CURSO' : 'LISTO PARA INICIAR';
  const subtituloRuta = trackingActivo
    ? 'Telemetría en vivo, control activo y sincronización habilitada.'
    : 'La consola está preparada para arrancar un nuevo recorrido.';

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
    Alert.alert(
      'Confirmar finalización',
      '¿Está seguro de que quiere finalizar el recorrido?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Finalizar',
          style: 'destructive',
          onPress: async () => {
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
          },
        },
      ],
      { cancelable: true },
    );
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
      <View style={styles.backgroundOrbTop} />
      <View style={styles.backgroundOrbBottom} />

      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>CONTROL DEL CHOFER</Text>
          <Text style={styles.title}>PANEL DE MANDO</Text>
          <Text style={styles.subtitle}>{subtituloRuta}</Text>
        </View>

        <View style={[styles.statusBadge, trackingActivo ? styles.badgeActive : styles.badgeInactive]}>
          <View style={[styles.statusDot, trackingActivo ? styles.statusDotActive : styles.statusDotInactive]} />
          <MaterialCommunityIcons
            name={trackingActivo ? 'access-point' : 'access-point-off'}
            size={14}
            color="#FFFFFF"
            style={styles.statusIcon}
          />
          <View>
            <Text style={styles.statusLabel}>ESTADO DE RUTA</Text>
            <Text style={styles.statusText}>{estadoRuta}</Text>
          </View>
        </View>
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroTag}>
            <MaterialCommunityIcons name="clock-outline" size={14} color="#38BDF8" />
            <Text style={styles.heroTagText}>TIEMPO TRANSCURRIDO</Text>
          </View>
          <View style={styles.heroTagSecondary}>
            <MaterialCommunityIcons name="map-marker-distance" size={14} color="#A5B4FC" />
            <Text style={styles.heroTagTextSecondary}>ODÓMETRO LOCAL</Text>
          </View>
        </View>

        <Cronometro fechaInicio={fechaInicioRecorrido} />

        <View style={styles.odometerRow}>
          <View style={styles.odometerPill}>
            <MaterialCommunityIcons name="road-variant" size={16} color="#38BDF8" />
            <Text style={styles.odometerValue}>{distanciaKm.toFixed(3)} KM</Text>
          </View>
          <View style={styles.odometerSeparator} />
          <View style={styles.odometerPill}>
            <MaterialCommunityIcons name="swap-horizontal" size={16} color="#A5B4FC" />
            <Text style={styles.odometerValue}>{(distanciaKm * 1000).toFixed(0)} M</Text>
          </View>
        </View>
      </View>

      <View style={styles.metricsBlock}>
        <View style={styles.sectionHeader}>
          <Text style={styles.metricsTitle}>MÉTRICAS LOCALES</Text>
          <Text style={styles.metricsHint}>Recuperadas desde SQLite en tiempo real</Text>
        </View>

        <View style={styles.metricsContainer}>
          <View style={styles.metricCard}>
            <View style={styles.metricIconWrap}>
              <MaterialCommunityIcons name="database" size={18} color="#38BDF8" />
            </View>
            <Text style={styles.metricValue}>{metricas.total}</Text>
            <Text style={styles.metricLabel}>REGISTROS</Text>
          </View>
          <View style={styles.metricCard}>
            <View style={styles.metricIconWrap}>
              <MaterialCommunityIcons name="cloud-outline" size={18} color={metricas.supPendientes > 0 ? '#F59E0B' : '#10B981'} />
            </View>
            <Text style={[styles.metricValue, metricas.supPendientes > 0 ? styles.textWarning : styles.textSafe]}>
              {metricas.supPendientes}
            </Text>
            <Text style={styles.metricLabel}>SUPABASE</Text>
          </View>
          <View style={styles.metricCard}>
            <View style={styles.metricIconWrap}>
              <MaterialCommunityIcons name="cloud-sync-outline" size={18} color={metricas.apiPendientes > 0 ? '#F59E0B' : '#10B981'} />
            </View>
            <Text style={[styles.metricValue, metricas.apiPendientes > 0 ? styles.textWarning : styles.textSafe]}>
              {metricas.apiPendientes}
            </Text>
            <Text style={styles.metricLabel}>API EXT.</Text>
          </View>
        </View>
      </View>

      {/* Acciones de Control */}
      <View style={styles.controlsContainer}>
        {trackingActivo && (
          <>
          {/* NUEVO BOTÓN DEL MAPA */}
            <TouchableOpacity 
              style={styles.buttonMap} 
              onPress={() => navigation.navigate('Mapa')}
            >
              <View style={styles.buttonContentRow}>
                <MaterialCommunityIcons name="map-outline" size={18} color="#10B981" />
                <Text style={styles.buttonTextMap}>VER MAPA EN VIVO</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.buttonManual} onPress={handleForzarHitoManual}>
            <View style={styles.buttonContentRow}>
              <MaterialCommunityIcons name="camera-outline" size={18} color="#38BDF8" />
              <Text style={styles.buttonTextManual}>CAPTURAR EVIDENCIA MANUAL (TEST)</Text>
            </View>
          </TouchableOpacity>
          </>
        )}

        {!trackingActivo ? (
          <TouchableOpacity style={[styles.buttonPrimary, procesandoHandshake && styles.buttonDisabled]} onPress={handleIniciarRecorrido} disabled={procesandoHandshake}>
            {procesandoHandshake ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View style={styles.buttonContentRow}>
                <MaterialCommunityIcons name="play" size={18} color="#FFFFFF" />
                <Text style={styles.buttonText}>INICIAR RECORRIDO</Text>
              </View>
              
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.buttonDanger} onPress={handleFinalizarRecorrido}>
            <View style={styles.buttonContentRow}>
              <MaterialCommunityIcons name="stop-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.buttonText}>FINALIZAR RECORRIDO</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* El portal reactivo oculto del Hito */}
      <ModalHito />
    </View>
  );
};

const styles = StyleSheet.create({
  containerCenter: { flex: 1, backgroundColor: '#0A0D11', justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#0A0D11', padding: 20 },
  backgroundOrbTop: {
    position: 'absolute',
    top: -60,
    right: -80,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  backgroundOrbBottom: {
    position: 'absolute',
    bottom: 60,
    left: -90,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
  },
  header: { marginTop: 40, marginBottom: 16 },
  headerCopy: { marginBottom: 14 },
  kicker: { color: '#38BDF8', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1.1 },
  subtitle: { color: '#9CA3AF', marginTop: 8, lineHeight: 18, fontSize: 12 },
  statusBadge: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  statusIcon: { marginRight: 10 },
  statusLabel: { fontSize: 9, color: '#C7D2FE', fontWeight: '800', letterSpacing: 1.1, marginBottom: 1 },
  statusText: { fontSize: 13, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.6 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  statusDotActive: { backgroundColor: '#10B981' },
  statusDotInactive: { backgroundColor: '#EF4444' },
  badgeActive: { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.4)' },
  badgeInactive: { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.4)' },
  heroCard: {
    backgroundColor: '#11161D',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#22303B',
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  heroTag: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  heroTagSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(165, 180, 252, 0.08)',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  heroTagText: { color: '#7DD3FC', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  heroTagTextSecondary: { color: '#C4B5FD', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  chronoContainer: { backgroundColor: '#171C22', borderRadius: 12, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#242C35', marginBottom: 20 },
  chronoLabel: { color: '#8892B0', fontSize: 11, fontWeight: 'bold', letterSpacing: 2 },
  odometerRow: { flexDirection: 'row', marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  odometerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F141A',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#22303B',
  },
  odometerSeparator: { width: 12 },
  odometerValue: { color: '#E5F4FF', fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  metricsBlock: {
    backgroundColor: '#11161D',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#22303B',
    marginBottom: 20,
  },
  sectionHeader: { marginBottom: 12 },
  metricsTitle: { color: '#E5E7EB', fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  metricsHint: { color: '#8B96A8', fontSize: 11, marginTop: 4 },
  metricsContainer: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  metricCard: { flex: 1, backgroundColor: '#0F141A', borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#22303B' },
  metricIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.03)' },
  metricValue: { fontSize: 24, fontWeight: '900', marginBottom: 3 },
  textSafe: { color: '#10B981' },
  textWarning: { color: '#F59E0B' },
  metricLabel: { fontSize: 9, color: '#8B96A8', fontWeight: 'bold', letterSpacing: 0.8 },
  controlsContainer: { flex: 1, justifyContent: 'flex-end', paddingBottom: 10 },
  buttonPrimary: {
    backgroundColor: '#0EA5E9',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#0EA5E9',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  buttonDanger: {
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  buttonManual: {
    backgroundColor: '#11161D',
    borderColor: '#38BDF8',
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14, letterSpacing: 0.9 },
  buttonTextManual: { color: '#38BDF8', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  buttonContentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonMap: {
    backgroundColor: '#11161D',
    borderColor: '#10B981',
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonTextMap: { 
    color: '#10B981', 
    fontWeight: '800', 
    fontSize: 12, 
    letterSpacing: 0.5 
  },
});

export default PantallaOperacion;