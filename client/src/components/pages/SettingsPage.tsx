import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { toast } from 'sonner';
import { authAPI, aiSettingsAPI } from '@/api/tasks';
import { Settings, User, Lock, Bell, Clock, Loader2, Save, Eye, EyeOff, Sparkles, TestTube, Trash2, RefreshCw, ExternalLink, CheckCircle2, XCircle, Globe, BookOpen, Zap, Shield, DollarSign, Cpu, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export default function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const { theme } = useTheme();

  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
    bio: user?.bio || '',
  });
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [showPasswords, setShowPasswords] = useState({ current: false, newPass: false, confirm: false });
  const [changingPassword, setChangingPassword] = useState(false);
  const [pomodoro, setPomodoro] = useState({
    workDuration: user?.pomodoroSettings?.workDuration || 25,
    breakDuration: user?.pomodoroSettings?.breakDuration || 5,
    longBreakDuration: user?.pomodoroSettings?.longBreakDuration || 15,
    sessionsBeforeLongBreak: user?.pomodoroSettings?.sessionsBeforeLongBreak || 4,
  });
  const [preferences, setPreferences] = useState({
    notifications: user?.preferences?.notifications ?? true,
    emailNotifications: user?.preferences?.emailNotifications ?? true,
  });
  const [saving, setSaving] = useState(false);

  // AI Settings state
  const [aiSettings, setAiSettings] = useState({
    aiProvider: '',
    aiApiKey: '',
    aiModel: '',
    temperature: 0.3,
    maxTokens: 500,
    streaming: false,
    timeout: 30000,
  });
  const [aiProviderList, setAiProviderList] = useState<Array<{
    key: string;
    label: string;
    defaultModel: string;
    recommendedModels: string[];
    description: string;
    freeTier: boolean | null;
    pricing: string;
    recommendedFor: string;
    websiteUrl: string | null;
    docsUrl: string | null;
  }>>([]);
  const [hasAiApiKey, setHasAiApiKey] = useState(false);
  const [aiSettingsLoading, setAiSettingsLoading] = useState(true);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [showAiApiKey, setShowAiApiKey] = useState(false);
  const [showAdvancedAi, setShowAdvancedAi] = useState(false);
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [lastTestResult, setLastTestResult] = useState<{ success: boolean; message: string; time: number } | null>(null);

  useEffect(() => {
    loadAiSettings();
  }, []);

  const loadAiSettings = async () => {
    try {
      const { data } = await aiSettingsAPI.getSettings();
      setAiSettings({
        aiProvider: data.aiProvider || '',
        aiApiKey: data.aiApiKey || '',
        aiModel: data.aiModel || '',
        temperature: data.aiSettings?.temperature ?? 0.3,
        maxTokens: data.aiSettings?.maxTokens ?? 500,
        streaming: data.aiSettings?.streaming ?? false,
        timeout: data.aiSettings?.timeout ?? 30000,
      });
      setAiBaseUrl(data.aiBaseUrl || '');
      setHasAiApiKey(data.hasApiKey);
      setAiProviderList(data.supportedProviders || []);
    } catch {
      // Not critical if AI settings fail to load
    } finally {
      setAiSettingsLoading(false);
    }
  };

  const handleSaveAiSettings = async () => {
    setAiSaving(true);
    try {
      const payload: any = {
        aiProvider: aiSettings.aiProvider || null,
        aiApiKey: aiSettings.aiApiKey,
        aiModel: aiSettings.aiModel,
        aiSettings: {
          temperature: aiSettings.temperature,
          maxTokens: aiSettings.maxTokens,
          streaming: aiSettings.streaming,
          timeout: aiSettings.timeout,
        },
      };
      if (aiSettings.aiProvider === 'openai-compatible' && aiBaseUrl) {
        payload.aiBaseUrl = aiBaseUrl;
      }
      const { data } = await aiSettingsAPI.updateSettings(payload);
      setHasAiApiKey(data.hasApiKey);
      setAiSettings(prev => ({ ...prev, aiApiKey: data.aiApiKey || '' }));
      toast.success('AI settings saved');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save AI settings');
    } finally {
      setAiSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setAiTesting(true);
    const startTime = Date.now();
    try {
      const { data } = await aiSettingsAPI.testConnection({
        aiProvider: aiSettings.aiProvider,
        aiApiKey: aiSettings.aiApiKey || undefined,
        aiModel: aiSettings.aiModel,
        aiBaseUrl: aiSettings.aiProvider === 'openai-compatible' ? aiBaseUrl : undefined,
        temperature: aiSettings.temperature,
        maxTokens: Math.min(aiSettings.maxTokens, 50),
        timeout: 10000,
      });
      const elapsed = Date.now() - startTime;
      setLastTestResult({ success: data.success, message: data.message || '', time: elapsed });
      if (data.success) {
        toast.success(
          (data.message || `Connected in ${elapsed}ms`)
        );
      } else {
        toast.error('Connection failed' + (data.message ? ': ' + data.message : ''));
      }
    } catch (err: any) {
      setLastTestResult({ success: false, message: err.response?.data?.message || err.message, time: Date.now() - startTime });
      const friendlyMsg = err.response?.data?.message?.toLowerCase().includes('api key')
        ? 'Invalid API key. Please check your key and try again.'
        : 'Connection test error: ' + (err.response?.data?.message || err.message);
      toast.error(friendlyMsg);
    } finally {
      setAiTesting(false);
    }
  };

  const handleRemoveAiSettings = async () => {
    if (!confirm('Remove AI provider configuration? This will disable AI features until you reconnect.')) return;
    try {
      await aiSettingsAPI.removeSettings();
      setAiSettings({
        aiProvider: '',
        aiApiKey: '',
        aiModel: '',
        temperature: 0.3,
        maxTokens: 500,
        streaming: false,
        timeout: 30000,
      });
      setHasAiApiKey(false);
      toast.success('AI provider removed');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove AI settings');
    }
  };

  // Provider logo/icon mapping (brand colors)
  const providerIcons: Record<string, { gradient: string; icon: string; color: string }> = {
    openai: { gradient: 'from-emerald-400 to-teal-500', icon: 'O', color: '#10a37f' },
    gemini: { gradient: 'from-blue-400 to-indigo-500', icon: 'G', color: '#4285f4' },
    anthropic: { gradient: 'from-orange-400 to-rose-500', icon: 'C', color: '#d97706' },
    groq: { gradient: 'from-purple-400 to-fuchsia-500', icon: 'G', color: '#a855f7' },
    openrouter: { gradient: 'from-cyan-400 to-blue-500', icon: 'OR', color: '#06b6d4' },
    together: { gradient: 'from-pink-400 to-red-500', icon: 'T', color: '#ec4899' },
    'openai-compatible': { gradient: 'from-gray-400 to-slate-500', icon: 'API', color: '#6b7280' },
  };

  const connectedProviderMeta = aiSettings.aiProvider
    ? aiProviderList.find((p: any) => p.key === aiSettings.aiProvider)
    : null;
  const providerIcon = aiSettings.aiProvider ? providerIcons[aiSettings.aiProvider] : null;

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateProfile({
        ...profile,
        preferences: {
          theme,
          notifications: preferences.notifications,
          emailNotifications: preferences.emailNotifications
        },
        pomodoroSettings: pomodoro,
      });
      // ThemeContext's useEffect already writes `theme` to localStorage on change.
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to update profile');
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (passwords.newPass !== passwords.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (passwords.newPass.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setChangingPassword(true);
    try {
      await authAPI.changePassword(passwords.current, passwords.newPass);
      toast.success('Password changed successfully');
      setPasswords({ current: '', newPass: '', confirm: '' });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 lg:p-6 max-w-3xl mx-auto"
    >
      <div className="flex items-center gap-3 mb-6">
        <Settings size={24} className="text-yellow-500" />
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Settings</h2>
          <p className="text-sm text-gray-400">Manage your account and preferences</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Profile Section */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <User size={18} className="text-yellow-500" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Profile</h3>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Name</label>
                <input
                  value={profile.name}
                  onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Email</label>
                <div className="relative">
                  <input
                    value={profile.email}
                    disabled
                    className="input-field opacity-60 cursor-not-allowed pr-20"
                  />
                  <span className={cn(
                    'absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium px-2 py-0.5 rounded-full',
                    user?.emailVerified
                      ? 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                  )}>
                    {user?.emailVerified ? 'Verified' : 'Unverified'}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Bio</label>
              <textarea
                value={profile.bio}
                onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
                className="input-field resize-none"
                rows={3}
                placeholder="Tell us about yourself..."
              />
            </div>
          </div>
        </div>

        {/* Password Section */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lock size={18} className="text-yellow-500" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Change Password</h3>
          </div>
          <div className="space-y-4 max-w-sm">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Current Password</label>
              <div className="relative">
                <input
                  type={showPasswords.current ? 'text' : 'password'}
                  value={passwords.current}
                  onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))}
                  className="input-field pr-9"
                  placeholder="Enter current password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(p => ({ ...p, current: !p.current }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  tabIndex={-1}
                  aria-label={showPasswords.current ? 'Hide password' : 'Show password'}
                >
                  {showPasswords.current ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">New Password</label>
              <div className="relative">
                <input
                  type={showPasswords.newPass ? 'text' : 'password'}
                  value={passwords.newPass}
                  onChange={e => setPasswords(p => ({ ...p, newPass: e.target.value }))}
                  className="input-field pr-9"
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(p => ({ ...p, newPass: !p.newPass }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  tabIndex={-1}
                  aria-label={showPasswords.newPass ? 'Hide password' : 'Show password'}
                >
                  {showPasswords.newPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showPasswords.confirm ? 'text' : 'password'}
                  value={passwords.confirm}
                  onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                  className="input-field pr-9"
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(p => ({ ...p, confirm: !p.confirm }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  tabIndex={-1}
                  aria-label={showPasswords.confirm ? 'Hide password' : 'Show password'}
                >
                  {showPasswords.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <Button onClick={handleChangePassword} variant="secondary" size="sm" loading={changingPassword}>
              Update Password
            </Button>
          </div>
        </div>

        {/* Pomodoro Settings */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-yellow-500" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Focus Timer</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Work (min)</label>
              <input
                type="number"
                value={pomodoro.workDuration}
                onChange={e => setPomodoro(p => ({ ...p, workDuration: Number(e.target.value) }))}
                className="input-field"
                min={1} max={120}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Break (min)</label>
              <input
                type="number"
                value={pomodoro.breakDuration}
                onChange={e => setPomodoro(p => ({ ...p, breakDuration: Number(e.target.value) }))}
                className="input-field"
                min={1} max={60}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Long Break (min)</label>
              <input
                type="number"
                value={pomodoro.longBreakDuration}
                onChange={e => setPomodoro(p => ({ ...p, longBreakDuration: Number(e.target.value) }))}
                className="input-field"
                min={1} max={120}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Long break after (sessions)</label>
              <input
                type="number"
                value={pomodoro.sessionsBeforeLongBreak}
                onChange={e => setPomodoro(p => ({ ...p, sessionsBeforeLongBreak: Number(e.target.value) }))}
                className="input-field"
                min={1} max={20}
              />
            </div>
          </div>
        </div>

        {/* AI Provider Settings */}
        <div className="card overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800/50">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-yellow-500/20">
                <Sparkles size={20} className="text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">AI Provider</h3>
                <p className="text-xs text-gray-400">Connect your preferred AI provider for intelligent features</p>
              </div>
            </div>
          </div>

          {aiSettingsLoading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3">
              <Loader2 size={24} className="animate-spin text-yellow-500" />
              <p className="text-sm text-gray-400">Loading AI settings...</p>
            </div>
          ) : !hasAiApiKey && !aiSettings.aiProvider ? (
            /* ═══════════════════════════════════════════════════════════════
               FIRST-TIME SETUP WIZARD — No provider configured
               ═══════════════════════════════════════════════════════════════ */
            <div className="p-6">
              <div className="text-center max-w-md mx-auto mb-8">
                <div className="flex justify-center mb-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-yellow-500 shadow-lg shadow-purple-500/20">
                    <Sparkles size={32} className="text-white" />
                  </div>
                </div>
                <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Connect an AI Provider
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  TaskFlow lets you bring your own AI. Choose any supported provider and connect it securely.
                </p>
                <p className="text-xs text-gray-400">
                  Your API key is stored securely with your account. You can change providers at any time.{' '}
                  <span className="font-medium text-yellow-500">AI is completely optional.</span>
                </p>
              </div>

              {/* Provider Directory Cards */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-4">
                  <Cpu size={16} className="text-yellow-500" />
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Choose a Provider
                  </h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {aiProviderList.filter((p: any) => p.key !== 'openai-compatible').map((provider: any) => {
                    const icon = providerIcons[provider.key] || { gradient: 'from-gray-400 to-slate-500', icon: '?', color: '#6b7280' };
                    return (
                      <div className="relative flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 transition-all duration-200 hover:border-yellow-300 dark:hover:border-yellow-600 hover:shadow-md hover:shadow-yellow-500/5 group">
                        {/* Clickable top section to select provider */}
                        <button
                          type="button"
                          onClick={() => {
                            setAiSettings(p => ({ ...p, aiProvider: provider.key, aiModel: provider.defaultModel || '' }));
                            setShowAdvancedAi(false);
                          }}
                          className="flex items-start gap-4 p-4 text-left w-full"
                        >
                          {/* Logo */}
                          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${icon.gradient} shadow-sm`}>
                            <span className="text-sm font-bold text-white">{icon.icon}</span>
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h5 className="font-semibold text-gray-900 dark:text-gray-100">{provider.label}</h5>
                              {provider.freeTier === true && (
                                <span className="text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 px-1.5 py-0.5 rounded-full">
                                  Free Tier
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
                              {provider.description}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500">
                              <span className="flex items-center gap-1">
                                <DollarSign size={10} />
                                {provider.pricing}
                              </span>
                              <span className="flex items-center gap-1">
                                <Zap size={10} />
                                {provider.recommendedFor?.split(',').slice(0, 2).join(', ')}
                              </span>
                            </div>
                          </div>
                        </button>

                        {/* Action buttons */}
                        {(provider.websiteUrl || provider.docsUrl) && (
                          <div className="flex items-center gap-1 px-4 pb-3 border-t border-gray-100 dark:border-gray-700/50 pt-2.5">
                            {provider.websiteUrl && (
                              <a
                                href={provider.websiteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-500/10 hover:bg-yellow-100 dark:hover:bg-yellow-500/20 transition-colors"
                              >
                                <ExternalLink size={11} />
                                Get API Key
                              </a>
                            )}
                            {provider.docsUrl && (
                              <a
                                href={provider.docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              >
                                <BookOpen size={11} />
                                Docs
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* OpenAI Compatible (special card with custom endpoint) */}
                <motion.button
                  type="button"
                  onClick={() => {
                    setAiSettings(p => ({ ...p, aiProvider: 'openai-compatible', aiModel: '' }));
                    setShowAdvancedAi(true);
                  }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center gap-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-4 text-left transition-all duration-200 hover:border-yellow-300 dark:hover:border-yellow-600 hover:bg-gray-50 dark:hover:bg-gray-800/30 bg-white dark:bg-gray-800/20"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gray-400 to-slate-500">
                    <Globe size={20} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <h5 className="font-semibold text-gray-900 dark:text-gray-100">OpenAI Compatible</h5>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Connect any OpenAI-compatible API endpoint including self-hosted or private models.</p>
                  </div>
                  <ExternalLink size={16} className="text-gray-400 shrink-0" />
                </motion.button>
              </div>
            </div>
          ) : (
            /* ═══════════════════════════════════════════════════════════════
               AFTER CONNECTION — Provider is configured
               ═══════════════════════════════════════════════════════════════ */
            <div className="p-6 space-y-5">
              {/* Connected Status Banner */}
              <div className="rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-500/5 dark:to-emerald-500/5 border border-green-200 dark:border-green-500/20 p-4">
                <div className="flex items-center gap-3">
                  {providerIcon && (
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${providerIcon.gradient}`}>
                      <span className="text-sm font-bold text-white">{providerIcon.icon}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                      <h4 className="font-semibold text-green-800 dark:text-green-300">Connected</h4>
                    </div>
                    <p className="text-sm text-green-700 dark:text-green-400">
                      {connectedProviderMeta?.label || aiSettings.aiProvider}
                      {aiSettings.aiModel && ` — ${aiSettings.aiModel}`}
                    </p>
                  </div>
                  {lastTestResult && (
                    <div className="text-right shrink-0">
                      <p className={cn(
                        'text-xs font-medium',
                        lastTestResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-500'
                      )}>
                        {lastTestResult.success ? `${lastTestResult.time}ms` : 'Error'}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {lastTestResult.success ? 'Last tested' : 'Last attempt'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* If test failed, show helpful error */}
              {lastTestResult && !lastTestResult.success && (
                <div className="rounded-xl bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20 p-4">
                  <div className="flex items-start gap-3">
                    <XCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-800 dark:text-red-300">Connection Issue</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {lastTestResult.message?.toLowerCase().includes('api key') || lastTestResult.message?.toLowerCase().includes('401') || lastTestResult.message?.toLowerCase().includes('invalid')
                          ? 'Your API key appears to be invalid. Please check that you have entered the correct key from the provider website.'
                          : lastTestResult.message || 'Connection failed. Please check your settings and try again.'}
                      </p>
                      {connectedProviderMeta?.websiteUrl && (
                        <a
                          href={connectedProviderMeta.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                        >
                          <ExternalLink size={12} />
                          Open Provider Website
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* API Key */}
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-1.5">
                  <Shield size={14} />
                  API Key
                  {hasAiApiKey && <span className="text-xs text-green-500 font-medium">✓ Saved</span>}
                </label>
                <div className="relative">
                  <input
                    type={showAiApiKey ? 'text' : 'password'}
                    value={aiSettings.aiApiKey}
                    onChange={e => setAiSettings(p => ({ ...p, aiApiKey: e.target.value }))}
                    className="input-field w-full pr-24 font-mono text-sm"
                    placeholder={
                      hasAiApiKey
                        ? 'Enter new key to replace, or leave blank to keep current'
                        : 'Paste your API key here...'
                    }
                    autoComplete="off"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <button
                      type="button"
                      onClick={() => setShowAiApiKey(!showAiApiKey)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                      tabIndex={-1}
                      aria-label={showAiApiKey ? 'Hide' : 'Show'}
                    >
                      {showAiApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    {hasAiApiKey && (
                      <button
                        type="button"
                        onClick={handleRemoveAiSettings}
                        className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10"
                        tabIndex={-1}
                        title="Remove API key"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  Your key is stored securely and never exposed.{' '}
                  {connectedProviderMeta?.websiteUrl && (
                    <a
                      href={connectedProviderMeta.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-yellow-600 dark:text-yellow-400 hover:underline"
                    >
                      Get API key ↗
                    </a>
                  )}
                </p>
              </div>

              {/* Model */}
              <div>
                <label className="block text-sm text-gray-500 mb-1.5">Model</label>
                <input
                  type="text"
                  value={aiSettings.aiModel}
                  onChange={e => setAiSettings(p => ({ ...p, aiModel: e.target.value }))}
                  className="input-field w-full"
                  placeholder={connectedProviderMeta?.defaultModel || 'Enter model name'}
                  list="model-suggestions"
                />
                <datalist id="model-suggestions">
                  {(connectedProviderMeta?.recommendedModels ?? []).map((m: string) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                {(connectedProviderMeta?.recommendedModels?.filter((m: string) => m) ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(connectedProviderMeta?.recommendedModels ?? []).filter((m: string) => m).map((m: string) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setAiSettings(p => ({ ...p, aiModel: m }))}
                        className={cn(
                          'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                          aiSettings.aiModel === m
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                            : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Base URL (for OpenAI Compatible) */}
              {aiSettings.aiProvider === 'openai-compatible' && (
                <div>
                  <label className="block text-sm text-gray-500 mb-1.5">
                    <Globe size={14} className="inline mr-1" />
                    Base URL
                  </label>
                  <input
                    type="url"
                    value={aiBaseUrl}
                    onChange={e => setAiBaseUrl(e.target.value)}
                    className="input-field w-full"
                    placeholder="https://your-api-endpoint.com/v1"
                  />
                  <p className="text-xs text-gray-400 mt-1">Enter the full base URL of your OpenAI-compatible API endpoint.</p>
                </div>
              )}

              {/* Advanced Options */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedAi(!showAdvancedAi)}
                  className="text-sm text-yellow-600 dark:text-yellow-400 hover:underline flex items-center gap-1"
                >
                  <RefreshCw size={14} className={cn('transition-transform duration-200', showAdvancedAi && 'rotate-180')} />
                  Advanced options
                </button>
                {showAdvancedAi && (
                  <div className="mt-3 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Temperature: {aiSettings.temperature.toFixed(1)}
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.1"
                          value={aiSettings.temperature}
                          onChange={e => setAiSettings(p => ({ ...p, temperature: parseFloat(e.target.value) }))}
                          className="w-full accent-yellow-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Max Tokens</label>
                        <input
                          type="number"
                          value={aiSettings.maxTokens}
                          onChange={e => setAiSettings(p => ({ ...p, maxTokens: Math.max(1, parseInt(e.target.value) || 1) }))}
                          className="input-field w-full"
                          min={1}
                          max={100000}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Timeout (ms)</label>
                        <input
                          type="number"
                          value={aiSettings.timeout}
                          onChange={e => setAiSettings(p => ({ ...p, timeout: Math.max(1000, parseInt(e.target.value) || 1000) }))}
                          className="input-field w-full"
                          min={1000}
                          max={300000}
                          step={1000}
                        />
                      </div>
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={aiSettings.streaming}
                            onChange={e => setAiSettings(p => ({ ...p, streaming: e.target.checked }))}
                            className="rounded border-gray-300 dark:border-gray-600 text-yellow-500 focus:ring-yellow-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Streaming</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  onClick={handleTestConnection}
                  variant="secondary"
                  size="sm"
                  loading={aiTesting}
                  icon={<TestTube size={14} />}
                  disabled={!aiSettings.aiApiKey && !hasAiApiKey}
                >
                  Test Connection
                </Button>
                <Button
                  onClick={handleSaveAiSettings}
                  loading={aiSaving}
                  size="sm"
                  icon={<Save size={14} />}
                >
                  Save AI Settings
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setAiSettings({
                      aiProvider: '',
                      aiApiKey: '',
                      aiModel: '',
                      temperature: 0.3,
                      maxTokens: 500,
                      streaming: false,
                      timeout: 30000,
                    });
                    setHasAiApiKey(false);
                    setLastTestResult(null);
                  }}
                  className="text-sm text-gray-500 dark:text-gray-400 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors underline-offset-2 hover:underline"
                >
                  Change Provider
                </button>
                {connectedProviderMeta?.docsUrl && (
                  <a
                    href={connectedProviderMeta.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-yellow-500 transition-colors ml-auto"
                  >
                    <BookOpen size={14} />
                    Docs
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Appearance */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Moon size={18} className="text-yellow-500" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Appearance</h3>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Notifications */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bell size={18} className="text-yellow-500" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
          </div>
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-gray-700 dark:text-gray-300">In-app notifications</span>
              <input
                type="checkbox"
                checked={preferences.notifications}
                onChange={e => setPreferences(p => ({ ...p, notifications: e.target.checked }))}
                className="rounded border-gray-300 dark:border-gray-600 text-yellow-500 focus:ring-yellow-500"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-gray-700 dark:text-gray-300">Email notifications</span>
              <input
                type="checkbox"
                checked={preferences.emailNotifications}
                onChange={e => setPreferences(p => ({ ...p, emailNotifications: e.target.checked }))}
                className="rounded border-gray-300 dark:border-gray-600 text-yellow-500 focus:ring-yellow-500"
              />
            </label>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSaveProfile} loading={saving} icon={<Save size={16} />}>
            Save Changes
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
