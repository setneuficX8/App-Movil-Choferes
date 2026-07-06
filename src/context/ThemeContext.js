import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_STORAGE_KEY = '@app_theme';

export const lightTheme = {
  isDark: false,
  colors: {
    background: '#F7FAFC',
    card: '#FFFFFF',
    text: '#1A202C',
    textSecondary: '#4A5568',
    border: '#E2E8F0',
    primary: '#00D084', // Se mantiene el verde como acento
    danger: '#E53935',
    inputBackground: '#EDF2F7',
    icon: '#4A5568',
  },
};

export const darkTheme = {
  isDark: true,
  colors: {
    background: '#0C0F12',
    card: '#151B22',
    text: '#FFFFFF',
    textSecondary: '#8892B0',
    border: '#30363D',
    primary: '#00D084',
    danger: '#E53935',
    inputBackground: '#0C0F12',
    icon: '#8892B0',
  },
};

const ThemeContext = createContext({
  theme: darkTheme,
  isDarkMode: true,
  toggleTheme: () => {},
});

export const ThemeProvider = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === 'dark');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Cargar la preferencia del usuario al iniciar
    const loadThemePreference = async () => {
      try {
        const storedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (storedTheme !== null) {
          setIsDarkMode(storedTheme === 'dark');
        } else {
          setIsDarkMode(systemColorScheme === 'dark');
        }
      } catch (error) {
        console.error('Error loading theme preference', error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadThemePreference();
  }, [systemColorScheme]);

  const toggleTheme = async () => {
    try {
      const newTheme = !isDarkMode;
      setIsDarkMode(newTheme);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme ? 'dark' : 'light');
    } catch (error) {
      console.error('Error saving theme preference', error);
    }
  };

  const theme = isDarkMode ? darkTheme : lightTheme;

  if (!isLoaded) {
    return null; // O un ActivityIndicator si prefieres
  }

  return (
    <ThemeContext.Provider value={{ theme, isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
