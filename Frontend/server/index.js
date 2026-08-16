const express  = require('express');
const multer   = require('multer');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');
const { fromPath } = require('pdf2pic');
const Tesseract = require('tesseract.js');
const fetch    = require('node-fetch');

const app  = express();
const PORT = 3000;

// ── Firebase config (同じプロジェクト) ────────────────────────────────────
const PROJECT_ID = 'universityassistentai';
const FS_BASE    = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

app.use(cors());
app.use(express.json());

// PDF一時保存先
const upload = multer({ dest: 'uploads/' });

// ── Firestore保存ヘルパー ─────────────────────────────────────────────────
async function saveToFirestore(data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string')  fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = { doubleValue: v };
    else fields[k] = { stringValue: JSON.stringify(v) };
  }
  const res = await fetch(`${FS_BASE}/timetables/active`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Firestore error: ' + err);
  }
  return await res.json();
}

// ── テキストからタイムテーブルJSONをパース ────────────────────────────────
function parseTimetableText(fullText) {
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);

  // 曜日パターン
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  // 時間スロットパターン (例: 08:30, 9:45 など)
  const timeRegex = /(\d{1,2}:\d{2})/g;

  // 部屋パターン (LT1〜LT9)
  const roomRegex = /\b(LT\d|Lab\d?)\b/gi;

  const roomMap = {};
  const subjectSet = new Set();
  const displayRows = [];

  // バッチ・学期情報を抽出
  let currentBatch = '';
  let currentSem = '';
  let currentRoom = '';
  let currentDay = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // バッチ検出 (例: "SP23-BCS" or "Semester 7")
    const semMatch = line.match(/semester\s*(\d)/i);
    if (semMatch) currentSem = semMatch[1];

    const batchMatch = line.match(/(SP|FA)\d{2}/i);
    if (batchMatch) currentBatch = batchMatch[0].toUpperCase();

    // 部屋検出
    const roomMatch = line.match(roomRegex);
    if (roomMatch) currentRoom = roomMatch[0].toUpperCase();

    // 曜日検出
    const dayMatch = DAYS.find(d => line.toLowerCase().includes(d.toLowerCase()));
    if (dayMatch) currentDay = dayMatch;

    // 時間スロット + 科目名の行を検出
    const times = line.match(timeRegex);
    if (times && times.length >= 2 && currentRoom && currentDay) {
      // 科目名を時間の前後から取得
      const subject = line
        .replace(timeRegex, '')
        .replace(roomRegex, '')
        .replace(/[^a-zA-Z\s]/g, '')
        .trim()
        .split(/\s{2,}/)[0]
        .trim();

      if (subject.length > 2) {
        const entry = {
          day:     currentDay,
          start:   times[0],
          end:     times[1],
          subject: subject,
          batch:   currentBatch,
          sem:     currentSem ? parseInt(currentSem) : null,
        };

        if (!roomMap[currentRoom]) roomMap[currentRoom] = [];
        roomMap[currentRoom].push(entry);
        subjectSet.add(subject);

        displayRows.push({
          room:    currentRoom,
          subject: subject,
          batch:   currentBatch,
          sem:     entry.sem,
          day:     currentDay,
          start:   times[0],
          end:     times[1],
        });
      }
    }
  }

  return {
    roomMap,
    displayRows,
    subjectsList: Array.from(subjectSet),
    lectureSlots: {
      1: { label: 'Lecture 1', start: '08:30', end: '09:45' },
      2: { label: 'Lecture 2', start: '09:45', end: '11:00' },
      3: { label: 'Lecture 3', start: '11:00', end: '12:30' },
      4: { label: 'Lecture 4', start: '12:30', end: '13:45' },
      5: { label: 'Lecture 5', start: '14:00', end: '15:15' },
      6: { label: 'Lecture 6', start: '15:15', end: '16:30' },
    },
  };
}

// ── メインエンドポイント: POST /upload-timetable ──────────────────────────
app.post('/upload-timetable', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF file received.' });

  const pdfPath  = req.file.path;
  const version  = req.body.version  || 'v1';
  const effDate  = req.body.effectiveDate || new Date().toISOString().split('T')[0];
  const uploadedBy = req.body.uploadedBy || 'admin';

  console.log(`📄 PDF received: ${req.file.originalname}`);

  const tmpDir = path.join('uploads', `tmp_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // Step 1: PDF → 画像変換
    console.log('🖼️  Converting PDF pages to images...');
    const converter = fromPath(pdfPath, {
      density: 200,
      saveFilename: 'page',
      savePath: tmpDir,
      format: 'png',
      width: 2480,
    });

    // ページ数取得（最大20ページ）
    const MAX_PAGES = 20;
    const pageImages = [];
    for (let p = 1; p <= MAX_PAGES; p++) {
      try {
        const result = await converter(p);
        if (result && result.path) {
          pageImages.push(result.path);
          console.log(`  ✓ Page ${p} converted`);
        }
      } catch {
        console.log(`  ℹ️  Page ${p} not found, stopping.`);
        break;
      }
    }

    if (pageImages.length === 0) throw new Error('No pages could be converted from PDF.');

    // Step 2: OCRでテキスト抽出
    console.log(`🔍 Running OCR on ${pageImages.length} pages...`);
    let fullText = '';
    const worker = await Tesseract.createWorker('eng');

    for (let i = 0; i < pageImages.length; i++) {
      console.log(`  OCR page ${i + 1}/${pageImages.length}...`);
      const { data: { text } } = await worker.recognize(pageImages[i]);
      fullText += `\n=== PAGE ${i + 1} ===\n` + text;
    }
    await worker.terminate();

    console.log('✅ OCR complete. Parsing timetable...');

    // Step 3: テキスト → JSON変換
    const parsed = parseTimetableText(fullText);

    // Step 4: Firestoreに保存
    console.log('💾 Saving to Firestore...');
    await saveToFirestore({
      version,
      effectiveDate: effDate,
      uploadedBy,
      uploadedAt: new Date().toISOString(),
      status: 'active',
      roomMap:      JSON.stringify(parsed.roomMap),
      displayRows:  JSON.stringify(parsed.displayRows),
      subjectsList: JSON.stringify(parsed.subjectsList),
      lectureSlots: JSON.stringify(parsed.lectureSlots),
      rawText:      fullText.slice(0, 5000), // デバッグ用（先頭5000文字）
    });

    // 一時ファイル削除
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.unlinkSync(pdfPath);

    console.log('🎉 Done!');
    res.json({
      success: true,
      message: `Timetable saved! ${pageImages.length} pages processed.`,
      roomCount: Object.keys(parsed.roomMap).length,
      subjectCount: parsed.subjectsList.length,
      rowCount: parsed.displayRows.length,
    });

  } catch (err) {
    // 一時ファイル削除
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    try { fs.unlinkSync(pdfPath); } catch {}

    console.error('❌ Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── ヘルスチェック ────────────────────────────────────────────────────────
app.get('/', (_, res) => res.json({ status: 'CampusAI Server running ✅' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 CampusAI Server started on http://localhost:${PORT}`);
  console.log(`📡 Send PDF to: POST http://localhost:${PORT}/upload-timetable\n`);
});
