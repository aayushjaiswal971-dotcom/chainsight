import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext({
  theme: 'system',
  isDark: false,
  setTheme: () => { },
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem('chainsight_theme') || 'system';
    } catch {
      return 'system';
    }
  });

  const [isDark, setIsDark] = useState(() => {
    try {
      const stored = localStorage.getItem('chainsight_theme') || 'system';
      if (stored === 'dark') return true;
      if (stored === 'light') return false;
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  const applyTheme = useCallback((targetTheme, enableTransition = true) => {
    const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const darkActive = targetTheme === 'dark' || (targetTheme === 'system' && isSystemDark);

    if (enableTransition) {
      document.documentElement.classList.add('theme-transitioning');
    }

    if (darkActive) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }

    setIsDark(darkActive);

    if (enableTransition) {
      setTimeout(() => {
        document.documentElement.classList.remove('theme-transitioning');
      }, 150);
    }
  }, []);

  const setTheme = useCallback((newTheme) => {
    try {
      localStorage.setItem('chainsight_theme', newTheme);
    } catch { }
    setThemeState(newTheme);
    applyTheme(newTheme, true);
  }, [applyTheme]);

  // System OS theme listener
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const stored = localStorage.getItem('chainsight_theme') || 'system';
      if (stored === 'system') {
        applyTheme('system', true);
      }
    };
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, isDark, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
