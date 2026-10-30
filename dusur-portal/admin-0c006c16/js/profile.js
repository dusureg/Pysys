/**
 * <admin>/js/profile.js  -  a person's own profile: phone number and picture
 * One small sealed file per person (data/private/profiles/<id>.json, "owner" for the administrator). Everybody may write their own file and nobody else's
 * (see canWritePath). The name of a team member is set by the administrator, so the History always names the person the administrator knows.
 * Loaded by: admin page
 */
'use strict';

/* =====================================================================
   Profiles
   ===================================================================== */
const PROFILE_PX = 192, PROFILE_PIC_MAX = 60000;
const profilePath = (uid) => PROFILE_DIR + uid + '.json';
const PIC_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const normProfile = (x) => {
  x = x || {};
  return { v: 1, phone: String(x.phone == null ? '' : x.phone).replace(/[^\d+\-() ]/g, '').trim().slice(0, 30), pic: typeof x.pic === 'string' && x.pic.length <= PROFILE_PIC_MAX && PIC_RE.test(x.pic) ? x.pic : '' };
};
const myProfile = () => (session && session.user ? profiles[session.user.id] || null : null);

async function loadProfile(uid) {
  try { const f = await getFile(profilePath(uid)); return (profiles[uid] = normProfile(await openObj(f.text))); } catch (e) {
    if (e.status === 404) return (profiles[uid] = normProfile(null));
    throw e;
  }
}
async function loadAllProfiles() {
  const list = (await listDir(PROFILE_DIR)).filter((f) => f.type === 'file' && /^[\w-]+\.json$/.test(f.name));
  await pool(list, 4, async (f) => { try { const r = await getFile(f.path); profiles[f.name.slice(0, -5)] = normProfile(await openObj(r.text)); } catch (_) { /* one unreadable file does not hide the others */ } });
  return profiles;
}
// read once after signing in, then the menu is drawn again with the picture
async function ensureMyProfile() {
  const u = session && session.user; if (!u || profiles[u.id]) return;
  try { await loadProfile(u.id); if (session && session.user === u) paintUser(); } catch (_) { /* the initials are shown instead */ }
}
async function saveMyProfile(p) {
  const u = session && session.user; if (!u) throw new Error(t('err.relock'));
  const before = profiles[u.id] || normProfile(null), clean = normProfile(p);
  await putFile(profilePath(u.id), await sealObj(clean), 'Update profile');
  profiles[u.id] = clean;
  audit({ area: 'team', act: 'profile', ref: u.id, title: u.owner ? ownerLabel() : u.name || u.username, ch: [].concat(before.phone !== clean.phone ? [['phone', before.phone, clean.phone]] : [], before.pic !== clean.pic ? [['picture', '', clean.pic ? '(image)' : '(removed)']] : []) });
  paintUser();
}
// a square picture, cut from the middle, small enough for a sealed file
async function profilePicFromFile(file) {
  if (file.size > 12 * 1024 * 1024) throw new Error(t('prof.picBig'));
  let bmp; try { bmp = await createImageBitmap(file); } catch (_) { throw new Error(t('ph.unsupported', { name: file.name })); }
  try {
    for (const px of [PROFILE_PX, 144, 112, 80]) {
      const side = Math.min(bmp.width, bmp.height), c = document.createElement('canvas'); c.width = c.height = px;
      c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, px, px);
      const url = c.toDataURL('image/jpeg', 0.82);
      if (url.length <= PROFILE_PIC_MAX) return url;
    }
  } finally { if (bmp.close) bmp.close(); }
  throw new Error(t('prof.picBig'));
}
// the round picture, or the initials when there is none
const avatarNode = (name, pic, cls) => h('span', { class: 'avatar' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' }, pic ? h('img', { src: pic, alt: '' }) : initials(name));
