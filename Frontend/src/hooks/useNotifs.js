import { useState, useCallback, useEffect, useRef } from 'react';
import { fsAdd, fsUpdate, fsDelete, fsList } from '../firebase/firestore';
import { sortNotifs, dateToDayName } from '../utils/helpers';
import { FALLBACK_LECTURE_SLOTS } from '../constants/config';

const POLL_INTERVAL = 15000;

export default function useNotifs(lectureSlots) {
  const slots = lectureSlots || FALLBACK_LECTURE_SLOTS;
  const [notifs,          setNotifs]          = useState([]);
  const [arrangedClasses, setArrangedClasses] = useState([]);
  const [cancelledSlots,  setCancelledSlots]  = useState([]);
  const deptRef = useRef(null);
  const semRef  = useRef(null);

  function notifPath(dept, semester) {
    return `notifications/${dept}/semesters/${semester}/posts`;
  }

  function toSubjectName(subject) {
    if (typeof subject === 'string') return subject;
    return subject?.subject || '';
  }

  function normalizeNotif(notif) {
    if (!notif) return notif;
    const subject = toSubjectName(notif.subject);
    return {
      ...notif,
      subject: subject || 'General',
      title: typeof notif.title === 'string'
        ? notif.title
        : `${notif?.title?.label || ''}${subject ? ` — ${subject}` : ''}`,
    };
  }

  function applyDocs(docs) {
    const normalizedDocs = (docs || []).map(normalizeNotif);
    setNotifs(sortNotifs(normalizedDocs, slots));
    setArrangedClasses(
      normalizedDocs.filter(n => n.type === 'arrange' && n.room && n.lectureNum)
        .map(n => ({
          id: n.id, day: dateToDayName(n.date),
          lectureNum: Number(n.lectureNum), room: n.room,
          subject: n.subject, postedBy: n.postedBy, date: n.date,
        }))
    );
    setCancelledSlots(
      normalizedDocs.filter(n => n.type === 'cancel' && n.date && n.lectureNum)
        .map(n => ({ id: n.id, date: n.date, lectureNum: Number(n.lectureNum), subject: n.subject }))
    );
  }

  const loadNotifs = useCallback(async (dept, semester) => {
    deptRef.current = dept;
    semRef.current  = semester;
    const docs = await fsList(notifPath(dept, semester));
    applyDocs(docs);
  }, [slots]);

  // Polling every 15 seconds
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!deptRef.current || !semRef.current) return;
      const docs = await fsList(notifPath(deptRef.current, semRef.current));
      applyDocs(docs);
    }, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [slots]);

  const postNotif = useCallback(async (notif, dept, semester) => {
    const cleanNotif = normalizeNotif(notif);
    const targetDept = cleanNotif.dept || dept;
    const targetSem  = cleanNotif.semester || semester;
    const id = await fsAdd(notifPath(targetDept, targetSem), cleanNotif);
    const withId = { ...cleanNotif, id };
    setNotifs(prev => sortNotifs([withId, ...prev], slots));
    if (cleanNotif.type === 'arrange' && cleanNotif.room && cleanNotif.lectureNum) {
      setArrangedClasses(prev => [...prev, {
        id: withId.id, day: dateToDayName(notif.date),
        lectureNum: Number(cleanNotif.lectureNum), room: cleanNotif.room,
        subject: cleanNotif.subject, postedBy: cleanNotif.postedBy, date: cleanNotif.date,
      }]);
    }
    if (cleanNotif.type === 'cancel' && cleanNotif.date && cleanNotif.lectureNum) {
      setCancelledSlots(prev => [...prev, {
        id: withId.id, date: cleanNotif.date,
        lectureNum: Number(cleanNotif.lectureNum), subject: cleanNotif.subject,
      }]);
    }
    return withId;
  }, [slots]);

  const editNotif = useCallback(async (updated, dept, semester) => {
    const cleanUpdated = normalizeNotif(updated);
    const targetDept = cleanUpdated.dept || dept;
    const targetSem  = cleanUpdated.semester || semester;
    await fsUpdate(`${notifPath(targetDept, targetSem)}/${cleanUpdated.id}`, cleanUpdated);
    setNotifs(prev => sortNotifs(prev.map(n => n.id === cleanUpdated.id ? cleanUpdated : n), slots));
    if (cleanUpdated.type === 'arrange') {
      setArrangedClasses(prev => prev.map(a =>
        a.id === cleanUpdated.id
          ? { ...a, day: dateToDayName(cleanUpdated.date), lectureNum: Number(cleanUpdated.lectureNum), room: cleanUpdated.room, subject: cleanUpdated.subject, date: cleanUpdated.date }
          : a
      ));
    }
    if (cleanUpdated.type === 'cancel') {
      setCancelledSlots(prev => [
        ...prev.filter(cs => cs.id !== cleanUpdated.id),
        { id: cleanUpdated.id, date: cleanUpdated.date, lectureNum: Number(cleanUpdated.lectureNum), subject: cleanUpdated.subject },
      ]);
    }
  }, [slots]);

  const deleteNotif = useCallback(async (id, type, dept, semester) => {
    await fsDelete(`${notifPath(dept, semester)}/${id}`);
    setNotifs(prev => prev.filter(n => n.id !== id));
    if (type === 'arrange') setArrangedClasses(prev => prev.filter(a => a.id !== id));
    if (type === 'cancel')  setCancelledSlots( prev => prev.filter(c => c.id !== id));
  }, []);

  const togglePin = useCallback((id) => {
    setNotifs(prev => sortNotifs(prev.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n), slots));
  }, [slots]);

  return {
    notifs, arrangedClasses, cancelledSlots,
    loadNotifs, postNotif, editNotif, deleteNotif, togglePin,
    setNotifs, setArrangedClasses, setCancelledSlots,
  };
}
