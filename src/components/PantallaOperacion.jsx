import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  AppState,
  DeviceEventEmitter,
  Modal,
  ScrollView,
  Alert // CORREGIDO: Importación de Alert requerida para usePreventRemove
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePreventRemove, useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location'; // CORREGIDO: Importación del SDK nativo para aserciones JIT

// SERVICIOS DE GESTIÓN DE RECORRIDO (CORREGIDO: Importados verificarConexionRed y abortarRecorridoFallido)
import {
  iniciarNuevoRecorrido,
  finalizarRecorridoActivo,
  auditarVigenciaRecorrido,
  verificarConexionRed,
  abortarRecorridoFallido
} from '../services/recorridoService';

// SERVICIOS DE GEOLOCALIZACIÓN (CORREGIDO: Importado comprobarPermisosExistentesGPS)
import {
  iniciarTrackingGPS,
  detenerTrackingGPS,
  comprobarPermisosExistentesGPS
} from '../services/geolocalizacionService';

import { obtenerMetricasLocales } from '../database/posicionesQueries';
import { useNetworkSync } from '../hooks/useNetworkSync';
import { supabase, STORAGE_KEYS, EVENTOS } from '../config/constanst';
import { useTheme } from '../context/ThemeContext'; // CORREGIDO: Importación desde el contexto personalizado del tema

import Cronometro from './Cronometro';
import { ModalHito } from './ModalHito';
import MapaOperacion from './MapaOperacion';

/**
 * Pantalla de Operación de Telemetría para Choferes.
 * Aplica validaciones JIT (Just-In-Time) secuenciales en el momento de la ignición.
 */
const PantallaOperacion = () => {
  const { theme } = useTheme(); // CORREGIDO: Consumo correcto de la paleta de colores del tema global
  const styles = getStyles(theme);
  const navigation = useNavigation();
  const [trackingActivo, setTrackingActivo] = useState(false);
  const [procesandoHandshake, setProcesandoHandshake] = useState(false);
  const [configDinamica, setConfigDinamica] = useState(null);
  const [cargandoConfig, setCargandoConfig] = useState(true);
  const [fechaInicioRecorrido, setFechaInicioRecorrido] = useState(null);

  // Telemetría de odómetro visual
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
        setMetricas({ total: result.total, supPendientes: result.supPendientes, apiPendientes: result.apiPendientes });
      }

      // Extracción del odómetro geodésico de almacenamiento local
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
        .select(`id, chofer_id, vehiculo_id, ruta_id, Rutas(id_ruta, nombre_ruta, shape), vehiculos(vehiculo_id_api, placa, marca, modelo)`)
        .limit(1)
        .single();

      if (!error && data?.vehiculos?.vehiculo_id_api && isMounted.current) {
        setConfigDinamica({
          asignacionId: data.id,
          choferId: data.chofer_id,
          vehiculoIdInterno: data.vehiculo_id,
          vehiculoIdExterno: data.vehiculos.vehiculo_id_api,
          vehiculoPlaca: data.vehiculos.placa || null,
          vehiculoNombre: `${data.vehiculos.marca || ''} ${data.vehiculos.modelo || ''}`.trim() || null,
          rutaIdBigInt: data.ruta_id,
          rutaIdUuid: data.Rutas.id_ruta,
          rutaNombre: data.Rutas.nombre_ruta || null,
          rutaShape: data.Rutas.shape
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

      // ASERCIÓN 3: Verificación y solicitud imperativa de permisos de ubicación
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

      // Inyección y encendido del sensor de fondo nativo de geolocalización
      await iniciarTrackingGPS();

      if (isMounted.current) {
        const ahoraISO = new Date().toISOString();
        setFechaInicioRecorrido(ahoraISO);
        setTrackingActivo(true);
      }

    } catch (error) {
      // Ejecutar Rollback inmediato para mitigar viajes parciales (zombi/fantasma)
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

  // El botón principal de inicio no tiene bloqueo pasivo, solo responde temporalmente
  // mientras se está resolviendo la aserción o petición.
  const isButtonDisabled = procesandoHandshake;

  // ═══════════════════════════════════════════════════════════════
  // LAYOUT ACTIVO: Mapa + Panel de Control Compacto
  // ═══════════════════════════════════════════════════════════════
  if (trackingActivo) {
    return (
      <View style={styles.containerActivo}>
        {/* ZONA SUPERIOR: MAPA CON OVERLAYS */}
        <View style={styles.mapaZona}>
          <MapaOperacion
            rutaShape={configDinamica?.rutaShape}
            isActive={trackingActivo}
            style={styles.mapaFull}
          />

          {/* Overlay: Badge de estado */}
          <View style={styles.overlayTopLeft}>
            <View style={[styles.statusBadgeCompacto, styles.badgeActive]}>
              <View style={[styles.statusDot, styles.statusDotActive]} />
              <MaterialCommunityIcons name="access-point" size={12} color={theme.colors.text} />
              <Text style={styles.statusTextCompacto}>EN CURSO</Text>
            </View>
          </View>

          {/* Overlay: Indicadores de hardware */}
          <View style={styles.overlayTopRight}>
            <View style={[styles.indicatorPillCompacto, redHabilitada ? styles.indicatorPillActive : styles.indicatorPillInactive]}>
              <MaterialCommunityIcons
                name={redHabilitada ? 'wifi' : 'wifi-off'}
                size={11}
                color={redHabilitada ? '#10B981' : '#EF4444'}
              />
            </View>
            <View style={[styles.indicatorPillCompacto, gpsHabilitado ? styles.indicatorPillActive : styles.indicatorPillInactive]}>
              <MaterialCommunityIcons
                name={gpsHabilitado ? 'satellite-variant' : 'satellite-off'}
                size={11}
                color={gpsHabilitado ? '#10B981' : '#EF4444'}
              />
            </View>
          </View>
        </View>

        {/* ZONA INFERIOR: PANEL DE CONTROL COMPACTO */}
        <View style={styles.panelCompacto}>
          {/* Handle visual estilo bottom-sheet */}
          <View style={styles.panelHandle} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.panelScrollContent}
            bounces={false}
          >
            {/* Info de Asignación */}
            {configDinamica && (
              <View style={styles.assignChipsRow}>
                <View style={styles.assignChip}>
                  <MaterialCommunityIcons name="bus-side" size={13} color="#38BDF8" />
                  <View>
                    <Text style={styles.assignChipLabel}>VEHÍCULO</Text>
                    <Text style={styles.assignChipValue} numberOfLines={1}>
                      {configDinamica.vehiculoNombre || configDinamica.vehiculoIdExterno}
                    </Text>
                    {configDinamica.vehiculoPlaca ? (
                      <Text style={styles.assignChipSub}>{configDinamica.vehiculoPlaca}</Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.assignChipDividerV} />
                <View style={styles.assignChip}>
                  <MaterialCommunityIcons name="map-outline" size={13} color="#A5B4FC" />
                  <View>
                    <Text style={styles.assignChipLabel}>RUTA</Text>
                    <Text style={styles.assignChipValue} numberOfLines={2}>
                      {configDinamica.rutaNombre || `#${String(configDinamica.rutaIdBigInt)}`}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Cronómetro y Odómetro apilados */}
            <View style={styles.cronOdoStack}>
              {/* Fila del cronómetro */}
              <View style={styles.cronOdoBlock}>
                <View style={styles.cronLabelRow}>
                  <MaterialCommunityIcons name="clock-outline" size={12} color="#38BDF8" />
                  <Text style={styles.cronLabel}>TIEMPO TRANSCURRIDO</Text>
                </View>
                <Cronometro fechaInicio={fechaInicioRecorrido} />
              </View>

              {/* Separador horizontal */}
              <View style={styles.cronOdoSeparatorH} />

              {/* Fila del odómetro */}
              <View style={styles.cronOdoBlock}>
                <View style={styles.cronLabelRow}>
                  <MaterialCommunityIcons name="road-variant" size={12} color="#A5B4FC" />
                  <Text style={styles.odoLabel}>ODÓMETRO LOCAL</Text>
                </View>
                <View style={styles.odoValueRow}>
                  <Text style={styles.odoValueCompacto}>{distanciaKm.toFixed(3)}</Text>
                  <Text style={styles.odoUnit}>KM</Text>
                </View>
              </View>
            </View>


            {/* Botones de Acción */}
            <View style={styles.controlsCompacto}>
              <TouchableOpacity style={styles.buttonManualCompacto} onPress={handleForzarHitoManual}>
                <View style={styles.buttonContentRow}>
                  <MaterialCommunityIcons name="camera-outline" size={16} color="#38BDF8" />
                  <Text style={styles.buttonTextManualCompacto}>CAPTURAR EVIDENCIA</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.buttonDangerCompacto} onPress={handleFinalizarRecorrido}>
                <View style={styles.buttonContentRow}>
                  <MaterialCommunityIcons name="stop-circle-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.buttonTextCompacto}>FINALIZAR RECORRIDO</Text>
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        <ModalHito />

        {/* Modal de Alerta JIT */}
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
  }

  // ═══════════════════════════════════════════════════════════════
  // LAYOUT INACTIVO: Pantalla original sin modificaciones
  // ═══════════════════════════════════════════════════════════════
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

        <View style={[styles.statusBadge, styles.badgeInactive]}>
          <View style={[styles.statusDot, styles.statusDotInactive]} />
          <MaterialCommunityIcons
            name="access-point-off"
            size={14}
            color={theme.colors.text}
            style={styles.statusIcon}
          />
          <View>
            <Text style={styles.statusLabel}>ESTADO DE LA RUTA</Text>
            <Text style={styles.statusText}>{estadoRuta}</Text>
          </View>
        </View>
      </View>

      <View style={styles.heroCard}>
        {/* Bloque del cronómetro */}
        <View style={styles.heroBlock}>
          <View style={styles.heroLabelRow}>
            <MaterialCommunityIcons name="clock-outline" size={13} color="#38BDF8" />
            <Text style={styles.heroLabelText}>TIEMPO TRANSCURRIDO</Text>
          </View>
          <Cronometro fechaInicio={fechaInicioRecorrido} />
        </View>

        {/* Separador horizontal */}
        <View style={styles.heroSeparatorH} />

        {/* Bloque del odómetro */}
        <View style={styles.heroBlock}>
          <View style={styles.heroLabelRow}>
            <MaterialCommunityIcons name="map-marker-distance" size={13} color="#A5B4FC" />
            <Text style={styles.heroLabelTextSecondary}>ODÓMETRO LOCAL</Text>
          </View>
          <View style={styles.heroOdoValueRow}>
            <Text style={styles.heroOdoValue}>{distanciaKm.toFixed(3)}</Text>
            <Text style={styles.heroOdoUnit}>KM</Text>
          </View>
        </View>
      </View>

      {/* Tarjeta de Asignación */}
      <View style={styles.assignCard}>
        {configDinamica ? (
          <View style={styles.assignCardRow}>
            <View style={styles.assignCardItem}>
              <View style={styles.assignCardIconWrap}>
                <MaterialCommunityIcons name="bus-side" size={18} color="#38BDF8" />
              </View>
              <Text style={styles.assignCardLabel}>VEHÍCULO</Text>
              <Text style={styles.assignCardValue} numberOfLines={1}>
                {configDinamica.vehiculoNombre || configDinamica.vehiculoIdExterno}
              </Text>
              {configDinamica.vehiculoPlaca ? (
                <Text style={styles.assignCardSub}>{configDinamica.vehiculoPlaca}</Text>
              ) : null}
            </View>
            <View style={styles.assignCardDivider} />
            <View style={styles.assignCardItem}>
              <View style={styles.assignCardIconWrap}>
                <MaterialCommunityIcons name="map-outline" size={18} color="#A5B4FC" />
              </View>
              <Text style={styles.assignCardLabel}>RUTA</Text>
              <Text style={styles.assignCardValue} numberOfLines={2}>
                {configDinamica.rutaNombre || `#${String(configDinamica.rutaIdBigInt)}`}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.assignCardEmpty}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.assignCardEmptyText}>Sin asignación activa</Text>
          </View>
        )}
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

      <View style={styles.controlsContainer}>
        {/* Conservación del botón incorporado por tu compañero de forma intacta */}
        <TouchableOpacity
          style={styles.buttonMap}
          onPress={() => navigation.navigate('Mapa')}
        >
          <View style={styles.buttonContentRow}>
            <MaterialCommunityIcons
              name="map-search"
              size={18}
              color="#10B981"
            />
            <Text style={styles.buttonTextMap}>
              MAPA E HISTORIAL
            </Text>
          </View>
        </TouchableOpacity>

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

const getStyles = (theme) => StyleSheet.create({
  // ═══════════════════════════════════════════════════════════════
  // ESTILOS COMPARTIDOS
  // ═══════════════════════════════════════════════════════════════
  containerCenter: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginTop: 15,
    marginBottom: 24,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  buttonEscapeLoader: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonEscapeText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  buttonContentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  statusDotActive: { backgroundColor: '#10B981' },
  statusDotInactive: { backgroundColor: theme.colors.danger },
  badgeActive: { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.4)' },
  badgeInactive: { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.4)' },
  textSafe: { color: '#10B981' },
  textWarning: { color: '#F59E0B' },
  buttonDisabled: { opacity: 0.5 },
  indicatorPillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  indicatorPillInactive: {
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },

  // Estilos del Modal JIT de Advertencia
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 10, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    width: '100%',
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessageText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalConfirmButton: {
    backgroundColor: theme.colors.primary,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: theme.colors.primary,
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

  // ═══════════════════════════════════════════════════════════════
  // ESTILOS DEL LAYOUT INACTIVO (pantalla original)
  // ═══════════════════════════════════════════════════════════════
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 20 },
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
  kicker: { color: theme.colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '900', color: theme.colors.text, letterSpacing: 1.1 },
  subtitle: { color: theme.colors.textSecondary, marginTop: 8, lineHeight: 18, fontSize: 12 },
  statusBadge: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: { marginRight: 10 },
  statusLabel: { fontSize: 9, color: theme.colors.textSecondary, fontWeight: '800', letterSpacing: 1.1, marginBottom: 1 },
  statusText: { fontSize: 13, fontWeight: '900', color: theme.colors.text, letterSpacing: 0.6 },
  heroCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  heroBlock: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  heroSeparatorH: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  heroLabelText: { color: '#0284C7', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  heroLabelTextSecondary: { color: '#6366F1', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  heroOdoValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  heroOdoValue: {
    fontSize: 38,
    fontWeight: '900',
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  heroOdoUnit: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textSecondary,
    letterSpacing: 1,
  },
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
    gap: 7,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  indicatorPillText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  indicatorTextActive: { color: '#10B981' },
  indicatorTextInactive: { color: '#EF4444' },
  controlsContainer: { paddingBottom: 10, gap: 16 },
  buttonPrimary: {
    backgroundColor: '#0EA5E9',
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#0EA5E9',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  buttonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15, letterSpacing: 0.9 },
  buttonMap: {
    backgroundColor: '#11161D',
    borderColor: '#10B981',
    borderWidth: 1,
    paddingVertical: 17,
    borderRadius: 16,
    alignItems: 'center',
  },
  buttonTextMap: {
    color: '#10B981',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5
  },

  // ── Tarjeta de Asignación (layout inactivo) ─────────────────────
  assignCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 16,
    overflow: 'hidden',
  },
  assignCardRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  assignCardItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 4,
  },
  assignCardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  assignCardLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: theme.colors.textSecondary,
    letterSpacing: 0.8,
  },
  assignCardValue: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  assignCardSub: {
    fontSize: 9,
    fontWeight: '600',
    color: theme.colors.primary,
    textAlign: 'center',
    marginTop: 1,
  },
  assignCardDivider: {
    width: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 10,
  },
  assignCardEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  assignCardEmptyText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },

  // ── Chips de Asignación (layout activo / mapa) ──────────────────
  assignChipsRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  assignChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  assignChipLabel: {
    fontSize: 7,
    fontWeight: '900',
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
  },
  assignChipValue: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.text,
  },
  assignChipSub: {
    fontSize: 8,
    fontWeight: '600',
    color: theme.colors.primary,
    marginTop: 1,
  },
  assignChipDividerV: {
    width: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 8,
  },

  // ═══════════════════════════════════════════════════════════════
  // ESTILOS DEL LAYOUT ACTIVO (mapa + panel compacto)
  // ═══════════════════════════════════════════════════════════════
  containerActivo: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  // Zona del mapa (~50%)
  mapaZona: {
    flex: 50,
    position: 'relative',
  },
  mapaFull: {
    flex: 1,
    borderRadius: 0,
  },

  // Overlays flotantes sobre el mapa
  overlayTopLeft: {
    position: 'absolute',
    top: 50,
    left: 16,
    zIndex: 10,
  },
  overlayTopRight: {
    position: 'absolute',
    top: 50,
    right: 16,
    zIndex: 10,
    flexDirection: 'row',
    gap: 6,
  },
  statusBadgeCompacto: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  statusTextCompacto: {
    fontSize: 10,
    fontWeight: '900',
    color: theme.colors.text,
    letterSpacing: 0.8,
  },
  indicatorPillCompacto: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },

  // Panel de control compacto (~50%)
  panelCompacto: {
    flex: 50,
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  panelHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  panelScrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 20,
    gap: 12,
  },

  // Cronómetro y Odómetro apilados
  cronOdoStack: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  cronOdoBlock: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cronOdoSeparatorH: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginHorizontal: 0,
  },
  cronLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  cronLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0284C7',
    letterSpacing: 1,
  },
  odoLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6366F1',
    letterSpacing: 1,
  },
  odoValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  odoValueCompacto: {
    fontSize: 32,
    fontWeight: '900',
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  odoUnit: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textSecondary,
    letterSpacing: 1,
  },


  // Botones de acción compactos
  controlsCompacto: {
    gap: 10,
    marginTop: 4,
  },
  buttonManualCompacto: {
    backgroundColor: theme.colors.inputBackground,
    borderColor: theme.colors.primary,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonTextManualCompacto: {
    color: theme.colors.primary,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  buttonDangerCompacto: {
    backgroundColor: theme.colors.danger,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: theme.colors.danger,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  buttonTextCompacto: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.9,
  },
});

export default PantallaOperacion;