"use client";
import { useState, useEffect } from 'react';
import { Moon, Sun, Globe, Bell, Calendar, Clock, Eye, Type, CheckCircle } from 'lucide-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useI18n } from '../../../lib/i18n';

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
  const { locale, setLocale, t } = useI18n();
  const [fontSize, setFontSize] = useState('medium');
  const [highContrast, setHighContrast] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [emailReminders, setEmailReminders] = useState(true);
  const [defaultView, setDefaultView] = useState('week');
  const [weekStart, setWeekStart] = useState('monday');
  const [timeFormat, setTimeFormat] = useState('12h');
  const [showWeekends, setShowWeekends] = useState(true);
  const [showToast, setShowToast] = useState(false);

  // Apply the initial theme to the document on mount. We initialize `theme`
  // synchronously from localStorage, so this only needs to run once.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (theme === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    }
  }, []);

  useEffect(() => {
    if (!showToast) return;
    const timer = setTimeout(() => setShowToast(false), 3200);
    return () => clearTimeout(timer);
  }, [showToast]);

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
        await supabase.auth.updateUser({ data: { theme } });
      }
    } catch (e) {
    }

    try { localStorage.setItem('theme', theme); } catch {}

    try {
      const expires = 60 * 60 * 24 * 365; // seconds
      const cookieVal = encodeURIComponent(theme);
      document.cookie = `theme=${cookieVal}; Max-Age=${expires}; Path=/; SameSite=Lax`;
    } catch (e) {
    }

    setShowToast(true);
  };

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'} transition-colors duration-200`}>
      <div className="pointer-events-none fixed top-4 left-0 right-0 z-40 flex justify-center px-4">
        <div
          role="status"
          aria-live="polite"
          className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border border-emerald-200 bg-white/95 px-4 py-3 text-sm text-emerald-900 shadow-lg backdrop-blur transition-all duration-300 dark:border-emerald-500/40 dark:bg-slate-900/90 dark:text-emerald-100 ${
            showToast ? 'translate-y-0 opacity-100' : '-translate-y-6 opacity-0'
          }`}
        >
          <CheckCircle className="mt-0.5 h-5 w-5 text-emerald-500" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">{t('settings.toast.saved')}</p>
            <p className="text-xs text-emerald-800/80 dark:text-emerald-100/70">{t('settings.toast.savedDescription')}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowToast(false)}
            className="ml-auto text-xs font-semibold text-emerald-700 underline-offset-2 transition hover:underline dark:text-emerald-200"
          >
            OK
          </button>
        </div>
      </div>
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <div className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
          <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            {t('subtitle')}
          </p>
        </div>

        <section className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm p-6 space-y-6`}>
          <div className="flex items-center gap-3 mb-4">
            <Eye className={`w-5 h-5 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
            <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {t('accessibility')}
            </h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? <Moon className="w-5 h-5 text-gray-400" /> : <Sun className="w-5 h-5 text-gray-600" />}
                <div>
                  <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {t('theme')}
                  </label>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    {t('theme_desc')}
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
                  {t('light')}
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
                  {t('dark')}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`} />
                <div>
                  <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {t('language')}
                  </label>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    {t('language_desc')}
                  </p>
                </div>
              </div>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className={`px-4 py-2 rounded-lg border ${
                  theme === 'dark'
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              >
                <option value="en">{t('english')}</option>
                <option value="es">{t('spanish')}</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Type className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`} />
                <div>
                  <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {t('font_size')}
                  </label>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    {t('font_size_desc')}
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
                <option value="small">{t('small')}</option>
                <option value="medium">{t('medium')}</option>
                <option value="large">{t('large')}</option>
                <option value="xlarge">{t('xlarge')}</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {t('high_contrast')}
                </label>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  {t('high_contrast_desc')}
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
              {t('notifications')}
            </h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {t('push_notifications')}
                </label>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  {t('push_notifications_desc')}
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
                  {t('email_reminders')}
                </label>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  {t('email_reminders_desc')}
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
              {t('calendar_prefs')}
            </h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {t('default_view')}
                </label>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  {t('default_view_desc')}
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
                <option value="day">{t('day')}</option>
                <option value="week">{t('week')}</option>
                <option value="month">{t('month')}</option>
                <option value="agenda">{t('agenda')}</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {t('week_starts')}
                </label>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  {t('week_starts_desc')}
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
                <option value="sunday">{t('sunday')}</option>
                <option value="monday">{t('monday')}</option>
                <option value="saturday">{t('saturday')}</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`} />
                <div>
                  <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {t('time_format')}
                  </label>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    {t('time_format_desc')}
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
                  {t('12h')}
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
                  {t('24h')}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {t('show_weekends')}
                </label>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  {t('show_weekends_desc')}
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
            {t('cancel')}
          </button>
          <button
            onClick={saveChanges}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('save_changes')}
          </button>
        </div>
      </div>
    </div>
  );
}
