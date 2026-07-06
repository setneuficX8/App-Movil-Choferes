import React, { memo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useChronometer } from '../hooks/useChronometer';
import { useTheme } from '../context/ThemeContext';

const Cronometro = ({ fechaInicio }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const tiempoStr = useChronometer(fechaInicio);
  
  return <Text style={styles.textoReloj}>{tiempoStr}</Text>;
};

const getStyles = (theme) => StyleSheet.create({
  textoReloj: {
    fontSize: 54,
    fontWeight: '900',
    color: theme.colors.primary, 
    letterSpacing: 2,
    fontVariant: ['tabular-nums'], 
    textAlign: 'center',
    marginVertical: 15,
  }
});

// React.memo previene renderizados si la prop 'fechaInicio' no ha mutado.
export default memo(Cronometro);