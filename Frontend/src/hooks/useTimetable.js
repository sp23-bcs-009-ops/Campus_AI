import { useState, useEffect } from 'react';
import { fsGet, fsList } from '../firebase/firestore';
import { parseTimetableDoc } from '../utils/helpers';
import { FALLBACK_LECTURE_SLOTS } from '../constants/config';

/**
 * Loads the active timetable from Firestore on mount.
 * Falls back to default lecture slots when Firebase is not configured.
 *
 * Returns:
 *   { lectureSlots, timetables, displayRows, subjectsList, meta, loading, error, reload }
 */
export default function useTimetable() {
  const [state, setState] = useState({
    lectureSlots: FALLBACK_LECTURE_SLOTS,
    timetables:   {},
    displayRows:  [],
    displayRowsBySemester: {},
    subjectsList: [],
    subjectsBySemester: {},
    meta:         null,
    loading:      true,
    error:        null,
  });

  async function load() {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const docs = await fsList('timetables');

      const bySem = {};
      const displayRowsBySemester = {};
      const subjectsBySemester = {};

      let lectureSlots = FALLBACK_LECTURE_SLOTS;
      let latestMeta = null;

      for (const doc of docs) {
        const parsed = parseTimetableDoc(doc);
        if (!parsed) continue;

        if (parsed.lectureSlots && Object.keys(parsed.lectureSlots).length > 0) {
          lectureSlots = parsed.lectureSlots;
        }

        const sem = Number(doc.semester);
        if (Number.isFinite(sem) && sem >= 1 && sem <= 8) {
          bySem[sem] = parsed.timetables;
          displayRowsBySemester[sem] = parsed.displayRows || [];
          subjectsBySemester[sem] = parsed.subjectsList || [];
        }

        const updatedAt = doc.updatedAt || '';
        if (!latestMeta || updatedAt > (latestMeta.updatedAt || '')) {
          latestMeta = {
            version:       parsed.version,
            effectiveDate: parsed.effectiveDate,
            uploadedBy:    parsed.uploadedBy,
            pdfUrl:        parsed.pdfUrl,
            status:        parsed.status,
            updatedAt,
          };
        }
      }

      // Backward compatibility: if semester docs are not available, use timetables/active.
      if (Object.keys(bySem).length === 0) {
        const active = await fsGet('timetables/active');
        const parsedActive = parseTimetableDoc(active);
        if (parsedActive) {
          const fallbackSem = 7;
          bySem[fallbackSem] = parsedActive.timetables;
          displayRowsBySemester[fallbackSem] = parsedActive.displayRows || [];
          subjectsBySemester[fallbackSem] = parsedActive.subjectsList || [];
          lectureSlots = parsedActive.lectureSlots || lectureSlots;
          latestMeta = {
            version:       parsedActive.version,
            effectiveDate: parsedActive.effectiveDate,
            uploadedBy:    parsedActive.uploadedBy,
            pdfUrl:        parsedActive.pdfUrl,
            status:        parsedActive.status,
            updatedAt:     active?.updatedAt || '',
          };
        }
      }

      const defaultSem = Number(Object.keys(bySem)[0] || 7);
      setState({
        lectureSlots,
        timetables: bySem,
        displayRows: displayRowsBySemester[defaultSem] || [],
        displayRowsBySemester,
        subjectsList: subjectsBySemester[defaultSem] || [],
        subjectsBySemester,
        meta: latestMeta,
        loading: false,
        error: null,
      });
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: 'Could not load timetable.' }));
    }
  }

  useEffect(() => { load(); }, []);

  return { ...state, reload: load };
}
