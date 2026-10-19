/* ══════════════════════════════════════════════════════
   DISSONÂNCIA & MÁCULA — cloud.js
   Única camada que conversa com o Firebase (Auth + Firestore).
   O SDK é carregado sob demanda: sem uso de Campanha/Mestre,
   nada é baixado. Todo o resto do app usa só o objeto `cloud`.
   ══════════════════════════════════════════════════════ */

import { FIREBASE_CONFIG } from './firebase-config.js';

const SDK_VERSION = '12.19.0';
const SDK_BASE    = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

let _sdkPromise = null;

function loadSdk() {
  if (!_sdkPromise) {
    _sdkPromise = (async () => {
      const [appM, authM, fsM] = await Promise.all([
        import(`${SDK_BASE}/firebase-app.js`),
        import(`${SDK_BASE}/firebase-auth.js`),
        import(`${SDK_BASE}/firebase-firestore.js`),
      ]);
      const app = appM.initializeApp(FIREBASE_CONFIG);
      return { authM, fsM, auth: authM.getAuth(app), db: fsM.getFirestore(app) };
    })().catch(err => { _sdkPromise = null; throw err; });
  }
  return _sdkPromise;
}

const charsPath  = code => ['campaigns', code, 'characters'];
const grantsPath = (code, charId) => ['campaigns', code, 'characters', charId, 'grants'];

export const cloud = {

  /** true quando o firebase-config.js foi preenchido. */
  isConfigured() {
    const c = FIREBASE_CONFIG;
    return !!(c && c.apiKey && c.projectId && !String(c.apiKey).startsWith('COLE_') && !String(c.projectId).startsWith('COLE_'));
  },

  /* ── Autenticação ── */

  /** Usuário atual (aguarda o Firebase restaurar a sessão salva). Pode ser null. */
  async currentUser() {
    const { authM, auth } = await loadSdk();
    return new Promise(resolve => {
      const off = authM.onAuthStateChanged(auth, u => { off(); resolve(u); });
    });
  },

  /** Garante um usuário (entra como anônimo se não houver ninguém). */
  async ensureUser() {
    const { authM, auth } = await loadSdk();
    let user = await this.currentUser();
    if (!user) { await authM.signInAnonymously(auth); user = auth.currentUser; }
    return user;
  },

  /**
   * Login com Google. Se já houver um usuário anônimo, a conta Google é
   * VINCULADA a ele (mesmo uid), preservando as fichas já compartilhadas.
   */
  async signInGoogle() {
    const { authM, auth } = await loadSdk();
    const provider = new authM.GoogleAuthProvider();
    const cur = await this.currentUser();
    if (cur && cur.isAnonymous) {
      try { return (await authM.linkWithPopup(cur, provider)).user; }
      catch (e) { if (e.code !== 'auth/credential-already-in-use') throw e; }
    }
    return (await authM.signInWithPopup(auth, provider)).user;
  },

  async signOut() {
    const { authM, auth } = await loadSdk();
    await authM.signOut(auth);
  },

  /* ── Campanhas ── */

  async getCampaign(code) {
    const { fsM, db } = await loadSdk();
    const snap = await fsM.getDoc(fsM.doc(db, 'campaigns', code));
    return { exists: snap.exists(), data: snap.exists() ? snap.data() : null };
  },

  async createCampaign(code, name, ownerUid) {
    const { fsM, db } = await loadSdk();
    await fsM.setDoc(fsM.doc(db, 'campaigns', code), { ownerUid, name, createdAt: Date.now() });
  },

  async listMyCampaigns(ownerUid) {
    const { fsM, db } = await loadSdk();
    const q = fsM.query(fsM.collection(db, 'campaigns'), fsM.where('ownerUid', '==', ownerUid));
    const snap = await fsM.getDocs(q);
    return snap.docs.map(d => ({ code: d.id, ...d.data() })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },

  /* ── Fichas compartilhadas ── */

  async putCharacter(code, charId, data) {
    const { fsM, db } = await loadSdk();
    await fsM.setDoc(fsM.doc(db, ...charsPath(code), charId), data);
  },

  async deleteCharacter(code, charId) {
    const { fsM, db } = await loadSdk();
    await fsM.deleteDoc(fsM.doc(db, ...charsPath(code), charId));
  },

  /** Escuta em tempo real as fichas da campanha. Retorna a função que cancela. */
  watchCharacters(code, onData, onError) {
    let off = () => {}; let cancelled = false;
    loadSdk().then(({ fsM, db }) => {
      if (cancelled) return;
      off = fsM.onSnapshot(fsM.collection(db, ...charsPath(code)),
        snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        err => onError && onError(err));
    }).catch(err => onError && onError(err));
    return () => { cancelled = true; off(); };
  },

  /* ── Concessões (mestre → jogador) ── */

  async addGrant(code, charId, grant) {
    const { fsM, db } = await loadSdk();
    await fsM.addDoc(fsM.collection(db, ...grantsPath(code, charId)), grant);
  },

  async deleteGrant(code, charId, grantId) {
    const { fsM, db } = await loadSdk();
    await fsM.deleteDoc(fsM.doc(db, ...grantsPath(code, charId), grantId));
  },

  watchGrants(code, charId, onData, onError) {
    let off = () => {}; let cancelled = false;
    loadSdk().then(({ fsM, db }) => {
      if (cancelled) return;
      off = fsM.onSnapshot(fsM.collection(db, ...grantsPath(code, charId)),
        snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        err => onError && onError(err));
    }).catch(err => onError && onError(err));
    return () => { cancelled = true; off(); };
  },
};
