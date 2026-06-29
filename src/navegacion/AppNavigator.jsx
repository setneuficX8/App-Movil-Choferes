import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack'; 
import { supabase } from '../config/constanst'; 

import LoginScreen from '../components/LoginScreen';
import PerfilChofer from '../components/PerfilChofer';
import PantallaOperacion from '../components/PantallaOperacion';

const Stack = createNativeStackNavigator(); 

export const AppNavigator = () => {
  const [session, setSession] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Evaluación del estado inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsInitializing(false);
    });

    // Suscripción reactiva a cambios de token
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isInitializing) return null; // El motor de renderizado ignora el montaje hasta tener un estado estable

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {!session ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            {/* El orden aquí establece a PerfilChofer como el nodo raíz del árbol autenticado */}
            <Stack.Screen name="Perfil" component={PerfilChofer} />
            <Stack.Screen name="Operacion" component={PantallaOperacion} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}


