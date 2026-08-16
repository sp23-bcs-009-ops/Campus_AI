import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../constants/colors';
import { NOTIF_TYPES, can } from '../constants/config';
import NotifCard from '../components/class/NotifCard';
import PostModal from '../components/class/PostModal';
import useNotifs from '../hooks/useNotifs';

const FILTERS = [
  { key: 'all',        label: 'All' },
  { key: 'arrange',    label: 'Arrange' },
  { key: 'cancel',     label: 'Cancel' },
  { key: 'assignment', label: 'Tasks' },
  { key: 'quiz',       label: 'Quiz' },
  { key: 'other',      label: 'Other' },
];

export default function ClassScreen({ user, dark, lectureSlots, subjectsMap, isGuest }) {
  const {
    notifs, loadNotifs, postNotif, editNotif, deleteNotif, togglePin,
    arrangedClasses, cancelledSlots,
  } = useNotifs(lectureSlots);

  const [typeFilter,    setTypeFilter]    = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [showPost,      setShowPost]      = useState(false);
  const [editItem,      setEditItem]      = useState(null);

  const dept     = user?.dept || 'cs';
  const semester = user?.semester || 7;

  const toSubjectName = (s) => (typeof s === 'string' ? s : s?.subject || '');

  useEffect(() => {
    if (!isGuest) loadNotifs(dept, semester);
  }, [dept, semester, isGuest]);

  const filtered = isGuest ? [] : notifs
    .filter(n => typeFilter    === 'all' || n.type    === typeFilter)
    .filter(n => subjectFilter === 'all' || toSubjectName(n.subject) === subjectFilter);

  const subjectOptions = ['all', ...new Set(notifs.map(n => toSubjectName(n.subject)).filter(s => s && s !== 'General'))];

  const tp  = dark ? '#EDE9FF' : '#1A0F4A';
  const ts  = dark ? '#9B7EF8' : '#6C47D4';
  const bg  = dark ? '#0A0A1E' : '#F5F4FF';

  async function handleSubmit(notif) {
    const targetDept = notif?.dept || dept;
    const targetSem = notif?.semester || semester;
    if (editItem) {
      await editNotif(notif, targetDept, targetSem);
    } else {
      await postNotif(notif, targetDept, targetSem);
    }
    setEditItem(null);
  }

  async function handleDelete(id, type) {
    await deleteNotif(id, type, dept, semester);
  }

  const canPost = !isGuest && can.postClassNotif(user);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={['left', 'right']}> 
      {/* Header */}
      <View style={[styles.header, { backgroundColor: dark ? C.purpleDeep : C.purple }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerSub}>BS {dept.toUpperCase()} · Sem {semester}</Text>
            <Text style={styles.headerTitle}>Class Board</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{notifs.length}</Text>
            </View>
            {canPost && (
              <TouchableOpacity
                onPress={() => { setEditItem(null); setShowPost(true); }}
                style={styles.addBtn}>
                <Text style={{ color: '#fff', fontSize: 20, lineHeight: 22 }}>+</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Type filter */}
        <FlatList
          data={FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={f => f.key}
          style={{ marginBottom: 8 }}
          renderItem={({ item: f }) => {
            const active = typeFilter === f.key;
            const nt = f.key !== 'all' ? NOTIF_TYPES[f.key] : null;
            return (
              <TouchableOpacity onPress={() => setTypeFilter(f.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, active && { color: nt ? nt.l.tx : C.purple }]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />

        {/* Subject filter */}
        <FlatList
          data={subjectOptions}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={s => s}
          style={{ marginBottom: 12 }}
          renderItem={({ item: s }) => {
            const active = subjectFilter === s;
            return (
              <TouchableOpacity onPress={() => setSubjectFilter(s)}
                style={[styles.subjectChip, active && styles.subjectChipActive]}>
                <Text style={[styles.subjectChipText, active && { color: C.purple }]}>
                  {s === 'all' ? 'All Subjects' : s}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Feed */}
      <FlatList
        data={filtered}
        keyExtractor={n => String(n.id)}
        contentContainerStyle={styles.feed}
        ListHeaderComponent={
          canPost ? (
            <TouchableOpacity
              onPress={() => { setEditItem(null); setShowPost(true); }}
              style={[styles.postPrompt, { backgroundColor: dark ? '#12123A' : '#FFFFFF', borderColor: dark ? '#2A1C6B' : '#E2E0F5' }]}>
              <View style={styles.postPromptIcon}>
                <Text style={{ color: '#fff', fontSize: 16 }}>+</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: ts }}>Post a notification...</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>📭</Text>
            <Text style={{ fontSize: 13, color: ts }}>No notifications here</Text>
          </View>
        }
        renderItem={({ item: n }) => (
          <NotifCard
            notif={n} dark={dark} user={user}
            lectureSlots={lectureSlots}
            onPin={togglePin}
            onEdit={item => { setEditItem(item); setShowPost(true); }}
            onDelete={handleDelete}
          />
        )}
      />

      {/* Post Modal */}
      <PostModal
        visible={showPost}
        dark={dark}
        editNotif={editItem}
        lectureSlots={lectureSlots}
        subjectsMap={subjectsMap}
        onClose={() => { setShowPost(false); setEditItem(null); }}
        onSubmit={handleSubmit}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { padding: 16, paddingBottom: 0 },
  headerTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerSub:   { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  countBadge:  { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  countText:   { color: '#fff', fontSize: 11, fontWeight: '700' },
  addBtn:      { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  filterChip:  { marginRight: 5, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  filterChipActive: { backgroundColor: 'rgba(255,255,255,0.95)' },
  filterChipText:   { fontSize: 11, fontWeight: '700', color: '#fff' },
  subjectChip: { marginRight: 5, marginBottom: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
  subjectChipActive: { backgroundColor: 'rgba(255,255,255,0.9)' },
  subjectChipText:   { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  feed:        { padding: 14, paddingBottom: 32 },
  postPrompt:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', marginBottom: 12 },
  postPromptIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center' },
  empty:       { alignItems: 'center', paddingVertical: 40 },
});
