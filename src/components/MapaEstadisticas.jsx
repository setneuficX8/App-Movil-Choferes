import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function MapaEstadisticas({ recorrido, cantidadPuntos = 0 }) {

  if (!recorrido) {
    return null;
  }

  const fechaInicio = new Date(recorrido.fecha_inicio);

  const fechaFin = recorrido.fecha_fin
    ? new Date(recorrido.fecha_fin)
    : null;

  function calcularTiempo() {

    if (!fechaFin) {

      return "En curso";

    }

    const segundos = (fechaFin - fechaInicio) / 1000;

    const horas = Math.floor(segundos / 3600);

    const minutos = Math.floor((segundos % 3600) / 60);

    return `${horas}h ${minutos}m`;

  }

  function formatearFecha(fecha){

    return fecha.toLocaleDateString() + " " +
      fecha.toLocaleTimeString([],{
        hour:"2-digit",
        minute:"2-digit"
      });

  }

  return (

    <View style={styles.card}>

      <Text style={styles.titulo}>
        INFORMACIÓN DEL RECORRIDO
      </Text>

      <View style={styles.linea}/>

      <View style={styles.item}>

        <MaterialCommunityIcons
          name="map-marker-path"
          color="#3B82F6"
          size={20}
        />

        <View style={styles.info}>

          <Text style={styles.label}>
            Ruta
          </Text>

          <Text style={styles.valor}>
            {recorrido.Rutas?.nombre_ruta ?? "Sin ruta"}
          </Text>

        </View>

      </View>

      <View style={styles.item}>

        <MaterialCommunityIcons
          name="calendar"
          color="#F59E0B"
          size={20}
        />

        <View style={styles.info}>

          <Text style={styles.label}>
            Inicio
          </Text>

          <Text style={styles.valor}>
            {formatearFecha(fechaInicio)}
          </Text>

        </View>

      </View>

      <View style={styles.item}>

        <MaterialCommunityIcons
          name="clock-outline"
          color="#10B981"
          size={20}
        />

        <View style={styles.info}>

          <Text style={styles.label}>
            Duración
          </Text>

          <Text style={styles.valor}>
            {calcularTiempo()}
          </Text>

        </View>

      </View>

      <View style={styles.item}>

        <MaterialCommunityIcons
          name="road-variant"
          color="#06B6D4"
          size={20}
        />

        <View style={styles.info}>

          <Text style={styles.label}>
            Distancia
          </Text>

          <Text style={styles.valor}>
            {Number(recorrido.distancia_total_km).toFixed(2)} km
          </Text>

        </View>

      </View>

      <View style={styles.item}>

        <MaterialCommunityIcons
          name="crosshairs-gps"
          color="#8B5CF6"
          size={20}
        />

        <View style={styles.info}>

          <Text style={styles.label}>
            Puntos GPS
          </Text>

          <Text style={styles.valor}>
            {cantidadPuntos}
          </Text>

        </View>

      </View>

      <View style={styles.item}>

        <MaterialCommunityIcons
          name={
            recorrido.estado === "en_curso"
              ? "check-circle"
              : "stop-circle"
          }
          color={
            recorrido.estado === "en_curso"
              ? "#10B981"
              : "#EF4444"
          }
          size={20}
        />

        <View style={styles.info}>

          <Text style={styles.label}>
            Estado
          </Text>

          <Text
            style={[
              styles.valor,
              {
                color:
                  recorrido.estado === "en_curso"
                    ? "#10B981"
                    : "#EF4444"
              }
            ]}
          >
            {recorrido.estado.toUpperCase()}
          </Text>

        </View>

      </View>

    </View>

  );

}

const styles = StyleSheet.create({

card:{
backgroundColor:"#11161D",
margin:15,
padding:18,
borderRadius:18,
borderWidth:1,
borderColor:"#23303B"
},

titulo:{
fontSize:17,
fontWeight:"bold",
color:"white",
marginBottom:10
},

linea:{
height:1,
backgroundColor:"#1F2937",
marginBottom:15
},

item:{
flexDirection:"row",
alignItems:"center",
marginBottom:16
},

info:{
marginLeft:15,
flex:1
},

label:{
fontSize:11,
color:"#94A3B8",
marginBottom:2
},

valor:{
fontSize:15,
fontWeight:"700",
color:"white"
}

});