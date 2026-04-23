import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import db, { logActivity } from '../database';
import { requireAuth } from '../middleware/auth';

const router = Router();

// POST /api/auth/login
router.post('/login', (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
        res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
        return;
    }

    const employee = db.prepare('SELECT * FROM employees WHERE username = ?').get(username) as any;

    if (!employee) {
        res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        return;
    }

    const validPassword = bcrypt.compareSync(password, employee.password);
    if (!validPassword) {
        res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        return;
    }

    req.session.user = {
        id: employee.id,
        name: employee.name,
        username: employee.username,
        role: employee.role,
        department: employee.department,
        shift: employee.shift,
        support_group: employee.support_group || null,
    };

    logActivity(employee.id, employee.name, 'تسجيل دخول', 'نظام');

    res.json({
        message: 'تم تسجيل الدخول بنجاح',
        user: req.session.user,
    });
});

// POST /api/auth/logout
router.post('/logout', (req: Request, res: Response) => {
    const user = req.session.user;
    if (user) {
        logActivity(user.id, user.name, 'تسجيل خروج', 'نظام');
    }
    req.session.destroy((err) => {
        if (err) {
            res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الخروج' });
            return;
        }
        res.json({ message: 'تم تسجيل الخروج بنجاح' });
    });
});

// GET /api/auth/me
router.get('/me', (req: Request, res: Response) => {
    if (!req.session.user) {
        res.status(401).json({ error: 'غير مسجل الدخول' });
        return;
    }
    // Fetch fresh data including leave balance and department
    const employee = db.prepare('SELECT id, name, username, role, department, shift, support_group, annual_leave_balance FROM employees WHERE id = ?').get(req.session.user.id) as any;
    if (!employee) {
        res.status(401).json({ error: 'المستخدم غير موجود' });
        return;
    }
    res.json({ user: { ...employee } });
});

// PUT /api/auth/change-password
router.put('/change-password', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
        res.status(400).json({ error: 'كلمة المرور الحالية والجديدة مطلوبتان' });
        return;
    }

    if (new_password.length < 4) {
        res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل' });
        return;
    }

    const employee = db.prepare('SELECT password FROM employees WHERE id = ?').get(user.id) as any;
    if (!employee) {
        res.status(404).json({ error: 'المستخدم غير موجود' });
        return;
    }

    const validPassword = bcrypt.compareSync(current_password, employee.password);
    if (!validPassword) {
        res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
        return;
    }

    const hashedPassword = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE employees SET password = ? WHERE id = ?').run(hashedPassword, user.id);

    logActivity(user.id, user.name, 'تغيير كلمة المرور', 'حساب');

    res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
});

export default router;
