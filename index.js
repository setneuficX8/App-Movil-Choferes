import { registerRootComponent } from "expo";
import App from "./App";

// Primero inicializamos el entorno nativo y registramos la raíz de React Native
registerRootComponent(App);

// DESPUÉS de registrar la raíz, importamos el servicio en segundo plano.
// De esta forma, cuando dbSetup ejecute openDatabaseSync, la infraestructura nativa ya estará lista.
import "./src/services/geolocalizacionService";
