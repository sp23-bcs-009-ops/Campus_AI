import { FS_BASE, STORAGE_BASE, FIREBASE_CONFIG } from './config';

const AUTH_BASE = `https://identitytoolkit.googleapis.com/v1/accounts`;
const API_KEY   = FIREBASE_CONFIG.apiKey;

// Firebase Auth
export async function authSignUp(email, password) {
  const r = await fetch(`${AUTH_BASE}:signUp?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d;
}

export async function authSignIn(email, password) {
  const r = await fetch(`${AUTH_BASE}:signInWithPassword?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d;
}

export async function authSendVerification(idToken) {
  const r = await fetch(`${AUTH_BASE}:sendOobCode?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestType: 'VERIFY_EMAIL', idToken }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d;
}

export async function authGoogleSignIn(idToken) {
  const r = await fetch(`${AUTH_BASE}:signInWithIdp?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postBody: `id_token=${idToken}&providerId=google.com`,
      requestUri: 'http://localhost',
      returnIdpCredential: true,
      returnSecureToken: true,
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d;
}

export async function authGetUser(idToken) {
  const r = await fetch(`${AUTH_BASE}:lookup?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.users?.[0] || null;
}

// Firestore helpers
function serialise(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined)   out[k] = { nullValue: null };
    else if (typeof v === 'boolean')     out[k] = { booleanValue: v };
    else if (typeof v === 'number')      out[k] = { doubleValue: v };
    else if (typeof v === 'string')      out[k] = { stringValue: v };
    else if (Array.isArray(v))           out[k] = { arrayValue: { values: v.map(i => ({ stringValue: JSON.stringify(i) })) } };
    else if (typeof v === 'object')      out[k] = { stringValue: JSON.stringify(v) };
  }
  return out;
}

function deserialise(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v.stringValue !== undefined) {
      try { out[k] = JSON.parse(v.stringValue); } catch { out[k] = v.stringValue; }
    } else if (v.booleanValue !== undefined) out[k] = v.booleanValue;
    else if (v.doubleValue  !== undefined)   out[k] = v.doubleValue;
    else if (v.integerValue !== undefined)   out[k] = Number(v.integerValue);
    else if (v.nullValue    !== undefined)   out[k] = null;
    else if (v.arrayValue)                   out[k] = (v.arrayValue.values || []).map(i => { try { return JSON.parse(i.stringValue); } catch { return i.stringValue; } });
    else out[k] = v;
  }
  return out;
}

export async function fsGet(path) {
  try {
    const r = await fetch(`${FS_BASE}/${path}`);
    if (!r.ok) return null;
    const d = await r.json();
    return deserialise(d.fields || {});
  } catch { return null; }
}

export async function fsSet(path, data) {
  const body = { fields: serialise(data) };
  const r = await fetch(`${FS_BASE}/${path}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function fsAdd(collection, data) {
  const body = { fields: serialise(data) };
  const r = await fetch(`${FS_BASE}/${collection}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(d));
  return d.name?.split('/').pop() ?? null;
}

export async function fsUpdate(path, data) {
  const fields = Object.keys(data).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const body = { fields: serialise(data) };
  const r = await fetch(`${FS_BASE}/${path}?${fields}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function fsDelete(path) {
  const r = await fetch(`${FS_BASE}/${path}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
}

export async function fsList(collection) {
  try {
    const r = await fetch(`${FS_BASE}/${collection}`);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.documents || []).map(doc => ({
      _docId: doc.name.split('/').pop(), // always-unique Firestore doc ID
      ...deserialise(doc.fields || {}),
    }));
  } catch { return []; }
}

export async function storageUpload(storagePath, fileUri, mimeType = 'application/pdf') {
  const response = await fetch(fileUri);
  const blob = await response.blob();
  const uploadUrl = `${STORAGE_BASE}?uploadType=media&name=${encodeURIComponent(storagePath)}`;
  const r = await fetch(uploadUrl, {
    method: 'POST', headers: { 'Content-Type': mimeType }, body: blob,
  });
  if (!r.ok) {
    const errorText = await r.text();
    console.error("Firebase Storage Upload Error:", r.status, errorText);
    throw new Error('Storage upload failed: ' + errorText);
  }
  const d = await r.json();
  return `${STORAGE_BASE}/${encodeURIComponent(d.name)}?alt=media`;
}

export async function saveUserProfile(email, profile) {
  await fsSet(`users/${email.replace(/\./g, '_')}`, profile);
}

export async function getUserProfile(email) {
  return await fsGet(`users/${email.replace(/\./g, '_')}`);
}
