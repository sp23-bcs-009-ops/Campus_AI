import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import { C } from './src/constants/colors';
import { NAV_TABS } from './src/constants/config';
import useTimetable from './src/hooks/useTimetable';
import useNotifs from './src/hooks/useNotifs';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import ClassScreen from './src/screens/ClassScreen';
import UniNewsScreen from './src/screens/UniNewsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ChatScreen from './src/screens/ChatScreen';
import InternalScreen from './src/screens/InternalScreen';

export default function App() {
  const [screen, setScreen] = useState('login');
  const [user, setUser] = useState(null);
  const [dark, setDark] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [now, setNow] = useState(new Date());

  // ── Persistent login ──────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem('campusai_user').then(val => {
      if (val) { setUser(JSON.parse(val)); setScreen('main'); }
    }).catch(() => { });
  }, []);

  function handleLogin(u) {
    setUser(u);
    AsyncStorage.setItem('campusai_user', JSON.stringify(u)).catch(() => { });
    setScreen('main');
  }
  function handleUpdate(u) {
    setUser(u);
    AsyncStorage.setItem('campusai_user', JSON.stringify(u)).catch(() => { });
  }
  function handleLogout() {
    AsyncStorage.removeItem('campusai_user').catch(() => { });
    setUser(null); setScreen('login');
  }

  // ── Timetable ─────────────────────────────────────────────────────────────
  const {
    lectureSlots,
    timetables,
    displayRows,
    displayRowsBySemester,
    subjectsList,
    subjectsBySemester,
    meta: ttMeta,
    reload: reloadTT,
  } = useTimetable();

  // ── Notifs ────────────────────────────────────────────────────────────────
  const { arrangedClasses, cancelledSlots } = useNotifs(lectureSlots);

  // Clock tick every minute
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // ── isMine: mark slots belonging to the current user's subjects ───────────
  function normaliseRoomId(roomId) {
    const raw = String(roomId || '').trim();
    if (!raw) return raw;

    const ltMatch = raw.match(/LT\s*(\d+)/i);
    if (ltMatch) return `LT${ltMatch[1]}`;

    const labMatch = raw.match(/(?:C\.?\s*Lab|Lab)\s*(\d+)/i);
    if (labMatch) return `Lab${labMatch[1]}`;

    return raw;
  }

  const currentSem = Number(user?.semester || 7);
  const semSubjects = subjectsBySemester?.[currentSem] || subjectsList || [];
  const toSubjectName = (s) => (typeof s === 'string' ? s : s?.subject || '');
  const semSubjectNames = Array.from(new Set(semSubjects.map(toSubjectName).filter(Boolean)));
  const userSubjects = Array.from(new Set((user?.subjects?.length > 0 ? user.subjects : semSubjectNames).map(toSubjectName).filter(Boolean)));

  // Merge all semester timetables so map can show in-session occupancy campus-wide.
  const mergedRawTimetable = {};
  for (const [semKey, roomMap] of Object.entries(timetables || {})) {
    const semNum = Number(semKey);
    for (const [room, slots] of Object.entries(roomMap || {})) {
      const nr = normaliseRoomId(room);
      if (!mergedRawTimetable[nr]) mergedRawTimetable[nr] = [];
      for (const slot of (slots || [])) {
        mergedRawTimetable[nr].push({ ...slot, sem: slot?.sem ?? semNum });
      }
    }
  }

  const timetable = Object.fromEntries(
    Object.entries(mergedRawTimetable).map(([room, slots]) => [
      room,
      (slots || []).map(slot => ({
        ...slot,
        isMine: userSubjects.includes(slot.subject),
      })),
    ])
  );

  const subjectsMap = { cs: { [currentSem]: semSubjectNames } };

  // BUG FIX: Pass displayRows into ttMeta so TimetableModal can render them
  const ttRows = displayRowsBySemester?.[currentSem] || displayRows;
  const ttMetaWithRows = ttMeta ? { ...ttMeta, displayRows: ttRows } : null;

  // ── Guest sign-in banner (reused across tabs) ────────────────────────────
  const GuestSignInBanner = () => (
    <View style={{ padding: 16, backgroundColor: dark ? '#12123A' : '#FFFFFF', borderTopWidth: 1, borderTopColor: dark ? '#2A1C6B' : '#E2E0F5', alignItems: 'center' }}>
      <TouchableOpacity
        onPress={() => { setUser(null); setScreen('login'); }}
        style={{ backgroundColor: C.purple, paddingHorizontal: 28, paddingVertical: 11, borderRadius: 14 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Sign In for Full Access</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Guest locked placeholder (profile only) ─────────────────────────────
  const GuestLocked = () => (
    <View style={{ flex: 1, backgroundColor: dark ? '#0A0A1E' : '#F5F4FF', justifyContent: 'space-between' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>🔒</Text>
        <Text style={{ fontSize: 17, fontWeight: '800', color: dark ? '#fff' : '#1A0F4A', marginBottom: 8, textAlign: 'center' }}>
          Sign In Required
        </Text>
        <Text style={{ fontSize: 13, color: dark ? '#9B7EF8' : '#6C47D4', textAlign: 'center', lineHeight: 20 }}>
          Sign in with your university account to access all features.
        </Text>
      </View>
      <GuestSignInBanner />
    </View>
  );

  const isGuest = user?.type === 'guest';

  const renderTab = () => {
    switch (activeTab) {
      case 'home':
        return (
          <View style={{ flex: 1 }}>
            <HomeScreen
              user={user} dark={dark} now={now}
              timetable={timetable} lectureSlots={lectureSlots}
              arrangedClasses={arrangedClasses} cancelledSlots={cancelledSlots}
              ttMeta={ttMetaWithRows} onTTUploaded={() => reloadTT()}
              isGuest={isGuest}
            />
            {isGuest && <GuestSignInBanner />}
          </View>
        );
      case 'class':
        return (
          <View style={{ flex: 1 }}>
            <ClassScreen
              user={user} dark={dark}
              lectureSlots={lectureSlots} subjectsMap={subjectsMap}
              isGuest={isGuest}
            />
            {isGuest && <GuestSignInBanner />}
          </View>
        );
      case 'chat':
        if (isGuest) {
          return (
            <View style={{ flex: 1, backgroundColor: dark ? '#0A0A1E' : '#F5F4FF', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>🤖</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: dark ? '#fff' : '#1A0F4A', marginBottom: 8, textAlign: 'center' }}>
                  Coming Soon
                </Text>
                <Text style={{ fontSize: 13, color: dark ? '#9B7EF8' : '#6C47D4', textAlign: 'center', lineHeight: 20 }}>
                  AI Assistant will be available after you sign in.
                </Text>
              </View>
              <GuestSignInBanner />
            </View>
          );
        }
        return (
          <View style={{ flex: 1, backgroundColor: dark ? '#0A0A1E' : '#F5F4FF' }}>
            <ChatScreen user={user} dark={dark} />
          </View>
        );
      case 'uninews':
        return (
          <View style={{ flex: 1 }}>
            <UniNewsScreen user={user} dark={dark} isGuest={isGuest} />
            {isGuest && <GuestSignInBanner />}
          </View>
        );
      case 'profile':
        if (isGuest) return <GuestLocked />;
        return (
          <ProfileScreen
            user={user} dark={dark}
            subjectsList={semSubjectNames}
            onUpdate={handleUpdate}
            onLogout={handleLogout}
          />
        );
      case 'internal':
        return (
          <View style={{ flex: 1, backgroundColor: dark ? '#0A0A1E' : '#F5F4FF' }}>
            <InternalScreen user={user} dark={dark} />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaProvider>
      {screen === 'login' ? (
        <LoginScreen
          onLogin={handleLogin}
          onGuest={() => { handleLogin({ type: 'guest', name: 'Guest' }); setActiveTab('chat'); }}
        />
      ) : (
        <SafeAreaView style={styles.app} edges={['top', 'bottom', 'left', 'right']}>
          {/* Top bar */}
          <View style={[styles.topBar, { backgroundColor: dark ? C.purpleDeep : C.purple }]}>
            <Text style={styles.topBarTitle}>CampusAI</Text>
            <TouchableOpacity onPress={() => setDark(!dark)} style={styles.darkBtn}>
              <Text style={{ fontSize: 16 }}>{dark ? '☀️' : '🌙'}</Text>
            </TouchableOpacity>
          </View>

          {/* Tab content */}
          <View style={{ flex: 1 }}>{renderTab()}</View>

          {/* Bottom nav */}
          <View style={[styles.tabBar, { backgroundColor: dark ? '#12123A' : '#FFFFFF', borderTopColor: dark ? '#2A1C6B' : '#E2E0F5' }]}>
            {NAV_TABS.map((tab) => {
              const active = activeTab === tab.key;
              const ic = active ? '#6C47D4' : (dark ? '#4A3A7A' : '#B0A8D8');
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={styles.tabBtn}>
                  <Svg width={22} height={22} viewBox="0 0 24 24" fill={ic}>
                    <Path d={tab.icon} />
                  </Svg>
                  <Text style={[styles.tabLabel, { color: ic, fontWeight: active ? '700' : '500' }]}>
                    {tab.label}
                  </Text>
                  {active && <View style={styles.tabDot} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10 },
  topBarTitle: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  darkBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  tabBar: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10, paddingBottom: 12, borderTopWidth: 1 },
  tabBtn: { alignItems: 'center', gap: 2, paddingHorizontal: 6, minWidth: 52 },
  tabLabel: { fontSize: 10 },
  tabDot: { width: 16, height: 3, borderRadius: 2, backgroundColor: C.purple, marginTop: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
