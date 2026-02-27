import { Router, Request, Response } from 'express';
import db, { logActivity } from '../database';
import { requireAuth, requireManager, isGeneralManager } from '../middleware/auth';

const router = Router();

// GET /api/courses - Get courses based on role
router.get('/', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;

    if (user.role === 'general_manager') {
        const courses = db.prepare(`
            SELECT c.*, e.name as employee_name, e.role as employee_role, e.shift as employee_shift, e.department as employee_department
            FROM courses c
            JOIN employees e ON c.employee_id = e.id
            ORDER BY c.date DESC
        `).all();
        res.json(courses);
    } else if (user.role === 'dept_manager') {
        const courses = db.prepare(`
            SELECT c.*, e.name as employee_name, e.role as employee_role, e.shift as employee_shift, e.department as employee_department
            FROM courses c
            JOIN employees e ON c.employee_id = e.id
            WHERE e.department = ?
            ORDER BY c.date DESC
        `).all(user.department);
        res.json(courses);
    } else {
        const courses = db.prepare(`
            SELECT c.*, e.name as employee_name, e.role as employee_role, e.shift as employee_shift, e.department as employee_department
            FROM courses c
            JOIN employees e ON c.employee_id = e.id
            WHERE c.employee_id = ?
            ORDER BY c.date DESC
        `).all(user.id);
        res.json(courses);
    }
});

// GET /api/courses/nominations - Get employees ranked for nomination (manager only)
router.get('/nominations', requireManager, (req: Request, res: Response) => {
    const user = req.session.user!;
    const roleFilter = req.query.role as string;

    let query = `
        SELECT 
            e.id, e.name, e.role, e.shift, e.department, e.join_date,
            (SELECT MAX(c2.date) FROM courses c2 WHERE c2.employee_id = e.id) as last_course_date
        FROM employees e
        WHERE e.role NOT IN ('general_manager')
    `;

    const params: any[] = [];

    if (!isGeneralManager(req)) {
        query += ` AND e.department = ?`;
        params.push(user.department);
    }

    if (roleFilter && ['dept_manager', 'supervisor', 'operator'].includes(roleFilter)) {
        query += ` AND e.role = ?`;
        params.push(roleFilter);
    }

    query += `
        ORDER BY
            CASE WHEN (SELECT MAX(c2.date) FROM courses c2 WHERE c2.employee_id = e.id) IS NULL THEN 0 ELSE 1 END,
            (SELECT MAX(c2.date) FROM courses c2 WHERE c2.employee_id = e.id) ASC,
            e.join_date ASC
    `;

    const employees = db.prepare(query).all(...params);
    res.json(employees);
});

// POST /api/courses - Assign course to employee (manager only)
router.post('/', requireManager, (req: Request, res: Response) => {
    const { title, location, date, employee_id } = req.body;

    if (!title || !location || !date || !employee_id) {
        res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        return;
    }

    const employee = db.prepare('SELECT id, name, department FROM employees WHERE id = ?').get(Number(employee_id)) as any;
    if (!employee) {
        res.status(404).json({ error: 'الموظف غير موجود' });
        return;
    }

    // Dept manager can only assign courses to their department
    const manager = req.session.user!;
    if (!isGeneralManager(req) && employee.department !== manager.department) {
        res.status(403).json({ error: 'لا يمكنك إسناد دورة لموظف من إدارة أخرى' });
        return;
    }

    try {
        const result = db.prepare(`
            INSERT INTO courses (title, location, date, employee_id)
            VALUES (?, ?, ?, ?)
        `).run(title, location, date, Number(employee_id));

        logActivity(manager.id, manager.name, 'إسناد دورة', 'دورة', employee.name, title);

        res.status(201).json({
            message: 'تم إسناد الدورة بنجاح',
            id: result.lastInsertRowid,
        });
    } catch (err) {
        res.status(500).json({ error: 'حدث خطأ أثناء إسناد الدورة' });
    }
});

// PUT /api/courses/:id - Update course (manager only)
router.put('/:id', requireManager, (req: Request, res: Response) => {
    const { id } = req.params;
    const { title, location, date, employee_id } = req.body;

    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(Number(id)) as any;
    if (!course) {
        res.status(404).json({ error: 'الدورة غير موجودة' });
        return;
    }

    db.prepare(`
        UPDATE courses SET title = ?, location = ?, date = ?, employee_id = ?
        WHERE id = ?
    `).run(title, location, date, Number(employee_id), Number(id));

    res.json({ message: 'تم تعديل الدورة بنجاح' });
});

// DELETE /api/courses/:id - Delete course (manager only)
router.delete('/:id', requireManager, (req: Request, res: Response) => {
    const { id } = req.params;
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(Number(id)) as any;

    if (!course) {
        res.status(404).json({ error: 'الدورة غير موجودة' });
        return;
    }

    db.prepare('DELETE FROM courses WHERE id = ?').run(Number(id));

    const manager = req.session.user!;
    const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(course.employee_id) as any;
    logActivity(manager.id, manager.name, 'حذف دورة', 'دورة', emp?.name, course.title);

    res.json({ message: 'تم حذف الدورة بنجاح' });
});

export default router;
