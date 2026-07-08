import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../config/constanst'; 
import { useTheme } from '../context/ThemeContext';
import { autenticarChofer } from '../services/biometriaService';

import LoginScreen from '../components/LoginScreen';
import PerfilChofer from '../components/PerfilChofer';
import PantallaOperacion from '../components/PantallaOperacion';
import PantallaAjustes from '../components/PantallaAjustes';
import MapaRecorrido from '../components/MapaRecorrido';

const Stack = createNativeStackNavigator(); 
const BIOMETRIA_STORAGE_KEY = '@biometria_enabled';

/**
 * Pantalla Interceptora (Gatekeeper) de Seguridad Biométrica.
 * Suspende el acceso a las pantallas internas hasta confirmar la identidad física.
 */
const BiometricGate = ({ onUnlock, onLogout }) => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);

  const ejecutarVerificacion = async () => {
    setLoading(true);
    const auth = await autenticarChofer();
    if (auth.success) {
      onUnlock();
    } else {
      setLoading(false);
    }
  };

  useEffect(() => {
    ejecutarVerificacion();
  }, []);

  return (
    <View style={[styles.gateContainer, { backgroundColor: theme.colors.background }]}>
      <MaterialCommunityIcons name="lock-outline" size={60} color={theme.colors.primary} />
      <Text style={[styles.gateTitle, { color: theme.colors.text }]}>APLICACIÓN BLOQUEADA</Text>
      <Text style={[styles.gateSubtitle, { color: theme.colors.textSecondary }]}>
        Se requiere validación biométrica para abrir el panel de control del chofer.
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color={theme.colors.primary} style={styles.loader} />
      ) : (
        <TouchableOpacity 
          style={[styles.unlockButton, { backgroundColor: theme.colors.primary }]}
          onPress={ejecutarVerificacion}
        >
          <MaterialCommunityIcons name="fingerprint" size={20} color="#FFFFFF" />
          <Text style={styles.unlockButtonText}>DESBLOQUEAR</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
        <Text style={[styles.logoutButtonText, { color: theme.colors.danger }]}>Cerrar Sesión Activa</Text>
      </TouchableOpacity>
    </View>
  );
};

export const AppNavigator = ({ session: initialSession, requiresBiometrics }) => {
  const [session, setSession] = useState(initialSession);
  const [biometriaDesbloqueada, setBiometriaDesbloqueada] = useState(!requiresBiometrics);

  useEffect(() => {
    setSession(initialSession);
    setBiometriaDesbloqueada(!requiresBiometrics);
  }, [initialSession, requiresBiometrics]);

  useEffect(() => {
    // Escucha de manera reactiva únicamente cambios de sesión generados por logout manual
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      if (!currentSession) {
        setBiometriaDesbloqueada(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    await AsyncStorage.removeItem(BIOMETRIA_STORAGE_KEY);
    setBiometriaDesbloqueada(false);
  };

  const mostrarIntercepcionSeguridad = session && !biometriaDesbloqueada;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {mostrarIntercepcionSeguridad ? (
          <Stack.Screen name="Gate">
            {(props) => (
              <BiometricGate 
                {...props} 
                onUnlock={() => setBiometriaDesbloqueada(true)} 
                onLogout={handleLogout}
              />
            )}
          </Stack.Screen>
        ) : !session ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Perfil" component={PerfilChofer} />
            <Stack.Screen name="Operacion" component={PantallaOperacion} />
            <Stack.Screen name="Ajustes" component={PantallaAjustes} />
            <Stack.Screen name="Mapa" component={MapaRecorrido} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  gateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  gateTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 20,
    marginBottom: 8,
  },
  gateSubtitle: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  loader: {
    height: 48,
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  unlockButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.8,
  },
  logoutButton: {
    position: 'absolute',
    bottom: 40,
    padding: 10,
  },
  logoutButtonText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textDecorationLine: 'underline',
  },
});

