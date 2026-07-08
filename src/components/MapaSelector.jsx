import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
} from "react-native";

import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function MapaSelector({
  recorridos,
  seleccionado,
  onSeleccionar,
}) {

  const [visible, setVisible] = useState(false);

  function obtenerTitulo(recorrido) {

    if (!recorrido) return "Seleccione un recorrido";

    const ruta =
      recorrido.Rutas?.nombre_ruta ??
      "Ruta";

    const fecha = new Date(recorrido.fecha_inicio);

    return `${ruta} • ${fecha.toLocaleDateString()}`;

  }

  function calcularTiempo(recorrido) {

    if (!recorrido.fecha_fin) {

      return "EN CURSO";

    }

    const inicio = new Date(recorrido.fecha_inicio);

    const fin = new Date(recorrido.fecha_fin);

    const total = Math.floor((fin - inicio) / 1000);

    const horas = Math.floor(total / 3600);

    const minutos = Math.floor((total % 3600) / 60);

    return `${horas}h ${minutos}m`;

  }

  function renderItem({ item }) {

    return (

      <TouchableOpacity

        style={styles.item}

        onPress={() => {

          onSeleccionar(item);

          setVisible(false);

        }}

      >

        <View style={styles.icono}>

          <MaterialCommunityIcons

            name="map-marker-path"

            color="#10b981"

            size={22}

          />

        </View>

        <View style={{ flex: 1 }}>

          <Text style={styles.nombre}>

            {item.Rutas?.nombre_ruta}

          </Text>

          <Text style={styles.fecha}>

            {new Date(item.fecha_inicio).toLocaleString()}

          </Text>

        </View>

        <View>

          <Text style={styles.estado}>

            {item.estado.toUpperCase()}

          </Text>

          <Text style={styles.tiempo}>

            {calcularTiempo(item)}

          </Text>

        </View>

      </TouchableOpacity>

    );

  }

  return (

    <>

      <TouchableOpacity

        style={styles.selector}

        onPress={() => setVisible(true)}

      >

        <View style={{ flex: 1 }}>

          <Text style={styles.label}>

            RECORRIDO

          </Text>

          <Text style={styles.valor}>

            {obtenerTitulo(seleccionado)}

          </Text>

        </View>

        <MaterialCommunityIcons

          name="chevron-down"

          size={28}

          color="#10b981"

        />

      </TouchableOpacity>

      <Modal

        visible={visible}

        animationType="slide"

        transparent

      >

        <View style={styles.fondo}>

          <View style={styles.modal}>

            <View style={styles.encabezado}>

              <Text style={styles.titulo}>

                Seleccione un recorrido

              </Text>

              <TouchableOpacity

                onPress={() => setVisible(false)}

              >

                <MaterialCommunityIcons

                  name="close"

                  size={28}

                  color="white"

                />

              </TouchableOpacity>

            </View>

            <FlatList

              data={recorridos}

              keyExtractor={(item) => item.id}

              renderItem={renderItem}

              ItemSeparatorComponent={() => (

                <View style={styles.separator} />

              )}

            />

          </View>

        </View>

      </Modal>

    </>

  );

}

const styles = StyleSheet.create({

selector:{

backgroundColor:"#11161D",

marginHorizontal:15,

marginBottom:12,

padding:16,

borderRadius:16,

borderWidth:1,

borderColor:"#23303B",

flexDirection:"row",

alignItems:"center"

},

label:{

fontSize:11,

fontWeight:"700",

color:"#38BDF8",

marginBottom:5,

letterSpacing:1

},

valor:{

fontSize:15,

fontWeight:"700",

color:"white"

},

fondo:{

flex:1,

backgroundColor:"rgba(0,0,0,0.6)",

justifyContent:"flex-end"

},

modal:{

backgroundColor:"#0A0D11",

borderTopLeftRadius:24,

borderTopRightRadius:24,

padding:20,

height:"75%"

},

encabezado:{

flexDirection:"row",

justifyContent:"space-between",

alignItems:"center",

marginBottom:20

},

titulo:{

fontSize:20,

fontWeight:"bold",

color:"white"

},

item:{

flexDirection:"row",

alignItems:"center",

paddingVertical:16

},

icono:{

width:45,

height:45,

borderRadius:25,

justifyContent:"center",

alignItems:"center",

backgroundColor:"rgba(16,185,129,.15)",

marginRight:15

},

nombre:{

fontSize:16,

fontWeight:"700",

color:"white"

},

fecha:{

marginTop:4,

fontSize:12,

color:"#94A3B8"

},

estado:{

fontSize:11,

fontWeight:"bold",

textAlign:"right",

color:"#10b981"

},

tiempo:{

marginTop:5,

fontSize:12,

color:"#94A3B8"

},

separator:{

height:1,

backgroundColor:"#1F2937"

}

});