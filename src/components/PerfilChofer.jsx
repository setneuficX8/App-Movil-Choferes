import { useNavigation } from '@react-navigation/native';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { supabase } from '../config/constanst'; // Tipografía preservada estrictamente según las reglas del proyecto


const PerfilChofer = () => {
    const navigation = useNavigation();
  const [chofer, setChofer] = useState(null);
  const [asignacionActiva, setAsignacionActiva] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  // --- MÁQUINA DE ESTADOS DE RENDERIZADO ---

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#38BDF8" />
        <Text style={styles.loadingText}>Sincronizando telemetría del perfil...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Acceso Denegado / Error</Text>
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
      
      <View style={styles.header}>
        <Text style={styles.title}>Mi Perfil Operativo</Text>
        <Text style={styles.subtitle}>Información personal y matriz de asignación</Text>
      </View>

      {/* Tarjeta de Identidad del Chofer */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>👤 Identidad del Conductor</Text>
        
        <View style={styles.grid}>
          <View style={styles.dataBlock}>
            <Text style={styles.label}>Nombre Completo</Text>
            <Text style={styles.value}>{chofer?.nombre} {chofer?.apellido}</Text>
          </View>

          <View style={styles.dataBlock}>
            <Text style={styles.label}>Correo Electrónico</Text>
            <Text style={styles.value}>{chofer?.email}</Text>
          </View>

          <View style={styles.dataBlock}>
            <Text style={styles.label}>Estado del Sistema</Text>
            <View style={[styles.badge, chofer?.activo ? styles.badgeSuccess : styles.badgeInactive]}>
              <Text style={styles.badgeText}>{chofer?.activo ? 'AUTORIZADO' : 'INACTIVO'}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Tarjeta de Asignación Operativa */}
      {asignacionActiva ? (
        <View style={[styles.card, styles.cardActive]}>
          <Text style={styles.sectionTitle}>📋 Orden de Trabajo Activa</Text>

          <View style={styles.dataBlock}>
            <Text style={styles.label}>🚛 Vehículo Asignado</Text>
            <Text style={styles.value}>{asignacionActiva.vehiculo?.marca} {asignacionActiva.vehiculo?.modelo}</Text>
            <Text style={styles.subValue}>Placa: {asignacionActiva.vehiculo?.placa}</Text>
          </View>

          <View style={styles.dataBlock}>
            <Text style={styles.label}>🗺️ Ruta Designada</Text>
            <Text style={styles.value}>{asignacionActiva.ruta?.nombre_ruta || 'Ruta sin nombre'}</Text>
            <Text style={styles.subValue}>ID: {asignacionActiva.ruta?.id_ruta}</Text>
          </View>

          <View style={styles.dataBlock}>
            <Text style={styles.label}>⏱️ Vigencia de Asignación</Text>
            <Text style={styles.value}>
              {asignacionActiva.hora_inicio} - {asignacionActiva.hora_fin}
            </Text>
            <Text style={styles.subValue}>
              Inicio: {new Date(asignacionActiva.fecha_inicio).toLocaleDateString('es-ES')}
            </Text>
          </View>

        </View>
      ) : (
        <View style={[styles.card, styles.cardEmpty]}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.sectionTitle}>Sin Asignación Vigente</Text>
          <Text style={styles.subtitle}>
            El algoritmo de despacho no te ha asignado un vehículo ni una ruta en este momento.
          </Text>
        </View>
      )}

      {/* Botón de Transición a Telemetría */}
      {asignacionActiva && (
        <TouchableOpacity 
          style={[styles.refreshButton, { backgroundColor: '#10B981', marginTop: 20 }]} 
          onPress={() => navigation.navigate('Operacion')}
        >
          <Text style={styles.buttonText}>🚀 ENTRAR A LA CÁPSULA DE OPERACIÓN</Text>
        </TouchableOpacity>
      )}

      {/* Control de Refresco */}
      <TouchableOpacity 
        style={styles.refreshButton} 
        onPress={cargarPerfil}
        disabled={loading}
      >
        <Text style={styles.buttonText}>🔄 SINCRONIZAR DATOS</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.signOutButton}
        onPress={cerrarSesion}
        disabled={loading}
      >
        <Text style={styles.buttonText}>🔒 CERRAR SESIÓN</Text>
      </TouchableOpacity>

    </ScrollView>
  );
};

// --- ARQUITECTURA VISUAL ESTRUCTURADA ---
const styles = StyleSheet.create({
  centerContainer: { flex: 1, backgroundColor: '#0C0F12', justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#FFFFFF', marginTop: 15, fontSize: 16, fontWeight: '600', letterSpacing: 0.5 },
  errorBox: { backgroundColor: 'rgba(153, 27, 27, 0.2)', borderColor: '#EF4444', borderWidth: 1, borderRadius: 8, padding: 20, alignItems: 'center', width: '100%' },
  errorTitle: { color: '#F87171', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  errorText: { color: '#D1D5DB', textAlign: 'center', marginBottom: 20 },
  container: { flexGrow: 1, backgroundColor: '#0C0F12', padding: 20 },
  header: { marginBottom: 25, marginTop: 20 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#FFFFFF', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#8892B0', marginTop: 5 },
  card: { backgroundColor: '#171C22', borderColor: '#242C35', borderWidth: 1, borderRadius: 10, padding: 20, marginBottom: 20 },
  cardActive: { borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.05)' },
  cardEmpty: { alignItems: 'center', paddingVertical: 40, borderStyle: 'dashed' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 15 },
  grid: { gap: 15 },
  dataBlock: { backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: 12, borderRadius: 6, marginBottom: 10 },
  label: { fontSize: 11, color: '#8892B0', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  value: { fontSize: 16, color: '#FFFFFF', fontWeight: '600' },
  subValue: { fontSize: 12, color: '#38BDF8', marginTop: 4 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  badgeSuccess: { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: '#10B981' },
  badgeInactive: { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: '#EF4444' },
  badgeText: { fontSize: 10, fontWeight: 'bold', color: '#FFFFFF', letterSpacing: 1 },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  refreshButton: { backgroundColor: '#38BDF8', paddingVertical: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  retryButton: { backgroundColor: '#0284C7', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 6 },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13, letterSpacing: 1 },
  signOutButton: { backgroundColor: '#EF4444', paddingVertical: 15, borderRadius: 8, alignItems: 'center', marginTop: 8 },
});

export default PerfilChofer;