import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { authAPI } from '@/api/tasks';
import { resolvePomodoroSettings } from '@/lib/utils';
import { toast } from 'sonner';

export type SessionType = 'work' | 'break' | 'longBreak';

export function useFocusTimer() {
  const { user, updateFocusTime } = useAuth();
  const [mode, setMode] = useState<SessionType>('work');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [focusMinutes, setFocusMinutes] = useState(user?.focusTimeToday || 0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Use refs to avoid stale closures in setInterval
  const modeRef = useRef(mode);
  const sessionsRef = useRef(sessionsCompleted);
  const settingsRef = useRef(resolvePomodoroSettings(user?.pomodoroSettings));

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { sessionsRef.current = sessionsCompleted; }, [sessionsCompleted]);
  useEffect(() => {
    if (user?.pomodoroSettings) settingsRef.current = resolvePomodoroSettings(user.pomodoroSettings);
  }, [user?.pomodoroSettings]);

  const getDuration = useCallback((m: SessionType) => {
    const s = resolvePomodoroSettings(user?.pomodoroSettings);
    switch (m) {
      case 'work': return s.workDuration * 60;
      case 'break': return s.breakDuration * 60;
      case 'longBreak': return s.longBreakDuration * 60;
    }
  }, [user?.pomodoroSettings]);

  useEffect(() => { setTimeLeft(getDuration(mode)); }, [mode, getDuration]);

  const handleSessionComplete = useCallback(() => {
    const currentMode = modeRef.current;
    const currentSessions = sessionsRef.current;
    const s = settingsRef.current;

    if (currentMode === 'work') {
      const newSessions = currentSessions + 1;
      setSessionsCompleted(newSessions);
      sessionsRef.current = newSessions;

      const minutes = s.workDuration;
      setFocusMinutes(prev => prev + minutes);
      authAPI.updateFocusTime(minutes).then(() => updateFocusTime(minutes)).catch(() => {});

      const nextMode = newSessions % s.sessionsBeforeLongBreak === 0 ? 'longBreak' : 'break';
      setMode(nextMode);
      setTimeLeft(getDuration(nextMode));
      toast.success(`Focus session complete! Take a ${nextMode === 'longBreak' ? 'long ' : ''}break.`);
    } else {
      setMode('work');
      setTimeLeft(getDuration('work'));
      toast.success('Break over! Time to focus.');
    }
  }, [getDuration, updateFocusTime]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setIsRunning(false);
            // Defer the session completion to avoid state update during render
            setTimeout(() => handleSessionComplete(), 0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, handleSessionComplete]);

  const toggleTimer = () => setIsRunning(!isRunning);

  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(getDuration(mode));
  };

  const switchMode = (m: SessionType) => {
    setIsRunning(false);
    setMode(m);
    setTimeLeft(getDuration(m));
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = timeLeft > 0 ? 1 - (timeLeft / getDuration(mode)) : 1;

  return {
    mode,
    isRunning,
    sessionsCompleted,
    focusMinutes,
    toggleTimer,
    resetTimer,
    switchMode,
    minutes,
    seconds,
    progress,
    timeLeft,
    sessionsBeforeLongBreak: settingsRef.current.sessionsBeforeLongBreak,
  };
}
