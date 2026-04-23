import { Router, Request, Response } from 'express';
import db, { logActivity } from '../database';
import { requireAuth } from '../middleware/auth';

const router = Router();

// ========== HELPERS ==========

const GROUP_TIMES: Record<string, { start: string; end: string; label: string }> = {
    morning: { start: '07:00', end: '15:00', label: 'الصباح' },
    afternoon: { start: '14:30', end: '23:30', label: 'العصر' },
    night: { start: '22:00', end: '07:00', label: 'الليل' },
};

function isSupervisor(req: Request): boolean {
    return req.session.user?.role === 'supervisor';
}

function isManager(req: Request): boolean {
    const role = req.session.user?.role;
    return role === 'general_manager' || role === 'dept_manager';
}

function requireSupervisorAuth(req: Request, res: Response, next: Function): void {
    if (!req.session.user) {
        res.status(401).json({ error: 'غير مصرح - يرجى تسجيل الدخول' });
        return;
    }
    if (req.session.user.role !== 'supervisor') {
        res.status(403).json({ error: 'غير مصرح - صلاحية المشرف فقط' });
        return;
    }
    next();
}

function getToday(): string {
    // Use local date (server timezone)
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60000);
    return local.toISOString().split('T')[0];
}

// ========== DAILY REPORT ENDPOINTS ==========

// POST /api/support-attendance/reports - Create daily report + 3 sessions
router.post('/reports', requireSupervisorAuth, (req: Request, res: Response) => {
    const user = req.session.user!;
    const today = getToday();

    // Check if report already exists
    const existing = db.prepare('SELECT id, status FROM support_daily_reports WHERE date = ?').get(today) as any;
    if (existing) {
        res.json({ message: 'كشف المساندة موجود بالفعل', id: existing.id, status: existing.status });
        return;
    }

    try {
        const result = db.prepare(`
            INSERT INTO support_daily_reports (date) VALUES (?)
        `).run(today);
        const reportId = result.lastInsertRowid;

        // Create 3 sessions
        const insertSession = db.prepare(`
            INSERT INTO support_sessions (report_id, group_type, shift_start_time, shift_end_time)
            VALUES (?, ?, ?, ?)
        `);

        for (const [groupType, times] of Object.entries(GROUP_TIMES)) {
            insertSession.run(reportId, groupType, times.start, times.end);
        }

        logActivity(user.id, user.name, 'إنشاء كشف مساندة', 'مساندة', `التاريخ: ${today}`);

        res.status(201).json({
            message: 'تم إنشاء كشف المساندة اليومي',
            id: reportId,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'حدث خطأ أثناء إنشاء كشف المساندة' });
    }
});

// GET /api/support-attendance/reports/today - Get today's report with all sessions and records
router.get('/reports/today', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;
    const today = getToday();

    const report = db.prepare(`
        SELECT r.*, e1.name as submitted_by_name, e2.name as approved_by_name
        FROM support_daily_reports r
        LEFT JOIN employees e1 ON e1.id = r.submitted_by
        LEFT JOIN employees e2 ON e2.id = r.approved_by
        WHERE r.date = ?
    `).get(today) as any;

    if (!report) {
        res.json({ report: null });
        return;
    }

    // Get all sessions
    const sessions = db.prepare(`
        SELECT s.*, 
            e1.name as checkin_supervisor_name,
            e2.name as checkout_supervisor_name
        FROM support_sessions s
        LEFT JOIN employees e1 ON e1.id = s.checkin_supervisor_id
        LEFT JOIN employees e2 ON e2.id = s.checkout_supervisor_id
        WHERE s.report_id = ?
        ORDER BY 
            CASE s.group_type WHEN 'morning' THEN 0 WHEN 'afternoon' THEN 1 WHEN 'night' THEN 2 END
    `).all(report.id) as any[];

    // Get records for each session
    for (const session of sessions) {
        session.records = db.prepare(`
            SELECT sar.*, e.name as employee_name, e.role as employee_role, e.support_group
            FROM support_attendance_records sar
            JOIN employees e ON e.id = sar.employee_id
            WHERE sar.session_id = ?
            ORDER BY e.name
        `).all(session.id);
    }

    res.json({ report, sessions });
});

// ========== SESSION ENDPOINTS ==========

// PUT /api/support-attendance/sessions/:id/open-checkin - Open check-in for a group
router.put('/sessions/:id/open-checkin', requireSupervisorAuth, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { id } = req.params;

    const session = db.prepare(`
        SELECT s.*, r.status as report_status
        FROM support_sessions s
        JOIN support_daily_reports r ON r.id = s.report_id
        WHERE s.id = ?
    `).get(Number(id)) as any;

    if (!session) {
        res.status(404).json({ error: 'الجلسة غير موجودة' });
        return;
    }
    if (session.report_status !== 'active') {
        res.status(400).json({ error: 'الكشف اليومي مغلق أو معتمد' });
        return;
    }
    if (session.checkin_status !== 'pending') {
        res.status(400).json({ error: 'تسجيل الحضور مفتوح أو مكتمل بالفعل' });
        return;
    }

    // Create attendance records for employees in this group
    const employees = db.prepare(`
        SELECT id FROM employees WHERE support_group = ? AND role = 'operator'
    `).all(session.group_type) as any[];

    const insertRecord = db.prepare(`
        INSERT OR IGNORE INTO support_attendance_records (session_id, employee_id) VALUES (?, ?)
    `);

    for (const emp of employees) {
        insertRecord.run(session.id, emp.id);
    }

    db.prepare(`
        UPDATE support_sessions SET checkin_status = 'open', checkin_supervisor_id = ? WHERE id = ?
    `).run(user.id, Number(id));

    const groupLabel = GROUP_TIMES[session.group_type]?.label || session.group_type;
    logActivity(user.id, user.name, 'فتح حضور مساندة', 'مساندة', `مجموعة ${groupLabel}`);

    res.json({ message: `تم فتح تسجيل حضور مجموعة ${groupLabel}`, employee_count: employees.length });
});

// PUT /api/support-attendance/sessions/:id/close-checkin - Close check-in + signature
router.put('/sessions/:id/close-checkin', requireSupervisorAuth, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { id } = req.params;
    const { signature } = req.body;

    const session = db.prepare('SELECT * FROM support_sessions WHERE id = ?').get(Number(id)) as any;

    if (!session) {
        res.status(404).json({ error: 'الجلسة غير موجودة' });
        return;
    }
    if (session.checkin_status !== 'open') {
        res.status(400).json({ error: 'لا يمكن إغلاق الحضور - ليست مفتوحة' });
        return;
    }

    db.prepare(`
        UPDATE support_sessions 
        SET checkin_status = 'completed', checkin_supervisor_signature = ?, checkin_supervisor_id = ?
        WHERE id = ?
    `).run(signature || null, user.id, Number(id));

    const groupLabel = GROUP_TIMES[session.group_type]?.label || session.group_type;
    logActivity(user.id, user.name, 'إغلاق حضور مساندة', 'مساندة', `مجموعة ${groupLabel}`);

    res.json({ message: `تم إغلاق تسجيل حضور مجموعة ${groupLabel}` });
});

// PUT /api/support-attendance/sessions/:id/open-checkout - Open check-out for a group
router.put('/sessions/:id/open-checkout', requireSupervisorAuth, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { id } = req.params;

    const session = db.prepare(`
        SELECT s.*, r.status as report_status
        FROM support_sessions s
        JOIN support_daily_reports r ON r.id = s.report_id
        WHERE s.id = ?
    `).get(Number(id)) as any;

    if (!session) {
        res.status(404).json({ error: 'الجلسة غير موجودة' });
        return;
    }
    if (session.report_status !== 'active') {
        res.status(400).json({ error: 'الكشف اليومي مغلق أو معتمد' });
        return;
    }
    if (session.checkin_status !== 'completed') {
        res.status(400).json({ error: 'يجب إغلاق الحضور أولاً قبل فتح الانصراف' });
        return;
    }
    if (session.checkout_status !== 'pending') {
        res.status(400).json({ error: 'تسجيل الانصراف مفتوح أو مكتمل بالفعل' });
        return;
    }

    db.prepare(`
        UPDATE support_sessions SET checkout_status = 'open', checkout_supervisor_id = ? WHERE id = ?
    `).run(user.id, Number(id));

    const groupLabel = GROUP_TIMES[session.group_type]?.label || session.group_type;
    logActivity(user.id, user.name, 'فتح انصراف مساندة', 'مساندة', `مجموعة ${groupLabel}`);

    res.json({ message: `تم فتح تسجيل انصراف مجموعة ${groupLabel}` });
});

// PUT /api/support-attendance/sessions/:id/close-checkout - Close check-out + signature
router.put('/sessions/:id/close-checkout', requireSupervisorAuth, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { id } = req.params;
    const { signature } = req.body;

    const session = db.prepare('SELECT * FROM support_sessions WHERE id = ?').get(Number(id)) as any;

    if (!session) {
        res.status(404).json({ error: 'الجلسة غير موجودة' });
        return;
    }
    if (session.checkout_status !== 'open') {
        res.status(400).json({ error: 'لا يمكن إغلاق الانصراف - ليست مفتوحة' });
        return;
    }

    db.prepare(`
        UPDATE support_sessions
        SET checkout_status = 'completed', checkout_supervisor_signature = ?, checkout_supervisor_id = ?
        WHERE id = ?
    `).run(signature || null, user.id, Number(id));

    const groupLabel = GROUP_TIMES[session.group_type]?.label || session.group_type;
    logActivity(user.id, user.name, 'إغلاق انصراف مساندة', 'مساندة', `مجموعة ${groupLabel}`);

    res.json({ message: `تم إغلاق تسجيل انصراف مجموعة ${groupLabel}` });
});

// ========== ATTENDANCE RECORD ENDPOINTS ==========

// POST /api/support-attendance/check-in - Employee self check-in
router.post('/check-in', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { signature } = req.body;

    if (!user.support_group) {
        res.status(400).json({ error: 'أنت لست من منفذي المساندة' });
        return;
    }
    if (!signature) {
        res.status(400).json({ error: 'التوقيع مطلوب لتسجيل الحضور' });
        return;
    }

    const today = getToday();

    // Find today's report
    const report = db.prepare('SELECT id FROM support_daily_reports WHERE date = ? AND status = ?').get(today, 'active') as any;
    if (!report) {
        res.status(400).json({ error: 'لا يوجد كشف مساندة مفتوح اليوم' });
        return;
    }

    // Find the session for my group
    const session = db.prepare(`
        SELECT id, checkin_status FROM support_sessions 
        WHERE report_id = ? AND group_type = ?
    `).get(report.id, user.support_group) as any;

    if (!session) {
        res.status(400).json({ error: 'لا توجد جلسة لمجموعتك' });
        return;
    }
    if (session.checkin_status !== 'open') {
        res.status(400).json({ error: 'تسجيل الحضور لم يُفتح بعد أو مغلق' });
        return;
    }

    // Check existing record
    const record = db.prepare(
        'SELECT * FROM support_attendance_records WHERE session_id = ? AND employee_id = ?'
    ).get(session.id, user.id) as any;

    if (!record) {
        db.prepare(`
            INSERT INTO support_attendance_records (session_id, employee_id, check_in_time, check_in_signature, status)
            VALUES (?, ?, datetime('now'), ?, 'present')
        `).run(session.id, user.id, signature);
    } else {
        if (record.check_in_time) {
            res.status(400).json({ error: 'تم تسجيل حضورك بالفعل' });
            return;
        }
        db.prepare(`
            UPDATE support_attendance_records 
            SET check_in_time = datetime('now'), check_in_signature = ?, status = 'present'
            WHERE session_id = ? AND employee_id = ?
        `).run(signature, session.id, user.id);
    }

    res.json({ message: 'تم تسجيل حضورك بنجاح' });
});

// POST /api/support-attendance/check-out - Employee self check-out
router.post('/check-out', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { signature } = req.body;

    if (!user.support_group) {
        res.status(400).json({ error: 'أنت لست من منفذي المساندة' });
        return;
    }
    if (!signature) {
        res.status(400).json({ error: 'التوقيع مطلوب لتسجيل الانصراف' });
        return;
    }

    const today = getToday();
    const report = db.prepare('SELECT id FROM support_daily_reports WHERE date = ? AND status = ?').get(today, 'active') as any;
    if (!report) {
        res.status(400).json({ error: 'لا يوجد كشف مساندة مفتوح اليوم' });
        return;
    }

    const session = db.prepare(`
        SELECT id, checkout_status FROM support_sessions
        WHERE report_id = ? AND group_type = ?
    `).get(report.id, user.support_group) as any;

    if (!session) {
        res.status(400).json({ error: 'لا توجد جلسة لمجموعتك' });
        return;
    }
    if (session.checkout_status !== 'open') {
        res.status(400).json({ error: 'تسجيل الانصراف لم يُفتح بعد أو مغلق' });
        return;
    }

    const record = db.prepare(
        'SELECT * FROM support_attendance_records WHERE session_id = ? AND employee_id = ?'
    ).get(session.id, user.id) as any;

    if (!record || !record.check_in_time) {
        res.status(400).json({ error: 'يجب تسجيل الحضور أولاً' });
        return;
    }
    if (record.check_out_time) {
        res.status(400).json({ error: 'تم تسجيل انصرافك بالفعل' });
        return;
    }

    db.prepare(`
        UPDATE support_attendance_records
        SET check_out_time = datetime('now'), check_out_signature = ?
        WHERE session_id = ? AND employee_id = ?
    `).run(signature, session.id, user.id);

    res.json({ message: 'تم تسجيل انصرافك بنجاح' });
});

// PUT /api/support-attendance/records/:id - Update record status/note (supervisor)
router.put('/records/:id', requireSupervisorAuth, (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, note } = req.body;

    const record = db.prepare(`
        SELECT sar.*, ss.group_type, r.status as report_status
        FROM support_attendance_records sar
        JOIN support_sessions ss ON ss.id = sar.session_id
        JOIN support_daily_reports r ON r.id = ss.report_id
        WHERE sar.id = ?
    `).get(Number(id)) as any;

    if (!record) {
        res.status(404).json({ error: 'السجل غير موجود' });
        return;
    }
    if (record.report_status !== 'active') {
        res.status(400).json({ error: 'الكشف معتمد ولا يمكن تعديل السجلات' });
        return;
    }

    if (status && !['present', 'absent', 'late', 'excused'].includes(status)) {
        res.status(400).json({ error: 'حالة غير صالحة' });
        return;
    }

    if (status && note !== undefined) {
        db.prepare('UPDATE support_attendance_records SET status = ?, note = ? WHERE id = ?')
            .run(status, note, Number(id));
    } else if (status) {
        db.prepare('UPDATE support_attendance_records SET status = ? WHERE id = ?')
            .run(status, Number(id));
    } else if (note !== undefined) {
        db.prepare('UPDATE support_attendance_records SET note = ? WHERE id = ?')
            .run(note, Number(id));
    }

    res.json({ message: 'تم تحديث السجل بنجاح' });
});

// ========== SUBMIT / MANAGEMENT ENDPOINTS ==========

// PUT /api/support-attendance/reports/:id/submit - Submit report to management
router.put('/reports/:id/submit', requireSupervisorAuth, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { id } = req.params;
    const { final_notes, signature } = req.body;

    const report = db.prepare('SELECT * FROM support_daily_reports WHERE id = ?').get(Number(id)) as any;
    if (!report) {
        res.status(404).json({ error: 'الكشف غير موجود' });
        return;
    }
    if (report.status !== 'active') {
        res.status(400).json({ error: 'الكشف مرفوع أو معتمد بالفعل' });
        return;
    }

    // Check all sessions are completed
    const pendingSessions = db.prepare(`
        SELECT COUNT(*) as cnt FROM support_sessions 
        WHERE report_id = ? AND (checkin_status != 'completed' OR checkout_status != 'completed')
    `).get(Number(id)) as any;

    if (pendingSessions.cnt > 0) {
        res.status(400).json({ error: 'يجب إكمال جميع الجلسات (حضور + انصراف) قبل رفع الكشف' });
        return;
    }

    if (!signature) {
        res.status(400).json({ error: 'توقيع المشرف مطلوب لرفع الكشف' });
        return;
    }

    db.prepare(`
        UPDATE support_daily_reports 
        SET status = 'completed', final_notes = ?, submitted_by = ?, submitted_at = datetime('now')
        WHERE id = ?
    `).run(final_notes || null, user.id, Number(id));

    logActivity(user.id, user.name, 'رفع كشف مساندة', 'مساندة', `التاريخ: ${report.date}`);

    res.json({ message: 'تم رفع كشف المساندة لإدارة المناوبات' });
});

// GET /api/support-attendance/reports/approved - Approved/completed reports for management
router.get('/reports/approved', requireAuth, (req: Request, res: Response) => {
    if (!isManager(req)) {
        res.status(403).json({ error: 'غير مصرح' });
        return;
    }

    const { date_from, date_to } = req.query;
    let query = `
        SELECT r.*, e1.name as submitted_by_name,
            (SELECT COUNT(*) FROM support_sessions ss 
             JOIN support_attendance_records sar ON sar.session_id = ss.id 
             WHERE ss.report_id = r.id AND sar.status = 'present') as total_present,
            (SELECT COUNT(*) FROM support_sessions ss 
             JOIN support_attendance_records sar ON sar.session_id = ss.id 
             WHERE ss.report_id = r.id AND sar.status = 'absent') as total_absent,
            (SELECT COUNT(*) FROM support_sessions ss 
             JOIN support_attendance_records sar ON sar.session_id = ss.id 
             WHERE ss.report_id = r.id) as total_count
        FROM support_daily_reports r
        LEFT JOIN employees e1 ON e1.id = r.submitted_by
        WHERE r.status IN ('completed', 'approved')
    `;
    const params: any[] = [];

    if (date_from) {
        query += ' AND r.date >= ?';
        params.push(date_from);
    }
    if (date_to) {
        query += ' AND r.date <= ?';
        params.push(date_to);
    }

    query += ' ORDER BY r.date DESC';
    const reports = db.prepare(query).all(...params);
    res.json(reports);
});

// GET /api/support-attendance/reports/:id/full - Full report detail
router.get('/reports/:id/full', requireAuth, (req: Request, res: Response) => {
    if (!isManager(req) && !isSupervisor(req)) {
        res.status(403).json({ error: 'غير مصرح' });
        return;
    }

    const { id } = req.params;

    const report = db.prepare(`
        SELECT r.*, e1.name as submitted_by_name
        FROM support_daily_reports r
        LEFT JOIN employees e1 ON e1.id = r.submitted_by
        WHERE r.id = ?
    `).get(Number(id)) as any;

    if (!report) {
        res.status(404).json({ error: 'الكشف غير موجود' });
        return;
    }

    const sessions = db.prepare(`
        SELECT s.*,
            e1.name as checkin_supervisor_name,
            e2.name as checkout_supervisor_name
        FROM support_sessions s
        LEFT JOIN employees e1 ON e1.id = s.checkin_supervisor_id
        LEFT JOIN employees e2 ON e2.id = s.checkout_supervisor_id
        WHERE s.report_id = ?
        ORDER BY 
            CASE s.group_type WHEN 'morning' THEN 0 WHEN 'afternoon' THEN 1 WHEN 'night' THEN 2 END
    `).all(Number(id)) as any[];

    for (const session of sessions) {
        session.records = db.prepare(`
            SELECT sar.*, e.name as employee_name, e.role as employee_role, e.support_group
            FROM support_attendance_records sar
            JOIN employees e ON e.id = sar.employee_id
            WHERE sar.session_id = ?
            ORDER BY e.name
        `).all(session.id);
    }

    res.json({ report, sessions });
});

// GET /api/support-attendance/my-status - Get support employee's current status
router.get('/my-status', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;

    if (!user.support_group) {
        res.json({ is_support: false });
        return;
    }

    const today = getToday();
    const report = db.prepare('SELECT id, status FROM support_daily_reports WHERE date = ?').get(today) as any;

    if (!report) {
        res.json({ is_support: true, has_session: false });
        return;
    }

    const session = db.prepare(`
        SELECT id, checkin_status, checkout_status, group_type
        FROM support_sessions WHERE report_id = ? AND group_type = ?
    `).get(report.id, user.support_group) as any;

    if (!session) {
        res.json({ is_support: true, has_session: false });
        return;
    }

    const record = db.prepare(
        'SELECT * FROM support_attendance_records WHERE session_id = ? AND employee_id = ?'
    ).get(session.id, user.id) as any;

    res.json({
        is_support: true,
        has_session: true,
        report_status: report.status,
        session,
        record: record || null,
    });
});

export default router;
