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
    <div
      className="mouse-toggle-wrapper"
      onClick={toggleTheme}
      title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
    >
      <div className="mouse-cable"></div>
      <div className="mouse-body">
        <div className="mouse-wheel"></div>
        <div className="mouse-line"></div>
      </div>
    </div>
  );
}
