import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { C } from '../constants/colors';
import { SS } from '../constants/colors';
import { FLOORS, FLOOR_ROOMS, FLOOR_LABELS, FALLBACK_LECTURE_SLOTS, can } from '../constants/config';
import { getTimetableServerUrl } from '../constants/network';
import { toMin, getFullRoomStatus } from '../utils/helpers';
import { fsSet } from '../firebase/firestore';
import ArcMap from '../components/map/ArcMap';
import { COMSATSLogo } from '../components/ui';


export default function HomeScreen({
  user, dark, now, timetable, lectureSlots,
  arrangedClasses, cancelledSlots,
  ttMeta, onTTUploaded, isGuest,
}) {
  const [floor, setFloor] = useState(1);
  const [selRoom, setSelRoom] = useState(null);
  const [showTT, setShowTT] = useState(false);

  const slots = lectureSlots || FALLBACK_LECTURE_SLOTS;
  const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
  const cur = now.getHours() * 60 + now.getMinutes();
  const bg = dark ? '#0A0A1E' : '#F5F4FF';
  const tp = dark ? '#EDE9FF' : '#1A0F4A';
  const ts = dark ? '#9B7EF8' : '#6C47D4';
  const bdr = dark ? '#2A1C6B' : '#E2E0F5';
  const cardBg = dark ? '#12123A' : '#FFFFFF';

  const floorHasActive = (f) =>
    (FLOOR_ROOMS[f] || []).some(id => {
      const st = getFullRoomStatus(id, now, timetable, arrangedClasses, cancelledSlots, slots).status;
      return st === 'mine' || st === 'arranged';
    });

  const selectedRoomStatus = selRoom
    ? getFullRoomStatus(selRoom, now, timetable, arrangedClasses, cancelledSlots, slots)
    : null;

  const dateLabel = now.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  const timeLabel = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  const todayClasses = Object.values(timetable || {})
    .flat()
    .filter(s => s?.isMine && s.day === dayName)
    .sort((a, b) => toMin(a.start) - toMin(b.start));
  const currentClass = todayClasses.find(s => cur >= toMin(s.start) && cur < toMin(s.end));
  const nextClass = todayClasses.find(s => toMin(s.start) > cur);
  const roomLabel = (slot) => slot?.room ? ` · ${slot.room}` : '';

  const statusMessage = currentClass
    ? `In session: ${currentClass.subject} (${currentClass.start}-${currentClass.end})${roomLabel(currentClass)}`
    : nextClass
      ? `Next class: ${nextClass.subject} at ${nextClass.start}${roomLabel(nextClass)}`
      : 'No more classes today';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>

        {/* Top header */}
        <View style={[styles.homeHeader, { backgroundColor: dark ? C.purpleDeep : C.purple }]}>
          <View style={styles.homeHeaderTopRow}>
            <COMSATSLogo size={46} />
            <View style={{ flex: 1 }}>
              <Text style={styles.homeHeaderTitle}>COMSATS · ATTOCK</Text>
              <Text style={styles.homeHeaderSub}>
                {`${user?.type ? `${user.type.charAt(0).toUpperCase()}${user.type.slice(1)}` : 'User'} · Sem ${user?.semester || '-'} · ${user?.email ? user.email.split('@')[0] : ''}`}
              </Text>
            </View>
          </View>

          <Text style={styles.homeHeaderDate}>{dateLabel}</Text>
          <Text style={styles.homeHeaderTime}>{timeLabel}</Text>

          {!isGuest && (
            <View style={styles.homeHeaderStatusPill}>
              <Text style={styles.homeHeaderStatusText}>{statusMessage}</Text>
            </View>
          )}
        </View>

        {/* Floor selector */}
        <View style={[styles.floorBar, { backgroundColor: cardBg, borderBottomColor: bdr }]}>
          <Text style={[styles.mapTitle, { color: tp }]}>Live Floor Map</Text>
          <View style={styles.floorBtns}>
            {[1, 2, 3].map(f => {
              const active = floor === f;
              const hasBadge = floorHasActive(f) && !active;
              return (
                <View key={f} style={{ position: 'relative' }}>
                  <TouchableOpacity
                    onPress={() => setFloor(f)}
                    style={[styles.floorBtn, active && styles.floorBtnActive]}>
                    <Text style={[styles.floorBtnText, active && styles.floorBtnTextActive]}>F{f}</Text>
                  </TouchableOpacity>
                  {hasBadge && (
                    <View style={styles.floorBadge}>
                      <Text style={{ color: '#fff', fontSize: 8, fontWeight: '800' }}>!</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Map */}
        <View style={[styles.mapCard, { backgroundColor: cardBg, borderColor: bdr }]}>
          <ArcMap
            floor={floor} dark={dark} timetable={timetable} now={now}
            arrangedClasses={arrangedClasses} cancelledSlots={cancelledSlots}
            lectureSlots={slots}
            onRoomPress={setSelRoom}
          />
        </View>

        <Text style={[styles.mapHint, { color: ts }]}>Tap a room for details</Text>

        {/* Legend */}
        <View style={styles.legend}>
          {Object.entries(SS).map(([key, s]) => {
            const c = s[dark ? 'd' : 'l'];
            return (
              <View key={key} style={[styles.legendItem, { backgroundColor: c.bg, borderColor: c.bd }]}>
                <View style={[styles.legendDot, { backgroundColor: c.dt }]} />
                <Text style={[styles.legendText, { color: c.tx }]}>{c.lb}</Text>
              </View>
            );
          })}
        </View>

        {/* Timetable button — hidden for guests */}
        {!isGuest && (
          <TouchableOpacity
            onPress={() => setShowTT(true)}
            style={[styles.ttBtn, { backgroundColor: dark ? '#1A1A3E' : '#EDE9FF', borderColor: dark ? '#3D2B8E' : '#C4B5FD' }]}>
            <Text style={{ fontSize: 16 }}>📋</Text>
            <Text style={[styles.ttBtnText, { color: ts }]}>View Weekly Timetable</Text>
            <Text style={{ color: ts, marginLeft: 'auto' }}>›</Text>
          </TouchableOpacity>
        )}

        {/* Admin: TT Upload */}
        {can.uploadTimetable(user) && (
          <AdminTTUpload dark={dark} user={user} ttMeta={ttMeta} onUploaded={onTTUploaded} />
        )}
      </ScrollView>

      {/* Room popup */}
      {selRoom && selectedRoomStatus && (
        <RoomPopup
          roomId={selRoom} status={selectedRoomStatus} dark={dark}
          timetable={timetable} now={now} slots={slots}
          onClose={() => setSelRoom(null)}
        />
      )}

      {/* Timetable modal */}
      {showTT && (
        <TimetableModal
          dark={dark} lectureSlots={slots}
          ttMeta={ttMeta} arrangedClasses={arrangedClasses}
          onClose={() => setShowTT(false)}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Room Popup ───────────────────────────────────────────────────────────
function RoomPopup({ roomId, status, dark, timetable, now, slots, onClose }) {
  const { status: st, slot, issue } = status;
  const c = SS[st][dark ? 'd' : 'l'];
  const tp = dark ? '#EDE9FF' : '#1A0F4A';
  const ts = dark ? '#9B7EF8' : '#6C47D4';
  const bdr = dark ? '#3D2B8E' : '#E2E0F5';
  const bg = dark ? '#12123A' : '#FFFFFF';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
  const curM = now.getHours() * 60 + now.getMinutes();
  const next = ((timetable || {})[roomId] || [])
    .filter(s => s.day === day && toMin(s.start) > curM)
    .sort((a, b) => toMin(a.start) - toMin(b.start))[0];

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.popup, { backgroundColor: bg, borderTopColor: bdr }]}>
        <View style={[styles.handle, { backgroundColor: ts }]} />
        <View style={styles.popupHeader}>
          <View style={[styles.roomBadge, { backgroundColor: c.bg, borderColor: c.bd }]}>
            <Text style={[styles.roomBadgeText, { color: c.tx }]}>{roomId}</Text>
          </View>
          <View>
            <Text style={[styles.roomId, { color: tp }]}>{roomId}</Text>
            <View style={[styles.statusPill, { backgroundColor: c.bg, borderColor: c.bd }]}>
              <Text style={[styles.statusText, { color: c.tx }]}>{c.lb}</Text>
            </View>
          </View>
        </View>
        {issue && (
          <View style={styles.issueBox}>
            <Text style={styles.issueText}>⚠️ {issue}</Text>
          </View>
        )}
        {slot ? (
          [['Subject', slot.subject], ['Professor', slot.prof], ['Time', `${slot.start} – ${slot.end}`]].map(([l, v]) => (
            <View key={l} style={[styles.infoRow, { borderBottomColor: bdr }]}>
              <Text style={{ fontSize: 13, color: ts }}>{l}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: tp }}>{v}</Text>
            </View>
          ))
        ) : (
          <Text style={{ color: ts, fontSize: 14, marginBottom: 8 }}>No class right now.</Text>
        )}
        {next && (
          <View style={[styles.nextBox, { backgroundColor: dark ? '#1A1A3E' : '#F0EEFF', borderColor: bdr }]}>
            <Text style={[styles.nextLabel, { color: ts }]}>Next class today</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: tp }}>{next.subject} — {next.start}</Text>
            <Text style={{ fontSize: 12, color: ts }}>{next.prof}</Text>
          </View>
        )}
        <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: C.purple }]}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Timetable Modal ──────────────────────────────────────────────────────
function TimetableModal({ dark, lectureSlots, ttMeta, arrangedClasses, onClose }) {
  const slots = lectureSlots || FALLBACK_LECTURE_SLOTS;
  const tp = dark ? '#EDE9FF' : '#1A0F4A';
  const ts = dark ? '#9B7EF8' : '#6C47D4';
  const bdr = dark ? '#2A1C6B' : '#E2E0F5';
  const bg = dark ? '#0A0A1E' : '#F5F4FF';
  const cardBg = dark ? '#1A1A3E' : '#FFFFFF';

  // BUG FIX: displayRows was always [] — now received via ttMeta or falls back gracefully
  // The timetable data is passed from the parent's useTimetable hook via ttMeta.displayRows
  const displayRows = ttMeta?.displayRows || [];

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.ttModal, { backgroundColor: cardBg, borderTopColor: bdr }]}>
        {/* Header */}
        <View style={[styles.ttHeader, { backgroundColor: C.purple }]}>
          <View>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>BS CS</Text>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>Weekly Timetable</Text>
            {ttMeta?.effectiveDate && (
              <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>w.e.f {ttMeta.effectiveDate}</Text>
            )}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.ttCloseBtn}>
            <Text style={{ color: '#fff', fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        </View>
        {/* Lecture time reference */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ backgroundColor: C.purpleDark, paddingVertical: 6, paddingHorizontal: 10, flexGrow: 0, flexShrink: 0 }}
          contentContainerStyle={{ alignItems: 'center' }}>
          {Object.entries(slots).map(([n, sl]) => (
            <View key={n} style={styles.slotChip}>
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>L{n}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 8 }}>{sl.start}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8 }}>{sl.end}</Text>
            </View>
          ))}
        </ScrollView>
        {/* Body */}
        <ScrollView style={{ flex: 1, backgroundColor: bg }}>
          {displayRows.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>📅</Text>
              <Text style={{ fontSize: 13, color: ts }}>Timetable loads from Firebase</Text>
              <Text style={{ fontSize: 11, color: ts, marginTop: 6, opacity: 0.7 }}>Upload a timetable PDF to see it here</Text>
            </View>
          ) : displayRows.map(({ day, slots: daySlots }, idx) => (
            <View key={day || idx} style={{ padding: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: tp, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>{day}</Text>
              {(daySlots || []).map((s, i) => {
                const sl = slots[s.n];
                return (
                  <View key={i} style={[styles.ttRow, { backgroundColor: cardBg, borderColor: bdr, borderLeftColor: s.mine ? '#EF4444' : C.purple }]}>
                    <View style={[styles.ttLecBadge, { backgroundColor: s.mine ? '#FEE2E2' : '#EDE9FF', borderColor: s.mine ? '#EF4444' : C.purple }]}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: s.mine ? '#B91C1C' : C.purple }}>L{s.n}</Text>
                      <Text style={{ fontSize: 7, color: s.mine ? '#B91C1C' : C.purple, opacity: 0.8 }}>{sl?.start}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: tp }}>{s.subject}</Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                        <Text style={{ fontSize: 10, color: ts }}>{s.prof}</Text>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: s.mine ? '#B91C1C' : C.purple }}>{s.room}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Admin TT Upload ──────────────────────────────────────────────────────
function AdminTTUpload({ dark, user, ttMeta, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState('');
  const [progress, setProgress] = useState('');

  const tp = dark ? '#EDE9FF' : '#1A0F4A';
  const ts = dark ? '#9B7EF8' : '#6C47D4';
  const bdr = dark ? '#2A1C6B' : '#E2E0F5';
  const ib = dark ? '#0A0A1E' : '#F8F7FF';
  const cardBg = dark ? '#12123A' : '#FFFFFF';

  async function handleUpload() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (result.canceled) return;
    const file = result.assets?.[0];
    if (!file) return;

    setUploading(true); setStatus(null); setProgress('📤 Sending PDF...');
    try {
      // Convert file URI to blob for proper multipart handling
      const fileBlob = await fetch(file.uri).then(res => res.blob());

      const formData = new FormData();
      formData.append('pdf', fileBlob, file.name);
      formData.append('version', `v${new Date().toLocaleDateString('en-GB')}`);
      formData.append('effectiveDate', new Date().toISOString().split('T')[0]);
      formData.append('uploadedBy', user.email || 'admin');

      setProgress('🔍 Running OCR... (may take a few minutes)');

      const response = await fetch(`${getTimetableServerUrl()}/upload-timetable`, {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header - fetch will set it with proper boundary
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Server error');

      setStatus('success');
      setMsg(`✓ ${data.message}\nRooms: ${data.roomCount} · Subjects: ${data.subjectCount}`);
      onUploaded?.({});
    } catch (e) {
      setStatus('error');
      if (e.message.includes('Network') || e.message.includes('fetch')) {
        setMsg(`Cannot connect to server at ${getTimetableServerUrl()}.\nOn your PC, open server/ folder and run:\nnpm install\nnode index.js`);
      } else {
        setMsg('Error: ' + e.message);
      }
    } finally {
      setUploading(false); setProgress('');
    }
  }

  return (
    <View style={[styles.uploadCard, { backgroundColor: cardBg, borderColor: bdr }]}>
      <View style={[styles.uploadHeader, { backgroundColor: C.purpleDark }]}>
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>📄 Timetable Management</Text>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9 }}>Staff / Admin only</Text>
      </View>
      <View style={{ padding: 12 }}>
        {ttMeta && (
          <View style={[styles.ttInfoBox, { backgroundColor: ib, borderColor: bdr }]}>
            <Text style={[styles.ttInfoLabel, { color: ts }]}>CURRENT TIMETABLE</Text>
            {ttMeta.version && ttMeta.version !== 'pending'
              ? <>
                <Text style={{ fontSize: 12, fontWeight: '600', color: tp }}>{ttMeta.version}{ttMeta.effectiveDate ? ` · w.e.f ${ttMeta.effectiveDate}` : ''}</Text>
                <Text style={{ fontSize: 10, color: ts }}>Uploaded by {ttMeta.uploadedBy}</Text>
              </>
              : <Text style={{ fontSize: 11, color: ts, fontStyle: 'italic' }}>No timetable loaded yet</Text>
            }
          </View>
        )}

        <TouchableOpacity onPress={handleUpload} disabled={uploading}
          style={[styles.uploadBtn, { borderColor: bdr, backgroundColor: ib }]}>
          {uploading
            ? <>
              <ActivityIndicator color={C.purple} size="small" />
              <Text style={{ fontSize: 11, color: ts, marginTop: 8, textAlign: 'center' }}>{progress}</Text>
            </>
            : <>
              <Text style={{ fontSize: 22, marginBottom: 4 }}>⬆️</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: tp }}>Upload Timetable PDF</Text>
              <Text style={{ fontSize: 10, color: ts }}>Tap to browse · PDF only</Text>
            </>
          }
        </TouchableOpacity>

        {status && (
          <View style={[styles.statusBox, {
            backgroundColor: status === 'success' ? '#DCFCE7' : '#FEE2E2',
            borderColor: status === 'success' ? '#16A34A' : '#FCA5A5',
          }]}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: status === 'success' ? '#166534' : '#B91C1C', lineHeight: 18 }}>
              {msg}
            </Text>
          </View>
        )}

        <View style={[styles.statusBox, { backgroundColor: '#EDE9FF', borderColor: '#9B7EF844', marginTop: 8 }]}>
          <Text style={{ fontSize: 10, color: '#6C47D4', fontWeight: '600' }}>
            Server URL is detected automatically from the current Expo host.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  homeHeader: { margin: 14, marginBottom: 10, borderRadius: 18, padding: 16 },
  homeHeaderTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  homeHeaderTitle: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 1.1 },
  homeHeaderSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 3, fontWeight: '600' },
  homeHeaderDate: { color: 'rgba(255,255,255,0.9)', fontSize: 11, marginTop: 14, fontWeight: '700', letterSpacing: 0.8 },
  homeHeaderTime: { color: '#fff', fontSize: 36, fontWeight: '900', letterSpacing: 0.5, marginTop: 2 },
  homeHeaderStatusPill: { marginTop: 12, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  homeHeaderStatusText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  floorBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1 },
  mapTitle: { fontSize: 13, fontWeight: '700' },
  floorBtns: { flexDirection: 'row', gap: 5 },
  floorBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#EDE9FF' },
  floorBtnActive: { backgroundColor: C.purple },
  floorBtnText: { fontSize: 12, fontWeight: '600', color: C.purple },
  floorBtnTextActive: { color: '#fff' },
  floorBadge: { position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: 7, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  mapCard: { marginHorizontal: 14, marginTop: 10, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  mapHint: { textAlign: 'center', fontSize: 11, marginTop: 8, marginBottom: 6 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 6, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: 10, fontWeight: '600' },
  ttBtn: { marginHorizontal: 14, marginBottom: 12, padding: 10, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  ttBtnText: { fontSize: 12, fontWeight: '700' },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26,15,74,0.5)' },
  popup: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, padding: 24, paddingBottom: 40 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18, opacity: 0.4 },
  popupHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  roomBadge: { width: 50, height: 50, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  roomBadgeText: { fontSize: 13, fontWeight: '700' },
  roomId: { fontSize: 18, fontWeight: '700' },
  statusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 2, borderWidth: 1, alignSelf: 'flex-start', marginTop: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  issueBox: { backgroundColor: '#DBEAFE', borderRadius: 10, padding: 10, marginBottom: 12 },
  issueText: { fontSize: 12, fontWeight: '600', color: '#1E40AF' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },
  nextBox: { marginTop: 12, borderRadius: 12, padding: 12, borderWidth: 1 },
  nextLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  closeBtn: { marginTop: 16, padding: 13, borderRadius: 14, alignItems: 'center' },

  ttModal: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1 },
  ttHeader: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ttCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  slotChip: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 6, marginRight: 5, alignItems: 'center', minWidth: 38 },
  ttRow: { flexDirection: 'row', gap: 10, marginBottom: 7, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderLeftWidth: 3, padding: 8 },
  ttLecBadge: { width: 36, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', padding: 4 },

  uploadCard: { marginHorizontal: 14, marginTop: 4, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  uploadHeader: { padding: 12 },
  ttInfoBox: { borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1 },
  ttInfoLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  uploadBtn: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12, padding: 18, alignItems: 'center', marginBottom: 8 },
  statusBox: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 8 },
});
