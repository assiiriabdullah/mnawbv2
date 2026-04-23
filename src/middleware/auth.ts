import { Request, Response, NextFunction } from 'express';

// Extend session to include user data
declare module 'express-session' {
    interface SessionData {
        user?: {
            id: number;
            name: string;
            username: string;
            role: 'general_manager' | 'dept_manager' | 'supervisor' | 'operator';
            department: string | null;
            shift: string | null;
            support_group: string | null;
        };
    }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (!req.session.user) {
        res.status(401).json({ error: 'غير مصرح - يرجى تسجيل الدخول' });
        return;
    }
    next();
}

// Requires general_manager role only
export function requireGeneralManager(req: Request, res: Response, next: NextFunction): void {
    if (!req.session.user) {
        res.status(401).json({ error: 'غير مصرح - يرجى تسجيل الدخول' });
        return;
    }
    if (req.session.user.role !== 'general_manager') {
        res.status(403).json({ error: 'غير مصرح - صلاحية المدير العام فقط' });
        return;
    }
    next();
}

// Requires general_manager or dept_manager role
export function requireManager(req: Request, res: Response, next: NextFunction): void {
    if (!req.session.user) {
        res.status(401).json({ error: 'غير مصرح - يرجى تسجيل الدخول' });
        return;
    }
    if (req.session.user.role !== 'general_manager' && req.session.user.role !== 'dept_manager') {
        res.status(403).json({ error: 'غير مصرح - صلاحية المدير فقط' });
        return;
    }
    next();
}

// Helper: check if user is general manager
export function isGeneralManager(req: Request): boolean {
    return req.session.user?.role === 'general_manager';
}

// Helper: check if user can manage a specific department
export function canManageDepartment(req: Request, department: string | null): boolean {
    const user = req.session.user;
    if (!user) return false;
    if (user.role === 'general_manager') return true;
    if (user.role === 'dept_manager' && user.department === department) return true;
    return false;
}
