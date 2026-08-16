/**
 * upload_timetable_fixed.js
 * CS Timetable w.e.f April 20, 2026
 *
 * 修正点: timetables/active に1つではなく
 *         timetables/cs_sem1 〜 cs_sem8 として学期ごとに書き込む
 *
 * 実行方法: node upload_timetable_fixed.js
 */

// ── Firebase Config ───────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:    "AIzaSyB04Cgl5eIUQb_x85qrI7l6OLDEA45y-WI",
  projectId: "universityassistentai",
};
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

// ── Lecture Slots ─────────────────────────────────────────────────────────
const lectureSlots = {
  1: { label: "Lecture 1", start: "08:30", end: "09:45" },
  2: { label: "Lecture 2", start: "09:45", end: "11:00" },
  3: { label: "Lecture 3", start: "11:00", end: "12:30" },
  4: { label: "Lecture 4", start: "12:30", end: "13:45" },
  5: { label: "Lecture 5", start: "14:00", end: "15:15" },
  6: { label: "Lecture 6", start: "15:15", end: "16:30" },
};

// ── Timetable Entries ─────────────────────────────────────────────────────
const TIMETABLE_ENTRIES = [

  // BS(CS)-I (sem:1)
  { room:"CR4",         day:"Mon", lectureNum:1, subject:"Pre Calculus I",                        prof:"Dr. Muhammad Ozair",                    dept:"cs", sem:1 },
  { room:"CS C.Lab2",   day:"Mon", lectureNum:2, subject:"PF (Lab) - Lab Group 1",                prof:"Ms. Maryam Bukhari (Visiting)",          dept:"cs", sem:1, isLab:true },
  { room:"LH1",         day:"Mon", lectureNum:3, subject:"Fundamentals of Psychology",            prof:"Dr. Muhammad Usman",                    dept:"cs", sem:1 },
  { room:"LT1",         day:"Mon", lectureNum:5, subject:"AICT",                                  prof:"Mr. Qasim Khan",                         dept:"cs", sem:1 },
  { room:"CS C.Lab4",   day:"Mon", lectureNum:6, subject:"AICT (Lab) - Lab Group 1",              prof:"Mr. Irshad",                             dept:"cs", sem:1, isLab:true },
  { room:"CR2",         day:"Tue", lectureNum:1, subject:"Functional English",                    prof:"Ms. Tasneem Fiza",                       dept:"cs", sem:1 },
  { room:"CS C.Lab6",   day:"Tue", lectureNum:2, subject:"PF (Lab) - Lab Group 2",                prof:"Ms. Maryam Bukhari (Visiting)",          dept:"cs", sem:1, isLab:true },
  { room:"CS C.Lab1",   day:"Tue", lectureNum:6, subject:"AICT (Lab) - Lab Group 2",              prof:"Mr. Irshad",                             dept:"cs", sem:1, isLab:true },
  { room:"LT9",         day:"Wed", lectureNum:1, subject:"Programming Fundamentals",              prof:"Mr. Babar Shahzad",                      dept:"cs", sem:1 },
  { room:"LH2",         day:"Wed", lectureNum:3, subject:"Civics and Community Engagement",       prof:"Ms. Nazish Yameen",                      dept:"cs", sem:1 },
  { room:"CS C.Lab6",   day:"Wed", lectureNum:4, subject:"AICT (Lab) - Lab Group 2",              prof:"Mr. Irshad",                             dept:"cs", sem:1, isLab:true },
  { room:"LT9",         day:"Thu", lectureNum:2, subject:"Programming Fundamentals",              prof:"Mr. Babar Shahzad",                      dept:"cs", sem:1 },
  { room:"EE Hall",     day:"Thu", lectureNum:3, subject:"Islamic Studies",                       prof:"Dr. Ehtasham Masood",                    dept:"cs", sem:1 },
  { room:"LH4",         day:"Thu", lectureNum:4, subject:"Functional English",                    prof:"Ms. Tasneem Fiza",                       dept:"cs", sem:1 },
  { room:"CS C.Lab4",   day:"Thu", lectureNum:5, subject:"PF (Lab) - Lab Group 1",                prof:"Ms. Maryam Bukhari (Visiting)",          dept:"cs", sem:1, isLab:true },
  { room:"LH5",         day:"Thu", lectureNum:6, subject:"Pre Calculus I",                        prof:"Dr. Muhammad Ozair",                     dept:"cs", sem:1 },

  // BS(CS)-II (sem:2)
  { room:"LT4",         day:"Mon", lectureNum:3, subject:"Introduction to Entrepreneurship",      prof:"Dr. Sameen Khalid",                      dept:"cs", sem:2 },
  { room:"LT6",         day:"Mon", lectureNum:4, subject:"Discrete Structures",                   prof:"Ms. Mehreen Wahab",                      dept:"cs", sem:2 },
  { room:"LT8",         day:"Mon", lectureNum:5, subject:"Expository Writing",                    prof:"Ms. Maryam Al Hussaini",                 dept:"cs", sem:2 },
  { room:"CS C.Lab6",   day:"Tue", lectureNum:1, subject:"OOP (Lab) - Lab Group 2",               prof:"Mr. Babar Shahzad",                      dept:"cs", sem:2, isLab:true },
  { room:"CS C.Lab3",   day:"Tue", lectureNum:1, subject:"OOP (Lab) - Lab Group 2",               prof:"Mr. Babar Shahzad",                      dept:"cs", sem:2, isLab:true },
  { room:"LT9",         day:"Tue", lectureNum:3, subject:"Object Oriented Programming",           prof:"Mr. M. Waseem Khan",                     dept:"cs", sem:2 },
  { room:"LH2",         day:"Tue", lectureNum:5, subject:"Expository Writing",                    prof:"Ms. Maryam Al Hussaini",                 dept:"cs", sem:2 },
  { room:"LT8",         day:"Wed", lectureNum:1, subject:"Object Oriented Programming",           prof:"Mr. M. Waseem Khan",                     dept:"cs", sem:2 },
  { room:"LT8",         day:"Wed", lectureNum:2, subject:"Discrete Structures",                   prof:"Ms. Mehreen Wahab",                      dept:"cs", sem:2 },
  { room:"CS DLD Lab",  day:"Wed", lectureNum:3, subject:"Applied Physics (Lab)",                 prof:"Mr. Kashif Jatoi",                       dept:"cs", sem:2, isLab:true },
  { room:"CR3",         day:"Wed", lectureNum:6, subject:"Pre Calculus-II",                       prof:"Dr. M. Awais",                           dept:"cs", sem:2 },
  { room:"CR2",         day:"Thu", lectureNum:2, subject:"Pre Calculus-II",                       prof:"Dr. M. Awais",                           dept:"cs", sem:2 },
  { room:"LH1",         day:"Thu", lectureNum:3, subject:"Applied Physics",                       prof:"Dr. Muhammad Zeb",                       dept:"cs", sem:2 },
  { room:"CS C.Lab6",   day:"Thu", lectureNum:5, subject:"OOP (Lab) - Lab Group 1",               prof:"Mr. Babar Shahzad",                      dept:"cs", sem:2, isLab:true },

  // BS(CS)-III (sem:3)
  { room:"CS C.Lab2",   day:"Mon", lectureNum:3, subject:"DBS (Lab) - Lab Group 2",               prof:"Ms. Mehreen Wahab",                      dept:"cs", sem:3, isLab:true },
  { room:"CS C.Lab6",   day:"Mon", lectureNum:4, subject:"CN (Lab) - Lab Group 2",                prof:"Ms. Noor Ul Ain",                        dept:"cs", sem:3, isLab:true },
  { room:"CS C.Lab6",   day:"Mon", lectureNum:5, subject:"DS (Lab) - Lab Group 2",                prof:"Ms. Noor Ul Ain",                        dept:"cs", sem:3, isLab:true },
  { room:"LT9",         day:"Mon", lectureNum:6, subject:"Data Structures",                       prof:"Dr. M. Sardaraz",                        dept:"cs", sem:3 },
  { room:"LT9",         day:"Tue", lectureNum:1, subject:"Database Systems",                      prof:"Ms. Mehreen Wahab",                      dept:"cs", sem:3 },
  { room:"LT9",         day:"Tue", lectureNum:2, subject:"Software Engineering",                  prof:"Mr. Usman Anwar",                        dept:"cs", sem:3 },
  { room:"LT8",         day:"Tue", lectureNum:3, subject:"Data Structures",                       prof:"Dr. M. Sardaraz",                        dept:"cs", sem:3 },
  { room:"CS C.Lab6",   day:"Tue", lectureNum:4, subject:"CN (Lab) - Lab Group 2",                prof:"Ms. Noor Ul Ain",                        dept:"cs", sem:3, isLab:true },
  { room:"CS C.Lab4",   day:"Tue", lectureNum:5, subject:"DS (Lab) - Lab Group 1",                prof:"Ms. Noor Ul Ain",                        dept:"cs", sem:3, isLab:true },
  { room:"CS C.Lab2",   day:"Tue", lectureNum:6, subject:"DBS (Lab) - Lab Group 2",               prof:"Ms. Mehreen Wahab",                      dept:"cs", sem:3, isLab:true },
  { room:"CS C.Lab6",   day:"Wed", lectureNum:1, subject:"DBS (Lab) - Lab Group 1",               prof:"Ms. Mehreen Wahab",                      dept:"cs", sem:3, isLab:true },
  { room:"LH5",         day:"Wed", lectureNum:2, subject:"Calculus and Analytic Geometry",        prof:"Dr. Sohail Ahmad",                       dept:"cs", sem:3 },
  { room:"LT8",         day:"Wed", lectureNum:3, subject:"Computer Networks",                     prof:"Dr. Khalid Awan",                        dept:"cs", sem:3 },
  { room:"LT8",         day:"Wed", lectureNum:4, subject:"Software Engineering",                  prof:"Mr. Usman Anwar",                        dept:"cs", sem:3 },
  { room:"CS C.Lab1",   day:"Wed", lectureNum:5, subject:"DS (Lab) - Lab Group 2",                prof:"Ms. Noor Ul Ain",                        dept:"cs", sem:3, isLab:true },
  { room:"CS C.Lab6",   day:"Wed", lectureNum:6, subject:"CN (Lab) - Lab Group 1",                prof:"Ms. Noor Ul Ain",                        dept:"cs", sem:3, isLab:true },
  { room:"LT8",         day:"Thu", lectureNum:2, subject:"Calculus and Analytic Geometry",        prof:"Dr. Sohail Ahmad",                       dept:"cs", sem:3 },
  { room:"CS C.Lab2",   day:"Thu", lectureNum:3, subject:"DBS (Lab) - Lab Group 1",               prof:"Ms. Mehreen Wahab",                      dept:"cs", sem:3, isLab:true },
  { room:"CS C.Lab4",   day:"Thu", lectureNum:4, subject:"CN (Lab) - Lab Group 1",                prof:"Ms. Noor Ul Ain",                        dept:"cs", sem:3, isLab:true },
  { room:"LT5",         day:"Thu", lectureNum:5, subject:"Database Systems",                      prof:"Ms. Mehreen Wahab",                      dept:"cs", sem:3 },
  { room:"CS C.Lab4",   day:"Thu", lectureNum:6, subject:"DS (Lab) - Lab Group 1",                prof:"Ms. Noor Ul Ain",                        dept:"cs", sem:3, isLab:true },

  // BS(CS)-IV (sem:4)
  { room:"CS C.Lab1",   day:"Mon", lectureNum:2, subject:"Advanced Database Systems (Lab)",       prof:"Mr. Shahzad Rizwan",                     dept:"cs", sem:4, isLab:true },
  { room:"LT3",         day:"Mon", lectureNum:3, subject:"Advanced Database Systems",             prof:"Mr. Shahzad Rizwan",                     dept:"cs", sem:4 },
  { room:"LT3",         day:"Mon", lectureNum:6, subject:"Operating Systems",                     prof:"Dr. Tahira Sadaf",                       dept:"cs", sem:4 },
  { room:"CS C.Lab3",   day:"Tue", lectureNum:1, subject:"Data Structures (Lab)",                 prof:"Ms. Fouzia Jabeen",                      dept:"cs", sem:4, isLab:true },
  { room:"LT2",         day:"Tue", lectureNum:2, subject:"Data Structures",                       prof:"Mr. Armaghan Ali",                       dept:"cs", sem:4 },
  { room:"CR2",         day:"Tue", lectureNum:3, subject:"Introduction to Entrepreneurship",      prof:"Ms. Sanober Tariq",                      dept:"cs", sem:4 },
  { room:"CS C.Lab1",   day:"Tue", lectureNum:5, subject:"Operating Systems (Lab)",               prof:"Mr. Irshad",                             dept:"cs", sem:4, isLab:true },
  { room:"CS C.Lab3",   day:"Wed", lectureNum:1, subject:"Data Structures (Lab)",                 prof:"Ms. Fouzia Jabeen",                      dept:"cs", sem:4, isLab:true },
  { room:"CS C.Lab3",   day:"Wed", lectureNum:3, subject:"Operating Systems (Lab)",               prof:"Mr. Irshad",                             dept:"cs", sem:4, isLab:true },
  { room:"CS C.Lab3",   day:"Wed", lectureNum:4, subject:"Artificial Intelligence (Lab)",         prof:"Mr. Babar Ali",                          dept:"cs", sem:4, isLab:true },
  { room:"CS C.Lab3",   day:"Wed", lectureNum:5, subject:"Artificial Intelligence (Lab)",         prof:"Mr. Babar Ali",                          dept:"cs", sem:4, isLab:true },
  { room:"LT8",         day:"Thu", lectureNum:1, subject:"Data Structures",                       prof:"Mr. Armaghan Ali",                       dept:"cs", sem:4 },
  { room:"LT8",         day:"Thu", lectureNum:3, subject:"Artificial Intelligence",               prof:"Dr. Saleem Khan",                        dept:"cs", sem:4 },
  { room:"CS C.Lab1",   day:"Thu", lectureNum:5, subject:"Advanced Database Systems (Lab)",       prof:"Mr. Shahzad Rizwan",                     dept:"cs", sem:4, isLab:true },

  // BS(CS)-V (sem:5)
  { room:"CS C.Lab1",   day:"Mon", lectureNum:1, subject:"ML Fundamentals (Lab)",                 prof:"Mr. Qasim Khan",                         dept:"cs", sem:5, isLab:true },
  { room:"LT8",         day:"Mon", lectureNum:2, subject:"Design and Analysis of Algorithms",     prof:"Dr. M. Sardaraz",                        dept:"cs", sem:5 },
  { room:"LT2",         day:"Mon", lectureNum:3, subject:"Machine Learning Fundamentals",         prof:"Mr. Qasim Khan",                         dept:"cs", sem:5 },
  { room:"CS C.Lab1",   day:"Mon", lectureNum:4, subject:"Mobile Application Development (Lab)",  prof:"Mr. Kamran Ali",                         dept:"cs", sem:5, isLab:true },
  { room:"EE C.Lab(U)", day:"Mon", lectureNum:5, subject:"Comp. Org. and Assembly Language (Lab)",prof:"Dr. Muhammad Ramzan (Visiting)",          dept:"cs", sem:5, isLab:true },
  { room:"CS C.Lab5",   day:"Mon", lectureNum:6, subject:"Mobile Application Development (Lab)",  prof:"Mr. Kamran Ali",                         dept:"cs", sem:5, isLab:true },
  { room:"LT1",         day:"Tue", lectureNum:1, subject:"Multivariable Calculus",                prof:"Dr. Muhammad Sulaiman",                  dept:"cs", sem:5 },
  { room:"CR6",         day:"Tue", lectureNum:3, subject:"Comp. Org. and Assembly Language",      prof:"Dr. Muhammad Ramzan (Visiting)",          dept:"cs", sem:5 },
  { room:"CS C.Lab5",   day:"Tue", lectureNum:4, subject:"Web Technologies (Lab)",                prof:"Ms. Areeba (Visiting)",                  dept:"cs", sem:5, isLab:true },
  { room:"EE C.Lab(U)", day:"Tue", lectureNum:5, subject:"Comp. Org. and Assembly Language (Lab)",prof:"Dr. Muhammad Ramzan (Visiting)",          dept:"cs", sem:5, isLab:true },
  { room:"CR4",         day:"Wed", lectureNum:2, subject:"Multivariable Calculus",                prof:"Dr. Muhammad Sulaiman",                  dept:"cs", sem:5 },
  { room:"CS C.Lab1",   day:"Wed", lectureNum:3, subject:"Web Technologies",                      prof:"Ms. Areeba (Visiting)",                  dept:"cs", sem:5 },
  { room:"LT8",         day:"Wed", lectureNum:6, subject:"Design and Analysis of Algorithms",     prof:"Dr. M. Sardaraz",                        dept:"cs", sem:5 },
  { room:"CS C.Lab5",   day:"Thu", lectureNum:2, subject:"ML Fundamentals (Lab)",                 prof:"Mr. Qasim Khan",                         dept:"cs", sem:5, isLab:true },
  { room:"LT4",         day:"Thu", lectureNum:3, subject:"Mobile Application Development",        prof:"Mr. Kamran Ali",                         dept:"cs", sem:5 },
  { room:"CS C.Lab5",   day:"Thu", lectureNum:5, subject:"Web Technologies (Lab)",                prof:"Ms. Areeba (Visiting)",                  dept:"cs", sem:5, isLab:true },

  // BS(CS)-VI (sem:6)
  { room:"LT3",         day:"Mon", lectureNum:2, subject:"Linear Algebra",                        prof:"Dr. Noor Muhammad",                      dept:"cs", sem:6 },
  { room:"CS C.Lab1",   day:"Mon", lectureNum:3, subject:"HCI and Computer Graphics (Lab)",       prof:"Mr. Usman Anwar",                        dept:"cs", sem:6, isLab:true },
  { room:"LT2",         day:"Mon", lectureNum:4, subject:"Theory of Automata",                    prof:"Mr. Armaghan Ali",                       dept:"cs", sem:6 },
  { room:"CS C.Lab5",   day:"Mon", lectureNum:5, subject:"Mobile Application Development (Lab)",  prof:"Mr. Majid Ayub (Visiting)",              dept:"cs", sem:6, isLab:true },
  { room:"LT6",         day:"Mon", lectureNum:6, subject:"Theory of Automata",                    prof:"Mr. Armaghan Ali",                       dept:"cs", sem:6 },
  { room:"LT5",         day:"Tue", lectureNum:3, subject:"HCI and Computer Graphics",             prof:"Mr. Usman Anwar",                        dept:"cs", sem:6 },
  { room:"LT5",         day:"Tue", lectureNum:5, subject:"Mobile Application Development",        prof:"Mr. Majid Ayub (Visiting)",              dept:"cs", sem:6 },
  { room:"CS C.Lab4",   day:"Tue", lectureNum:6, subject:"Intro to Computer Vision (Lab)",        prof:"Mr. Qasim Khan",                         dept:"cs", sem:6, isLab:true },
  { room:"CS C.Lab1",   day:"Wed", lectureNum:1, subject:"HCI and Computer Graphics (Lab)",       prof:"Mr. Usman Anwar",                        dept:"cs", sem:6, isLab:true },
  { room:"LT3",         day:"Wed", lectureNum:3, subject:"Introduction to Computer Vision",       prof:"Mr. Qasim Khan",                         dept:"cs", sem:6 },
  { room:"LH4",         day:"Wed", lectureNum:5, subject:"Linear Algebra",                        prof:"Dr. Noor Muhammad",                      dept:"cs", sem:6 },
  { room:"LT6",         day:"Wed", lectureNum:6, subject:"Mobile Application Development",        prof:"Mr. Majid Ayub (Visiting)",              dept:"cs", sem:6 },
  { room:"CS C.Lab3",   day:"Thu", lectureNum:1, subject:"Intro to Computer Vision (Lab)",        prof:"Mr. Qasim Khan",                         dept:"cs", sem:6, isLab:true },
  { room:"CS C.Lab1",   day:"Thu", lectureNum:2, subject:"Advanced Database Systems (Lab)",       prof:"Mr. Shahzad Rizwan",                     dept:"cs", sem:6, isLab:true },
  { room:"LT2",         day:"Thu", lectureNum:3, subject:"Advanced Database Systems",             prof:"Mr. Shahzad Rizwan",                     dept:"cs", sem:6 },
  { room:"CS C.Lab2",   day:"Thu", lectureNum:5, subject:"Mobile Application Development (Lab)",  prof:"Mr. Majid Ayub (Visiting)",              dept:"cs", sem:6, isLab:true },
  { room:"CS C.Lab3",   day:"Thu", lectureNum:6, subject:"Advanced Database Systems (Lab)",       prof:"Mr. Shahzad Rizwan",                     dept:"cs", sem:6, isLab:true },

  // BS(CS)-VII (sem:7)
  { room:"LT9",         day:"Mon", lectureNum:1, subject:"Information Security",                  prof:"Dr. Khalid Awan",                        dept:"cs", sem:7 },
  { room:"LT5",         day:"Mon", lectureNum:2, subject:"Pro&St",                                prof:"Dr. Atta Ullah",                         dept:"cs", sem:7 },
  { room:"LT3",         day:"Mon", lectureNum:5, subject:"Professional Practices",                prof:"Mr. Usman Anwar",                        dept:"cs", sem:7 },
  { room:"LH2",         day:"Tue", lectureNum:2, subject:"Fundamentals of Marketing",             prof:"Ms. Amina Amin (Visiting)",              dept:"cs", sem:7 },
  { room:"LT6",         day:"Tue", lectureNum:4, subject:"Information Security",                  prof:"Dr. Khalid Awan",                        dept:"cs", sem:7 },
  { room:"LH2",         day:"Wed", lectureNum:1, subject:"Fundamentals of Marketing",             prof:"Ms. Amina Amin (Visiting)",              dept:"cs", sem:7 },
  { room:"LT4",         day:"Wed", lectureNum:3, subject:"Compiler Construction",                 prof:"Mr. Armaghan Ali",                       dept:"cs", sem:7 },
  { room:"CR6",         day:"Wed", lectureNum:4, subject:"Pro&St",                                prof:"Dr. Atta Ullah",                         dept:"cs", sem:7 },
  { room:"LT4",         day:"Wed", lectureNum:5, subject:"Professional Practices",                prof:"Mr. Usman Anwar",                        dept:"cs", sem:7 },
  { room:"LT2",         day:"Thu", lectureNum:1, subject:"Differential Equation",                 prof:"Dr. Ali Imran",                          dept:"cs", sem:7 },
  { room:"CS C.Lab3",   day:"Thu", lectureNum:4, subject:"Compiler Construction (Lab)",           prof:"Mr. Armaghan Ali",                       dept:"cs", sem:7, isLab:true },
  { room:"LT3",         day:"Thu", lectureNum:6, subject:"Differential Equation",                 prof:"Dr. Ali Imran",                          dept:"cs", sem:7 },

  // BS(CS)-VIII (sem:8)
  { room:"LT5",         day:"Mon", lectureNum:2, subject:"Pro&St",                                prof:"Dr. Atta Ullah",                         dept:"cs", sem:8 },
  { room:"LT8",         day:"Mon", lectureNum:3, subject:"Dev Ops for Cloud Computing",           prof:"Dr. Saleem Khan",                        dept:"cs", sem:8 },
  { room:"LT9",         day:"Mon", lectureNum:4, subject:"Human Resource Management",             prof:"Dr. Hamid Masood",                       dept:"cs", sem:8 },
  { room:"CS C.Lab5",   day:"Wed", lectureNum:1, subject:"Parallel and Distributed Computing (Lab)", prof:"Ms. Rabia Sikander (Visiting)",      dept:"cs", sem:8, isLab:true },
  { room:"CR6",         day:"Wed", lectureNum:4, subject:"Pro&St",                                prof:"Dr. Atta Ullah",                         dept:"cs", sem:8 },
  { room:"CS C.Lab5",   day:"Wed", lectureNum:5, subject:"Dev Ops for Cloud Computing (Lab)",     prof:"Ms. Areeba (Visiting)",                  dept:"cs", sem:8, isLab:true },
  { room:"CS C.Lab5",   day:"Wed", lectureNum:6, subject:"Parallel and Distributed Computing (Lab)", prof:"Ms. Rabia Sikander (Visiting)",      dept:"cs", sem:8, isLab:true },
  { room:"CS C.Lab5",   day:"Thu", lectureNum:1, subject:"Dev Ops for Cloud Computing (Lab)",     prof:"Ms. Areeba (Visiting)",                  dept:"cs", sem:8, isLab:true },
  { room:"CS C.Lab5",   day:"Thu", lectureNum:3, subject:"Parallel and Distributed Computing",    prof:"Ms. Rabia Sikander (Visiting)",          dept:"cs", sem:8 },
  { room:"LT9",         day:"Thu", lectureNum:6, subject:"Human Resource Management",             prof:"Dr. Hamid Masood",                       dept:"cs", sem:8 },
];

// ── Build helpers ─────────────────────────────────────────────────────────
function buildRoomMap(entries) {
  const map = {};
  for (const e of entries) {
    if (!map[e.room]) map[e.room] = [];
    const sl = lectureSlots[e.lectureNum];
    map[e.room].push({
      day:        e.day,
      lectureNum: e.lectureNum,
      start:      sl?.start || "",
      end:        sl?.end   || "",
      subject:    e.subject,
      prof:       e.prof,
      dept:       e.dept,
      sem:        e.sem,
      isLab:      e.isLab || false,
      isMine:     false,
    });
  }
  return map;
}

function buildDisplayRows(entries) {
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const byDay = {};
  for (const e of entries) {
    if (!byDay[e.day]) byDay[e.day] = [];
    const sl = lectureSlots[e.lectureNum];
    byDay[e.day].push({
      n:       e.lectureNum,
      start:   sl?.start || "",
      end:     sl?.end   || "",
      subject: e.subject,
      prof:    e.prof,
      room:    e.room,
      dept:    e.dept,
      sem:     e.sem,
      isLab:   e.isLab || false,
      mine:    false,
    });
  }
  return DAYS
    .filter(d => byDay[d])
    .map(d => ({ day: d, slots: byDay[d].sort((a, b) => a.n - b.n) }));
}

function buildSubjectsList(entries) {
  const seen = new Set();
  return entries
    .filter(e => { const k = e.subject; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(e => ({ subject: e.subject, prof: e.prof, dept: e.dept, sem: e.sem, isLab: e.isLab || false }));
}

// ── Firestore helpers ─────────────────────────────────────────────────────
function serialise(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) out[k] = { nullValue: null };
    else if (typeof v === "boolean")   out[k] = { booleanValue: v };
    else if (typeof v === "number")    out[k] = { doubleValue: v };
    else if (typeof v === "string")    out[k] = { stringValue: v };
    else                               out[k] = { stringValue: JSON.stringify(v) };
  }
  return out;
}

async function fsSet(path, data) {
  const url  = `${FS_BASE}/${path}`;
  const body = JSON.stringify({ fields: serialise(data) });
  const r    = await fetch(url, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!r.ok) throw new Error(`Firestore ${r.status}: ${await r.text()}`);
  return await r.json();
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("CS Timetable Upload — w.e.f April 20, 2026");
  console.log("============================================");

  // 学期ごとにグループ化
  const bySem = {};
  for (const e of TIMETABLE_ENTRIES) {
    if (!bySem[e.sem]) bySem[e.sem] = [];
    bySem[e.sem].push(e);
  }

  for (const [sem, entries] of Object.entries(bySem)) {
    const semNum     = Number(sem);
    const docId      = `cs_sem${semNum}`;
    const roomMap    = buildRoomMap(entries);
    const displayRows = buildDisplayRows(entries);
    const subjectsList = buildSubjectsList(entries);

    const doc = {
      dept:          "cs",
      semester:      semNum,
      version:       "2026-SP-v1",
      effectiveDate: "2026-04-20",
      uploadedBy:    "admin",
      status:        "active",
      updatedAt:     new Date().toISOString(),
      lectureSlots:  JSON.stringify(lectureSlots),
      roomMap:       JSON.stringify(roomMap),
      displayRows:   JSON.stringify(displayRows),
      subjectsList:  JSON.stringify(subjectsList),
    };

    process.stdout.write(`Writing timetables/${docId} (${entries.length} entries)... `);
    try {
      await fsSet(`timetables/${docId}`, doc);
      console.log("OK");
    } catch (err) {
      console.log("FAILED");
      console.error("  Error:", err.message);
      process.exit(1);
    }
  }

  console.log("\nAll semesters uploaded successfully!");
  console.log("Firestore collection: timetables/");
  console.log("Documents: cs_sem1 ~ cs_sem8");
}

main();
