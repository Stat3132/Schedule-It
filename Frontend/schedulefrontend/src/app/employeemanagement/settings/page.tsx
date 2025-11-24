"use client";
import { useState, useEffect } from 'react';
import { Moon, Sun, Globe, Bell, Calendar, Clock, Eye, Type } from 'lucide-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const supabase = createClientComponentClient();

export default function Settings() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved as 'dark' | 'light';
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    } catch (e) {}
    return 'light';
  });
  const [language, setLanguage] = useState('en');
  const [fontSize, setFontSize] = useState('medium');
  const [highContrast, setHighContrast] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [emailReminders, setEmailReminders] = useState(true);
  const [defaultView, setDefaultView] = useState('week');
  const [weekStart, setWeekStart] = useState('monday');
  const [timeFormat, setTimeFormat] = useState('12h');
  const [showWeekends, setShowWeekends] = useState(true);

  // Apply the initial theme to the document on mount. We initialize `theme`
  // synchronously from localStorage, so this only needs to run once.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (theme === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    }
  }, []);

  const applyThemeToDocument = (t: 'light' | 'dark') => {
    try {
      if (typeof document !== 'undefined') {
        if (t === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
      }
    } catch (e) {
      // ignore
    }
  };

  const saveChanges = async () => {
    try {
      // Persist to Supabase user metadata when signed in
      const { data } = await supabase.auth.getUser();
      const user = data?.user ?? null;
      if (user) {
        // update user metadata with theme
        // supabase.auth.updateUser will merge into user_metadata
        await supabase.auth.updateUser({ data: { theme } });
      }
    } catch (e) {
      // ignore errors — still persist locally
    }

    try { localStorage.setItem('theme', theme); } catch {}

    try {
      // Set a cookie so the server can read the preference for SSR
      // Use a 1 year max-age. Use SameSite=Lax to be generally safe.
      const expires = 60 * 60 * 24 * 365; // seconds
      const cookieVal = encodeURIComponent(theme);
      document.cookie = `theme=${cookieVal}; Max-Age=${expires}; Path=/; SameSite=Lax`;
    } catch (e) {
      // ignore cookie errors in restricted environments
    }
  };

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'} transition-colors duration-200`}>
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <div className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Customize your schedule experience
          </p>
        </div>

        <section className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm p-6 space-y-6`}>
          <div className="flex items-center gap-3 mb-4">
            <Eye className={`w-5 h-5 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
            <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              Accessibility
            </h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? <Moon className="w-5 h-5 text-gray-400" /> : <Sun className="w-5 h-5 text-gray-600" />}
                <div>
                  <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    Theme
                  </label>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    Choose your preferred color scheme
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setTheme('light');
                    applyThemeToDocument('light');
                  }}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    theme === 'light'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Light
                </button>
                <button
                  onClick={() => {
                    setTheme('dark');
                    applyThemeToDocument('dark');
                  }}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    theme === 'dark'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Dark
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`} />
                <div>
                  <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    Language
                  </label>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    Select your preferred language
                  </p>
                </div>
              </div>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className={`px-4 py-2 rounded-lg border ${
                  theme === 'dark'
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              >
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="zh">中文</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Type className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`} />
                <div>
                  <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    Font Size
                  </label>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    Adjust text size for better readability
                  </p>
                </div>
              </div>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value)}
                className={`px-4 py-2 rounded-lg border ${
                  theme === 'dark'
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
                <option value="xlarge">Extra Large</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  High Contrast
                </label>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Enhance visual contrast for better visibility
                </p>
              </div>
              <button
                onClick={() => setHighContrast(!highContrast)}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  highContrast ? 'bg-blue-600' : theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                    highContrast ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        <section className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm p-6 space-y-6`}>
          <div className="flex items-center gap-3 mb-4">
            <Bell className={`w-5 h-5 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
            <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              Notifications
            </h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  Push Notifications
                </label>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Receive notifications for upcoming events
                </p>
              </div>
              <button
                onClick={() => setNotifications(!notifications)}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  notifications ? 'bg-blue-600' : theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                    notifications ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  Email Reminders
                </label>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Get email reminders for scheduled events
                </p>
              </div>
              <button
                onClick={() => setEmailReminders(!emailReminders)}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  emailReminders ? 'bg-blue-600' : theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                    emailReminders ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        <section className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm p-6 space-y-6`}>
          <div className="flex items-center gap-3 mb-4">
            <Calendar className={`w-5 h-5 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
            <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              Calendar Preferences
            </h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  Default View
                </label>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Choose your preferred calendar view
                </p>
              </div>
              <select
                value={defaultView}
                onChange={(e) => setDefaultView(e.target.value)}
                className={`px-4 py-2 rounded-lg border ${
                  theme === 'dark'
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              >
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="agenda">Agenda</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  Week Starts On
                </label>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Select the first day of the week
                </p>
              </div>
              <select
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                className={`px-4 py-2 rounded-lg border ${
                  theme === 'dark'
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              >
                <option value="sunday">Sunday</option>
                <option value="monday">Monday</option>
                <option value="saturday">Saturday</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`} />
                <div>
                  <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    Time Format
                  </label>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    Choose between 12-hour or 24-hour format
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setTimeFormat('12h')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    timeFormat === '12h'
                      ? 'bg-blue-600 text-white'
                      : theme === 'dark'
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  12h
                </button>
                <button
                  onClick={() => setTimeFormat('24h')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    timeFormat === '24h'
                      ? 'bg-blue-600 text-white'
                      : theme === 'dark'
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  24h
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  Show Weekends
                </label>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Display Saturday and Sunday in calendar view
                </p>
              </div>
              <button
                onClick={() => setShowWeekends(!showWeekends)}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  showWeekends ? 'bg-blue-600' : theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                    showWeekends ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-4">
          <button
            className={`px-6 py-2 rounded-lg border transition-colors ${
              theme === 'dark'
                ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-100'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={saveChanges}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
