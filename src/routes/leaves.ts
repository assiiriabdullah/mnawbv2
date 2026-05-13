import { Router, Request, Response } from 'express';
import db, { logActivity } from '../database';
import { requireAuth, requireManager, requireSupervisorOrManager, isGeneralManager, isSupervisor } from '../middleware/auth';

const router = Router();

// Helper: calculate number of days between two dates
function calcDays(start: string, end: string): number {
    const s = new Date(start);
    const e = new Date(end);
    const diff = e.getTime() - s.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
}

// Helper: get all months a leave spans
function getMonthsInRange(start: string, end: string): string[] {
    const months: string[] = [];
    const startDate = new Date(start);
    const endDate = new Date(end);
    const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (current <= endDate) {
        months.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`);
        current.setMonth(current.getMonth() + 1);
    }
    return months;
}

// Helper: count approved leaves in a specific month for a shift
function countApprovedLeavesInMonth(shift: string, month: string, excludeEmployeeId?: number): number {
    const [year, mon] = month.split('-');
    const monthStart = `${year}-${mon}-01`;
    const nextMonth = parseInt(mon) === 12
        ? `${parseInt(year) + 1}-01-01`
        : `${year}-${String(parseInt(mon) + 1).padStart(2, '0')}-01`;

    let query = `
        SELECT COUNT(DISTINCT l.employee_id) as count
        FROM leaves l
        JOIN employees e ON l.employee_id = e.id
        WHERE e.shift = ?
        AND l.status = 'approved'
        AND l.start_date < ?
        AND l.end_date >= ?
    `;
    const params: any[] = [shift, nextMonth, monthStart];

    if (excludeEmployeeId) {
        query += ` AND l.employee_id != ?`;
        params.push(excludeEmployeeId);
    }

    const result = db.prepare(query).get(...params) as any;
    return result?.count || 0;
}

// Helper: get max leaves setting for a shift/month
function getMaxLeaves(shift: string, month: string): number {
    const setting = db.prepare(
        'SELECT max_leaves FROM shift_leave_settings WHERE shift = ? AND month = ?'
    ).get(shift, month) as any;
    return setting?.max_leaves ?? 8; // default 8 if not configured
}

// GET /api/leaves - Get leaves based on role
router.get('/', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;

    if (user.role === 'general_manager') {
        // General manager sees all leaves
        const leaves = db.prepare(`
            SELECT l.*, e.name as employee_name, e.role as employee_role, e.shift as employee_shift, e.department as employee_department, e.sub_department as employee_sub_department
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            ORDER BY l.created_at DESC
        `).all();
        res.json(leaves);
    } else if (user.role === 'dept_manager') {
        // Department manager sees leaves from their department
        const leaves = db.prepare(`
            SELECT l.*, e.name as employee_name, e.role as employee_role, e.shift as employee_shift, e.department as employee_department, e.sub_department as employee_sub_department
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            WHERE e.department = ? OR l.employee_id = ?
            ORDER BY l.created_at DESC
        `).all(user.department, user.id);
        res.json(leaves);
    } else if (user.role === 'supervisor') {
        // Supervisor sees their shift operators' leaves + own
        const leaves = db.prepare(`
            SELECT l.*, e.name as employee_name, e.role as employee_role, e.shift as employee_shift, e.department as employee_department, e.sub_department as employee_sub_department
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            WHERE (e.shift = ? AND e.role = 'operator' AND e.department = ?) OR l.employee_id = ?
            ORDER BY l.created_at DESC
        `).all(user.shift, user.department, user.id);
        res.json(leaves);
    } else {
        // Operator sees only their own leaves
        const leaves = db.prepare(`
            SELECT l.*, e.name as employee_name, e.role as employee_role, e.shift as employee_shift, e.department as employee_department, e.sub_department as employee_sub_department
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            WHERE l.employee_id = ?
            ORDER BY l.created_at DESC
        `).all(user.id);
        res.json(leaves);
    }
});

// GET /api/leaves/check-conflicts - Check leave conflicts before submitting
router.get('/check-conflicts', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
        res.status(400).json({ error: 'تاريخ البداية والنهاية مطلوبان' });
        return;
    }

    const shift = user.shift;
    if (!shift) {
        res.json({ conflicts: [], monthCounts: {}, canSubmit: true });
        return;
    }

    // Get all approved leaves that overlap with the requested dates
    const overlappingLeaves = db.prepare(`
        SELECT l.*, e.name as employee_name, e.shift as employee_shift
        FROM leaves l
        JOIN employees e ON l.employee_id = e.id
        WHERE e.shift = ?
        AND l.status IN ('approved', 'pending')
        AND l.employee_id != ?
        AND l.start_date <= ?
        AND l.end_date >= ?
        ORDER BY l.start_date
    `).all(shift, user.id, end_date, start_date) as any[];

    // Calculate overlapping days for each conflict
    const conflicts = overlappingLeaves.map(leave => {
        const overlapStart = new Date(Math.max(new Date(start_date as string).getTime(), new Date(leave.start_date).getTime()));
        const overlapEnd = new Date(Math.min(new Date(end_date as string).getTime(), new Date(leave.end_date).getTime()));
        const overlapDays: string[] = [];

        const current = new Date(overlapStart);
        while (current <= overlapEnd) {
            overlapDays.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
        }

        return {
            employee_name: leave.employee_name,
            leave_start: leave.start_date,
            leave_end: leave.end_date,
            status: leave.status,
            overlap_days: overlapDays,
        };
    });

    // Check monthly limits
    const months = getMonthsInRange(start_date as string, end_date as string);
    const monthCounts: Record<string, { count: number; max: number; full: boolean }> = {};
    let canSubmit = true;
    const fullMonths: string[] = [];

    for (const month of months) {
        const count = countApprovedLeavesInMonth(shift, month, user.id);
        const max = getMaxLeaves(shift, month);
        const isFull = count >= max;
        monthCounts[month] = { count, max, full: isFull };
        if (isFull) {
            canSubmit = false;
            fullMonths.push(month);
        }
    }

    res.json({
        conflicts,
        monthCounts,
        canSubmit,
        fullMonths,
        message: !canSubmit ? `الأشهر التالية ممتلئة: ${fullMonths.join(', ')}` : null,
    });
});

// GET /api/leaves/settings - Get leave settings for supervisor's shift
router.get('/settings', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;

    if (user.role !== 'supervisor') {
        res.status(403).json({ error: 'صلاحية ضباط المناوبات فقط' });
        return;
    }

    if (!user.shift) {
        res.status(400).json({ error: 'لا توجد مناوبة مرتبطة بحسابك' });
        return;
    }

    const settings = db.prepare(
        'SELECT * FROM shift_leave_settings WHERE shift = ? ORDER BY month'
    ).all(user.shift);

    res.json(settings);
});

// PUT /api/leaves/settings - Update leave settings (supervisor only)
router.put('/settings', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;

    if (user.role !== 'supervisor') {
        res.status(403).json({ error: 'صلاحية ضباط المناوبات فقط' });
        return;
    }

    if (!user.shift) {
        res.status(400).json({ error: 'لا توجد مناوبة مرتبطة بحسابك' });
        return;
    }

    const { month, max_leaves } = req.body;

    if (!month || max_leaves === undefined || max_leaves === null) {
        res.status(400).json({ error: 'الشهر والحد الأقصى مطلوبان' });
        return;
    }

    if (max_leaves < 0 || max_leaves > 50) {
        res.status(400).json({ error: 'الحد الأقصى يجب أن يكون بين 0 و 50' });
        return;
    }

    try {
        db.prepare(`
            INSERT INTO shift_leave_settings (supervisor_id, shift, month, max_leaves)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(shift, month) DO UPDATE SET max_leaves = ?, supervisor_id = ?, updated_at = datetime('now')
        `).run(user.id, user.shift, month, max_leaves, max_leaves, user.id);

        logActivity(user.id, user.name, 'تعديل إعدادات الإجازات', 'إعدادات', undefined,
            `مناوبة ${user.shift} - شهر ${month} - الحد: ${max_leaves}`);

        res.json({ message: 'تم تحديث الإعدادات بنجاح' });
    } catch (err) {
        res.status(500).json({ error: 'حدث خطأ أثناء تحديث الإعدادات' });
    }
});

// POST /api/leaves - Submit leave request
router.post('/', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;

    if (user.role === 'general_manager') {
        res.status(403).json({ error: 'المدير العام لا يقدم طلبات إجازة' });
        return;
    }

    const { start_date, end_date } = req.body;

    if (!start_date || !end_date) {
        res.status(400).json({ error: 'تاريخ البداية والنهاية مطلوبان' });
        return;
    }

    if (new Date(end_date) < new Date(start_date)) {
        res.status(400).json({ error: 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية' });
        return;
    }

    const days = calcDays(start_date, end_date);

    // Check remaining balance
    const emp = db.prepare('SELECT annual_leave_balance FROM employees WHERE id = ?').get(user.id) as any;
    if (emp && emp.annual_leave_balance < days) {
        res.status(400).json({ error: `رصيد الإجازات غير كافي. الرصيد المتبقي: ${emp.annual_leave_balance} يوم، المطلوب: ${days} يوم` });
        return;
    }

    // Check monthly limits if user has a shift
    if (user.shift) {
        const months = getMonthsInRange(start_date, end_date);
        const fullMonths: string[] = [];

        for (const month of months) {
            const count = countApprovedLeavesInMonth(user.shift, month, user.id);
            const max = getMaxLeaves(user.shift, month);
            if (count >= max) {
                fullMonths.push(month);
            }
        }

        if (fullMonths.length > 0) {
            // Get conflicting employees for the full months
            const conflictDetails = fullMonths.map(month => {
                const [year, mon] = month.split('-');
                const monthStart = `${year}-${mon}-01`;
                const nextMonth = parseInt(mon) === 12
                    ? `${parseInt(year) + 1}-01-01`
                    : `${year}-${String(parseInt(mon) + 1).padStart(2, '0')}-01`;

                const conflicting = db.prepare(`
                    SELECT DISTINCT e.name
                    FROM leaves l
                    JOIN employees e ON l.employee_id = e.id
                    WHERE e.shift = ?
                    AND l.status = 'approved'
                    AND l.start_date < ?
                    AND l.end_date >= ?
                    AND l.employee_id != ?
                `).all(user.shift, nextMonth, monthStart, user.id) as any[];

                return {
                    month,
                    employees: conflicting.map(c => c.name),
                };
            });

            res.status(400).json({
                error: `الشهر ممتلئ - تم الوصول للحد الأقصى للإجازات`,
                fullMonths,
                conflictDetails,
            });
            return;
        }
    }

    try {
        const result = db.prepare(`
            INSERT INTO leaves (employee_id, start_date, end_date)
            VALUES (?, ?, ?)
        `).run(user.id, start_date, end_date);

        logActivity(user.id, user.name, 'طلب إجازة', 'إجازة', undefined, `من ${start_date} إلى ${end_date} (${days} يوم)`);

        res.status(201).json({
            message: 'تم تقديم طلب الإجازة بنجاح',
            id: result.lastInsertRowid,
        });
    } catch (err) {
        res.status(500).json({ error: 'حدث خطأ أثناء تقديم الطلب' });
    }
});

// PUT /api/leaves/:id/approve - Approve leave (supervisor or manager)
router.put('/:id/approve', requireSupervisorOrManager, (req: Request, res: Response) => {
    const { id } = req.params;
    const approver = req.session.user!;
    const leave = db.prepare(`
        SELECT l.*, e.name as employee_name, e.department as employee_department, e.shift as employee_shift
        FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.id = ?
    `).get(Number(id)) as any;

    if (!leave) {
        res.status(404).json({ error: 'طلب الإجازة غير موجود' });
        return;
    }

    // Supervisor can only approve leaves of operators in their shift
    if (isSupervisor(req)) {
        if (leave.employee_shift !== approver.shift || leave.employee_department !== approver.department) {
            res.status(403).json({ error: 'لا يمكنك الموافقة على إجازة موظف من مناوبة أخرى' });
            return;
        }
    } else if (!isGeneralManager(req) && leave.employee_department !== approver.department) {
        // Dept manager can only approve leaves from their department
        res.status(403).json({ error: 'لا يمكنك الموافقة على إجازة موظف من إدارة أخرى' });
        return;
    }

    if (leave.status !== 'pending') {
        res.status(400).json({ error: 'لا يمكن تعديل حالة هذا الطلب' });
        return;
    }

    // Check monthly limits before approving
    if (leave.employee_shift) {
        const months = getMonthsInRange(leave.start_date, leave.end_date);
        for (const month of months) {
            const count = countApprovedLeavesInMonth(leave.employee_shift, month, leave.employee_id);
            const max = getMaxLeaves(leave.employee_shift, month);
            if (count >= max) {
                res.status(400).json({
                    error: `لا يمكن الموافقة - شهر ${month} وصل للحد الأقصى (${max} أفراد)`,
                });
                return;
            }
        }
    }

    const days = calcDays(leave.start_date, leave.end_date);

    // Deduct from balance
    db.prepare('UPDATE employees SET annual_leave_balance = annual_leave_balance - ? WHERE id = ?').run(days, leave.employee_id);
    db.prepare("UPDATE leaves SET status = 'approved' WHERE id = ?").run(Number(id));

    logActivity(approver.id, approver.name, 'موافقة على إجازة', 'إجازة', leave.employee_name, `${days} يوم`);

    res.json({ message: 'تمت الموافقة على الإجازة' });
});

// PUT /api/leaves/:id/reject - Reject leave (supervisor or manager)
router.put('/:id/reject', requireSupervisorOrManager, (req: Request, res: Response) => {
    const { id } = req.params;
    const rejector = req.session.user!;
    const leave = db.prepare(`
        SELECT l.*, e.name as employee_name, e.department as employee_department, e.shift as employee_shift
        FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.id = ?
    `).get(Number(id)) as any;

    if (!leave) {
        res.status(404).json({ error: 'طلب الإجازة غير موجود' });
        return;
    }

    // Supervisor can only reject leaves of operators in their shift
    if (isSupervisor(req)) {
        if (leave.employee_shift !== rejector.shift || leave.employee_department !== rejector.department) {
            res.status(403).json({ error: 'لا يمكنك رفض إجازة موظف من مناوبة أخرى' });
            return;
        }
    } else if (!isGeneralManager(req) && leave.employee_department !== rejector.department) {
        // Dept manager can only reject leaves from their department
        res.status(403).json({ error: 'لا يمكنك رفض إجازة موظف من إدارة أخرى' });
        return;
    }

    // If was approved, refund balance
    if (leave.status === 'approved') {
        const days = calcDays(leave.start_date, leave.end_date);
        db.prepare('UPDATE employees SET annual_leave_balance = annual_leave_balance + ? WHERE id = ?').run(days, leave.employee_id);
    }

    db.prepare("UPDATE leaves SET status = 'rejected' WHERE id = ?").run(Number(id));

    logActivity(rejector.id, rejector.name, 'رفض إجازة', 'إجازة', leave.employee_name);

    res.json({ message: 'تم رفض الإجازة' });
});

// DELETE /api/leaves/:id - Delete leave (manager only)
router.delete('/:id', requireManager, (req: Request, res: Response) => {
    const { id } = req.params;
    const manager = req.session.user!;
    const leave = db.prepare(`
        SELECT l.*, e.name as employee_name, e.department as employee_department 
        FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.id = ?
    `).get(Number(id)) as any;

    if (!leave) {
        res.status(404).json({ error: 'طلب الإجازة غير موجود' });
        return;
    }

    // Dept manager can only delete leaves from their department
    if (!isGeneralManager(req) && leave.employee_department !== manager.department) {
        res.status(403).json({ error: 'لا يمكنك حذف إجازة موظف من إدارة أخرى' });
        return;
    }

    // If was approved, refund balance
    if (leave.status === 'approved') {
        const days = calcDays(leave.start_date, leave.end_date);
        db.prepare('UPDATE employees SET annual_leave_balance = annual_leave_balance + ? WHERE id = ?').run(days, leave.employee_id);
    }

    db.prepare('DELETE FROM leaves WHERE id = ?').run(Number(id));

    logActivity(manager.id, manager.name, 'حذف إجازة', 'إجازة', leave.employee_name);

    res.json({ message: 'تم حذف الإجازة' });
});

export default router;
