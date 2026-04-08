// ============================================================
// Employee Page JS - Windowed Layout
// ============================================================

let currentUser = null;

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.querySelector('div').textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function statusBadge(status) {
    const map = {
        pending: { label: 'قيد الانتظار', color: 'bg-yellow-100 text-yellow-700' },
        approved: { label: 'معتمدة', color: 'bg-green-100 text-green-700' },
        rejected: { label: 'مرفوضة', color: 'bg-red-100 text-red-700' },
    };
    const s = map[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
    return `<span class="px-2 py-0.5 rounded-lg text-xs font-medium ${s.color}">${s.label}</span>`;
}

function roleBadge(role) {
    const labels = { general_manager: 'مدير عام', dept_manager: 'مدير إدارة', supervisor: 'ضابط', operator: 'منفذ' };
    const colors = { general_manager: 'bg-purple-100 text-purple-700', dept_manager: 'bg-indigo-100 text-indigo-700', supervisor: 'bg-blue-100 text-blue-700', operator: 'bg-gray-100 text-gray-700' };
    return `<span class="px-2 py-0.5 rounded-lg text-xs font-medium ${colors[role] || ''}">${labels[role] || role}</span>`;
}

async function apiCall(url, options = {}) {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'حدث خطأ');
    return data;
}

// ============================================================
// NAVIGATION SYSTEM
// ============================================================

function setupNavigation() {
    const links = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.content-section');

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            navigateToSection(section);

            // Close mobile sidebar
            document.getElementById('sidebar').classList.add('translate-x-full');
            document.getElementById('sidebarOverlay').classList.add('hidden');
        });
    });

    // Profile sub-tabs
    setupProfileTabs();

    // Navigate based on hash or default to attendance
    const hash = window.location.hash.replace('#', '') || 'attendance';
    navigateToSection(hash);
}

function navigateToSection(section) {
    const links = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.content-section');

    // Update active link
    links.forEach(l => l.classList.remove('bg-emerald-50', 'text-emerald-700'));
    const activeLink = document.querySelector(`.nav-link[data-section="${section}"]`);
    if (activeLink) activeLink.classList.add('bg-emerald-50', 'text-emerald-700');

    // Show section
    sections.forEach(s => s.classList.add('hidden'));
    const sectionEl = document.getElementById(`section-${section}`);
    if (sectionEl) {
        sectionEl.classList.remove('hidden');
    }

    // Update hash
    window.location.hash = section;

    // Re-init signature canvas when switching to signature tab
    if (section === 'profile') {
        const activeTab = document.querySelector('.profile-tab.active-profile-tab');
        if (activeTab && activeTab.dataset.profileTab === 'signature') {
            setTimeout(initMainSignaturePad, 100);
        }
    }
}

function setupProfileTabs() {
    const tabs = document.querySelectorAll('.profile-tab');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabKey = tab.dataset.profileTab;
            switchProfileTab(tabKey);
        });
    });

    // Apply initial styles
    const activeTab = document.querySelector('.profile-tab[data-profile-tab="leaves"]');
    if (activeTab) {
        activeTab.classList.add('bg-emerald-600', 'text-white', 'shadow-md');
        activeTab.classList.remove('text-gray-500', 'hover:bg-gray-100');
    }
    tabs.forEach(t => {
        if (t.dataset.profileTab !== 'leaves') {
            t.classList.add('text-gray-500', 'hover:bg-gray-100');
        }
    });
}

function switchProfileTab(tabKey) {
    const tabs = document.querySelectorAll('.profile-tab');
    const contents = document.querySelectorAll('.profile-tab-content');

    // Update tab styles
    tabs.forEach(t => {
        t.classList.remove('active-profile-tab', 'bg-emerald-600', 'text-white', 'shadow-md');
        t.classList.add('text-gray-500', 'hover:bg-gray-100');
    });
    const activeTab = document.querySelector(`.profile-tab[data-profile-tab="${tabKey}"]`);
    if (activeTab) {
        activeTab.classList.add('active-profile-tab', 'bg-emerald-600', 'text-white', 'shadow-md');
        activeTab.classList.remove('text-gray-500', 'hover:bg-gray-100');
    }

    // Show tab content
    contents.forEach(c => c.classList.add('hidden'));
    const content = document.getElementById(`profileTab-${tabKey}`);
    if (content) content.classList.remove('hidden');

    // Re-init signature canvas when switching to signature tab
    if (tabKey === 'signature') {
        setTimeout(initMainSignaturePad, 100);
    }
}

// Mobile Menu
function setupMobileMenu() {
    const toggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    toggle.addEventListener('click', () => {
        sidebar.classList.toggle('translate-x-full');
        overlay.classList.toggle('hidden');
    });

    overlay.addEventListener('click', () => {
        sidebar.classList.add('translate-x-full');
        overlay.classList.add('hidden');
    });
}

// ---- Auth ----
async function checkAuth() {
    try {
        const data = await apiCall('/api/auth/me');
        currentUser = data.user;
        if (currentUser.role === 'general_manager' || currentUser.role === 'dept_manager') {
            window.location.href = '/dashboard.html';
            return;
        }
        document.getElementById('userName').textContent = currentUser.name;
        const roleLabels = { general_manager: 'مدير عام', dept_manager: 'مدير إدارة', supervisor: 'ضابط', operator: 'منفذ' };
        document.getElementById('userRole').textContent = roleLabels[currentUser.role] || currentUser.role;

        // Show shift leaves section only for supervisors
        if (currentUser.role === 'supervisor') {
            document.getElementById('shiftLeavesSection').classList.remove('hidden');
        }

        // Show leave balance
        document.getElementById('leaveBalance').textContent = `${currentUser.annual_leave_balance} يوم`;
    } catch {
        window.location.href = '/';
    }
}

// ---- My Leaves ----
async function loadMyLeaves() {
    try {
        const leaves = await apiCall('/api/leaves');

        const tbody = document.getElementById('myLeavesTable');
        const empty = document.getElementById('myLeavesEmpty');

        // Separate personal leaves from shift leaves
        const personalLeaves = leaves.filter(l => {
            return l.employee_name === currentUser.name;
        });

        if (personalLeaves.length === 0) {
            tbody.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');
        tbody.innerHTML = personalLeaves.map(l => `
      <tr class="hover:bg-gray-50/50 transition">
        <td class="px-4 py-3 text-gray-600">${l.start_date}</td>
        <td class="px-4 py-3 text-gray-600">${l.end_date}</td>
        <td class="px-4 py-3">${statusBadge(l.status)}</td>
      </tr>
    `).join('');

        // ---- Shift Leaves for Supervisor ----
        if (currentUser.role === 'supervisor') {
            const shiftLeaves = leaves.filter(l => l.status === 'approved' && l.employee_name !== currentUser.name);
            const shiftTbody = document.getElementById('shiftLeavesTable');
            const shiftEmpty = document.getElementById('shiftLeavesEmpty');

            if (shiftLeaves.length === 0) {
                shiftTbody.innerHTML = '';
                shiftEmpty.classList.remove('hidden');
            } else {
                shiftEmpty.classList.add('hidden');
                shiftTbody.innerHTML = shiftLeaves.map(l => `
          <tr class="hover:bg-gray-50/50 transition">
            <td class="px-4 py-3 font-medium text-gray-800">${l.employee_name}</td>
            <td class="px-4 py-3">${roleBadge(l.employee_role)}</td>
            <td class="px-4 py-3 text-gray-600">${l.start_date}</td>
            <td class="px-4 py-3 text-gray-600">${l.end_date}</td>
          </tr>
        `).join('');
            }
        }
    } catch (err) {
        showToast('خطأ في تحميل الإجازات');
    }
}

// ---- My Courses ----
async function loadMyCourses() {
    try {
        const courses = await apiCall('/api/courses');
        const tbody = document.getElementById('myCoursesTable');
        const empty = document.getElementById('myCoursesEmpty');

        if (courses.length === 0) {
            tbody.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');
        tbody.innerHTML = courses.map(c => `
      <tr class="hover:bg-gray-50/50 transition">
        <td class="px-4 py-3 font-medium text-gray-800">${c.title}</td>
        <td class="px-4 py-3 text-gray-600">${c.location}</td>
        <td class="px-4 py-3 text-gray-600">${c.date}</td>
      </tr>
    `).join('');
    } catch (err) {
        showToast('خطأ في تحميل الدورات');
    }
}

// ---- My Mandates ----
async function loadMyMandates() {
    try {
        const mandates = await apiCall('/api/mandates');
        const tbody = document.getElementById('myMandatesTable');
        const empty = document.getElementById('myMandatesEmpty');

        if (mandates.length === 0) {
            tbody.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');
        tbody.innerHTML = mandates.map(m => `
      <tr class="hover:bg-gray-50/50 transition">
        <td class="px-4 py-3 font-medium text-gray-800">${m.title}</td>
        <td class="px-4 py-3 text-gray-600">${m.location}</td>
        <td class="px-4 py-3 text-gray-600">${m.date}</td>
      </tr>
    `).join('');
    } catch (err) {
        showToast('خطأ في تحميل الانتدابات');
    }
}

// ---- Leave Request ----
document.getElementById('requestLeaveBtn').addEventListener('click', () => {
    document.getElementById('leaveForm').reset();
    document.getElementById('leaveModal').classList.remove('hidden');
});

document.getElementById('leaveForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await apiCall('/api/leaves', {
            method: 'POST',
            body: JSON.stringify({
                start_date: document.getElementById('leaveStart').value,
                end_date: document.getElementById('leaveEnd').value,
            }),
        });
        showToast('تم تقديم طلب الإجازة بنجاح');
        document.getElementById('leaveModal').classList.add('hidden');
        await checkAuth(); // Refresh balance
        loadMyLeaves();
    } catch (err) {
        showToast(err.message);
    }
});

// ---- Password Change ----
document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;

    try {
        await apiCall('/api/auth/change-password', {
            method: 'PUT',
            body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
        });
        showToast('تم تغيير كلمة المرور بنجاح');
        document.getElementById('passwordModal').classList.add('hidden');
        document.getElementById('passwordForm').reset();
    } catch (err) {
        showToast(err.message);
    }
});

// ---- Logout ----
document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await apiCall('/api/auth/logout', { method: 'POST' });
    } catch (e) { }
    window.location.href = '/';
});

// ============================================================
// STANDALONE SIGNATURE MANAGEMENT
// ============================================================

let mainSigCanvas, mainSigCtx, isDrawingMain = false;
let savedSignatureData = null;

function initMainSignaturePad() {
    mainSigCanvas = document.getElementById('signatureCanvasMain');
    if (!mainSigCanvas) return;
    mainSigCtx = mainSigCanvas.getContext('2d');

    function resizeCanvas() {
        const rect = mainSigCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        mainSigCanvas.width = rect.width * dpr;
        mainSigCanvas.height = rect.height * dpr;
        mainSigCtx.scale(dpr, dpr);
        mainSigCtx.strokeStyle = '#1a1a2e';
        mainSigCtx.lineWidth = 2.5;
        mainSigCtx.lineCap = 'round';
        mainSigCtx.lineJoin = 'round';
    }
    resizeCanvas();

    function getPos(e) {
        const rect = mainSigCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function startDraw(e) {
        e.preventDefault();
        isDrawingMain = true;
        const pos = getPos(e);
        mainSigCtx.beginPath();
        mainSigCtx.moveTo(pos.x, pos.y);
    }
    function draw(e) {
        if (!isDrawingMain) return;
        e.preventDefault();
        const pos = getPos(e);
        mainSigCtx.lineTo(pos.x, pos.y);
        mainSigCtx.stroke();
    }
    function stopDraw(e) {
        if (e) e.preventDefault();
        isDrawingMain = false;
    }

    mainSigCanvas.addEventListener('mousedown', startDraw);
    mainSigCanvas.addEventListener('mousemove', draw);
    mainSigCanvas.addEventListener('mouseup', stopDraw);
    mainSigCanvas.addEventListener('mouseleave', stopDraw);
    mainSigCanvas.addEventListener('touchstart', startDraw, { passive: false });
    mainSigCanvas.addEventListener('touchmove', draw, { passive: false });
    mainSigCanvas.addEventListener('touchend', stopDraw);

    // Clear button
    document.getElementById('clearSigMainBtn').addEventListener('click', () => {
        const rect = mainSigCanvas.getBoundingClientRect();
        mainSigCtx.clearRect(0, 0, rect.width, rect.height);
    });

    // Save button
    document.getElementById('saveSigMainBtn').addEventListener('click', async () => {
        const sigData = getMainSignatureData();
        if (!sigData) {
            showToast('الرجاء رسم التوقيع أولاً');
            return;
        }
        try {
            await apiCall('/api/attendance/signature', {
                method: 'POST',
                body: JSON.stringify({ signature_data: sigData }),
            });
            savedSignatureData = sigData;
            updateSavedSigPreview();
            showToast('تم حفظ التوقيع بنجاح ✅');
        } catch (err) {
            showToast(err.message);
        }
    });

    // Load existing saved signature
    loadSavedSignatureData();
}

function getMainSignatureData() {
    if (!mainSigCanvas) return null;
    const data = mainSigCtx.getImageData(0, 0, mainSigCanvas.width, mainSigCanvas.height).data;
    let hasContent = false;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) { hasContent = true; break; }
    }
    if (!hasContent) return null;
    return mainSigCanvas.toDataURL('image/png');
}

function updateSavedSigPreview() {
    const noMsg = document.getElementById('noSavedSigMsg');
    const img = document.getElementById('savedSigImage');
    if (savedSignatureData) {
        noMsg.classList.add('hidden');
        img.src = savedSignatureData;
        img.classList.remove('hidden');
    } else {
        noMsg.classList.remove('hidden');
        img.classList.add('hidden');
    }
}

async function loadSavedSignatureData() {
    try {
        const data = await apiCall('/api/attendance/signature');
        savedSignatureData = data.signature_data;
        updateSavedSigPreview();
    } catch (err) { }
}

// ============================================================
// ATTENDANCE SYSTEM
// ============================================================

let signatureCanvas, signatureCtx, isDrawing = false;
let currentSessionId = null;

// ---- Signature Pad (Attendance) ----
function initSignaturePad() {
    signatureCanvas = document.getElementById('signatureCanvas');
    if (!signatureCanvas) return;
    signatureCtx = signatureCanvas.getContext('2d');

    // Set proper dimensions
    function resizeCanvas() {
        const rect = signatureCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        signatureCanvas.width = rect.width * dpr;
        signatureCanvas.height = rect.height * dpr;
        signatureCtx.scale(dpr, dpr);
        signatureCtx.strokeStyle = '#1a1a2e';
        signatureCtx.lineWidth = 2.5;
        signatureCtx.lineCap = 'round';
        signatureCtx.lineJoin = 'round';
    }
    resizeCanvas();

    function getPos(e) {
        const rect = signatureCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function startDraw(e) {
        e.preventDefault();
        isDrawing = true;
        const pos = getPos(e);
        signatureCtx.beginPath();
        signatureCtx.moveTo(pos.x, pos.y);
    }
    function draw(e) {
        if (!isDrawing) return;
        e.preventDefault();
        const pos = getPos(e);
        signatureCtx.lineTo(pos.x, pos.y);
        signatureCtx.stroke();
    }
    function stopDraw(e) {
        if (e) e.preventDefault();
        isDrawing = false;
    }

    signatureCanvas.addEventListener('mousedown', startDraw);
    signatureCanvas.addEventListener('mousemove', draw);
    signatureCanvas.addEventListener('mouseup', stopDraw);
    signatureCanvas.addEventListener('mouseleave', stopDraw);
    signatureCanvas.addEventListener('touchstart', startDraw, { passive: false });
    signatureCanvas.addEventListener('touchmove', draw, { passive: false });
    signatureCanvas.addEventListener('touchend', stopDraw);

    // Clear button
    document.getElementById('clearSignatureBtn').addEventListener('click', clearSignature);

    // Save default signature button -> save and update preview
    document.getElementById('saveDefaultSigBtn').addEventListener('click', async () => {
        const sigData = getSignatureData();
        if (!sigData) {
            showToast('الرجاء رسم التوقيع أولاً');
            return;
        }
        try {
            await apiCall('/api/attendance/signature', {
                method: 'POST',
                body: JSON.stringify({ signature_data: sigData }),
            });
            savedSignatureData = sigData;
            updateSavedSigPreview();
            showToast('تم حفظ التوقيع بنجاح ✅');
        } catch (err) {
            showToast(err.message);
        }
    });

    // Load saved signature into attendance pad
    document.getElementById('loadSavedSigBtn').addEventListener('click', () => {
        if (!savedSignatureData) {
            showToast('لا يوجد توقيع محفوظ - قم بحفظ توقيعك من قسم "التوقيع" في صفحتي');
            return;
        }
        const img = new Image();
        img.onload = () => {
            clearSignature();
            const rect = signatureCanvas.getBoundingClientRect();
            signatureCtx.drawImage(img, 0, 0, rect.width, rect.height);
        };
        img.src = savedSignatureData;
    });
}

function clearSignature() {
    if (!signatureCtx) return;
    const rect = signatureCanvas.getBoundingClientRect();
    signatureCtx.clearRect(0, 0, rect.width, rect.height);
}

function getSignatureData() {
    if (!signatureCanvas) return null;
    const data = signatureCtx.getImageData(0, 0, signatureCanvas.width, signatureCanvas.height).data;
    let hasContent = false;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) { hasContent = true; break; }
    }
    if (!hasContent) return null;
    return signatureCanvas.toDataURL('image/png');
}

// ---- Attendance Status (for all employees) ----
async function loadAttendanceStatus() {
    if (!currentUser || !currentUser.shift) return;

    document.getElementById('attendanceSection').classList.remove('hidden');
    document.getElementById('noShiftMsg').classList.add('hidden');

    try {
        const data = await apiCall('/api/attendance/my-status');

        const noSessionMsg = document.getElementById('noSessionMsg');
        const attendanceActions = document.getElementById('attendanceActions');
        const checkInBtn = document.getElementById('checkInBtn');
        const checkOutBtn = document.getElementById('checkOutBtn');
        const signaturePadCont = document.getElementById('signaturePadContainer');
        const doneMsg = document.getElementById('attendanceDoneMsg');

        if (!data.has_session) {
            noSessionMsg.classList.remove('hidden');
            attendanceActions.classList.add('hidden');
            return;
        }

        noSessionMsg.classList.add('hidden');
        attendanceActions.classList.remove('hidden');

        // Update status badge
        const badge = document.getElementById('attendanceStatusBadge');
        const statusMap = {
            open: { label: 'جلسة مفتوحة', color: 'bg-green-100 text-green-700' },
            closed: { label: 'جلسة مغلقة', color: 'bg-yellow-100 text-yellow-700' },
            approved: { label: 'معتمدة', color: 'bg-blue-100 text-blue-700' },
        };
        const st = statusMap[data.session_status] || { label: data.session_status, color: 'bg-gray-100' };
        badge.textContent = st.label;
        badge.className = `px-3 py-1 rounded-lg text-xs font-bold ${st.color}`;

        const record = data.record;
        if (record && record.check_in_time && record.check_out_time) {
            // Both done
            signaturePadCont.classList.add('hidden');
            checkInBtn.classList.add('hidden');
            checkOutBtn.classList.add('hidden');
            doneMsg.classList.remove('hidden');
        } else if (record && record.check_in_time) {
            // Checked in, waiting for check out
            checkInBtn.disabled = true;
            checkInBtn.classList.add('opacity-50', 'cursor-not-allowed');
            checkOutBtn.disabled = false;
            doneMsg.classList.add('hidden');
            signaturePadCont.classList.remove('hidden');
            checkInBtn.classList.remove('hidden');
            checkOutBtn.classList.remove('hidden');
        } else {
            // Not checked in yet
            checkInBtn.disabled = false;
            checkInBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            checkOutBtn.disabled = true;
            doneMsg.classList.add('hidden');
            signaturePadCont.classList.remove('hidden');
            checkInBtn.classList.remove('hidden');
            checkOutBtn.classList.remove('hidden');
        }

        if (data.session_status === 'approved') {
            signaturePadCont.classList.add('hidden');
            checkInBtn.classList.add('hidden');
            checkOutBtn.classList.add('hidden');
        }
    } catch (err) {
        console.error('Attendance status error:', err);
    }
}

// ---- Check-in / Check-out ----
function setupAttendanceButtons() {
    document.getElementById('checkInBtn').addEventListener('click', async () => {
        // Auto-use saved signature, fall back to canvas drawing
        let signature = savedSignatureData || getSignatureData();
        if (!signature) {
            showToast('الرجاء حفظ توقيعك أولاً من قسم "التوقيع" في صفحتي');
            return;
        }
        try {
            await apiCall('/api/attendance/check-in', {
                method: 'POST',
                body: JSON.stringify({ signature }),
            });
            showToast('تم تسجيل حضورك بنجاح ✅');
            clearSignature();
            loadAttendanceStatus();
            if (currentUser.role === 'supervisor') loadSupervisorSession();
        } catch (err) {
            showToast(err.message);
        }
    });

    document.getElementById('checkOutBtn').addEventListener('click', async () => {
        // Auto-use saved signature, fall back to canvas drawing
        let signature = savedSignatureData || getSignatureData();
        if (!signature) {
            showToast('الرجاء حفظ توقيعك أولاً من قسم "التوقيع" في صفحتي');
            return;
        }
        try {
            await apiCall('/api/attendance/check-out', {
                method: 'POST',
                body: JSON.stringify({ signature }),
            });
            showToast('تم تسجيل انصرافك بنجاح ✅');
            clearSignature();
            loadAttendanceStatus();
            if (currentUser.role === 'supervisor') loadSupervisorSession();
        } catch (err) {
            showToast(err.message);
        }
    });
}

// ---- Supervisor Session Management ----
async function loadSupervisorSession() {
    if (!currentUser || currentUser.role !== 'supervisor') return;

    document.getElementById('supervisorAttendanceSection').classList.remove('hidden');
    document.getElementById('supervisorShiftLabel').textContent = currentUser.shift;

    try {
        const data = await apiCall('/api/attendance/sessions/current');

        const openBtn = document.getElementById('openSessionBtn');
        const infoCard = document.getElementById('sessionInfoCard');
        const approvedMsg = document.getElementById('sessionApprovedMsg');

        if (!data.session) {
            openBtn.classList.remove('hidden');
            infoCard.classList.add('hidden');
            approvedMsg.classList.add('hidden');
            currentSessionId = null;
            return;
        }

        currentSessionId = data.session.id;

        if (data.session.status === 'approved') {
            openBtn.classList.add('hidden');
            infoCard.classList.add('hidden');
            approvedMsg.classList.remove('hidden');
            return;
        }

        openBtn.classList.add('hidden');
        infoCard.classList.remove('hidden');
        approvedMsg.classList.add('hidden');

        // Update session badge
        const badge = document.getElementById('sessionStatusBadge');
        if (data.session.status === 'open') {
            badge.textContent = 'مفتوحة';
            badge.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-green-100 text-green-700';
        } else {
            badge.textContent = 'مغلقة';
            badge.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-yellow-100 text-yellow-700';
        }

        document.getElementById('sessionDateLabel').textContent = `التاريخ: ${data.session.date}`;

        // Populate shift times
        document.getElementById('shiftStartTime').value = data.session.shift_start_time || '';
        document.getElementById('shiftEndTime').value = data.session.shift_end_time || '';

        // Stats
        const records = data.records;
        document.getElementById('statPresent').textContent = records.filter(r => r.status === 'present').length;
        document.getElementById('statAbsent').textContent = records.filter(r => r.status === 'absent').length;
        document.getElementById('statLate').textContent = records.filter(r => r.status === 'late').length;
        document.getElementById('statExcused').textContent = records.filter(r => r.status === 'excused').length;

        // Records table
        const tbody = document.getElementById('sessionRecordsTable');
        tbody.innerHTML = records.map((r, i) => {
            const statusOptions = ['present', 'absent', 'late', 'excused'];
            const statusLabels = { present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'معذور' };
            const statusColors = {
                present: 'bg-emerald-100 text-emerald-700',
                absent: 'bg-red-100 text-red-700',
                late: 'bg-yellow-100 text-yellow-700',
                excused: 'bg-blue-100 text-blue-700',
            };

            const formatTime = (t) => t ? new Date(t + 'Z').toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '-';

            const sigPreview = r.check_in_signature
                ? `<img src="${r.check_in_signature}" class="h-8 rounded border border-gray-200 cursor-pointer hover:scale-150 transition" title="توقيع الحضور" onclick="window.open('${r.check_in_signature}')">`
                : '<span class="text-gray-300 text-xs">-</span>';

            return `
            <tr class="hover:bg-gray-50/50 transition">
                <td class="px-4 py-3 text-gray-400 text-xs">${i + 1}</td>
                <td class="px-4 py-3 font-medium text-gray-800">${r.employee_name}</td>
                <td class="px-4 py-3">${roleBadge(r.employee_role)}</td>
                <td class="px-4 py-3">
                    <select data-record-id="${r.id}" class="record-status-select text-xs px-2 py-1 rounded-lg border border-gray-200 ${statusColors[r.status]} font-bold">
                        ${statusOptions.map(s => `<option value="${s}" ${r.status === s ? 'selected' : ''}>${statusLabels[s]}</option>`).join('')}
                    </select>
                </td>
                <td class="px-4 py-3 text-gray-600 text-xs">${formatTime(r.check_in_time)}</td>
                <td class="px-4 py-3 text-gray-600 text-xs">${formatTime(r.check_out_time)}</td>
                <td class="px-4 py-3">${sigPreview}</td>
                <td class="px-4 py-3">
                    <input type="text" data-record-id="${r.id}" class="record-note-input text-xs px-2 py-1 rounded-lg border border-gray-200 w-24 focus:ring-1 focus:ring-indigo-400 outline-none" 
                        value="${r.note || ''}" placeholder="ملاحظة...">
                </td>
                <td class="px-4 py-3">
                    <button data-record-id="${r.id}" class="save-record-btn text-xs text-indigo-600 hover:text-indigo-800 font-bold transition">حفظ</button>
                </td>
            </tr>`;
        }).join('');

        // Event listeners for record updates
        tbody.querySelectorAll('.save-record-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const recordId = btn.dataset.recordId;
                const row = btn.closest('tr');
                const status = row.querySelector('.record-status-select').value;
                const note = row.querySelector('.record-note-input').value;

                try {
                    await apiCall(`/api/attendance/records/${recordId}`, {
                        method: 'PUT',
                        body: JSON.stringify({ status, note }),
                    });
                    showToast('تم تحديث السجل');
                    loadSupervisorSession();
                } catch (err) {
                    showToast(err.message);
                }
            });
        });

    } catch (err) {
        console.error('Supervisor session error:', err);
    }
}

function setupSupervisorButtons() {
    // Open session
    document.getElementById('openSessionBtn').addEventListener('click', async () => {
        try {
            const data = await apiCall('/api/attendance/sessions', { method: 'POST' });
            showToast(data.message);
            loadSupervisorSession();
            loadAttendanceStatus();
        } catch (err) {
            showToast(err.message);
        }
    });

    // Close session
    document.getElementById('closeSessionBtn').addEventListener('click', async () => {
        if (!currentSessionId) return;
        try {
            await apiCall(`/api/attendance/sessions/${currentSessionId}/close`, { method: 'PUT' });
            showToast('تم إغلاق جلسة التحضير');
            loadSupervisorSession();
        } catch (err) {
            showToast(err.message);
        }
    });

    // Save shift times
    document.getElementById('saveShiftTimesBtn').addEventListener('click', async () => {
        if (!currentSessionId) return;
        const shift_start_time = document.getElementById('shiftStartTime').value;
        const shift_end_time = document.getElementById('shiftEndTime').value;
        try {
            await apiCall(`/api/attendance/sessions/${currentSessionId}/times`, {
                method: 'PUT',
                body: JSON.stringify({ shift_start_time, shift_end_time }),
            });
            showToast('تم حفظ أوقات المناوبة ✅');
        } catch (err) {
            showToast(err.message);
        }
    });

    // Approve session - open approval modal
    document.getElementById('approveSessionBtn').addEventListener('click', () => {
        if (!currentSessionId) return;
        document.getElementById('approvalNotes').value = '';
        clearSupervisorSig();
        document.getElementById('approvalModal').classList.remove('hidden');
        // Re-init canvas size after modal is visible
        setTimeout(initSupervisorSigPad, 100);
    });

    // Confirm approve with signature
    document.getElementById('confirmApproveBtn').addEventListener('click', async () => {
        if (!currentSessionId) return;
        let sigData = getSupervisorSigData();
        if (!sigData && savedSignatureData) {
            sigData = savedSignatureData;
        }
        if (!sigData) {
            showToast('الرجاء رسم التوقيع أو استخدام التوقيع المحفوظ');
            return;
        }
        const notes = document.getElementById('approvalNotes').value;
        const shift_start_time = document.getElementById('shiftStartTime').value;
        const shift_end_time = document.getElementById('shiftEndTime').value;
        try {
            await apiCall(`/api/attendance/sessions/${currentSessionId}/approve`, {
                method: 'PUT',
                body: JSON.stringify({ 
                    notes, 
                    supervisor_signature: sigData,
                    shift_start_time,
                    shift_end_time
                }),
            });
            showToast('تم اعتماد سجل الحضور وإرساله لإدارة المناوبات ✅');
            document.getElementById('approvalModal').classList.add('hidden');
            loadSupervisorSession();
            loadAttendanceStatus();
        } catch (err) {
            showToast(err.message);
        }
    });
}

// ---- Supervisor Signature Pad (for approval modal) ----
let supSigCanvas, supSigCtx, isDrawingSup = false;

function initSupervisorSigPad() {
    supSigCanvas = document.getElementById('supervisorSigCanvas');
    if (!supSigCanvas) return;
    supSigCtx = supSigCanvas.getContext('2d');

    const rect = supSigCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    supSigCanvas.width = rect.width * dpr;
    supSigCanvas.height = rect.height * dpr;
    supSigCtx.scale(dpr, dpr);
    supSigCtx.strokeStyle = '#1a1a2e';
    supSigCtx.lineWidth = 2.5;
    supSigCtx.lineCap = 'round';
    supSigCtx.lineJoin = 'round';

    function getPos(e) {
        const r = supSigCanvas.getBoundingClientRect();
        const cx = e.touches ? e.touches[0].clientX : e.clientX;
        const cy = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: cx - r.left, y: cy - r.top };
    }
    function start(e) { e.preventDefault(); isDrawingSup = true; const p = getPos(e); supSigCtx.beginPath(); supSigCtx.moveTo(p.x, p.y); }
    function draw(e) { if (!isDrawingSup) return; e.preventDefault(); const p = getPos(e); supSigCtx.lineTo(p.x, p.y); supSigCtx.stroke(); }
    function stop(e) { if (e) e.preventDefault(); isDrawingSup = false; }

    // Remove old listeners to avoid duplicates
    supSigCanvas.onmousedown = start;
    supSigCanvas.onmousemove = draw;
    supSigCanvas.onmouseup = stop;
    supSigCanvas.onmouseleave = stop;
    supSigCanvas.ontouchstart = start;
    supSigCanvas.ontouchmove = draw;
    supSigCanvas.ontouchend = stop;

    document.getElementById('clearSupervisorSigBtn').onclick = clearSupervisorSig;
    document.getElementById('loadSupervisorSavedSigBtn').onclick = () => {
        if (!savedSignatureData) {
            showToast('لا يوجد توقيع محفوظ');
            return;
        }
        const img = new Image();
        img.onload = () => {
            clearSupervisorSig();
            const r = supSigCanvas.getBoundingClientRect();
            supSigCtx.drawImage(img, 0, 0, r.width, r.height);
        };
        img.src = savedSignatureData;
    };
}

function clearSupervisorSig() {
    if (!supSigCtx || !supSigCanvas) return;
    const r = supSigCanvas.getBoundingClientRect();
    supSigCtx.clearRect(0, 0, r.width, r.height);
}

function getSupervisorSigData() {
    if (!supSigCanvas) return null;
    const data = supSigCtx.getImageData(0, 0, supSigCanvas.width, supSigCanvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) return supSigCanvas.toDataURL('image/png');
    }
    return null;
}

// ---- Initialize ----
(async () => {
    await checkAuth();

    // Setup navigation & mobile menu
    setupMobileMenu();
    setupNavigation();

    // Load profile data
    loadMyLeaves();
    loadMyCourses();
    loadMyMandates();

    // Load saved signature data (for preview in signature tab)
    loadSavedSignatureData();

    // Initialize attendance features
    if (currentUser && currentUser.shift) {
        // Show attendance section, hide no-shift message
        document.getElementById('noShiftMsg').classList.add('hidden');
        
        initSignaturePad();
        setupAttendanceButtons();
        loadAttendanceStatus();

        if (currentUser.role === 'supervisor') {
            setupSupervisorButtons();
            loadSupervisorSession();

            // Auto-refresh supervisor view every 15s
            setInterval(() => {
                loadSupervisorSession();
            }, 15000);
        }
    }
})();
