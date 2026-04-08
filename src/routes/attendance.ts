import { Router, Request, Response } from 'express';
import db, { logActivity } from '../database';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Helper: check if user is supervisor
function isSupervisor(req: Request): boolean {
    return req.session.user?.role === 'supervisor';
}

// Helper: check if user is manager (dept_manager or general_manager)
function isManager(req: Request): boolean {
    const role = req.session.user?.role;
    return role === 'general_manager' || role === 'dept_manager';
}

// Middleware: require supervisor role
function requireSupervisor(req: Request, res: Response, next: Function): void {
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

// ========== SESSION ENDPOINTS ==========

// POST /api/attendance/sessions - Open new attendance session
router.post('/sessions', requireSupervisor, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { shift_start_time, shift_end_time } = req.body;

    if (!user.shift) {
        res.status(400).json({ error: 'لا يمكنك فتح جلسة تحضير - لم يتم تعيين مناوبة لك' });
        return;
    }

    const today = new Date().toISOString().split('T')[0];

    // Check if session already exists for this shift/date
    const existing = db.prepare(
        'SELECT id, status FROM attendance_sessions WHERE shift = ? AND date = ?'
    ).get(user.shift, today) as any;

    if (existing) {
        if (existing.status === 'approved') {
            res.status(400).json({ error: 'تم اعتماد جلسة التحضير لهذا اليوم بالفعل' });
            return;
        }
        // Return existing open/closed session
        res.json({ message: 'جلسة التحضير موجودة بالفعل', id: existing.id, status: existing.status });
        return;
    }

    try {
        const result = db.prepare(`
            INSERT INTO attendance_sessions (supervisor_id, shift, date, shift_start_time, shift_end_time)
            VALUES (?, ?, ?, ?, ?)
        `).run(user.id, user.shift, today, shift_start_time || null, shift_end_time || null);

        const sessionId = result.lastInsertRowid;

        // Create attendance records for all employees in this shift
        const shiftEmployees = db.prepare(`
            SELECT id FROM employees 
            WHERE shift = ? AND department = 'shifts' AND role IN ('supervisor', 'operator')
        `).all(user.shift) as any[];

        const insertRecord = db.prepare(`
            INSERT INTO attendance_records (session_id, employee_id) VALUES (?, ?)
        `);

        for (const emp of shiftEmployees) {
            insertRecord.run(sessionId, emp.id);
        }

        logActivity(user.id, user.name, 'فتح جلسة تحضير', 'تحضير', `مناوبة ${user.shift}`, `التاريخ: ${today}`);

        res.status(201).json({
            message: 'تم فتح جلسة التحضير بنجاح',
            id: sessionId,
            employee_count: shiftEmployees.length,
        });
    } catch (err) {
        res.status(500).json({ error: 'حدث خطأ أثناء فتح جلسة التحضير' });
    }
});

// GET /api/attendance/sessions/current - Get current open session for supervisor
router.get('/sessions/current', requireSupervisor, (req: Request, res: Response) => {
    const user = req.session.user!;
    const today = new Date().toISOString().split('T')[0];

    const session = db.prepare(`
        SELECT s.*, e.name as supervisor_name
        FROM attendance_sessions s
        JOIN employees e ON e.id = s.supervisor_id
        WHERE s.shift = ? AND s.date = ?
    `).get(user.shift, today) as any;

    if (!session) {
        res.json({ session: null });
        return;
    }

    // Get records with employee info
    const records = db.prepare(`
        SELECT ar.*, e.name as employee_name, e.role as employee_role, e.username as employee_username
        FROM attendance_records ar
        JOIN employees e ON e.id = ar.employee_id
        WHERE ar.session_id = ?
        ORDER BY 
            CASE e.role WHEN 'supervisor' THEN 0 ELSE 1 END,
            e.name
    `).all(session.id);

    res.json({ session, records });
});

// GET /api/attendance/sessions/:id - Get session details
router.get('/sessions/:id', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { id } = req.params;

    const session = db.prepare(`
        SELECT s.*, e.name as supervisor_name
        FROM attendance_sessions s
        JOIN employees e ON e.id = s.supervisor_id
        WHERE s.id = ?
    `).get(Number(id)) as any;

    if (!session) {
        res.status(404).json({ error: 'الجلسة غير موجودة' });
        return;
    }

    // Supervisors can only see their own shift sessions
    if (isSupervisor(req) && session.shift !== user.shift) {
        res.status(403).json({ error: 'لا يمكنك الاطلاع على جلسة مناوبة أخرى' });
        return;
    }

    const records = db.prepare(`
        SELECT ar.*, e.name as employee_name, e.role as employee_role
        FROM attendance_records ar
        JOIN employees e ON e.id = ar.employee_id
        WHERE ar.session_id = ?
        ORDER BY 
            CASE e.role WHEN 'supervisor' THEN 0 ELSE 1 END,
            e.name
    `).all(Number(id));

    res.json({ session, records });
});

// PUT /api/attendance/sessions/:id/close - Close session
router.put('/sessions/:id/close', requireSupervisor, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { id } = req.params;

    const session = db.prepare('SELECT * FROM attendance_sessions WHERE id = ?').get(Number(id)) as any;

    if (!session) {
        res.status(404).json({ error: 'الجلسة غير موجودة' });
        return;
    }
    if (session.shift !== user.shift) {
        res.status(403).json({ error: 'لا يمكنك إغلاق جلسة مناوبة أخرى' });
        return;
    }
    if (session.status === 'approved') {
        res.status(400).json({ error: 'الجلسة معتمدة بالفعل ولا يمكن تعديلها' });
        return;
    }

    db.prepare('UPDATE attendance_sessions SET status = ? WHERE id = ?').run('closed', Number(id));
    logActivity(user.id, user.name, 'إغلاق جلسة تحضير', 'تحضير', `مناوبة ${user.shift}`);

    res.json({ message: 'تم إغلاق جلسة التحضير' });
});

// PUT /api/attendance/sessions/:id/times - Update shift start/end times
router.put('/sessions/:id/times', requireSupervisor, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { id } = req.params;
    const { shift_start_time, shift_end_time } = req.body;

    const session = db.prepare('SELECT * FROM attendance_sessions WHERE id = ?').get(Number(id)) as any;

    if (!session) {
        res.status(404).json({ error: 'الجلسة غير موجودة' });
        return;
    }
    if (session.shift !== user.shift) {
        res.status(403).json({ error: 'لا يمكنك تعديل جلسة مناوبة أخرى' });
        return;
    }
    if (session.status === 'approved') {
        res.status(400).json({ error: 'الجلسة معتمدة ولا يمكن تعديلها' });
        return;
    }

    db.prepare(`
        UPDATE attendance_sessions SET shift_start_time = ?, shift_end_time = ? WHERE id = ?
    `).run(shift_start_time || null, shift_end_time || null, Number(id));

    res.json({ message: 'تم تحديث أوقات المناوبة' });
});

// PUT /api/attendance/sessions/:id/approve - Approve session (send to management)
router.put('/sessions/:id/approve', requireSupervisor, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { id } = req.params;
    const { notes, supervisor_signature, shift_start_time, shift_end_time } = req.body;

    const session = db.prepare('SELECT * FROM attendance_sessions WHERE id = ?').get(Number(id)) as any;

    if (!session) {
        res.status(404).json({ error: 'الجلسة غير موجودة' });
        return;
    }
    if (session.shift !== user.shift) {
        res.status(403).json({ error: 'لا يمكنك اعتماد جلسة مناوبة أخرى' });
        return;
    }
    if (session.status === 'approved') {
        res.status(400).json({ error: 'الجلسة معتمدة بالفعل' });
        return;
    }
    if (!supervisor_signature) {
        res.status(400).json({ error: 'توقيع المشرف مطلوب لاعتماد الكشف' });
        return;
    }

    db.prepare(`
        UPDATE attendance_sessions 
        SET status = 'approved', notes = ?, supervisor_signature = ?,
            shift_start_time = COALESCE(?, shift_start_time),
            shift_end_time = COALESCE(?, shift_end_time),
            approved_at = datetime('now') 
        WHERE id = ?
    `).run(
        notes || session.notes || null,
        supervisor_signature,
        shift_start_time || null,
        shift_end_time || null,
        Number(id)
    );

    logActivity(user.id, user.name, 'اعتماد سجل حضور', 'تحضير', `مناوبة ${user.shift}`, `التاريخ: ${session.date}`);

    res.json({ message: 'تم اعتماد سجل الحضور وإرساله لإدارة المناوبات' });
});

// ========== ATTENDANCE RECORD ENDPOINTS ==========

// POST /api/attendance/check-in - Employee check-in with signature
router.post('/check-in', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { signature } = req.body;

    if (!user.shift) {
        res.status(400).json({ error: 'لم يتم تعيين مناوبة لك' });
        return;
    }

    if (!signature) {
        res.status(400).json({ error: 'التوقيع مطلوب لتسجيل الحضور' });
        return;
    }

    const today = new Date().toISOString().split('T')[0];

    // Find open session for this shift today
    const session = db.prepare(`
        SELECT id FROM attendance_sessions 
        WHERE shift = ? AND date = ? AND status IN ('open', 'closed')
    `).get(user.shift, today) as any;

    if (!session) {
        res.status(400).json({ error: 'لا توجد جلسة تحضير مفتوحة لمناوبتك اليوم' });
        return;
    }

    // Check if already checked in
    const record = db.prepare(
        'SELECT * FROM attendance_records WHERE session_id = ? AND employee_id = ?'
    ).get(session.id, user.id) as any;

    if (!record) {
        // Create a record if it doesn't exist (e.g., employee added after session opened)
        db.prepare(`
            INSERT INTO attendance_records (session_id, employee_id, check_in_time, check_in_signature, status)
            VALUES (?, ?, datetime('now'), ?, 'present')
        `).run(session.id, user.id, signature);
    } else {
        if (record.check_in_time) {
            res.status(400).json({ error: 'تم تسجيل حضورك بالفعل' });
            return;
        }
        db.prepare(`
            UPDATE attendance_records 
            SET check_in_time = datetime('now'), check_in_signature = ?, status = 'present'
            WHERE session_id = ? AND employee_id = ?
        `).run(signature, session.id, user.id);
    }

    res.json({ message: 'تم تسجيل حضورك بنجاح' });
});

// POST /api/attendance/check-out - Employee check-out with signature
router.post('/check-out', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { signature } = req.body;

    if (!user.shift) {
        res.status(400).json({ error: 'لم يتم تعيين مناوبة لك' });
        return;
    }

    if (!signature) {
        res.status(400).json({ error: 'التوقيع مطلوب لتسجيل الانصراف' });
        return;
    }

    const today = new Date().toISOString().split('T')[0];

    const session = db.prepare(`
        SELECT id FROM attendance_sessions 
        WHERE shift = ? AND date = ? AND status IN ('open', 'closed')
    `).get(user.shift, today) as any;

    if (!session) {
        res.status(400).json({ error: 'لا توجد جلسة تحضير لمناوبتك اليوم' });
        return;
    }

    const record = db.prepare(
        'SELECT * FROM attendance_records WHERE session_id = ? AND employee_id = ?'
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
        UPDATE attendance_records 
        SET check_out_time = datetime('now'), check_out_signature = ?
        WHERE session_id = ? AND employee_id = ?
    `).run(signature, session.id, user.id);

    res.json({ message: 'تم تسجيل انصرافك بنجاح' });
});

// PUT /api/attendance/records/:id - Update record status/note (supervisor only)
router.put('/records/:id', requireSupervisor, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { id } = req.params;
    const { status, note } = req.body;

    const record = db.prepare(`
        SELECT ar.*, s.shift, s.status as session_status
        FROM attendance_records ar
        JOIN attendance_sessions s ON s.id = ar.session_id
        WHERE ar.id = ?
    `).get(Number(id)) as any;

    if (!record) {
        res.status(404).json({ error: 'السجل غير موجود' });
        return;
    }

    if (record.shift !== user.shift) {
        res.status(403).json({ error: 'لا يمكنك تعديل سجل مناوبة أخرى' });
        return;
    }

    if (record.session_status === 'approved') {
        res.status(400).json({ error: 'الجلسة معتمدة ولا يمكن تعديل السجلات' });
        return;
    }

    if (status && !['present', 'absent', 'late', 'excused'].includes(status)) {
        res.status(400).json({ error: 'حالة غير صالحة' });
        return;
    }

    if (status && note !== undefined) {
        db.prepare('UPDATE attendance_records SET status = ?, note = ? WHERE id = ?')
            .run(status, note, Number(id));
    } else if (status) {
        db.prepare('UPDATE attendance_records SET status = ? WHERE id = ?')
            .run(status, Number(id));
    } else if (note !== undefined) {
        db.prepare('UPDATE attendance_records SET note = ? WHERE id = ?')
            .run(note, Number(id));
    }

    res.json({ message: 'تم تحديث السجل بنجاح' });
});

// ========== MANAGEMENT ENDPOINTS ==========

// GET /api/attendance/approved - Get approved sessions (for management dashboard)
router.get('/approved', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;

    // Only managers and general_manager can view approved sessions
    if (!isManager(req)) {
        res.status(403).json({ error: 'غير مصرح' });
        return;
    }

    const { shift, date_from, date_to } = req.query;

    let query = `
        SELECT s.*, e.name as supervisor_name,
            (SELECT COUNT(*) FROM attendance_records WHERE session_id = s.id AND status = 'present') as present_count,
            (SELECT COUNT(*) FROM attendance_records WHERE session_id = s.id AND status = 'absent') as absent_count,
            (SELECT COUNT(*) FROM attendance_records WHERE session_id = s.id AND status = 'late') as late_count,
            (SELECT COUNT(*) FROM attendance_records WHERE session_id = s.id AND status = 'excused') as excused_count,
            (SELECT COUNT(*) FROM attendance_records WHERE session_id = s.id) as total_count
        FROM attendance_sessions s
        JOIN employees e ON e.id = s.supervisor_id
        WHERE s.status = 'approved'
    `;
    const params: any[] = [];

    if (shift) {
        query += ' AND s.shift = ?';
        params.push(shift);
    }
    if (date_from) {
        query += ' AND s.date >= ?';
        params.push(date_from);
    }
    if (date_to) {
        query += ' AND s.date <= ?';
        params.push(date_to);
    }

    query += ' ORDER BY s.date DESC, s.shift';

    const sessions = db.prepare(query).all(...params);
    res.json(sessions);
});

// GET /api/attendance/approved/:id - Full session detail for management
router.get('/approved/:id', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;
    if (!isManager(req)) {
        res.status(403).json({ error: 'غير مصرح' });
        return;
    }

    const { id } = req.params;

    const session = db.prepare(`
        SELECT s.*, e.name as supervisor_name
        FROM attendance_sessions s
        JOIN employees e ON e.id = s.supervisor_id
        WHERE s.id = ? AND s.status = 'approved'
    `).get(Number(id)) as any;

    if (!session) {
        res.status(404).json({ error: 'الجلسة غير موجودة' });
        return;
    }

    const records = db.prepare(`
        SELECT ar.*, e.name as employee_name, e.role as employee_role, e.username as employee_username
        FROM attendance_records ar
        JOIN employees e ON e.id = ar.employee_id
        WHERE ar.session_id = ?
        ORDER BY 
            CASE e.role WHEN 'supervisor' THEN 0 ELSE 1 END,
            e.name
    `).all(Number(id));

    res.json({ session, records });
});

// ========== SIGNATURE ENDPOINTS ==========

// POST /api/attendance/signature - Save/update default signature
router.post('/signature', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { signature_data } = req.body;

    if (!signature_data) {
        res.status(400).json({ error: 'بيانات التوقيع مطلوبة' });
        return;
    }

    const existing = db.prepare('SELECT id FROM employee_signatures WHERE employee_id = ?').get(user.id);

    if (existing) {
        db.prepare(`UPDATE employee_signatures SET signature_data = ?, updated_at = datetime('now') WHERE employee_id = ?`)
            .run(signature_data, user.id);
    } else {
        db.prepare('INSERT INTO employee_signatures (employee_id, signature_data) VALUES (?, ?)')
            .run(user.id, signature_data);
    }

    res.json({ message: 'تم حفظ التوقيع بنجاح' });
});

// GET /api/attendance/signature - Get saved signature
router.get('/signature', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;

    const sig = db.prepare('SELECT signature_data FROM employee_signatures WHERE employee_id = ?').get(user.id) as any;

    res.json({ signature_data: sig ? sig.signature_data : null });
});

// GET /api/attendance/my-status - Get current employee attendance status for today
router.get('/my-status', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;

    if (!user.shift) {
        res.json({ has_session: false });
        return;
    }

    const today = new Date().toISOString().split('T')[0];

    const session = db.prepare(`
        SELECT id, status FROM attendance_sessions 
        WHERE shift = ? AND date = ?
    `).get(user.shift, today) as any;

    if (!session) {
        res.json({ has_session: false });
        return;
    }

    const record = db.prepare(
        'SELECT * FROM attendance_records WHERE session_id = ? AND employee_id = ?'
    ).get(session.id, user.id) as any;

    res.json({
        has_session: true,
        session_status: session.status,
        record: record || null,
    });
});

export default router;
