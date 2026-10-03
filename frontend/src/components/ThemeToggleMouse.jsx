import { useState, useEffect } from 'react';

export default function ThemeToggleMouse() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <button
      type="button"
      className="mouse-toggle-wrapper"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
    >
      <div className="mouse-cable"></div>
      <div className="mouse-body">
        <div className="mouse-wheel"></div>
        <div className="mouse-line"></div>
      </div>
    </button>
  );
}
