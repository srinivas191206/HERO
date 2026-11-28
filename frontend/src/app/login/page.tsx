'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { SupabaseStateClient } from '../../services/cloud/SupabaseStateClient';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Eye,
  EyeOff,
  Globe,
  Info,
  Lock,
  Mail,
  Moon,
  RadioTower,
  RefreshCw,
  Settings,
  ShieldCheck,
  Smartphone,
  Sun,
  X
} from 'lucide-react';

type LoginLanguage = 'en' | 'te';
type ThemeMode = 'light' | 'dark';

const COPY: Record<
  LoginLanguage,
  {
    apPoliceEn: string;
    apPoliceTe: string;
    portalSubtitle: string;
    secureAccess: string;
    authorizedOnly: string;
    connectionMode: string;
    districtNode: string;
    districtSub: string;
    stateCloud: string;
    stateSub: string;
    emailPlaceholderCloud: string;
    emailPlaceholderLocal: string;
    passwordPlaceholder: string;
    rememberDevice: string;
    forgotPassword: string;
    secureLogin: string;
    authenticating: string;
    securityFooter: string;
    districtTools: string;
  }
> = {
  en: {
    apPoliceEn: 'ANDHRA PRADESH STATE POLICE',
    apPoliceTe: 'ఆంధ్రప్రదేశ్ రాష్ట్ర పోలీస్',
    portalSubtitle: 'EMERGENCY OPERATIONS PORTAL',
    secureAccess: 'Secure Access',
    authorizedOnly: 'Authorized Personnel Only',
    connectionMode: 'Connection Mode',
    districtNode: 'District Node',
    districtSub: 'Local (Offline) Network',
    stateCloud: 'State Cloud',
    stateSub: 'Online (Central) Access',
    emailPlaceholderCloud: 'Official Email (e.g., name@ap.gov.in)',
    emailPlaceholderLocal: 'Badge ID or Email (e.g., p1 / admin)',
    passwordPlaceholder: 'Password',
    rememberDevice: 'Remember this device',
    forgotPassword: 'Forgot Password?',
    secureLogin: 'Secure Login',
    authenticating: 'Authenticating...',
    securityFooter: 'Protected with end-to-end encryption and government-grade security.',
    districtTools: 'District Node Tools & Server IP'
  },
  te: {
    apPoliceEn: 'ANDHRA PRADESH STATE POLICE',
    apPoliceTe: 'ఆంధ్రప్రదేశ్ రాష్ట్ర పోలీస్',
    portalSubtitle: 'అత్యవసర కార్యకలాపాల పోర్టల్',
    secureAccess: 'సురక్షిత ప్రవేశం',
    authorizedOnly: 'అధికారిక సిబ్బందికి మాత్రమే',
    connectionMode: 'కనెక్షన్ విధానం',
    districtNode: 'జిల్లా నోడ్',
    districtSub: 'స్థానిక (ఆఫ్‌లైన్) నెట్‌వర్క్',
    stateCloud: 'రాష్ట్ర క్లౌడ్',
    stateSub: 'ఆన్‌లైన్ (కేంద్ర) యాక్సెస్',
    emailPlaceholderCloud: 'అధికారిక ఇమెయిల్ (ఉదా: name@ap.gov.in)',
    emailPlaceholderLocal: 'బ్యాడ్జ్ కోడ్ లేదా ఇమెయిల్ (ఉదా: p1 / admin)',
    passwordPlaceholder: 'పాస్‌వర్డ్',
    rememberDevice: 'ఈ పరికరాన్ని గుర్తుంచుకోండి',
    forgotPassword: 'పాస్‌వర్డ్ మర్చిపోయారా?',
    secureLogin: 'సురక్షిత లాగిన్',
    authenticating: 'ధృవీకరిస్తోంది...',
    securityFooter: 'ఎండ్-టు-ఎండ్ ఎన్‌క్రిప్షన్ మరియు ప్రభుత్వ స్థాయి భద్రతతో రక్షించబడింది.',
    districtTools: 'జిల్లా నోడ్ టూల్స్ & సర్వర్ IP'
  }
};

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, user, isLoading } = useAuth();

  const [badgeNumber, setBadgeNumber] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberDevice, setRememberDevice] = useState<boolean>(false);
  const [language, setLanguage] = useState<LoginLanguage>('en');
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [error, setError] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);

  // NFC simulation & forgot password modal state
  const [isNfcScanning, setIsNfcScanning] = useState<boolean>(false);
  const [scanSuccess, setScanSuccess] = useState<boolean>(false);
  const [showForgotModal, setShowForgotModal] = useState<boolean>(false);
  const [resetEmail, setResetEmail] = useState<string>('');
  const [resetStatus, setResetStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState<boolean>(false);

  // District Node IP override & connection tools
  const [showDistrictTools, setShowDistrictTools] = useState<boolean>(false);
  const [showModeInfo, setShowModeInfo] = useState<boolean>(false);
  const [customIp, setCustomIp] = useState<string>('');
  const [ipSavedMessage, setIpSavedMessage] = useState<string>('');
  const [connectionMode, setConnectionMode] = useState<'local' | 'cloud'>('local');
  const [cloudReady, setCloudReady] = useState<boolean>(false);

  const t = COPY[language];
  const isDark = theme === 'dark';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const initTimer = setTimeout(() => {
      setCustomIp(localStorage.getItem('tactical_server_ip') || '');

      const configured = SupabaseStateClient.isConfigured();
      setCloudReady(configured);
      if (configured) {
        setConnectionMode(SupabaseStateClient.getConnectionMode());
      }

      const savedRemember = localStorage.getItem('hero_remember_device') === '1';
      if (savedRemember) {
        setRememberDevice(true);
        const savedIdentifier = localStorage.getItem('hero_remembered_identifier');
        if (savedIdentifier) setBadgeNumber(savedIdentifier);
      }

      const savedLang = localStorage.getItem('hero_login_lang');
      if (savedLang === 'en' || savedLang === 'te') setLanguage(savedLang);

      const savedTheme = localStorage.getItem('hero_login_theme');
      if (savedTheme === 'light' || savedTheme === 'dark') {
        setTheme(savedTheme);
      }
    }, 0);
    return () => clearTimeout(initTimer);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    let meta = document.querySelector('meta[name="color-scheme"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'color-scheme';
      document.head.appendChild(meta);
    }
    const savedTheme = (() => {
      try {
        return localStorage.getItem('hero_login_theme');
      } catch {
        return null;
      }
    })();
    meta.content = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : theme;
  }, [theme]);

  const handleLanguageChange = (nextLang: LoginLanguage) => {
    setLanguage(nextLang);
    try {
      localStorage.setItem('hero_login_lang', nextLang);
    } catch {}
  };

  const handleToggleTheme = () => {
    const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    try {
      const systemTheme: ThemeMode =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
      if (nextTheme === systemTheme) {
        localStorage.removeItem('hero_login_theme');
        const meta = document.querySelector('meta[name="color-scheme"]') as HTMLMetaElement | null;
        if (meta) meta.content = 'light dark';
      } else {
        localStorage.setItem('hero_login_theme', nextTheme);
      }
    } catch {}
  };

  const switchMode = (mode: 'local' | 'cloud') => {
    setConnectionMode(mode);
    SupabaseStateClient.setConnectionMode(mode);
    setError(null);
    setInfoNotice(null);
  };

  const saveServerIp = () => {
    if (typeof window === 'undefined') return;
    const cleanIp = customIp.trim();
    if (cleanIp) {
      localStorage.setItem('tactical_server_ip', cleanIp);
      setIpSavedMessage('Server IP saved! Reloading...');
    } else {
      localStorage.removeItem('tactical_server_ip');
      setIpSavedMessage('Reset to Default! Reloading...');
    }
    setTimeout(() => {
      window.location.reload();
    }, 900);
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === 'state_admin') {
        router.replace('/admin');
      } else if (user.role === 'dispatcher') {
        router.replace('/command');
      } else {
        router.replace('/officer');
      }
    }
  }, [isAuthenticated, user, router]);

  const handleFormSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setInfoNotice(null);

    if (!badgeNumber.trim()) {
      setError(
        connectionMode === 'cloud'
          ? 'Official Email is required.'
          : 'Badge Number / User ID is required.'
      );
      return;
    }
    if (!pin || pin.length < 4) {
      setError('A password / passcode of at least 4 characters is required.');
      return;
    }

    try {
      if (typeof window !== 'undefined') {
        if (rememberDevice) {
          localStorage.setItem('hero_remember_device', '1');
          localStorage.setItem('hero_remembered_identifier', badgeNumber.trim());
        } else {
          localStorage.removeItem('hero_remember_device');
          localStorage.removeItem('hero_remembered_identifier');
        }
      }

      const loggedInUser = await login(badgeNumber.trim(), pin);
      if (loggedInUser.role === 'state_admin') {
        router.push('/admin');
      } else if (loggedInUser.role === 'dispatcher') {
        router.push('/command');
      } else {
        router.push('/officer');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid credentials or passcode.');
    }
  };

  const triggerNfcSimulation = () => {
    setError(null);
    setIsNfcScanning(true);
    setScanSuccess(false);

    setTimeout(() => {
      setScanSuccess(true);
      setTimeout(async () => {
        try {
          setBadgeNumber('p1');
          setPin('police');
          const loggedInUser = await login('p1', 'police');
          if (loggedInUser.role === 'dispatcher') {
            router.push('/command');
          } else {
            router.push('/officer');
          }
        } catch {
          setError('NFC Badge authentication failed.');
          setIsNfcScanning(false);
          setScanSuccess(false);
        }
      }, 800);
    }, 1400);
  };

  const loadPreset = async (presetBadge: string, presetPin: string) => {
    setError(null);
    setBadgeNumber(presetBadge);
    setPin(presetPin);
    try {
      const loggedInUser = await login(presetBadge, presetPin);
      if (loggedInUser.role === 'state_admin') {
        router.push('/admin');
      } else if (loggedInUser.role === 'dispatcher') {
        router.push('/command');
      } else {
        router.push('/officer');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Preset authentication failed.');
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetStatus(null);
    const trimmed = resetEmail.trim();
    if (!trimmed) return;

    if (connectionMode === 'cloud' && cloudReady && trimmed.includes('@')) {
      const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
      const supabaseAnon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
      if (!supabaseUrl || !supabaseAnon) {
        setResetStatus({ ok: false, text: 'Supabase Cloud config missing in this build.' });
        return;
      }
      setResetSubmitting(true);
      try {
        const res = await fetch(`${supabaseUrl}/auth/v1/recover`, {
          method: 'POST',
          headers: {
            apikey: supabaseAnon,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email: trimmed })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setResetStatus({
            ok: false,
            text: data?.msg || data?.error_description || 'Could not send reset email.'
          });
        } else {
          setResetStatus({
            ok: true,
            text: `Recovery link dispatched to ${trimmed}. Check your official inbox.`
          });
        }
      } catch {
        setResetStatus({ ok: false, text: 'Network error contacting State Cloud Auth.' });
      } finally {
        setResetSubmitting(false);
      }
    } else {
      setResetStatus({
        ok: true,
        text: 'Offline District Node PINs are managed by your District HQ Dispatcher or State Command Admin.'
      });
    }
  };

  return (
    <div
      className={`min-h-screen flex flex-col font-sans overflow-x-hidden transition-colors duration-200 ${
        isDark ? 'bg-[#07152B] text-slate-100' : 'bg-[#F4F7FB] text-[#0B2348]'
      }`}
    >
      {/* Top Government Branding Header */}
      <header
        className={`w-full border-b px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3 z-20 ${
          isDark
            ? 'bg-[#0B1C38] border-slate-700/80 text-white'
            : 'bg-white border-[#DCE3ED] text-[#0B2348]'
        }`}
      >
        {/* Header Left */}
        <div className="flex items-center gap-3 min-w-0">
          <picture className="flex-shrink-0">
            <source srcSet="/ap-police-crest.webp" type="image/webp" />
            <img
              src="/ap-police-crest.png"
              alt="Andhra Pradesh State Police Logo"
              width={638}
              height={391}
              decoding="async"
              className="h-10 sm:h-11 w-auto object-contain rounded-md"
            />
          </picture>

          <div
            className={`h-8 w-px flex-shrink-0 ${isDark ? 'bg-slate-700' : 'bg-[#DCE3ED]'}`}
            aria-hidden="true"
          />

          <div className="min-w-0">
            <div className="text-[11px] sm:text-xs font-extrabold tracking-wide uppercase leading-tight truncate">
              {t.apPoliceEn}
            </div>
            <div
              className={`text-[11px] font-semibold leading-tight mt-0.5 truncate ${
                isDark ? 'text-slate-300' : 'text-[#53627A]'
              }`}
            >
              {t.apPoliceTe}
            </div>
          </div>

          <div className="hidden md:flex items-center gap-3 pl-1 flex-shrink-0">
            <div className={`h-8 w-px ${isDark ? 'bg-slate-700' : 'bg-[#DCE3ED]'}`} aria-hidden="true" />
            <div className="w-[3px] h-7 bg-[#E5242A] rounded-full" aria-hidden="true" />
            <div>
              <div className="text-sm font-black tracking-tight leading-none">HERO</div>
              <div
                className={`text-[10px] font-bold tracking-wider uppercase mt-0.5 leading-none ${
                  isDark ? 'text-slate-300' : 'text-[#53627A]'
                }`}
              >
                {t.portalSubtitle}
              </div>
            </div>
          </div>
        </div>

        {/* Header Right: Language Selector + Theme Toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => handleLanguageChange('en')}
            aria-pressed={language === 'en'}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
              language === 'en'
                ? isDark
                  ? 'bg-slate-800 border-sky-400 text-white'
                  : 'bg-[#F8FAFD] border-[#1557A6] text-[#0B2348]'
                : isDark
                  ? 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border-[#DCE3ED] text-[#53627A] hover:bg-slate-50'
            }`}
          >
            <Globe className="w-3.5 h-3.5" aria-hidden="true" />
            <span>English</span>
            <ChevronDown className="w-3 h-3 opacity-60 hidden sm:inline" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => handleLanguageChange('te')}
            aria-pressed={language === 'te'}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
              language === 'te'
                ? isDark
                  ? 'bg-slate-800 border-sky-400 text-white'
                  : 'bg-[#EAF2FC] border-[#1557A6] text-[#0B2348]'
                : isDark
                  ? 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border-[#DCE3ED] text-[#53627A] hover:bg-slate-50'
            }`}
          >
            తెలుగు
          </button>

          <button
            type="button"
            onClick={handleToggleTheme}
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            className={`p-2 rounded-lg border cursor-pointer transition ${
              isDark
                ? 'bg-slate-800 border-slate-600 text-amber-300 hover:bg-slate-700'
                : 'bg-white border-[#DCE3ED] text-[#0B2348] hover:bg-slate-50'
            }`}
          >
            {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Split Stage with Official HERO_BG Artwork */}
      <main className="relative flex-1 flex flex-col lg:flex-row items-center justify-center lg:justify-end px-4 py-6 sm:px-8 lg:px-14 xl:px-20">
        {/* Unified Single HERO_BG <picture> (Preload-scanner discoverable WebP + PNG fallback across Desktop & Mobile) */}
        <picture className="w-full max-w-[460px] mb-5 rounded-2xl overflow-hidden border border-[#DCE3ED] shadow-md bg-white aspect-[16/9] block lg:max-w-none lg:mb-0 lg:rounded-none lg:border-0 lg:shadow-none lg:bg-transparent lg:aspect-auto lg:absolute lg:inset-0 lg:pointer-events-none">
          <source srcSet="/hero-bg.webp" type="image/webp" />
          <img
            src="/hero-bg.png"
            alt="HERO Hybrid Emergency Response and Operations"
            width={1672}
            height={941}
            fetchPriority="high"
            decoding="async"
            className="w-full h-full object-cover object-left lg:object-center"
          />
        </picture>
        {isDark && (
          <div
            aria-hidden="true"
            className="hidden lg:block absolute inset-0 bg-[#07152B]/45 pointer-events-none"
          />
        )}

        {/* Right Side Login Card – Secure Access */}
        <section
          aria-label="Secure Login"
          className={`relative z-10 w-full max-w-[440px] rounded-2xl border p-6 sm:p-7 transition-colors ${
            isDark
              ? 'bg-[#0D2140]/95 border-slate-700 text-white shadow-[0_24px_60px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md'
              : 'bg-white/95 border-[#DCE3ED] text-[#0B2348] shadow-[0_24px_60px_-12px_rgba(11,35,72,0.18)] backdrop-blur-md'
          }`}
        >
          {/* Card Heading */}
          <div className="flex items-center gap-3.5 pb-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                isDark
                  ? 'bg-[#15315B] border-slate-600 text-sky-300'
                  : 'bg-[#EAF2FC] border-[#DCE3ED] text-[#0B2348]'
              }`}
            >
              <Lock className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight leading-tight">
                {t.secureAccess}
              </h1>
              <p className={`text-xs font-medium mt-0.5 ${isDark ? 'text-slate-300' : 'text-[#53627A]'}`}>
                {t.authorizedOnly}
              </p>
            </div>
          </div>

          {/* Thin divider with emergency red accent */}
          <div className={`relative h-px w-full mb-5 ${isDark ? 'bg-slate-700' : 'bg-[#DCE3ED]'}`}>
            <span className="absolute left-0 top-0 h-[2px] w-8 bg-[#E5242A] rounded-full -translate-y-[0.5px]" />
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-4">
            {/* Connection Mode Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold">{t.connectionMode}</span>
                  <button
                    type="button"
                    onClick={() => setShowModeInfo(!showModeInfo)}
                    aria-label="Connection mode details"
                    className={`p-0.5 rounded-full cursor-pointer ${
                      isDark ? 'text-slate-400 hover:text-white' : 'text-[#53627A] hover:text-[#0B2348]'
                    }`}
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {showModeInfo && (
                <p
                  className={`text-[11px] mb-2 p-2.5 rounded-lg border leading-relaxed ${
                    isDark
                      ? 'bg-slate-800/80 border-slate-700 text-slate-300'
                      : 'bg-[#F4F8FD] border-[#DCE3ED] text-[#53627A]'
                  }`}
                >
                  Use <strong>District Node</strong> for local offline/LAN mesh terminals (:5001) or{' '}
                  <strong>State Cloud</strong> for centralized Supabase access.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => switchMode('local')}
                  aria-pressed={connectionMode === 'local'}
                  className={`relative flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    connectionMode === 'local'
                      ? isDark
                        ? 'border-sky-400 bg-[#15315B] text-white'
                        : 'border-[#1557A6] bg-[#EAF2FC] text-[#0B2348]'
                      : isDark
                        ? 'border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800'
                        : 'border-[#DCE3ED] bg-white text-[#53627A] hover:bg-slate-50'
                  }`}
                >
                  <RadioTower
                    className={`w-4 h-4 flex-shrink-0 ${
                      connectionMode === 'local'
                        ? isDark
                          ? 'text-sky-300'
                          : 'text-[#1557A6]'
                        : 'opacity-70'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 pr-3">
                    <div className="text-xs font-bold leading-tight truncate">{t.districtNode}</div>
                    <div className="text-[10px] opacity-80 leading-tight mt-0.5 truncate">
                      {t.districtSub}
                    </div>
                  </div>
                  {connectionMode === 'local' && (
                    <span
                      className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#1557A6] text-white flex items-center justify-center"
                      aria-hidden="true"
                    >
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => switchMode('cloud')}
                  aria-pressed={connectionMode === 'cloud'}
                  className={`relative flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    connectionMode === 'cloud'
                      ? isDark
                        ? 'border-sky-400 bg-[#15315B] text-white'
                        : 'border-[#1557A6] bg-[#EAF2FC] text-[#0B2348]'
                      : isDark
                        ? 'border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800'
                        : 'border-[#DCE3ED] bg-white text-[#53627A] hover:bg-slate-50'
                  }`}
                >
                  <Cloud
                    className={`w-4 h-4 flex-shrink-0 ${
                      connectionMode === 'cloud'
                        ? isDark
                          ? 'text-sky-300'
                          : 'text-[#1557A6]'
                        : 'opacity-70'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 pr-3">
                    <div className="text-xs font-bold leading-tight truncate">{t.stateCloud}</div>
                    <div className="text-[10px] opacity-80 leading-tight mt-0.5 truncate">
                      {t.stateSub}
                    </div>
                  </div>
                  {connectionMode === 'cloud' && (
                    <span
                      className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#1557A6] text-white flex items-center justify-center"
                      aria-hidden="true"
                    >
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Email / Badge Identifier Input */}
            <div>
              <label htmlFor="hero-login-identifier" className="sr-only">
                {connectionMode === 'cloud' ? 'Official Email' : 'Badge Number or Official Email'}
              </label>
              <div
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border transition ${
                  isDark
                    ? 'bg-slate-900/70 border-slate-700 focus-within:border-sky-400'
                    : 'bg-white border-[#DCE3ED] focus-within:border-[#1557A6] focus-within:ring-2 focus-within:ring-[#EAF2FC]'
                }`}
              >
                <Mail
                  className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-slate-400' : 'text-[#53627A]'}`}
                  aria-hidden="true"
                />
                <input
                  id="hero-login-identifier"
                  name="email"
                  type={connectionMode === 'cloud' ? 'email' : 'text'}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  placeholder={
                    connectionMode === 'cloud' ? t.emailPlaceholderCloud : t.emailPlaceholderLocal
                  }
                  value={badgeNumber}
                  onChange={(e) => setBadgeNumber(e.target.value)}
                  className={`w-full bg-transparent border-none outline-none text-sm font-medium ${
                    isDark
                      ? 'text-white placeholder-slate-400'
                      : 'text-[#0B2348] placeholder-[#53627A]/80'
                  }`}
                  required
                />
              </div>
            </div>

            {/* Password Input + Visibility Toggle */}
            <div>
              <label htmlFor="hero-login-password" className="sr-only">
                Password
              </label>
              <div
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border transition ${
                  isDark
                    ? 'bg-slate-900/70 border-slate-700 focus-within:border-sky-400'
                    : 'bg-white border-[#DCE3ED] focus-within:border-[#1557A6] focus-within:ring-2 focus-within:ring-[#EAF2FC]'
                }`}
              >
                <Lock
                  className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-slate-400' : 'text-[#53627A]'}`}
                  aria-hidden="true"
                />
                <input
                  id="hero-login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  enterKeyHint="done"
                  placeholder={t.passwordPlaceholder}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className={`w-full bg-transparent border-none outline-none text-sm font-medium ${
                    isDark
                      ? 'text-white placeholder-slate-400'
                      : 'text-[#0B2348] placeholder-[#53627A]/80'
                  }`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className={`p-1 rounded-md cursor-pointer transition ${
                    isDark ? 'text-slate-400 hover:text-white' : 'text-[#53627A] hover:text-[#0B2348]'
                  }`}
                >
                  {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Device & Forgot Password */}
            <div className="flex items-center justify-between text-xs pt-0.5">
              <label
                htmlFor="hero-remember-device"
                className={`inline-flex items-center gap-2 cursor-pointer select-none font-medium ${
                  isDark ? 'text-slate-300' : 'text-[#53627A]'
                }`}
              >
                <input
                  id="hero-remember-device"
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="w-4 h-4 rounded border-[#DCE3ED] accent-[#1557A6] cursor-pointer"
                />
                <span>{t.rememberDevice}</span>
              </label>

              <button
                type="button"
                onClick={() => {
                  setResetEmail(badgeNumber.includes('@') ? badgeNumber : '');
                  setResetStatus(null);
                  setShowForgotModal(true);
                }}
                className={`font-semibold cursor-pointer hover:underline ${
                  isDark ? 'text-sky-300' : 'text-[#1557A6]'
                }`}
              >
                {t.forgotPassword}
              </button>
            </div>

            {/* Error / Info Feedback */}
            {error && (
              <div
                role="alert"
                className="p-3 rounded-xl border border-red-200 bg-red-50 text-[#E5242A] text-xs font-semibold flex items-center gap-2"
              >
                <Lock className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {infoNotice && (
              <div className="p-3 rounded-xl border border-sky-200 bg-[#EAF2FC] text-[#0B2348] text-xs font-semibold">
                {infoNotice}
              </div>
            )}

            {/* Primary Secure Login CTA */}
            <button
              type="submit"
              disabled={isLoading || isNfcScanning}
              className="w-full py-3 px-4 rounded-xl bg-[#0B2348] hover:bg-[#1557A6] disabled:opacity-60 text-white font-bold text-sm flex items-center justify-between shadow-md cursor-pointer transition active:scale-[0.99]"
            >
              <span className="w-4" aria-hidden="true" />
              <span className="inline-flex items-center gap-2">
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>{t.authenticating}</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" aria-hidden="true" />
                    <span>{t.secureLogin}</span>
                  </>
                )}
              </span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>

            {/* Security Footer */}
            <div
              className={`rounded-xl border px-3.5 py-2.5 flex items-center gap-3 text-xs ${
                isDark
                  ? 'bg-slate-900/60 border-slate-700 text-slate-300'
                  : 'bg-[#F4F8FD] border-[#DCE3ED] text-[#53627A]'
              }`}
            >
              <ShieldCheck
                className={`w-5 h-5 flex-shrink-0 ${isDark ? 'text-sky-300' : 'text-[#0B2348]'}`}
                aria-hidden="true"
              />
              <span className="leading-snug">{t.securityFooter}</span>
            </div>

            {/* District Node Local Tools & Server Config (Preserved cleanly under District Node mode) */}
            {connectionMode === 'local' && (
              <div className={`pt-2 border-t ${isDark ? 'border-slate-700' : 'border-[#DCE3ED]'}`}>
                <button
                  type="button"
                  onClick={() => setShowDistrictTools(!showDistrictTools)}
                  className={`w-full flex items-center justify-between text-[11px] font-bold py-1 cursor-pointer ${
                    isDark ? 'text-slate-300 hover:text-white' : 'text-[#53627A] hover:text-[#0B2348]'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Settings className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.districtTools}</span>
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${showDistrictTools ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>

                {showDistrictTools && (
                  <div
                    className={`mt-2 p-3 rounded-xl border space-y-3 text-xs ${
                      isDark ? 'bg-slate-900/70 border-slate-700' : 'bg-[#F4F8FD] border-[#DCE3ED]'
                    }`}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => loadPreset('state_admin', 'police')}
                        className="py-1.5 px-2 rounded-lg border border-[#DCE3ED] bg-white hover:bg-[#EAF2FC] text-[#0B2348] text-[10px] font-bold uppercase cursor-pointer"
                      >
                        State Admin
                      </button>
                      <button
                        type="button"
                        onClick={() => loadPreset('admin', 'police')}
                        className="py-1.5 px-2 rounded-lg border border-[#DCE3ED] bg-white hover:bg-[#EAF2FC] text-[#0B2348] text-[10px] font-bold uppercase cursor-pointer"
                      >
                        District HQ
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={triggerNfcSimulation}
                      disabled={isLoading || isNfcScanning}
                      className="w-full py-1.5 px-2.5 rounded-lg border border-[#DCE3ED] bg-white hover:bg-[#EAF2FC] text-[#0B2348] text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Smartphone className="w-3.5 h-3.5 text-[#1557A6]" aria-hidden="true" />
                      <span>Simulate Contactless Badge Scan</span>
                    </button>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="tactical-server-ip"
                        className="text-[10px] font-bold uppercase tracking-wider block opacity-80"
                      >
                        Tactical Server IP Address
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="tactical-server-ip"
                          type="text"
                          placeholder="e.g. 192.168.0.103"
                          value={customIp}
                          onChange={(e) => setCustomIp(e.target.value)}
                          className="flex-1 px-2.5 py-1.5 bg-white border border-[#DCE3ED] rounded-lg text-xs font-mono text-[#0B2348] focus:outline-none focus:border-[#1557A6]"
                        />
                        <button
                          type="button"
                          onClick={saveServerIp}
                          className="px-3 py-1.5 bg-[#1557A6] hover:bg-[#0B2348] text-white text-[10px] font-bold uppercase rounded-lg cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                      {ipSavedMessage && (
                        <span className="text-[10px] font-bold text-emerald-600 block">
                          {ipSavedMessage}
                        </span>
                      )}
                      <span className="text-[10px] opacity-75 block">
                        Default (Auto): {typeof window !== 'undefined' ? window.location.hostname : 'localhost'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>
        </section>
      </main>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-password-title"
          className="fixed inset-0 bg-[#0B2348]/45 backdrop-blur-xs z-40 flex items-center justify-center p-4"
        >
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl space-y-4 ${
              isDark ? 'bg-[#0D2140] border-slate-700 text-white' : 'bg-white border-[#DCE3ED] text-[#0B2348]'
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 id="forgot-password-title" className="text-base font-extrabold">
                Password Recovery
              </h2>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                aria-label="Close password recovery"
                className="p-1 rounded-lg hover:bg-slate-100 text-[#53627A] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleForgotPasswordSubmit} className="space-y-3 text-xs">
              <p className={isDark ? 'text-slate-300' : 'text-[#53627A]'}>
                {connectionMode === 'cloud'
                  ? 'Enter your official State Cloud email to receive a password reset link.'
                  : 'For offline District Node credentials, enter your badge/email or contact your District HQ Dispatcher.'}
              </p>
              <input
                type="text"
                required
                placeholder="name@ap.gov.in or badge ID"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-white focus:border-sky-400'
                    : 'bg-white border-[#DCE3ED] text-[#0B2348] focus:border-[#1557A6]'
                }`}
              />
              {resetStatus && (
                <div
                  className={`p-2.5 rounded-xl border text-xs font-semibold ${
                    resetStatus.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-red-50 border-red-200 text-[#E5242A]'
                  }`}
                >
                  {resetStatus.text}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#DCE3ED] text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetSubmitting}
                  className="px-4 py-2 rounded-xl bg-[#0B2348] hover:bg-[#1557A6] text-white text-xs font-bold cursor-pointer disabled:opacity-60"
                >
                  {resetSubmitting ? 'Sending...' : 'Request Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NFC Scan Simulation Overlay */}
      {isNfcScanning && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-md z-40 flex items-center justify-center p-4">
          <div className="bg-white border border-[#DCE3ED] rounded-2xl p-6 w-full max-w-[340px] text-center shadow-2xl flex flex-col items-center gap-4 text-[#0B2348]">
            {scanSuccess ? (
              <div className="bg-emerald-50 text-emerald-600 p-4 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-10 h-10" />
              </div>
            ) : (
              <div className="bg-[#EAF2FC] text-[#1557A6] p-4 rounded-full border border-[#DCE3ED] relative">
                <Smartphone className="w-10 h-10 animate-pulse" />
                <span className="absolute -inset-1.5 border border-[#1557A6]/40 rounded-full animate-ping" />
              </div>
            )}
            <div>
              <h3 className="font-extrabold text-sm uppercase tracking-wide">
                {scanSuccess ? 'Decryption Success' : 'Badge Scanning'}
              </h3>
              <p className="text-xs text-[#53627A] leading-relaxed mt-1">
                {scanSuccess
                  ? 'Badge key verified. Redirecting...'
                  : 'Hold your police smart card against the screen reader...'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
