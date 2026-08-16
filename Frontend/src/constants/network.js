import { NativeModules, Platform } from 'react-native';

const DEFAULT_HOST = '127.0.0.1';

function cleanHost(value) {
  if (!value || typeof value !== 'string') return null;
  return value.trim().replace(/^https?:\/\//, '').replace(/:\d+$/, '') || null;
}

function getEnv(name) {
  if (typeof process === 'undefined' || !process.env) return null;
  return process.env[name] || null;
}

function getHostFromMetro() {
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  if (!scriptURL || typeof scriptURL !== 'string') return null;

  const match = scriptURL.match(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\/([^/:?]+)/);
  return cleanHost(match?.[1]);
}

function getHostFromWeb() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return cleanHost(window.location.hostname);
}

export function getDevHost() {
  return (
    getHostFromMetro() ||
    getHostFromWeb() ||
    cleanHost(getEnv('EXPO_PUBLIC_API_HOST')) ||
    DEFAULT_HOST
  );
}

export function getServerUrl(port, envOverrideName) {
  const override = getEnv(envOverrideName);
  if (override) return override.replace(/\/$/, '');

  return `http://${getDevHost()}:${port}`;
}

export const getAiServerUrl = () => getServerUrl(8000, 'EXPO_PUBLIC_AI_SERVER_URL');
export const getTimetableServerUrl = () => getServerUrl(3000, 'EXPO_PUBLIC_TIMETABLE_SERVER_URL');
