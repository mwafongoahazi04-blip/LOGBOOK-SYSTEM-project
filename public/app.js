/* IPTMS frontend — talks to the Express/Postgres backend over /api.
   Every signing action uses the signed-in user's OWN saved signature
   (fetched from the server), never a signature drawn on the spot and
   never a signature belonging to someone else. */

const state = { csrfToken: null, user: null };

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function fmt(dtStr) {
  if (!dtStr) return "—";
  const d = new Date(dtStr);
  if (isNaN(d)) return dtStr;
  return d.toLocaleString("sw-TZ", { dateStyle: "medium", timeStyle: "short" });
}

async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (state.csrfToken) headers["X-CSRF-Token"] = state.csrfToken;
  const res = await fetch("/api" + path, {
    method,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (res.status === 401) {
    state.user = null;
    showAuth();
    throw new Error(data.error || "Umetoka nje ya session. Ingia tena.");
  }
  if (!res.ok) throw new Error(data.error || "Hitilafu isiyojulikana.");
  return data;
}

/* ---------------- signature pad ---------------- */
function mountSignaturePad(container, onChange) {
  container.innerHTML = `
    <div class="pad-wrap">
      <canvas></canvas>
      <div class="pad-controls">
        <span>Chora saini hapa juu kwa kidole/mouse</span>
        <a href="#" data-clear style="color:var(--red); text-decoration:none; font-weight:600;">Futa</a>
      </div>
    </div>`;
  const canvas = container.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  let drawing = false, hasInk = false;

  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio;
    canvas.height = 120 * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#1B2430";
  }
  fitCanvas();

  function pos(e) {
    const rect = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  }
  function start(e) { drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
  function move(e) { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); hasInk = true; e.preventDefault(); }
  function end() { if (drawing) { drawing = false; onChange(hasInk ? canvas.toDataURL("image/png") : null); } }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start);
  canvas.addEventListener("touchmove", move);
  canvas.addEventListener("touchend", end);

  container.querySelector("[data-clear]").onclick = (e) => {
    e.preventDefault();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk = false;
    onChange(null);
  };
}
/* ---------------- signature upload ---------------- */
function mountSignatureUpload(container, onChange) {
  container.innerHTML = `
    <div class="sig-upload">
      <input type="file" accept="image/png,image/jpeg,image/webp" data-signature-file>
      <div class="sig-upload-preview" data-signature-preview style="display:none;">
        <img data-signature-img alt="Signature iliyopakiwa">
        <button type="button" class="btn btn-ghost" data-remove-signature>
          Ondoa picha
        </button>
      </div>
      <div class="helptext">
        Chagua picha ya signature yako. PNG yenye background transparent inapendekezwa.
      </div>
    </div>
  `;

  const input = container.querySelector("[data-signature-file]");
  const preview = container.querySelector("[data-signature-preview]");
  const img = container.querySelector("[data-signature-img]");
  const removeBtn = container.querySelector("[data-remove-signature]");

  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      input.value = "";
      toast("Tafadhali chagua picha ya signature.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = reader.result;
      img.src = dataUrl;
      preview.style.display = "block";
      onChange(dataUrl);
    };

    reader.readAsDataURL(file);
  };

  removeBtn.onclick = () => {
    input.value = "";
    img.src = "";
    preview.style.display = "none";
    onChange(null);
  };
}

/* ---------------- auth screens ---------------- */
function showAuth() {
  document.getElementById("app").style.display = "none";
  document.getElementById("authScreen").style.display = "flex";
  renderLoginPane();
  renderRegisterPane();
  document.getElementById("tabLogin").onclick = () => switchTab("login");
  document.getElementById("tabRegister").onclick = () => switchTab("register");
  switchTab("login");
}

function switchTab(which) {
  document.getElementById("tabLogin").classList.toggle("active", which === "login");
  document.getElementById("tabRegister").classList.toggle("active", which === "register");
  document.getElementById("loginPane").style.display = which === "login" ? "" : "none";
  document.getElementById("registerPane").style.display = which === "register" ? "" : "none";
  document.getElementById("authMsg").textContent = "";
}

function setAuthMsg(msg, ok) {
  const el = document.getElementById("authMsg");
  el.textContent = msg || "";
  el.classList.toggle("ok", !!ok);
}

function renderLoginPane() {
  const pane = document.getElementById("loginPane");
  pane.innerHTML = `
    <div class="field"><label>Barua Pepe</label><input type="email" id="li_email" placeholder="wewe@mfano.com"></div>
    <div class="field"><label>Password</label><input type="password" id="li_password" placeholder="••••••••"></div>
    <button class="btn btn-teal" id="li_submit" style="width:100%; justify-content:center;">Ingia</button>
  `;
  document.getElementById("li_submit").onclick = async () => {
    const email = document.getElementById("li_email").value.trim();
    const password = document.getElementById("li_password").value;
    setAuthMsg("");
    try {
      const data = await api("/auth/login", { method: "POST", body: { email, password } });
      state.csrfToken = data.csrfToken;
      state.user = data.user;
      await boot();
    } catch (e) { setAuthMsg(e.message); }
  };
}

const PUBLIC_ROLES = [
  { id: "student", label: "Mwanafunzi (Student)" },
  { id: "industrial", label: "Industrial Supervisor" },
  { id: "university", label: "University Supervisor (Assessor)" },
];

function renderRegisterPane() {
  const pane = document.getElementById("registerPane");
  pane.innerHTML = `
    <div class="field"><label>Jina Kamili</label><input type="text" id="re_name" placeholder="Jina lako"></div>
    <div class="field"><label>Barua Pepe</label><input type="email" id="re_email" placeholder="wewe@mfano.com"></div>
    <div class="field"><label>Role</label>
      <select id="re_role">${PUBLIC_ROLES.map(r => `<option value="${r.id}">${r.label}</option>`).join("")}</select>
    </div>
    <div class="helptext">Head of Faculty na Superadmin huundwa na Superadmin pekee.</div>
    <div class="field"><label>Password (herufi 8+, angalau namba moja)</label><input type="password" id="re_password" placeholder="••••••••"></div>
  <div class="field">
  <label>Saini Yako ya Kudumu — itatumika kila utakaposaini nyaraka</label>

  <div id="re_sigmount"></div>

  <div class="signature-option-label">
    Au pakia picha ya signature yako
  </div>

  <div id="re_sigupload"></div>
</div>
    <button class="btn btn-teal" id="re_submit" style="width:100%; justify-content:center;">Jisajili</button>
  `;
 let sig = null;

mountSignaturePad(document.getElementById("re_sigmount"), (dataUrl) => {
  sig = dataUrl;
});

mountSignatureUpload(document.getElementById("re_sigupload"), (dataUrl) => {
  sig = dataUrl;
});
  document.getElementById("re_submit").onclick = async () => {
    const name = document.getElementById("re_name").value.trim();
    const email = document.getElementById("re_email").value.trim();
    const role = document.getElementById("re_role").value;
    const password = document.getElementById("re_password").value;
    setAuthMsg("");
    if (!sig) { setAuthMsg("Tafadhali chora saini yako kwanza."); return; }
    try {
      const data = await api("/auth/register", { method: "POST", body: { name, email, password, role, signature: sig } });
      state.csrfToken = data.csrfToken;
      state.user = data.user;
      await boot();
    } catch (e) { setAuthMsg(e.message); }
  };
}

/* ---------------- shell ---------------- */
const NAV = {
  student: [["log", "Jaza Logbook"], ["mylog", "Logbook Yangu"], ["permreq", "Omba Ruhusa"], ["myperm", "Ruhusa Zangu"], ["print", "Chapisha / Print"], ["profile", "Wasifu Wangu"]],
  industrial: [["revlog", "Kagua Logbook"], ["revperm", "Maombi ya Ruhusa"], ["profile", "Wasifu Wangu"]],
  university: [["assess", "Tathmini Logbook"], ["profile", "Wasifu Wangu"]],
  faculty: [["final", "Idhini ya Mwisho"], ["profile", "Wasifu Wangu"]],
  superadmin: [["dash", "Dashibodi"], ["users", "Watumiaji"], ["audit", "Audit Trail"], ["profile", "Wasifu Wangu"]],
};
const NAV_ICON = { log:"✎", mylog:"☰", permreq:"✉", myperm:"☰", print:"🖶", revlog:"✎", revperm:"✉", assess:"☰", final:"✒", dash:"◱", users:"⚇", audit:"⌗", profile:"👤" };
const ROLE_LABEL = { student:"Mwanafunzi", industrial:"Industrial Supervisor", university:"University Supervisor", faculty:"Head of Faculty", superadmin:"Superadmin" };

let currentView = null;

function showApp() {
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("app").style.display = "flex";
  document.getElementById("whoami").innerHTML = `<b>${escapeHtml(state.user.name)}</b><br>${ROLE_LABEL[state.user.role] || state.user.role}`;
  const items = NAV[state.user.role] || [];
  if (!currentView || !items.find(i => i[0] === currentView)) currentView = items[0] ? items[0][0] : null;
  const nav = document.getElementById("navMenu");
  nav.innerHTML = items.map(([key, label]) =>
    `<button data-view="${key}" class="${currentView === key ? "active" : ""}"><span>${NAV_ICON[key] || "•"}</span>${label}</button>`
  ).join("");
  nav.querySelectorAll("button").forEach(b => {
    b.onclick = () => { currentView = b.dataset.view; showApp(); };
  });
  document.getElementById("logoutBtn").onclick = async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch (_) {}
    state.user = null;
    await boot();
  };
  renderMain();
}

function stepperHTML(e) {
  const steps = [
    { label: "Mwanafunzi", done: !!e.student_sig },
    { label: "Industrial Sup.", done: !!e.industrial_sig },
    { label: "University Sup.", done: !!e.university_sig },
    { label: "Head of Faculty", done: !!e.faculty_sig },
  ];
  return `<div class="stepper">` + steps.map((s, i) =>
    `<div class="step ${s.done ? "done" : ""}"><span class="dot"></span>${s.label}</div>` +
    (i < steps.length - 1 ? `<div class="step-line ${s.done ? "done" : ""}"></div>` : "")
  ).join("") + `</div>`;
}

function statusChip(e) {
  if (e.faculty_sig) return `<span class="status-chip s-done">Imekamilika</span>`;
  if (e.university_sig) return `<span class="status-chip s-pending">Kwa Head of Faculty</span>`;
  if (e.industrial_sig) return `<span class="status-chip s-pending">Kwa University Sup.</span>`;
  return `<span class="status-chip s-pending">Kwa Industrial Sup.</span>`;
}

function sigBox(label, sig, signedAt) {
  if (sig) return `<div class="sig-box signed"><b>${label}</b><br>${fmt(signedAt)}<img src="${sig}"></div>`;
  return `<div class="sig-box">${label} — bado hujathibitishwa</div>`;
}

// Renders the "confirm sign with my saved signature" panel used at every
// approval step, instead of a fresh drawing pad each time.
function signPanel(mySignature, btnLabel, onConfirm) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.innerHTML = `
    <label>Saini Yako Iliyohifadhiwa</label>
    <div class="sig-preview">
      <img src="${mySignature}" alt="Saini yako">
      <div class="hint">Saini hii ilihifadhiwa unaposajili akaunti yako. Bonyeza kitufe kutumia saini hii kutia sahihi.</div>
    </div>
    <button class="btn btn-teal" style="margin-top:10px;">${btnLabel}</button>
  `;
  wrap.querySelector("button").onclick = onConfirm;
  return wrap;
}

/* ---------------- views ---------------- */
function renderMain() {
  const main = document.getElementById("mainView");
  const key = state.user.role + ":" + currentView;
  const renderer = VIEWS[key];
  if (renderer) renderer(main);
  else main.innerHTML = `<div class="empty">Chagua sehemu kwenye menyu.</div>`;
}

const VIEWS = {};
function todayStr() { return new Date().toISOString().slice(0, 10); }

/* ---- STUDENT: fill logbook ---- */
VIEWS["student:log"] = async (main) => {
  main.innerHTML = `
    <div class="page-head">
      <div class="eyebrow">HATUA YA 1 — DAILY LOGBOOK</div>
      <h2>Jaza Logbook ya Leo</h2>
      <p>Jaza taarifa za kazi ya leo, kisha tumia saini yako iliyohifadhiwa kuwasilisha kwa Industrial Supervisor wako.</p>
    </div>
    <div class="card">
      <div class="grid2">
        <div class="field"><label>Tarehe (Date)</label><input type="date" id="f_date" value="${todayStr()}"></div>
        <div class="field"><label>Mwanafunzi</label><input type="text" value="${escapeHtml(state.user.name)}" disabled></div>
      </div>
      <div class="field"><label>Kazi Iliyofanyika (Activity Done)</label><textarea id="f_activity" placeholder="Elezea kazi uliyofanya leo…"></textarea></div>
      <div class="field"><label>Mambo Yaliyobainika / Changamoto</label><textarea id="f_obs" placeholder="Changamoto au mambo muhimu…"></textarea></div>
      <div class="field"><label>Maoni (Remarks)</label><textarea id="f_remarks" placeholder="Maoni yako ya ziada (si lazima)…"></textarea></div>
      <div id="signSlot"></div>
    </div>
  `;
  const { signature } = await api("/auth/my-signature");
  document.getElementById("signSlot").appendChild(
    signPanel(signature, "Saini na Wasilisha (Submit)", async () => {
      const activity = document.getElementById("f_activity").value.trim();
      if (!activity) { toast("Jaza sehemu ya 'Kazi Iliyofanyika' kwanza."); return; }
      try {
        await api("/logbooks", { method: "POST", body: {
          date: document.getElementById("f_date").value,
          activity,
          observations: document.getElementById("f_obs").value.trim(),
          remarks: document.getElementById("f_remarks").value.trim(),
        }});
        toast("Logbook imewasilishwa kwa Industrial Supervisor.");
        renderMain();
      } catch (e) { toast(e.message); }
    })
  );
};

VIEWS["student:mylog"] = async (main) => {
  main.innerHTML = `<div class="page-head"><div class="eyebrow">HISTORIA</div><h2>Logbook Yangu</h2><p>Fuatilia hatua ya idhini ya kila ripoti uliyowasilisha.</p></div><div class="empty">Inapakia…</div>`;
  const { logbooks } = await api("/logbooks/mine");
  main.querySelector(".empty")?.remove();
  main.innerHTML += logbooks.length === 0 ? `<div class="empty">Bado hujawasilisha logbook yoyote.</div>` : logbooks.map(e => `
    <div class="entry">
      <div class="entry-top"><div><div class="who">${e.entry_date}</div><div class="when">Iliwasilishwa: ${fmt(e.submitted_at)}</div></div>${statusChip(e)}</div>
      ${stepperHTML(e)}
      <div class="entry-body">
        <div><span class="lbl">Kazi:</span> ${escapeHtml(e.activity)}</div>
        ${e.observations ? `<div><span class="lbl">Changamoto:</span> ${escapeHtml(e.observations)}</div>` : ""}
        ${e.university_notes ? `<div><span class="lbl">Tathmini ya University Sup.:</span> ${escapeHtml(e.university_notes)}</div>` : ""}
        ${e.faculty_remarks ? `<div><span class="lbl">Remarks za Kitivo:</span> ${escapeHtml(e.faculty_remarks)}</div>` : ""}
      </div>
    </div>
  `).join("");
};

VIEWS["student:permreq"] = (main) => {
  main.innerHTML = `
    <div class="page-head"><div class="eyebrow">ABSENCE PERMISSION</div><h2>Omba Ruhusa</h2><p>Siku usipoweza kufika field, jaza fomu hii uisukume kwa Industrial Supervisor wako.</p></div>
    <div class="card">
      <div class="field"><label>Tarehe ya Ruhusa</label><input type="date" id="p_date" value="${todayStr()}"></div>
      <div class="field"><label>Sababu (Reason)</label><textarea id="p_reason" placeholder="Eleza sababu ya ruhusa…"></textarea></div>
      <button class="btn btn-teal" id="sendPerm">Wasilisha Ombi</button>
    </div>`;
  document.getElementById("sendPerm").onclick = async () => {
    const reason = document.getElementById("p_reason").value.trim();
    if (!reason) { toast("Andika sababu kwanza."); return; }
    try {
      await api("/permissions", { method: "POST", body: { date: document.getElementById("p_date").value, reason } });
      toast("Ombi la ruhusa limetumwa.");
      renderMain();
    } catch (e) { toast(e.message); }
  };
};

VIEWS["student:myperm"] = async (main) => {
  const { permissions } = await api("/permissions/mine");
  main.innerHTML = `<div class="page-head"><div class="eyebrow">RUHUSA</div><h2>Ruhusa Zangu</h2></div>` +
    (permissions.length === 0 ? `<div class="empty">Hujawahi kuomba ruhusa.</div>` : permissions.map(p => `
      <div class="entry">
        <div class="entry-top"><div><div class="who">${p.perm_date}</div><div class="when">Ombi: ${fmt(p.requested_at)}</div></div>
        <span class="status-chip ${p.status === "approved" ? "s-approved" : p.status === "denied" ? "s-denied" : "s-pending"}">
          ${p.status === "approved" ? "APPROVED" : p.status === "denied" ? "DENIED" : "INASUBIRI"}
        </span></div>
        <div class="entry-body"><span class="lbl">Sababu:</span> ${escapeHtml(p.reason)}</div>
      </div>`).join(""));
};

VIEWS["student:print"] = async (main) => {
  const { ready, notReady } = await api("/logbooks/printable");
  main.innerHTML = `
    <div class="page-head"><div class="eyebrow">PRINT CONTROL</div><h2>Chapisha / Print</h2><p>Unaweza kuchapisha baada tu ya Head of Faculty kuwasha "Enable Print".</p></div>
    <h3 style="font-size:14px; margin-bottom:8px;">Tayari kuchapishwa</h3>
    ${ready.length === 0 ? `<div class="empty">Hakuna logbook iliyoruhusiwa kuchapishwa bado.</div>` : ready.map(e => `
      <div class="entry">
        <div class="entry-top"><div class="who">${e.entry_date}</div><span class="print-badge print-on">🖶 Print Enabled</span></div>
        <div class="entry-body"><span class="lbl">Kazi:</span> ${escapeHtml(e.activity)}</div>
        <button class="btn btn-primary" style="margin-top:10px;" onclick="window.print()">Chapisha Sasa</button>
      </div>`).join("")}
    <h3 style="font-size:14px; margin:18px 0 8px;">Bado zinasubiri idhini</h3>
    ${notReady.length === 0 ? `<div class="empty">Hakuna kingine kinachosubiri.</div>` : notReady.map(e => `<div class="entry"><div class="entry-top"><div class="who">${e.entry_date}</div>${statusChip(e)}</div></div>`).join("")}
  `;
};

/* ---- INDUSTRIAL ---- */
VIEWS["industrial:revlog"] = async (main) => {
  main.innerHTML = `<div class="page-head"><div class="eyebrow">HATUA YA 2</div><h2>Kagua na Idhinisha Logbook</h2><p>Pitia logbook za wanafunzi, kisha tumia saini yako iliyohifadhiwa kuidhinisha.</p></div><div id="pendingList" class="empty">Inapakia…</div>`;
  const [{ logbooks }, { signature }] = await Promise.all([api("/logbooks/pending/industrial"), api("/auth/my-signature")]);
  const list = document.getElementById("pendingList");
  if (logbooks.length === 0) { list.innerHTML = `<div class="empty">Hakuna logbook inayosubiri kwa sasa.</div>`; return; }
  list.className = "";
  list.innerHTML = "";
  logbooks.forEach(e => {
    const card = document.createElement("div");
    card.className = "entry";
    card.innerHTML = `
      <div class="entry-top"><div><div class="who">${escapeHtml(e.student_name)}</div><div class="when">${e.entry_date} · ${fmt(e.submitted_at)}</div></div>${statusChip(e)}</div>
      <div class="entry-body">
        <div><span class="lbl">Kazi:</span> ${escapeHtml(e.activity)}</div>
        ${e.observations ? `<div><span class="lbl">Changamoto:</span> ${escapeHtml(e.observations)}</div>` : ""}
        ${e.remarks ? `<div><span class="lbl">Maoni:</span> ${escapeHtml(e.remarks)}</div>` : ""}
        ${sigBox("Saini ya Mwanafunzi", e.student_sig, e.student_signed_at)}
      </div>`;
    card.appendChild(signPanel(signature, "Idhinisha (Approve)", async () => {
      try {
        await api(`/logbooks/${e.id}/industrial-sign`, { method: "POST" });
        toast("Logbook imeidhinishwa na kutumwa kwa University Supervisor.");
        renderMain();
      } catch (err) { toast(err.message); }
    }));
    list.appendChild(card);
  });
};

VIEWS["industrial:revperm"] = async (main) => {
  main.innerHTML = `<div class="page-head"><div class="eyebrow">HATUA YA 3</div><h2>Maombi ya Ruhusa</h2><p>Idhinisha au kataa maombi ya ruhusa ya wanafunzi.</p></div><div id="permList" class="empty">Inapakia…</div>`;
  const [{ permissions }, hist, { signature }] = await Promise.all([api("/permissions/pending"), api("/permissions/history"), api("/auth/my-signature")]);
  const list = document.getElementById("permList");
  if (permissions.length === 0) { list.innerHTML = `<div class="empty">Hakuna ombi linalosubiri.</div>`; }
  else {
    list.className = ""; list.innerHTML = "";
    permissions.forEach(p => {
      const card = document.createElement("div");
      card.className = "entry";
      card.innerHTML = `
        <div class="entry-top"><div><div class="who">${escapeHtml(p.student_name)}</div><div class="when">${p.perm_date} · ${fmt(p.requested_at)}</div></div><span class="status-chip s-pending">INASUBIRI</span></div>
        <div class="entry-body"><span class="lbl">Sababu:</span> ${escapeHtml(p.reason)}</div>`;
      card.appendChild(signPanel(signature, "Idhinisha", async () => {
        try { await api(`/permissions/${p.id}/approve`, { method: "POST" }); toast("Ruhusa imeidhinishwa."); renderMain(); }
        catch (err) { toast(err.message); }
      }));
      const denyBtn = document.createElement("button");
      denyBtn.className = "btn btn-red"; denyBtn.style.marginTop = "8px"; denyBtn.textContent = "Kataa";
      denyBtn.onclick = async () => {
        try { await api(`/permissions/${p.id}/deny`, { method: "POST" }); toast("Ombi limekataliwa."); renderMain(); }
        catch (err) { toast(err.message); }
      };
      card.appendChild(denyBtn);
      list.appendChild(card);
    });
  }
  main.innerHTML += `<h3 style="font-size:14px; margin-top:22px;">Historia</h3>` +
    (hist.permissions.length === 0 ? `<div class="empty">Hakuna historia bado.</div>` : hist.permissions.map(p => `
      <div class="entry"><div class="entry-top"><div><div class="who">${escapeHtml(p.student_name)}</div><div class="when">${p.perm_date}</div></div>
      <span class="status-chip ${p.status === "approved" ? "s-approved" : "s-denied"}">${p.status.toUpperCase()}</span></div></div>`).join(""));
};

/* ---- UNIVERSITY ---- */
VIEWS["university:assess"] = async (main) => {
  main.innerHTML = `<div class="page-head"><div class="eyebrow">HATUA YA 4</div><h2>Tathmini ya University Supervisor</h2><p>Pitia logbook zilizoidhinishwa na Industrial Supervisor, ongeza tathmini, kisha wasilishe kwa Head of Faculty.</p></div><div id="assessList" class="empty">Inapakia…</div>`;
  const [{ logbooks }, { signature }] = await Promise.all([api("/logbooks/pending/university"), api("/auth/my-signature")]);
  const list = document.getElementById("assessList");
  if (logbooks.length === 0) { list.innerHTML = `<div class="empty">Hakuna logbook inayosubiri tathmini yako.</div>`; return; }
  list.className = ""; list.innerHTML = "";
  logbooks.forEach(e => {
    const card = document.createElement("div");
    card.className = "entry";
    card.innerHTML = `
      <div class="entry-top"><div><div class="who">${escapeHtml(e.student_name)}</div><div class="when">${e.entry_date}</div></div>${statusChip(e)}</div>
      ${stepperHTML(e)}
      <div class="entry-body">
        <div><span class="lbl">Kazi:</span> ${escapeHtml(e.activity)}</div>
        ${e.observations ? `<div><span class="lbl">Changamoto:</span> ${escapeHtml(e.observations)}</div>` : ""}
        <div class="sig-row">${sigBox("Mwanafunzi", e.student_sig)}${sigBox("Industrial Sup.", e.industrial_sig, e.industrial_signed_at)}</div>
      </div>
      <div class="field" style="margin-top:12px;"><label>Tathmini yako (Assessment Notes)</label><textarea class="notesField" placeholder="Andika tathmini yako…"></textarea></div>`;
    card.appendChild(signPanel(signature, "Wasilisha kwa Head of Faculty", async () => {
      try {
        await api(`/logbooks/${e.id}/university-sign`, { method: "POST", body: { notes: card.querySelector(".notesField").value.trim() } });
        toast("Imewasilishwa kwa Head of Faculty.");
        renderMain();
      } catch (err) { toast(err.message); }
    }));
    list.appendChild(card);
  });
};

/* ---- FACULTY ---- */
VIEWS["faculty:final"] = async (main) => {
  main.innerHTML = `<div class="page-head"><div class="eyebrow">HATUA YA 5</div><h2>Idhini ya Mwisho na Print Control</h2><p>Weka Remarks za Kitivo, tumia saini yako kuidhinisha, kisha amua kama mwanafunzi aruhusiwe kuchapisha.</p></div><div id="finalList" class="empty">Inapakia…</div>`;
  const [{ logbooks }, done, { signature }] = await Promise.all([api("/logbooks/pending/faculty"), api("/logbooks/completed/faculty"), api("/auth/my-signature")]);
  const list = document.getElementById("finalList");
  if (logbooks.length === 0) { list.innerHTML = `<div class="empty">Hakuna logbook inayosubiri idhini yako.</div>`; }
  else {
    list.className = ""; list.innerHTML = "";
    logbooks.forEach(e => {
      const card = document.createElement("div");
      card.className = "entry";
      card.innerHTML = `
        <div class="entry-top"><div><div class="who">${escapeHtml(e.student_name)}</div><div class="when">${e.entry_date}</div></div>${statusChip(e)}</div>
        ${stepperHTML(e)}
        <div class="entry-body">
          <div><span class="lbl">Kazi:</span> ${escapeHtml(e.activity)}</div>
          <div><span class="lbl">Tathmini ya University Sup.:</span> ${escapeHtml(e.university_notes || "—")}</div>
          <div class="sig-row">${sigBox("Mwanafunzi", e.student_sig)}${sigBox("Industrial Sup.", e.industrial_sig)}${sigBox("University Sup.", e.university_sig)}</div>
        </div>
        <div class="field" style="margin-top:12px;"><label>Remarks za Kitivo</label><textarea class="facRemarks" placeholder="Maoni ya mwisho ya Kitivo…"></textarea></div>
        <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; margin-bottom:8px;">
          <input type="checkbox" class="enablePrint" style="width:auto;"> Ruhusu mwanafunzi kuchapisha (Enable Print) mara moja
        </label>`;
      card.appendChild(signPanel(signature, "Sanya Idhini ya Mwisho", async () => {
        try {
          await api(`/logbooks/${e.id}/faculty-sign`, { method: "POST", body: {
            remarks: card.querySelector(".facRemarks").value.trim(),
            printEnabled: card.querySelector(".enablePrint").checked,
          }});
          toast("Idhini ya mwisho imekamilika.");
          renderMain();
        } catch (err) { toast(err.message); }
      }));
      list.appendChild(card);
    });
  }
  main.innerHTML += `<h3 style="font-size:14px; margin-top:22px;">Zilizokamilika</h3>` +
    (done.logbooks.length === 0 ? `<div class="empty">Bado hakuna iliyokamilika.</div>` : done.logbooks.map(e => `
      <div class="entry" data-id="${e.id}">
        <div class="entry-top"><div class="who">${escapeHtml(e.student_name)} — ${e.entry_date}</div>${statusChip(e)}</div>
        <div class="entry-body" style="margin-top:8px;"><span class="print-badge ${e.print_enabled ? "print-on" : "print-off"}">🖶 ${e.print_enabled ? "Print Enabled" : "Print Imezuiwa"}</span></div>
        <button class="btn btn-ghost togglePrint" data-id="${e.id}" style="margin-top:10px;">${e.print_enabled ? "Zuia Printing" : "Ruhusu Printing"}</button>
      </div>`).join(""));
  main.querySelectorAll(".togglePrint").forEach(btn => {
    btn.onclick = async () => {
      try { await api(`/logbooks/${btn.dataset.id}/print-toggle`, { method: "POST" }); renderMain(); }
      catch (err) { toast(err.message); }
    };
  });
};

/* ---- SUPERADMIN ---- */
VIEWS["superadmin:dash"] = async (main) => {
  const s = await api("/dashboard/stats");
  main.innerHTML = `
    <div class="page-head"><div class="eyebrow">SUPERADMIN</div><h2>Dashibodi ya Mfumo</h2><p>Muhtasari wa shughuli za mfumo mzima.</p></div>
    <div class="stat-row">
      <div class="stat"><div class="num">${s.total}</div><div class="lbl">Jumla ya Logbook</div></div>
      <div class="stat"><div class="num">${s.completed}</div><div class="lbl">Zilizokamilika (Idhini 4/4)</div></div>
      <div class="stat"><div class="num">${s.permApproved}</div><div class="lbl">Ruhusa Zilizoidhinishwa</div></div>
      <div class="stat"><div class="num">${s.permDenied}</div><div class="lbl">Ruhusa Zilizokataliwa</div></div>
    </div>`;
};

const ADMIN_ROLES = [
  { id: "student", label: "Mwanafunzi (Student)" },
  { id: "industrial", label: "Industrial Supervisor" },
  { id: "university", label: "University Supervisor" },
  { id: "faculty", label: "Head of Faculty" },
  { id: "superadmin", label: "Superadmin" },
];

VIEWS["superadmin:users"] = async (main) => {
  main.innerHTML = `
    <div class="page-head"><div class="eyebrow">USER MANAGEMENT</div><h2>Watumiaji wa Mfumo</h2><p>Ongeza au futa akaunti za watumiaji wa mfumo. Kila akaunti mpya lazima iwe na saini yake.</p></div>
    <div class="card">
      <h3>Ongeza Mtumiaji Mpya</h3>
      <div class="grid2">
        <div class="field"><label>Jina</label><input type="text" id="nu_name"></div>
        <div class="field"><label>Barua Pepe</label><input type="email" id="nu_email"></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Role</label><select id="nu_role">${ADMIN_ROLES.map(r => `<option value="${r.id}">${r.label}</option>`).join("")}</select></div>
        <div class="field"><label>Password ya Awali</label><input type="password" id="nu_password" placeholder="herufi 8+, namba moja"></div>
      </div>
     <div class="field">
  <label>Saini ya Mtumiaji</label>

  <div id="nu_sigmount"></div>

  <div class="signature-option-label">
    Au pakia picha ya signature
  </div>

  <div id="nu_sigupload"></div>
</div>
      <button class="btn btn-teal" id="addUserBtn">Ongeza Mtumiaji</button>
    </div>
    <div class="card"><h3>Orodha ya Watumiaji</h3><div id="userTable" class="empty">Inapakia…</div></div>
  `;
let sig = null;

mountSignaturePad(document.getElementById("nu_sigmount"), (d) => {
  sig = d;
});

mountSignatureUpload(document.getElementById("nu_sigupload"), (dataUrl) => {
  sig = dataUrl;
});
  document.getElementById("addUserBtn").onclick = async () => {
    if (!sig) { toast("Chora saini ya mtumiaji kwanza."); return; }
    try {
      await api("/users", { method: "POST", body: {
        name: document.getElementById("nu_name").value.trim(),
        email: document.getElementById("nu_email").value.trim(),
        role: document.getElementById("nu_role").value,
        password: document.getElementById("nu_password").value,
        signature: sig,
      }});
      toast("Mtumiaji ameongezwa.");
      renderMain();
    } catch (e) { toast(e.message); }
  };
  const { users } = await api("/users");
  const t = document.getElementById("userTable");
  t.className = "";
  t.innerHTML = `<table><tr><th>Jina</th><th>Barua Pepe</th><th>Role</th><th></th></tr>
    ${users.map(u => `<tr><td>${escapeHtml(u.name)}</td><td class="mono">${escapeHtml(u.email)}</td><td class="mono">${ROLE_LABEL[u.role] || u.role}</td>
      <td><a href="#" class="delUser" data-id="${u.id}" style="color:var(--red); text-decoration:none; font-size:12.5px; font-weight:600;">Futa</a></td></tr>`).join("")}
  </table>`;
  t.querySelectorAll(".delUser").forEach(a => {
    a.onclick = async (e) => {
      e.preventDefault();
      if (!confirm("Una uhakika unataka kumfuta mtumiaji huyu?")) return;
      try { await api(`/users/${a.dataset.id}`, { method: "DELETE" }); toast("Mtumiaji amefutwa."); renderMain(); }
      catch (err) { toast(err.message); }
    };
  });
};

VIEWS["superadmin:audit"] = async (main) => {
  const { audit } = await api("/audit");
  main.innerHTML = `
    <div class="page-head"><div class="eyebrow">AUDIT TRAIL</div><h2>Kumbukumbu za Saini na Matukio</h2><p>Ukaguzi wa kiusalama wa matukio yote ndani ya mfumo.</p></div>
    ${audit.length === 0 ? `<div class="empty">Hakuna matukio bado.</div>` : `<div class="card"><table><tr><th>Muda</th><th>Mtumiaji</th><th>Role</th><th>Kitendo</th></tr>
      ${audit.map(a => `<tr><td class="mono">${fmt(a.created_at)}</td><td>${escapeHtml(a.actor_name)}</td><td class="mono">${ROLE_LABEL[a.role] || a.role}</td><td>${escapeHtml(a.action)}</td></tr>`).join("")}
    </table></div>`}
  `;
};

/* ---- PROFILE (all roles): update signature + change password ---- */
Object.keys(NAV).forEach(role => {
  VIEWS[role + ":profile"] = async (main) => {
    const { signature } = await api("/auth/my-signature");
    main.innerHTML = `
      <div class="page-head"><div class="eyebrow">WASIFU</div><h2>Wasifu Wangu</h2><p>Angalia na sasisha saini yako iliyohifadhiwa, au badilisha password yako.</p></div>
      <div class="card">
        <h3>Saini Yangu ya Sasa</h3>
        <div class="sig-preview"><img src="${signature}"><div class="hint">Hii ndiyo saini itakayotumika kila utakaposaini nyaraka.</div></div>
        <div class="field" style="margin-top:16px;"><label>Chora Saini Mpya (hiari)</label><div id="pf_sigmount"></div></div>
        <button class="btn btn-teal" id="pf_savesig" disabled>Hifadhi Saini Mpya</button>
      </div>
      <div class="card">
        <h3>Badilisha Password</h3>
        <div class="field"><label>Password ya Sasa</label><input type="password" id="pf_current"></div>
        <div class="field"><label>Password Mpya (herufi 8+, namba moja)</label><input type="password" id="pf_new"></div>
        <button class="btn btn-teal" id="pf_savepass">Badilisha Password</button>
      </div>
    `;
    let newSig = null;
    mountSignaturePad(document.getElementById("pf_sigmount"), (d) => {
      newSig = d;
      document.getElementById("pf_savesig").disabled = !newSig;
    });
    document.getElementById("pf_savesig").onclick = async () => {
      try { await api("/auth/signature", { method: "POST", body: { signature: newSig } }); toast("Saini imesasishwa."); renderMain(); }
      catch (e) { toast(e.message); }
    };
    document.getElementById("pf_savepass").onclick = async () => {
      try {
        await api("/auth/password", { method: "POST", body: {
          currentPassword: document.getElementById("pf_current").value,
          newPassword: document.getElementById("pf_new").value,
        }});
        toast("Password imebadilishwa.");
        document.getElementById("pf_current").value = "";
        document.getElementById("pf_new").value = "";
      } catch (e) { toast(e.message); }
    };
  };
});

/* ---------------- boot ---------------- */
async function boot() {
  try {
    const csrf = await (await fetch("/api/auth/csrf", { credentials: "include" })).json();
    state.csrfToken = csrf.csrfToken;
    const me = await api("/auth/me");
    if (me.user) { state.user = me.user; showApp(); }
    else showAuth();
  } catch (e) {
    showAuth();
  }
}

boot();
