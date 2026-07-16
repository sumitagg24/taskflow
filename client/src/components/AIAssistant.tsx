import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, X, Bot, User, Loader2, Lightbulb, Settings, ExternalLink } from 'lucide-react';
import { aiAPI, aiSettingsAPI } from '@/api/tasks';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const suggestions = [
  'What should I work on next?',
  'Summarize my tasks',
  'Create a task: Buy groceries tomorrow at 5pm',
  'Help me organize my priorities',
];

export default function AIAssistant({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hi! I'm your AI task assistant. I can help you manage tasks, suggest priorities, break down work, and more. What would you like help with?",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [providerLabel, setProviderLabel] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [checkingConfig, setCheckingConfig] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen && isConfigured === null) {
      checkAiConfig();
    }
  }, [isOpen]);

  const checkAiConfig = async () => {
    setCheckingConfig(true);
    try {
      const { data } = await aiSettingsAPI.getSettings();
      const configured = !!(data.aiProvider && data.hasApiKey);
      setIsConfigured(configured);
      const provider = data.supportedProviders?.find((p: any) => p.key === data.aiProvider);
      setProviderLabel(provider?.label || data.aiProvider || null);
    } catch {
      setIsConfigured(false);
      setProviderLabel(null);
    } finally {
      setCheckingConfig(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const { data } = await aiAPI.chat(text.trim());
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.text || "I'm not sure how to help with that. Could you rephrase?",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      if (data.provider && data.provider !== 'none') {
        setProviderLabel(data.provider);
      }
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm having trouble connecting. Please check your AI provider settings.",
        timestamp: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestion = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const handleNavigateToSettings = () => {
    // Navigate to settings by dispatching a custom event that AppContent listens to
    window.dispatchEvent(new CustomEvent('navigate', { detail: { section: 'settings' } }));
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a23] shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-purple-500/10 to-yellow-500/5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-500/10">
                <Sparkles size={16} className="text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">AI Assistant</h3>
                <p className="text-[10px] text-gray-400">
                  {checkingConfig
                    ? 'Checking...'
                    : providerLabel
                      ? `Powered by ${providerLabel}`
                      : 'Not configured'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="h-[400px] overflow-y-auto p-4 space-y-3">
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'flex gap-2',
                  msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                <div className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full shrink-0',
                  msg.role === 'user'
                    ? 'bg-yellow-400 text-gray-900'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                )}>
                  {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                </div>
                <div className={cn(
                  'rounded-2xl px-3.5 py-2.5 text-sm max-w-[85%]',
                  msg.role === 'user'
                    ? 'bg-yellow-400 text-gray-900 rounded-tr-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-tl-sm'
                )}>
                  {msg.content}
                </div>
              </motion.div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 shrink-0">
                  <Bot size={14} className="text-gray-500" />
                </div>
                <div className="rounded-2xl px-4 py-3 bg-gray-100 dark:bg-gray-800">
                  <Loader2 size={16} className="animate-spin text-gray-400" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions or Connect CTA */}
          {messages.length <= 1 && !checkingConfig && (
            <>
              {isConfigured === false ? (
                <div className="px-4 pb-4">
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 p-4 text-center">
                    <Sparkles size={24} className="mx-auto mb-2 text-amber-500" />
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
                      AI is optional
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                      Connect your preferred AI provider to unlock task parsing, priority suggestions, daily digests, and chat assistance.
                    </p>
                    <button
                      onClick={handleNavigateToSettings}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors shadow-sm"
                    >
                      <Settings size={14} />
                      Connect AI Provider
                      <ExternalLink size={12} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {messages.length <= 1 && (
                    <div className="px-4 pb-2">
                      <p className="text-[10px] text-gray-400 mb-2 flex items-center gap-1">
                        <Lightbulb size={10} />
                        Suggestions
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((s) => (
                          <button
                            key={s}
                            onClick={() => handleSuggestion(s)}
                            className="rounded-lg bg-gray-50 dark:bg-gray-800 px-2.5 py-1 text-[11px] text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Input */}
          <div className="border-t border-gray-100 dark:border-gray-800 p-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage(input))}
                placeholder={isConfigured ? "Ask about your tasks…" : "Configure AI in Settings first"}
                disabled={!isConfigured}
                className="input-field flex-1"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading || !isConfigured}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-yellow-400 text-gray-900 hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
