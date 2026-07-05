import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  AppState, 
  DeviceEventEmitter, 
  Modal 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePreventRemove } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';

import { 
  iniciarNuevoRecorrido, 
  finalizarRecorridoActivo, 
  auditarVigenciaRecorrido, 
  verificarConexionRed, 
  abortarRecorridoFallido 
} from '../services/recorridoService';
import { 
  iniciarTrackingGPS, 
  detenerTrackingGPS, 
  comprobarPermisosExistentesGPS 
} from '../services/geolocalizacionService';
import { obtenerMetricasLocales } from '../database/posicionesQueries';
import { useNetworkSync } from '../hooks/useNetworkSync';
import { supabase, STORAGE_KEYS, EVENTOS } from '../config/constanst'; 

import Cronometro from './Cronometro';
import { ModalHito } from './ModalHito';

/**
 * Pantalla de Operación de Telemetría para Choferes.
 * Aplica validaciones JIT (Just-In-Time) secuenciales en el momento de la ignición.
 */
const PantallaOperacion = ({ navigation }) => {
  const [trackingActivo, setTrackingActivo] = useState(false);
  const [procesandoHandshake, setProcesandoHandshake] = useState(false);
  const [configDinamica, setConfigDinamica] = useState(null);
  const [cargandoConfig, setCargandoConfig] = useState(true);
  const [fechaInicioRecorrido, setFechaInicioRecorrido] = useState(null);
  const [distanciaKm, setDistanciaKm] = useState(0);
  const [metricas, setMetricas] = useState({ total: 0, supPendientes: 0, apiPendientes: 0 });

  // Indicadores de hardware para telemetría visual de la consola (No bloqueantes de UI)
  const [gpsHabilitado, setGpsHabilitado] = useState(true);
  const [redHabilitada, setRedHabilitada] = useState(true);

  // Estados del Modal de Advertencia Industrial
  const [advertenciaVisible, setAdvertenciaVisible] = useState(false);
  const [advertenciaConfig, setAdvertenciaConfig] = useState({ 
    titulo: 'ALERTA DEL SISTEMA', 
    mensaje: '', 
    icono: 'alert-decagram' 
  });

  const isMounted = useRef(true);

  const estadoRuta = trackingActivo ? 'EN CURSO' : 'LISTO PARA INICIAR';
  const subtituloRuta = trackingActivo
    ? 'Telemetría en vivo, control activo y sincronización habilitada.'
    : 'La consola está preparada para arrancar un nuevo recorrido.';

  useNetworkSync();

  // Control preventivo ante salida involuntaria durante transmisiones de coordenadas activas
  usePreventRemove(trackingActivo, () => {
    Alert.alert('Protocolo Activo', 'No se puede salir de la consola con la telemetría en marcha.');
  });

  /**
   * Actualiza el estado visual de los sensores de red y localización (Monitoreo pasivo)
   */
  const auditarDisponibilidadEntorno = async () => {
    const gpsStatus = await comprobarPermisosExistentesGPS();
    const redStatus = await verificarConexionRed();
    if (isMounted.current) {
      setGpsHabilitado(gpsStatus);
      setRedHabilitada(redStatus);
    }
  };

  const refrescarMetricasBufer = async () => {
    try {
      const result = await obtenerMetricasLocales();
      if (isMounted.current) {
        setMetricas({ 
          total: result.total, 
          supPendientes: result.supPendientes, 
          apiPendientes: result.apiPendientes 
        });
      }
      
      const kmAcumuladosStr = await AsyncStorage.getItem(STORAGE_KEYS.KM_ACUMULADO);
      if (isMounted.current) {
        setDistanciaKm(kmAcumuladosStr ? parseFloat(kmAcumuladosStr) : 0);
      }
    } catch (error) {
      console.error("[Metricas] Error al refrescar métricas locales:", error.message);
    }
  };

  const obtenerContextoYRestaurarSesion = async () => {
    try {
      const { data, error } = await supabase
        .from('asignaciones')
        .select(`id, chofer_id, vehiculo_id, ruta_id, Rutas(id_ruta), vehiculos(vehiculo_id_api)`)
        .limit(1)
        .single();

      if (!error && data?.vehiculos?.vehiculo_id_api && isMounted.current) {
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
      if (recorridoGuardado && isMounted.current) {
        setTrackingActivo(true);
        const kmStr = await AsyncStorage.getItem(STORAGE_KEYS.KM_ACUMULADO);
        setDistanciaKm(kmStr ? parseFloat(kmStr) : 0);
        const { data: recData } = await supabase
          .from('recorridos')
          .select('fecha_inicio')
          .eq('id', recorridoGuardado)
          .single();
        if (recData && isMounted.current) setFechaInicioRecorrido(recData.fecha_inicio);
      }
    } catch (err) {
      console.warn("[Sesión] Error al recuperar contexto operativo:", err.message);
    } finally {
      if (isMounted.current) setCargandoConfig(false);
    }
  };

  const lanzarAlertaJIT = (icono, titulo, mensaje) => {
    setAdvertenciaConfig({ icono, titulo, mensaje });
    setAdvertenciaVisible(true);
    setProcesandoHandshake(false);
  };

  /**
   * Controlador de Inicio de Recorrido con Validación Secuencial Just-In-Time (JIT)
   */
  const handleIniciarRecorrido = async () => {
    setProcesandoHandshake(true);
    let IDsCreados = null;

    try {
      // ASERCIÓN 1: Verificación de Red de Datos/WiFi
      const redValida = await verificarConexionRed();
      if (!redValida) {
        lanzarAlertaJIT(
          'wifi-off', 
          'SIN CONEXIÓN DE RED', 
          'Se requiere conexión de red activa (Datos móviles o WiFi) para iniciar la sincronización remota del recorrido. Por favor, verifica tu señal.'
        );
        return;
      }

      // ASERCIÓN 2: Verificación de disponibilidad física del Hardware de Ubicación
      const gpsEncendido = await Location.hasServicesEnabledAsync();
      if (!gpsEncendido) {
        lanzarAlertaJIT(
          'map-marker-off', 
          'GPS DESACTIVADO', 
          'El receptor de ubicación (GPS) está apagado a nivel de sistema. Despliega la barra de notificaciones y actívalo para poder iniciar la transmisión.'
        );
        return;
      }

      // ASERCIÓN 3: Verificación y solicitud imperativa de permisos
      let { status: foreStatus } = await Location.getForegroundPermissionsAsync();
      if (foreStatus !== 'granted') {
        const { status: reqStatus } = await Location.requestForegroundPermissionsAsync();
        foreStatus = reqStatus;
      }

      if (foreStatus !== 'granted') {
        lanzarAlertaJIT(
          'shield-lock-outline', 
          'ACCESO RECHAZADO', 
          'No se han otorgado los permisos necesarios para acceder a las coordenadas de geolocalización. Concede los permisos de ubicación en primer plano para poder continuar.'
        );
        return;
      }

      // ASERCIÓN 4: Ejecución del handshake y distribución de datos remotos
      const resultado = await iniciarNuevoRecorrido(configDinamica);
      IDsCreados = { localId: resultado.localId, apiId: resultado.apiId };

      // Inyección y encendido del sensor de fondo nativo
      await iniciarTrackingGPS();
      
      if (isMounted.current) {
        const ahoraISO = new Date().toISOString();
        setFechaInicioRecorrido(ahoraISO);
        setTrackingActivo(true);
      }

    } catch (error) {
      if (IDsCreados) {
        await abortarRecorridoFallido(IDsCreados.localId, IDsCreados.apiId);
      }
      if (isMounted.current) {
        setFechaInicioRecorrido(null);
        setTrackingActivo(false);
      }
      lanzarAlertaJIT(
        'server-off', 
        'FALLO DE CONEXIÓN', 
        `Ocurrió un error crítico durante el inicio de la sesión: ${error.message || 'Verifique la calidad de su cobertura e intente nuevamente.'}`
      );
    } finally {
      if (isMounted.current) {
        setProcesandoHandshake(false);
      }
    }
  };

  const handleFinalizarRecorrido = async () => {
    try {
      await detenerTrackingGPS();
      await finalizarRecorridoActivo();
      if (isMounted.current) {
        setTrackingActivo(false);
        setFechaInicioRecorrido(null);
        setDistanciaKm(0);
      }
      Alert.alert('Consola de Control', 'Recorrido finalizado y transmitido formalmente.');
    } catch (error) {
      Alert.alert('Error Operativo', error.message);
    }
  };

  const handleForzarHitoManual = () => {
    const hitoFicticio = Math.ceil(distanciaKm) || 1;
    DeviceEventEmitter.emit(EVENTOS.HITO_ALCANZADO, {
      numero_hito: hitoFicticio, 
      km_acumulado: distanciaKm
    });
  };

  useEffect(() => {
    const verificarCaducidad = async () => {
      const estadoAuditoria = await auditarVigenciaRecorrido();
      if ((estadoAuditoria.zombie || estadoAuditoria.expirado) && isMounted.current) {
        await detenerTrackingGPS();
        setTrackingActivo(false);
        setFechaInicioRecorrido(null);
      }
    };
    verificarCaducidad();
  }, [trackingActivo]);

  useEffect(() => {
    isMounted.current = true;
    obtenerContextoYRestaurarSesion();
    refrescarMetricasBufer();
    auditarDisponibilidadEntorno();

    const auditorId = setInterval(() => {
      refrescarMetricasBufer();
      auditarDisponibilidadEntorno(); 
    }, 2000);

    const subAppState = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') auditarDisponibilidadEntorno();
    });

    return () => {
      isMounted.current = false;
      clearInterval(auditorId);
      subAppState.remove();
    };
  }, []);

  if (cargandoConfig) {
    return (
      <View style={styles.containerCenter}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Sincronizando consola operativa...</Text>
        <TouchableOpacity 
          style={styles.buttonEscapeLoader} 
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonEscapeText}>CANCELAR Y REGRESAR</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // JIT Refactor: El botón principal de inicio no tiene bloqueo pasivo.
  // Solo se bloquea temporalmente mientras se está resolviendo la aserción o petición.
  const isButtonDisabled = procesandoHandshake;

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

      {/* Indicadores pasivos de estado de Red y Satélite */}
      <View style={styles.hardwareIndicators}>
        <View style={[styles.indicatorPill, redHabilitada ? styles.indicatorPillActive : styles.indicatorPillInactive]}>
          <MaterialCommunityIcons 
            name={redHabilitada ? "wifi" : "wifi-off"} 
            size={14} 
            color={redHabilitada ? "#10B981" : "#EF4444"} 
          />
          <Text style={[styles.indicatorPillText, redHabilitada ? styles.indicatorTextActive : styles.indicatorTextInactive]}>
            {redHabilitada ? "RED DETECTADA" : "SIN RED"}
          </Text>
        </View>
        <View style={[styles.indicatorPill, gpsHabilitado ? styles.indicatorPillActive : styles.indicatorPillInactive]}>
          <MaterialCommunityIcons 
            name={gpsHabilitado ? "satellite-variant" : "satellite-off"} 
            size={14} 
            color={gpsHabilitado ? "#10B981" : "#EF4444"} 
          />
          <Text style={[styles.indicatorPillText, gpsHabilitado ? styles.indicatorTextActive : styles.indicatorTextInactive]}>
            {gpsHabilitado ? "SEÑAL GPS LISTA" : "SIN SEÑAL GPS"}
          </Text>
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

      <View style={styles.controlsContainer}>
        {trackingActivo && (
          <TouchableOpacity style={styles.buttonManual} onPress={handleForzarHitoManual}>
            <View style={styles.buttonContentRow}>
              <MaterialCommunityIcons name="camera-outline" size={18} color="#38BDF8" />
              <Text style={styles.buttonTextManual}>CAPTURAR EVIDENCIA MANUAL (TEST)</Text>
            </View>
          </TouchableOpacity>
        )}

        {!trackingActivo ? (
          <TouchableOpacity 
            style={[styles.buttonPrimary, isButtonDisabled && styles.buttonDisabled]} 
            onPress={handleIniciarRecorrido} 
            disabled={isButtonDisabled}
          >
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

      <ModalHito />

      {/* Componente Modal de Alerta de Control JIT Estilizado */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={advertenciaVisible}
        onRequestClose={() => setAdvertenciaVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalIconWrap}>
              <MaterialCommunityIcons name={advertenciaConfig.icono} size={36} color="#EF4444" />
            </View>
            <Text style={styles.modalTitleText}>{advertenciaConfig.titulo}</Text>
            <Text style={styles.modalMessageText}>{advertenciaConfig.mensaje}</Text>
            
            <TouchableOpacity 
              style={styles.modalConfirmButton} 
              onPress={() => setAdvertenciaVisible(false)}
            >
              <Text style={styles.modalConfirmButtonText}>ENTENDIDO</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  containerCenter: { 
    flex: 1, 
    backgroundColor: '#0A0D11', 
    justifyContent: 'center', 
    alignItems: 'center',
    padding: 30
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 15,
    marginBottom: 24,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  buttonEscapeLoader: {
    backgroundColor: '#11161D',
    borderColor: '#374151',
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonEscapeText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
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
    marginBottom: 12,
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
  
  // Estilos de los indicadores pasivos de hardware
  hardwareIndicators: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 16
  },
  indicatorPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  indicatorPillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  indicatorPillInactive: {
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  indicatorPillText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  indicatorTextActive: { color: '#10B981' },
  indicatorTextInactive: { color: '#EF4444' },

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

  // Estilos del Modal de Advertencia con estética industrial oscura
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 10, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    width: '100%',
    backgroundColor: '#11161D',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#22303B',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  modalIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitleText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessageText: {
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalConfirmButton: {
    backgroundColor: '#0EA5E9',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#0EA5E9',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  modalConfirmButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
});

export default PantallaOperacion;