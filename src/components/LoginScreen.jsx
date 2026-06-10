import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { authService } from '../services/authService';

const LoginScreen = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    // Validación de entrada para evitar disparar tráfico innecesario a la red
    if (!email.trim() || !password) {
      Alert.alert('Campos Incompletos', 'Por favor ingresa tus credenciales operativas.');
      return;
    }

    setLoading(true); // Bloqueo de la interfaz de usuario

    try {
      const usuarioLogueado = await authService.iniciarSesion(email, password);
      // Informamos al componente raíz que la sesión es válida para que desmonte el login
      onLoginSuccess(usuarioLogueado);
    } catch (error) {
      Alert.alert('Fallo de Conexión', error.message);
    } finally {
      setLoading(false); // Liberación de la interfaz de usuario
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.wrapper}
    >
      <View style={styles.card}>
        <Text style={styles.brandTitle}>RECO-SOMBRA</Text>
        <Text style={styles.subtitle}>Capa de Identidad del Conductor</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Correo Operativo</Text>
          <TextInput
            style={styles.input}
            placeholder="ejemplo@empresa.com"
            placeholderTextColor="#4B5563"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            editable={!loading}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Contraseña de Ruta</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#4B5563"
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
            editable={!loading}
          />
        </View>

        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <Text style={styles.buttonText}>AUTENTICAR Y SOLICITAR ACCESO RLS</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#0C0F12', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#171C22', borderRadius: 12, padding: 25, borderWidth: 1, borderColor: '#242C35', width: '100%' },
  brandTitle: { fontSize: 26, fontWeight: 'bold', color: '#FFFFFF', textAlign: 'center', letterSpacing: 2 },
  subtitle: { fontSize: 12, color: '#8892B0', textAlign: 'center', marginTop: 5, marginBottom: 30, textTransform: 'uppercase' },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF', marginBottom: 8, textTransform: 'uppercase' },
  input: { backgroundColor: '#0C0F12', color: '#FFFFFF', borderRadius: 8, paddingHorizontal: 15, paddingVertical: 14, fontSize: 14, borderWidth: 1, borderColor: '#242C35' },
  button: { backgroundColor: '#FFFFFF', borderRadius: 8, paddingVertical: 16, alignItems: 'center', marginTop: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#000000', fontWeight: 'bold', fontSize: 13, letterSpacing: 0.5 }
});

export default LoginScreen;