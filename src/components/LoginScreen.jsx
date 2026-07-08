import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Alert, 
  SafeAreaView 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../config/constanst';
import { useTheme } from '../context/ThemeContext';
import { verificarHardware, autenticarChofer } from '../services/biometriaService';

const BIOMETRIA_STORAGE_KEY = '@biometria_enabled';

const LoginScreen = () => {
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometriaDisponible, setBiometriaDisponible] = useState(false);

  // Evalúa en el montaje si el chofer configuró previamente el acceso rápido biométrico
  useEffect(() => {
    const verificarPreferenciaBiometrica = async () => {
      try {
        const flag = await AsyncStorage.getItem(BIOMETRIA_STORAGE_KEY);
        if (flag === 'true') {
          const compatible = await verificarHardware();
          if (compatible) {
            setBiometriaDisponible(true);
            // Ejecutar de forma imperativa al iniciar la pantalla
            ejecutarAutenticacionRapida();
          }
        }
      } catch (err) {
        console.warn('[Login-Biometria] Fallo al leer almacenamiento:', err.message);
      }
    };
    verificarPreferenciaBiometrica();
  }, []);

  const ejecutarAutenticacionRapida = async () => {
    const verification = await autenticarChofer();
    if (verification.success) {
      setLoading(true);
      try {
        // En un flujo de producción con sesión persistente nativa, la restauración de tokens
        // en Supabase o el SessionProvider se ejecuta de forma asíncrona automáticamente.
        // Si no hay token de sesión válido, el chofer ingresa su credencial manual por única vez.
        const { data: { session }, error } = await supabase.auth.getSession();
        if (session) {
          // El AppNavigator procesará de inmediato el cambio de estado y redirigirá al Dashboard
          console.log('[Login] Sesión biométrica validada e inyectada con éxito.');
        } else {
          Alert.alert('Sesión Expirada', 'Por favor, ingrese su correo y contraseña de forma manual para restaurar sus credenciales de seguridad.');
        }
      } catch (err) {
        console.error('[Login-Sess] Fallo al inicializar sesión:', err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleManualLogin = async () => {
    if (!email || !password) {
      Alert.alert('Datos Incompletos', 'Por favor complete todos los campos.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      Alert.alert('Fallo de Autenticación', error.message);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <View style={styles.container}>
        <View style={styles.logoWrap}>
          <MaterialCommunityIcons name="truck-delivery" size={54} color={theme.colors.primary} />
          <Text style={[styles.title, { color: theme.colors.text }]}>RECOLECCIÓN SÓLIDA</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>MÓDULO DE CHOFER</Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>CORREO ELECTRÓNICO</Text>
          <TextInput 
            style={[styles.input, { backgroundColor: theme.colors.inputBackground, color: theme.colors.text, borderColor: theme.colors.border }]}
            placeholder="usuario@dominio.com"
            placeholderTextColor={theme.colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>CONTRASEÑA DE ACCESO</Text>
          <TextInput 
            style={[styles.input, { backgroundColor: theme.colors.inputBackground, color: theme.colors.text, borderColor: theme.colors.border }]}
            placeholder="••••••••••••"
            placeholderTextColor={theme.colors.textSecondary}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
          />
        </View>

        <TouchableOpacity 
          style={[styles.buttonPrimary, { backgroundColor: theme.colors.primary }, loading && styles.disabled]}
          onPress={handleManualLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>INGRESAR AL PANEL</Text>
          )}
        </TouchableOpacity>

        {biometriaDisponible && !loading && (
          <TouchableOpacity 
            style={[styles.buttonBiometric, { borderColor: theme.colors.primary }]}
            onPress={ejecutarAutenticacionRapida}
          >
            <MaterialCommunityIcons name="fingerprint" size={24} color={theme.colors.primary} />
            <Text style={[styles.buttonBiometricText, { color: theme.colors.primary }]}>
              INGRESAR CON HUELLA O ROSTRO
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 15,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 4,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 13,
    marginBottom: 16,
  },
  buttonPrimary: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 16,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1,
  },
  buttonBiometric: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  buttonBiometricText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  disabled: {
    opacity: 0.6,
  },
});

export default LoginScreen;