// ================= FIREBASE SETUP =================
const firebaseConfig = {
  apiKey: "AIzaSyA8ppXG3b3L9tahTXNaND6DErOSGQEHvqE",
  authDomain: "chipme-5e40f.firebaseapp.com",
  databaseURL: "https://chipme-5e40f-default-rtdb.firebaseio.com",
  projectId: "chipme-5e40f",
  storageBucket: "chipme-5e40f.firebasestorage.app",
  messagingSenderId: "958044996418",
  appId: "1:958044996418:web:3481959dc8895cd6a33edb"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ================= MAP =================
const map = L.map('map').setView([0, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap'
}).addTo(map);

// ================= USER ID =================
let userId = localStorage.getItem('chipmeUserId');
if (!userId) {
  userId = 'user_' + Date.now();
  localStorage.setItem('chipmeUserId', userId);
}

// ================= AVATAR UTILS =================
const avatarColors = ['red', 'blue', 'green', 'orange', 'purple', 'pink'];

function getAvatarColor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function createAvatarIcon(id) {
  const color = getAvatarColor(id);

  return L.divIcon({
    className: 'avatar-marker',
    html: `<div class="avatar ${color}"></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}


// ================= LOCATION TRACKING =================
let followUser = true;
let lastPosition = null;

map.on('dragstart zoomstart touchstart', () => followUser = false);

function startTracking() {
  const name = document.getElementById('username').value.trim();
  if (!name) return alert("Enter your name");
  const statusEl = document.getElementById('status');

  statusEl.textContent = 'Tracking location…';
  statusEl.style.color = '#2e7d32';



  followUser = true;
  hasCenteredOnce = false;

  map.invalidateSize();

  db.ref('users/' + userId).onDisconnect().remove();

  navigator.geolocation.watchPosition(pos => {
    const { latitude, longitude } = pos.coords;

    lastPosition = { latitude, longitude };

    db.ref('users/' + userId).set({
      name,
      lat: latitude,
      lon: longitude,
      time: Date.now()
    });

    // ✅ Center only once
    if (!hasCenteredOnce) {
      map.setView([latitude, longitude], 16);
      hasCenteredOnce = true;
      followUser = false;
    }
  });
}


// ================= USERS =================
const userMarkers = {};
const userAnim = {};

db.ref('users').on('child_added', s => {
  const id = s.key, u = s.val();
  userMarkers[id] = L.marker(
  [u.lat, u.lon],
  { icon: createAvatarIcon(id) }
)
.addTo(map)
.bindTooltip(u.name, { permanent: true, direction: 'top' });

});



db.ref('users').on('child_changed', s => {
  const id = s.key;
  const u = s.val();

  if (!userMarkers[id]) return;

  const prev = userAnim[id]?.pos;
  const next = L.latLng(u.lat, u.lon);

  if (!validMove(prev, next)) return;

  if (!userAnim[id]) userAnim[id] = {};
  userAnim[id].pos = next;

  smoothMoveMarker(
    userMarkers[id],
    prev || next,
    next,
    300
  );
});



db.ref('users').on('child_removed', s => {
  map.removeLayer(userMarkers[s.key]);
  delete userMarkers[s.key];
});

// ================= ANIMATION =================

function smoothMoveMarker(marker, from, to, duration = 300) {
  const startTime = performance.now();

  function animate(time) {
    const t = Math.min((time - startTime) / duration, 1);

    const lat = from.lat + (to.lat - from.lat) * t;
    const lng = from.lng + (to.lng - from.lng) * t;

    marker.setLatLng([lat, lng]);

    if (t < 1) requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}



function validMove(prev, next) {
  if (!prev) return true;

  const d = map.distance(
    [prev.lat, prev.lon],
    [next.lat, next.lon]
  );

  return d < 50; // meters
}



// ================= SOS SYSTEM =================
let checkCenteredOnce = false;
const checkMarkers = {};
const sosMarkers = {};


// 🔒 prevent double tap
let sosBusy = false;
let sosCenteredOnce = false;

// ---- SEND SOS ----
function sendSOS() {
  if (sosBusy) return;
  sosBusy = true;

  const name = document.getElementById('username')?.value || "Unknown";

  // 🔥 USE LAST LOCATION INSTANTLY
  if (!lastPosition) {
    sosBusy = false;
    return alert("Location not ready yet");
  }

  db.ref('sos/' + userId).set({
    userId,
    name,
    lat: lastPosition.latitude,
    lon: lastPosition.longitude,
    time: Date.now()
  }).finally(() => {
    sosBusy = false;
  });
}


// ---- CANCEL SOS ----
function cancelSOS() {
  if (sosBusy) return;
  sosBusy = true;

  db.ref('sos/' + userId).remove().finally(() => {
    sosBusy = false;
  });
}

// ---- BUTTON HANDLER  ----
function handleSOS(e) {
  e.preventDefault();
  e.stopPropagation();

  const btn = document.getElementById('sosBtn');
  if (btn.dataset.state === 'active') {
    cancelSOS();
  } else {
    sendSOS();
  }
}

// ================= SOS LISTENERS =================
db.ref('sos').on('child_added', s => {
  const d = s.val(), id = s.key;


  sosMarkers[id] = L.circleMarker([d.lat, d.lon], {
    radius: 50,
    color: '#ff0000',
    fillColor: '#ff0000',
    fillOpacity: 0.7
  }).addTo(map).bindPopup(`🚨 SOS from ${d.name}`).openPopup();

  if (id !== userId && !sosCenteredOnce) {
  map.setView([d.lat, d.lon], 18);
  sosCenteredOnce = true;
}
});

db.ref('sos').on('child_removed', s => {
  const id = s.key;
  if (sosMarkers[id]) {
    map.removeLayer(sosMarkers[id]);
    delete sosMarkers[id];
  }
});

// ================= SOS BUTTON STATE (SOURCE OF TRUTH) =================
db.ref('sos/' + userId).on('value', s => {
  const btn = document.getElementById('sosBtn');

  if (s.exists()) {
    btn.textContent = 'CANCEL';
    btn.dataset.state = 'active';
    btn.style.color = '#999';
  } else {
    btn.textContent = 'SOS';
    btn.dataset.state = 'idle';
    btn.style.color = '#d32f2f';
  }
});

// ================= CHECKIN SYSTEM =================
function sendCheck() {
  const name = document.getElementById('username')?.value || "Unknown";

  if (!lastPosition) {
    return alert("Location not ready yet");
  }

  db.ref('check/' + userId).set({
    userId,
    name,
    lat: lastPosition.latitude,
    lon: lastPosition.longitude,
    time: Date.now()
  });

  // auto-remove after 10 seconds
  setTimeout(() => {
    db.ref('check/' + userId).remove();
    checkCenteredOnce = false;
  }, 10000);
}


db.ref('check').on('child_added', s => {
  const d = s.val(), id = s.key;

  const marker = L.circleMarker([d.lat, d.lon], {
    radius: 50,
    color: '#2e7d32',
    fillColor: '#66bb6a',
    fillOpacity: 0.7
  }).addTo(map)
    .bindPopup(`✅ ${d.name} checked in`);

  marker.openPopup();
  checkMarkers[id] = marker;

  // ✅ center ONCE
  if (!checkCenteredOnce) {
    map.setView([d.lat, d.lon], 17);
    checkCenteredOnce = true;
  }

  // 🔥 FORCE LOCAL AUTO-REMOVE AFTER 10s
  const remaining = 10000 - (Date.now() - d.time);
  const timeout = Math.max(0, remaining);

  setTimeout(() => {
    if (checkMarkers[id]) {
      map.removeLayer(checkMarkers[id]);
      delete checkMarkers[id];
    }

    // Only the sender removes from DB
    if (id === userId) {
      db.ref('check/' + userId).remove();
    }
  }, timeout);
});


db.ref('check').on('child_removed', s => {
  const id = s.key;
  if (checkMarkers[id]) {
    map.removeLayer(checkMarkers[id]);
    delete checkMarkers[id];
  }
  checkCenteredOnce = false;
});





// ================= EVENTS =================
document.getElementById('startBtn')
  .addEventListener('pointerdown', startTracking);

document.getElementById('sosBtn')
  .addEventListener('pointerdown', handleSOS);

document.getElementById('checkBtn')
  .addEventListener('pointerdown', sendCheck);



