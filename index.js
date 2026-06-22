import { registerRootComponent } from "expo";

// 1. IMPORTACIÓN CRÍTICA: Se evalúa y define la tarea en el global scope ANTES de React
import "./src/tasks/locationTask";

// 2. Importamos App
import App from "./App";

// 3. Montamos la raíz
registerRootComponent(App);
