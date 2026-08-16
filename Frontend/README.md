# CampusAI — COMSATS University Islamabad, Attock Campus

React Native (Expo) mobile app for campus management.

---

## 📁 Project Structure

```
CampusAI/
├── App.js                          # Root navigation + state
├── app.json                        # Expo config
├── babel.config.js
├── package.json
├── assets/
└── src/
    ├── constants/
    │   ├── colors.js               # Brand colours + room status palette
    │   └── config.js               # All app-wide config, permissions, floor map data
    │
    ├── firebase/
    │   ├── config.js               # Firebase SDK keys (fill in YOUR_* values)
    │   └── firestore.js            # fsGet / fsSet / fsAdd / fsUpdate / fsDelete / fsList / storageUpload
    │
    ├── utils/
    │   └── helpers.js              # Auth helpers, time utils, room status, sort, event status
    │
    ├── hooks/
    │   ├── useTimetable.js         # Loads active timetable from Firestore on mount
    │   └── useNotifs.js            # Class notifications: load, post, edit, delete
    │
    ├── components/
    │   ├── ui/
    │   │   └── index.js            # COMSATSLogo, PrimaryButton, InputField, ErrBanner, Chip, etc.
    │   ├── map/
    │   │   └── ArcMap.js           # SVG floor map (3 floors, scrollable)
    │   ├── class/
    │   │   ├── PostModal.js        # Teacher-only: type → dept/sem → form
    │   │   └── NotifCard.js        # Notification card with pin/edit/delete (teacher only)
    │   ├── events/
    │   │   ├── EventPostModal.js   # Teacher/Staff: 2-step warning + form + image picker
    │   │   └── EventCard.js        # Event card with edit/delete (teacher/staff only)
    │   └── lostfound/
    │       ├── LFPostModal.js      # All users: 2-step warning + form + image picker
    │       └── LFCard.js           # L&F card with resolve/edit/delete (staff only)
    │
    └── screens/
        ├── LoginScreen.js          # Sign in / Sign up (role select → form)
        ├── HomeScreen.js           # Floor map + TT button + Admin PDF upload
        ├── ClassScreen.js          # Class Board (type + subject filter)
        ├── UniNewsScreen.js        # Events + Lost & Found (sub-tabs)
        └── ProfileScreen.js        # My Page (edit name/dob/phone, portal link)
```

---

## 🔐 Permission Matrix

| Feature                  | Student | Teacher | Staff | Guest |
|--------------------------|:-------:|:-------:|:-----:|:-----:|
| View Class Notifications | ✓       | ✓       | ✓     | —     |
| Post / Edit / Delete Notif | —     | ✓       | —     | —     |
| View Events              | ✓       | ✓       | ✓     | —     |
| Post / Edit / Delete Event | —     | ✓       | ✓     | —     |
| View Lost & Found        | ✓       | ✓       | ✓     | —     |
| Post Lost & Found        | ✓       | ✓       | ✓     | —     |
| Edit / Delete / Resolve LF | —     | —       | ✓     | —     |
| Upload Timetable PDF     | —       | ✓       | ✓     | —     |

All permissions are defined in `src/constants/config.js` → `can` object.

---

## 🔥 Firebase Design

### Collections

```
/timetables/active              ← Active timetable doc (written by Admin upload)
  version:       "TT2"
  effectiveDate: "2026-04-20"
  uploadedBy:    "admin@cuiatk.edu.pk"
  uploadedAt:    ISO timestamp
  pdfUrl:        Storage download URL
  pdfPath:       Storage path
  status:        "processing" | "ready"
  lectureSlots:  { "1": {label, start, end}, ... }   ← populated by Cloud Function
  roomMap:       { "LT9": [{day,start,end,subject,prof,isMine}] }
  displayRows:   [ {day, slots:[{n,subject,prof,room,mine}]} ]
  subjectsList:  ["Information Security", ...]

/notifications/{dept}/{semester}/posts/{docId}
  type:       "arrange" | "cancel" | "assignment" | "quiz" | "other"
  dept:       "cs" | "se" | "ai"
  semester:   1-8
  subject:    string
  lectureNum: number | null
  date:       "YYYY-MM-DD" | null
  deadline:   "YYYY-MM-DDTHH:MM" | null
  room:       string | null
  body:       string
  postedBy:   string
  pinned:     boolean
  title:      string

/events/{docId}                 ← University Events
  cat, title, date, time, endTime, venue,
  deadline, contact, body, images[], postedBy, createdAt

/lostfound/{docId}              ← Lost & Found
  type, cat, title, location, date, time,
  contact, body, images[], resolved, postedBy, createdAt
```

### Firebase Cloud Function (backend team)

When a PDF is uploaded to `gs://YOUR_BUCKET/timetables/*`, trigger a Function that:
1. Downloads the PDF from Storage
2. Extracts text (pdf-parse or similar)
3. Parses the timetable table structure into JSON matching the schema above
4. Writes the result back to `timetables/active` with `status: "ready"`

The frontend polls / listens to `timetables/active` and calls `applyTimetable()` when ready.

---

## 🚀 Setup & Run

### Prerequisites
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- Expo Go app on your phone (iOS/Android)

### Steps

```bash
# 1. Install dependencies
cd CampusAI
npm install

# 2. Add Firebase credentials
# Open src/firebase/config.js and replace all YOUR_* placeholders

# 3. Start dev server
npx expo start

# 4. Scan QR code with Expo Go on your phone
```

### Android (USB)
```bash
npx expo start --android
```

### iOS (Simulator)
```bash
npx expo start --ios
```

---

## 📝 Notes for Backend Team

- All Firestore calls use REST API (no Firebase SDK dependency)
- `src/firebase/firestore.js` exports: `fsGet`, `fsSet`, `fsAdd`, `fsUpdate`, `fsDelete`, `fsList`, `storageUpload`
- PDF upload: frontend uploads to Storage, saves metadata to `timetables/active`
- Cloud Function processes PDF → writes structured JSON back to same doc
- No auth token implementation yet — add Firebase Auth Bearer token to fetch headers in `firestore.js` when ready
