// ─── App-wide config ──────────────────────────────────────────────────────
export const ALLOWED_DOMAIN = '@cuiatk.edu.pk';

export const DEPT_MAP = {
  cs:  'Computer Science',
  se:  'Software Engineering',
  ai:  'Artificial Intelligence',
};

// Max semesters per department
export const DEPT_MAX_SEM = { cs: 8, se: 8, ai: 4 };

export const SEM_LABELS = ['','1st','2nd','3rd','4th','5th','6th','7th','8th'];

export const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ─── User roles & permissions ─────────────────────────────────────────────
export const ROLES = {
  student: 'student',
  teacher: 'teacher',
  staff:   'staff',
  guest:   'guest',
};

/**
 * Centralised permission checks.
 * Pass the user object (must have .type property).
 */
export const can = {
  // Class Notifications
  postClassNotif:   (u) => u?.type === ROLES.teacher,
  editClassNotif:   (u) => u?.type === ROLES.teacher,
  deleteClassNotif: (u) => u?.type === ROLES.teacher,

  // University Events
  postEvent:   (u) => u?.type === ROLES.teacher || u?.type === ROLES.staff,
  editEvent:   (u) => u?.type === ROLES.teacher || u?.type === ROLES.staff,
  deleteEvent: (u) => u?.type === ROLES.teacher || u?.type === ROLES.staff,

  // Lost & Found
  postLF:   (u) => !!u && u.type !== ROLES.guest,   // all logged-in users
  editLF:   (u) => u?.type === ROLES.staff,
  deleteLF: (u) => u?.type === ROLES.staff,
  resolveLF:(u) => u?.type === ROLES.staff,

  // Timetable upload (Admin panel)
  uploadTimetable: (u) => u?.type === ROLES.staff || u?.type === ROLES.teacher,
};

// ─── Navigation tabs ──────────────────────────────────────────────────────
export const NAV_TABS = [
  { key: 'chat',    label: 'AI Chat',   icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z' },
  { key: 'class',   label: 'Class',     icon: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z', badge: true },
  { key: 'home',    label: 'Home',      icon: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z' },
  { key: 'uninews', label: 'Uni News',  icon: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z' },
  { key: 'profile', label: 'My Page',   icon: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' },
  { key: 'internal', label: 'Internal', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z' },
];

export const USER_TYPES = [
  { id: 'student', label: 'Student', sub: 'Enrolled student · @cuiatk.edu.pk' },
  { id: 'teacher', label: 'Teacher', sub: 'Faculty member · @cuiatk.edu.pk' },
  { id: 'staff',   label: 'Staff',   sub: 'Admin / support · @cuiatk.edu.pk' },
];

// ─── Notification types ───────────────────────────────────────────────────
export const NOTIF_TYPES = {
  arrange:    { label: 'Arrange Class',  l:{bg:'#DCFCE7',bd:'#16A34A',tx:'#166534'}, d:{bg:'#052E16',bd:'#22C55E',tx:'#86EFAC'} },
  cancel:     { label: 'Cancel Class',   l:{bg:'#FEE2E2',bd:'#EF4444',tx:'#B91C1C'}, d:{bg:'#450A0A',bd:'#F87171',tx:'#FCA5A5'} },
  assignment: { label: 'Assignment',     l:{bg:'#FEF9C3',bd:'#CA8A04',tx:'#854D0E'}, d:{bg:'#422006',bd:'#FCD34D',tx:'#FDE047'} },
  quiz:       { label: 'Quiz',           l:{bg:'#EDE9FF',bd:'#6C47D4',tx:'#3D2B8E'}, d:{bg:'#2A1C6B',bd:'#A78BFA',tx:'#C4B5FD'} },
  other:      { label: 'Other',          l:{bg:'#F3F4F6',bd:'#6B7280',tx:'#374151'}, d:{bg:'#1F2937',bd:'#9CA3AF',tx:'#D1D5DB'} },
};

// ─── Event categories ─────────────────────────────────────────────────────
export const EVENT_CATS = [
  { key: 'academic',  label: 'Academic',  color: '#4F46E5' },
  { key: 'sports',    label: 'Sports',    color: '#16A34A' },
  { key: 'cultural',  label: 'Cultural',  color: '#D97706' },
  { key: 'career',    label: 'Career',    color: '#0891B2' },
  { key: 'other',     label: 'Other',     color: '#6B7280' },
];

// ─── Lost & Found categories ──────────────────────────────────────────────
export const LF_CATS = [
  { key: 'wallet',     label: 'Wallet / ID' },
  { key: 'phone',      label: 'Phone' },
  { key: 'bag',        label: 'Bag / Laptop' },
  { key: 'stationery', label: 'Stationery' },
  { key: 'clothing',   label: 'Clothing' },
  { key: 'other',      label: 'Other' },
];

// ─── Fallback lecture slots (used before Firebase loads) ──────────────────
export const FALLBACK_LECTURE_SLOTS = {
  1: { label: 'Lecture 1', start: '08:30', end: '09:45' },
  2: { label: 'Lecture 2', start: '09:45', end: '11:00' },
  3: { label: 'Lecture 3', start: '11:00', end: '12:30' },
  4: { label: 'Lecture 4', start: '12:30', end: '13:45' },
  5: { label: 'Lecture 5', start: '14:00', end: '15:15' },
  6: { label: 'Lecture 6', start: '15:15', end: '16:30' },
};

// ─── CS Block floor map layout ────────────────────────────────────────────
export const FLOORS = {
  1: {
    outerR: 200, innerR: 70,
    arcRooms: [
      { id:'LT3', cx:270, cy:315, w:74, h:46, type:'lt' },
      { id:'LT2', cx:380, cy:298, w:78, h:52, type:'lt' },
      { id:'LT1', cx:490, cy:315, w:74, h:46, type:'lt' },
    ],
    leftWing: [
      { id:'OffL1', cx:188, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL2', cx:113, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL3', cx:38,  cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL4', cx:188, cy:396, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL5', cx:113, cy:396, w:68, h:32, type:'office', label:'MS Lab' },
      { id:'OffL6', cx:38,  cy:396, w:68, h:32, type:'office', label:'Office' },
    ],
    rightWing: [
      { id:'OffR1', cx:572, cy:358, w:68, h:32, type:'office', label:'Dept Staff' },
      { id:'OffR2', cx:647, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR3', cx:722, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR4', cx:572, cy:396, w:68, h:32, type:'office', label:'PS Office' },
      { id:'OffR5', cx:647, cy:396, w:68, h:32, type:'office', label:'HOD Office' },
      { id:'OffR6', cx:722, cy:396, w:68, h:32, type:'office', label:'Office' },
    ],
  },
  2: {
    outerR: 200, innerR: 70,
    arcRooms: [
      { id:'LT6', cx:270, cy:315, w:74, h:46, type:'lt' },
      { id:'LT5', cx:380, cy:298, w:78, h:52, type:'lt' },
      { id:'LT4', cx:490, cy:315, w:74, h:46, type:'lt' },
    ],
    leftWing: [
      { id:'Lab2',  cx:188, cy:358, w:68, h:32, type:'lab', label:'Computer Lab 2' },
      { id:'Lab1',  cx:188, cy:396, w:68, h:32, type:'lab', label:'Computer Lab 1' },
      { id:'OffL7', cx:113, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL8', cx:113, cy:396, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL9', cx:38,  cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL10',cx:38,  cy:396, w:68, h:32, type:'office', label:'Office' },
    ],
    rightWing: [
      { id:'OffR7', cx:572, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR8', cx:572, cy:396, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR9', cx:647, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR10',cx:647, cy:396, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR11',cx:722, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR12',cx:722, cy:396, w:68, h:32, type:'office', label:'Office' },
    ],
  },
  3: {
    outerR: 200, innerR: 88,
    arcRooms: [
      { id:'LT9', cx:312, cy:306, w:90, h:52, type:'lt' },
      { id:'LT8', cx:448, cy:306, w:90, h:52, type:'lt' },
    ],
    leftWing: [
      { id:'Lab4',  cx:188, cy:358, w:68, h:32, type:'lab', label:'Electric Lab 4' },
      { id:'Lab3',  cx:188, cy:396, w:68, h:32, type:'lab', label:'Electric Lab 3' },
      { id:'OffL13',cx:113, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL14',cx:113, cy:396, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL15',cx:38,  cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffL16',cx:38,  cy:396, w:68, h:32, type:'office', label:'Office' },
    ],
    rightWing: [
      { id:'OffR13',cx:572, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR14',cx:572, cy:396, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR15',cx:647, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR16',cx:647, cy:396, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR17',cx:722, cy:358, w:68, h:32, type:'office', label:'Office' },
      { id:'OffR18',cx:722, cy:396, w:68, h:32, type:'office', label:'Office' },
    ],
  },
};

export const FLOOR_ROOMS = {
  1: ['LT1','LT2','LT3'],
  2: ['LT4','LT5','LT6','Lab1','Lab2'],
  3: ['LT8','LT9','Lab3','Lab4'],
};

export const FLOOR_LABELS = { 1:'Ground Floor', 2:'First Floor', 3:'Second Floor' };
