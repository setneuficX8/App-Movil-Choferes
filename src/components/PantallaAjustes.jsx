import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Switch, 
  TouchableOpacity, 
  ScrollView, 
  Alert, 
  SafeAreaView 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { verificarHardware, autenticarChofer } from '../services/biometriaService';

const BIOMETRIA_STORAGE_KEY = '@biometria_enabled';

/**
 * Componente de Presentación PantallaAjustes.
 * Permite alternar la interfaz de modo claro/oscuro y activar la seguridad biométrica.
 * 
 * @param {Object} props
 * @param {Object} props.navigation Controlador de navegación nativo.
 */
const PantallaAjustes = ({ navigation }) => {
  const { theme, isDarkMode, toggleTheme } = useTheme();
  const [biometriaHabilitada, setBiometriaHabilitada] = useState(false);
  const [cargandoPreferencias, setCargandoPreferencias] = useState(true);

  // Carga inicial del estado persistido de biometría
  useEffect(() => {
    const cargarPreferenciasPersistidas = async () => {
      try {
        const flag = await AsyncStorage.getItem(BIOMETRIA_STORAGE_KEY);
        if (flag !== null) {
          setBiometriaHabilitada(flag === 'true');
        }
      } catch (error) {
        console.error('[Ajustes] Error al recuperar preferencias:', error.message);
      } finally {
        setCargandoPreferencias(false);
      }
    };
    cargarPreferenciasPersistidas();
  }, []);

  /**
   * Ejecuta el flujo secuencial para alternar la autenticación facial/dactilar.
   */
  const handleToggleBiometria = async (nuevoEstado) => {
    if (nuevoEstado) {
      // 1. Verificar hardware y registros en el S.O.
      const hardwareValido = await verificarHardware();
      if (!hardwareValido) {
        Alert.alert(
          'Hardware No Disponible',
          'Su dispositivo no admite autenticación biométrica o no cuenta con huellas/rostros registrados en los ajustes del sistema.'
        );
        setBiometriaHabilitada(false);
        return;
      }

      // 2. Solicitar autenticación instantánea de validación previa al guardado
      const verificacion = await autenticarChofer();
      if (verificacion.success) {
        try {
          await AsyncStorage.setItem(BIOMETRIA_STORAGE_KEY, 'true');
          setBiometriaHabilitada(true);
          Alert.alert('Seguridad Biométrica', 'Autenticación nativa activada de forma satisfactoria.');
        } catch (storageError) {
          Alert.alert('Error de Almacenamiento', 'No se pudo guardar la preferencia de seguridad.');
          setBiometriaHabilitada(false);
        }
      } else {
        // En caso de cancelación o fallo, el switch retorna a su posición inicial
        setBiometriaHabilitada(false);
      }
    } else {
      // Confirmar desactivación por seguridad
      Alert.alert(
        'Desactivar Seguridad',
        '¿Está seguro de que desea desactivar el ingreso biométrico? Se le solicitará contraseña la próxima vez que inicie sesión.',
        [
          { 
            text: 'Cancelar', 
            style: 'cancel', 
            onPress: () => setBiometriaHabilitada(true) 
          },
          { 
            text: 'Desactivar', 
            style: 'destructive', 
            onPress: async () => {
              try {
                await AsyncStorage.setItem(BIOMETRIA_STORAGE_KEY, 'false');
                setBiometriaHabilitada(false);
              } catch (err) {
                Alert.alert('Error', 'No se pudo procesar la solicitud.');
                setBiometriaHabilitada(true);
              }
            } 
          }
        ]
      );
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      {/* Header de Navegación */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>AJUSTES</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Sección Visual */}
        <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>INTERFAZ VISUAL</Text>
        <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: theme.colors.inputBackground }]}>
                <MaterialCommunityIcons name="theme-light-dark" size={20} color={theme.colors.primary} />
              </View>
              <View>
                <Text style={[styles.rowLabel, { color: theme.colors.text }]}>Modo Oscuro</Text>
                <Text style={[styles.rowSubtitle, { color: theme.colors.textSecondary }]}>Alternar el aspecto de la pantalla</Text>
              </View>
            </View>
            <Switch 
              value={isDarkMode} 
              onValueChange={toggleTheme} 
              trackColor={{ false: theme.colors.border, true: 'rgba(0, 208, 132, 0.4)' }}
              thumbColor={isDarkMode ? theme.colors.primary : '#F4F3F4'}
            />
          </View>
        </View>

        {/* Sección de Seguridad */}
        <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>PROTECCIÓN DE DATOS</Text>
        <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: theme.colors.inputBackground }]}>
                <MaterialCommunityIcons name="fingerprint" size={20} color={theme.colors.primary} />
              </View>
              <View>
                <Text style={[styles.rowLabel, { color: theme.colors.text }]}>Autenticación Biométrica</Text>
                <Text style={[styles.rowSubtitle, { color: theme.colors.textSecondary }]}>Usar reconocimiento facial o dactilar</Text>
              </View>
            </View>
            {!cargandoPreferencias && (
              <Switch 
                value={biometriaHabilitada} 
                onValueChange={handleToggleBiometria} 
                trackColor={{ false: theme.colors.border, true: 'rgba(0, 208, 132, 0.4)' }}
                thumbColor={biometriaHabilitada ? theme.colors.primary : '#F4F3F4'}
              />
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  headerSpacer: {
    width: 32,
  },
  scrollContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 10,
    marginTop: 10,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  rowSubtitle: {
    fontSize: 10,
    marginTop: 2,
  },
});

export default PantallaAjustes;