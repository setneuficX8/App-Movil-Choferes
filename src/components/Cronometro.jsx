import React, { memo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useChronometer } from '../hooks/useChronometer';

const Cronometro = ({ fechaInicio }) => {
  const tiempoStr = useChronometer(fechaInicio);
  
  return <Text style={styles.textoReloj}>{tiempoStr}</Text>;
};

const styles = StyleSheet.create({
  textoReloj: {
    fontSize: 54,
    fontWeight: '900',
    color: '#10B981', // Verde Esmeralda (Éxito)
    letterSpacing: 2,
    fontVariant: ['tabular-nums'], // Obliga a las fuentes a ocupar el mismo ancho métrico
    textAlign: 'center',
    marginVertical: 15,
  }
});

// React.memo previene renderizados si la prop 'fechaInicio' no ha mutado.
export default memo(Cronometro);