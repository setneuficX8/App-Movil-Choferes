import { useNavigation } from '@react-navigation/native';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { supabase } from '../config/constanst';


const PerfilChofer = () => {
  const navigation = useNavigation();
  const [chofer, setChofer] = useState(null);
  const [asignacionActiva, setAsignacionActiva] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const estadoSistema = chofer?.activo ? 'AUTORIZADO' : 'INACTIVO';
  const subtituloPerfil = asignacionActiva
    ? 'Perfil sincronizado con asignación activa y contexto operativo.'
    : 'Perfil sincronizado sin asignación activa en este momento.';

  useEffect(() => {
    cargarPerfil();
  }, []);

  const cargarPerfil = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Obtener la sesión nativa activa directamente del motor de Supabase
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      
      if (authError || !session?.user) {
        throw new Error('No hay una sesión activa. Debes iniciar sesión primero.');
      }

      const userId = session.user.id;

      // 2. Extraer el perfil del Chofer usando el UUID de autenticación
      // CORRECCIÓN RELACIONAL: Consultamos la tabla real, no una vista web que podría no estar expuesta al cliente móvil.
      const { data: choferData, error: choferError } = await supabase
        .from('Chofer')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (choferError || !choferData) {
        console.error('[Perfil] Chofer no encontrado:', choferError);
        throw new Error('Tu usuario no está registrado como Chofer en el sistema.');
      }

      setChofer(choferData);

      // 3. Obtener la asignación activa usando el ID interno relacional (bigint) del Chofer
      const { data: asignacionData, error: asignacionError } = await supabase
        .from('asignaciones')
        .select(`
          *,
          vehiculo:vehiculos(id, placa, marca, modelo, vehiculo_id_api),
          ruta:Rutas(id, nombre_ruta, id_ruta)
        `)
        .eq('chofer_id', choferData.id) // USO ESTRICTO DEL BIGINT
        .eq('estado', 'activa')
        .maybeSingle();

      if (asignacionError && asignacionError.code !== 'PGRST116') {
        console.warn('[Perfil] Error al verificar asignación:', asignacionError.message);
      }

      setAsignacionActiva(asignacionData);

    } catch (err) {
      console.error('[Perfil] Falla en la carga:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const cerrarSesion = async () => {
    try {
      setLoading(true);
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      setChofer(null);
      setAsignacionActiva(null);
      Alert.alert('Sesión cerrada', 'Has cerrado sesión correctamente.');
    } catch (err) {
      console.error('[Perfil] Error al cerrar sesión:', err.message);
      Alert.alert('Error', `No se pudo cerrar sesión: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatearFecha = fecha => {
    if (!fecha) return 'Sin fecha';
    return new Date(fecha).toLocaleDateString('es-ES');
  };

  const renderDato = ({ icono, etiqueta, valor, subvalor }) => (
    <View style={styles.dataBlock}>
      <View style={styles.dataHeader}>
        <View style={styles.dataIconWrap}>
          <MaterialCommunityIcons name={icono} size={16} color="#38BDF8" />
        </View>
        <Text style={styles.label}>{etiqueta}</Text>
      </View>
      <Text style={styles.value}>{valor}</Text>
      {subvalor ? <Text style={styles.subValue}>{subvalor}</Text> : null}
    </View>
  );

  // --- MÁQUINA DE ESTADOS DE RENDERIZADO ---

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#38BDF8" />
        <Text style={styles.loadingText}>Sincronizando perfil operativo...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorBox}>
          <MaterialCommunityIcons name="alert-circle-outline" size={30} color="#F87171" />
          <Text style={styles.errorTitle}>Acceso denegado / error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={cargarPerfil}>
            <Text style={styles.buttonText}>REINTENTAR</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.backgroundOrbTop} />
      <View style={styles.backgroundOrbBottom} />

      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>MI PERFIL OPERATIVO</Text>
          <Text style={styles.subtitle}>{subtituloPerfil}</Text>
        </View>

        <View style={[styles.statusBadge, chofer?.activo ? styles.badgeActive : styles.badgeInactive]}>
          <View style={[styles.statusDot, chofer?.activo ? styles.statusDotActive : styles.statusDotInactive]} />
          <MaterialCommunityIcons
            name={chofer?.activo ? 'account-check-outline' : 'account-off-outline'}
            size={14}
            color="#FFFFFF"
            style={styles.statusIcon}
          />
          <View>
            <Text style={styles.statusLabel}>ESTADO DEL SISTEMA</Text>
            <Text style={styles.statusText}>{estadoSistema}</Text>
          </View>
        </View>
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroTag}>
            <MaterialCommunityIcons name="account-outline" size={14} color="#38BDF8" />
            <Text style={styles.heroTagText}>MI IDENTIDAD</Text>
          </View>
          <View style={styles.heroTagSecondary}>
            <MaterialCommunityIcons
              name={asignacionActiva ? 'clipboard-check-outline' : 'clipboard-remove-outline'}
              size={14}
              color="#A5B4FC"
            />
            <Text style={styles.heroTagTextSecondary}>{asignacionActiva ? 'ASIGNACION ACTIVA' : 'SIN ASIGNACION'}</Text>
          </View>
        </View>

        <View style={styles.heroMetricCardSingle}>
          <View style={styles.heroMetricHeader}>
            <MaterialCommunityIcons name="badge-account-outline" size={18} color="#38BDF8" />
            <Text style={styles.heroMetricLabel}>DATOS PERSONALES</Text>
          </View>

          <View style={styles.heroMetricStack}>
            <View>
              <Text style={styles.heroMetricCaption}>NOMBRE COMPLETO</Text>
              <Text style={styles.heroMetricValue}>{chofer ? `${chofer.nombre ?? ''} ${chofer.apellido ?? ''}`.trim() : 'Sin datos'}</Text>
            </View>

            <View style={styles.heroMetricDivider} />

            <View>
              <Text style={styles.heroMetricCaption}>CORREO ELECTRÓNICO</Text>
              <Text style={styles.heroMetricValue}>{chofer?.email || 'Sin correo'}</Text>
            </View>
          </View>
        </View>
      </View>

      {asignacionActiva ? (
        <View style={[styles.card, styles.cardActive]}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={18} color="#10B981" />
            <Text style={styles.sectionTitle}>ORDEN DE TRABAJO ACTIVA</Text>
          </View>

          {renderDato({
            icono: 'truck-outline',
            etiqueta: 'VEHICULO ASIGNADO',
            valor: `${asignacionActiva.vehiculo?.marca || 'Sin marca'} ${asignacionActiva.vehiculo?.modelo || ''}`.trim(),
            subvalor: `Placa: ${asignacionActiva.vehiculo?.placa || 'Sin placa'}`,
          })}

          {renderDato({
            icono: 'map-marker-path',
            etiqueta: 'RUTA DESIGNADA',
            valor: asignacionActiva.ruta?.nombre_ruta || 'Ruta sin nombre',
          })}

          {renderDato({
            icono: 'clock-outline',
            etiqueta: 'VIGENCIA DE ASIGNACION',
            valor: `${asignacionActiva.hora_inicio} - ${asignacionActiva.hora_fin}`,
            subvalor: `Inicio: ${formatearFecha(asignacionActiva.fecha_inicio)}`,
          })}
        </View>
      ) : (
        <View style={[styles.card, styles.cardEmpty]}>
          <MaterialCommunityIcons name="clipboard-remove-outline" size={44} color="#8892B0" />
          <Text style={styles.sectionTitle}>SIN ASIGNACIÓN VIGENTE</Text>
          <Text style={styles.subtitle}>
            El algoritmo de despacho no te ha asignado un vehiculo ni una ruta en este momento.
          </Text>
        </View>
      )}

      {asignacionActiva && (
        <TouchableOpacity 
          style={[styles.refreshButton, styles.primaryButton]} 
          onPress={() => navigation.navigate('Operacion')}
        >
          <View style={styles.buttonContentRow}>
            <MaterialCommunityIcons name="play-circle-outline" size={18} color="#FFFFFF" />
            <Text style={styles.buttonText}>ENTRAR A OPERACIÓN</Text>
          </View>
        </TouchableOpacity>
      )}

      <TouchableOpacity 
        style={styles.refreshButton} 
        onPress={cargarPerfil}
        disabled={loading}
      >
        <View style={styles.buttonContentRow}>
          <MaterialCommunityIcons name="sync" size={18} color="#FFFFFF" />
          <Text style={styles.buttonText}>SINCRONIZAR DATOS</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.signOutButton, loading && styles.buttonDisabled]}
        onPress={cerrarSesion}
        disabled={loading}
      >
        <View style={styles.buttonContentRow}>
          <MaterialCommunityIcons name="logout-variant" size={18} color="#FFFFFF" />
          <Text style={styles.buttonText}>CERRAR SESIÓN</Text>
        </View>
      </TouchableOpacity>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  centerContainer: { flex: 1, backgroundColor: '#0A0D11', justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#FFFFFF', marginTop: 15, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  errorBox: {
    backgroundColor: '#11161D',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    width: '100%',
    gap: 8,
  },
  errorTitle: { color: '#F87171', fontSize: 18, fontWeight: '900', marginBottom: 4, textAlign: 'center' },
  errorText: { color: '#D1D5DB', textAlign: 'center', marginBottom: 12 },
  container: { flexGrow: 1, backgroundColor: '#0A0D11', padding: 20 },
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
  heroMetricCardSingle: {
    backgroundColor: '#0F141A',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#22303B',
    gap: 10,
  },
  heroMetricHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroMetricStack: { gap: 12 },
  heroMetricCaption: { color: '#8B96A8', fontSize: 9, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  heroMetricDivider: { height: 1, backgroundColor: '#22303B' },
  heroMetricValue: { color: '#E5F4FF', fontSize: 14, fontWeight: '900' },
  heroMetricLabel: { color: '#7DD3FC', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  card: {
    backgroundColor: '#11161D',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#22303B',
    marginBottom: 20,
  },
  cardActive: { borderColor: 'rgba(16, 185, 129, 0.35)', backgroundColor: 'rgba(16, 185, 129, 0.05)' },
  cardEmpty: { alignItems: 'center', paddingVertical: 34, gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1.1 },
  dataBlock: { backgroundColor: '#0F141A', padding: 12, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#22303B' },
  dataHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  dataIconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(56, 189, 248, 0.08)' },
  label: { fontSize: 10, color: '#8B96A8', textTransform: 'uppercase', letterSpacing: 1 },
  value: { fontSize: 16, color: '#FFFFFF', fontWeight: '800' },
  subValue: { fontSize: 12, color: '#38BDF8', marginTop: 4 },
  refreshButton: { backgroundColor: '#38BDF8', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 10, shadowColor: '#38BDF8', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  primaryButton: { backgroundColor: '#10B981' },
  retryButton: { backgroundColor: '#0284C7', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 6 },
  buttonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13, letterSpacing: 0.9 },
  signOutButton: { backgroundColor: '#EF4444', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 8, shadowColor: '#EF4444', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  buttonContentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonDisabled: { opacity: 0.6 },
});

export default PerfilChofer;