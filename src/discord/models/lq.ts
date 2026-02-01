import { Schema, model, Model, Document } from "mongoose";

export interface RoleAssignment {
    role_id: string;
    assigned_at: Date;
    removed_at?: Date;
    is_active: boolean;
    assigned_by?: string; // User ID of who assigned the role
    removed_by?: string;  // User ID of who removed the role
}

export interface db_role_tracking {
    user_id: string;
    role_assignments: RoleAssignment[];
    inserver: boolean;
}

const roleAssignmentSchema = new Schema<RoleAssignment>({
    role_id: { type: String, required: true },
    assigned_at: { type: Date, required: true },
    removed_at: { type: Date, default: null },
    is_active: { type: Boolean, default: true },
    assigned_by: { type: String, default: null }, // New field
    removed_by: { type: String, default: null }   // New field
}, { _id: false });

const roleTrackingSchema = new Schema<db_role_tracking>({
    user_id: { type: String, required: true, unique: true },
    role_assignments: { type: [roleAssignmentSchema], required: true },
    inserver: { type: Boolean, default: true }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    collection: 'lq_tracking'
});

// Virtual property for current active roles
roleTrackingSchema.virtual('active_roles').get(function () {
    return this.role_assignments.filter(assignment => assignment.is_active);
});

roleTrackingSchema.index({ 'role_assignments.role_id': 1, 'role_assignments.is_active': 1 });

export const role_tracking_model = model<db_role_tracking>('RoleTracking', roleTrackingSchema);

// Updated functions to include assigner information

export function getRoleDuration(tracking: db_role_tracking, role_id: string): number | null {
    const assignment = tracking.role_assignments.find((a: RoleAssignment) => a.role_id === role_id && a.is_active);
    if (!assignment) return null;

    const now = new Date();
    return now.getTime() - assignment.assigned_at.getTime();
}

export async function getUsersWithRole(role_id: string): Promise<Array<Document<unknown, any, db_role_tracking> & db_role_tracking>> {
    return await role_tracking_model.find({
        'role_assignments': {
            $elemMatch: {
                role_id: role_id,
                is_active: true,
            }
        },
        inserver: true
    });
}

export async function auditRole(role_id: string): Promise<Array<{
    user_id: string;
    assigned_at: Date;
    assigned_by?: string;
    duration_ms: number;
    duration_hours: number;
    duration_days: number;
}>> {
    const users = await getUsersWithRole(role_id);

    return users.map((user: any) => {
        const assignment = user.role_assignments.find((a: RoleAssignment) => a.role_id === role_id && a.is_active);
        if (!assignment) return null;

        const duration = new Date().getTime() - assignment.assigned_at.getTime();

        return {
            user_id: user.user_id,
            assigned_at: assignment.assigned_at,
            assigned_by: assignment.assigned_by,
            duration_ms: duration,
            duration_hours: Math.floor(duration / (1000 * 60 * 60)),
            duration_days: Math.floor(duration / (1000 * 60 * 60 * 24))
        };
    }).filter(Boolean) as Array<{
        user_id: string;
        assigned_at: Date;
        assigned_by?: string;
        duration_ms: number;
        duration_hours: number;
        duration_days: number;
    }>;
}

export async function getCurrentNickname(user_id: string): Promise<string | null> {
    const user = await role_tracking_model.findOne({ user_id }, { role_assignments: { $slice: -1 } });
    return user?.role_assignments[0]?.role_id || null;
}

// Updated to include assigner information
export async function getUserRoleHistory(user_id: string, role_id?: string, active?: boolean) {
    const tracking = await role_tracking_model.findOne({ user_id });
    if (!tracking) return [];

    let assignments = tracking.role_assignments;
    if (role_id) {
        assignments = assignments.filter(a => a.role_id === role_id);
    }

    if(active){
        assignments = assignments.filter(a=> a.is_active)
    }

    return assignments.sort((a, b) => b.assigned_at.getTime() - a.assigned_at.getTime());
}

export async function getTotalRoleTime(user_id: string, role_id: string) {
    const tracking = await role_tracking_model.findOne({ user_id });
    if (!tracking) return 0;

    const roleAssignments = tracking.role_assignments.filter(a => a.role_id === role_id);

    let totalTime = 0;
    for (const assignment of roleAssignments) {
        const endTime = assignment.removed_at || new Date();
        totalTime += endTime.getTime() - assignment.assigned_at.getTime();
    }

    return totalTime;
}

export async function getUserRoleDuration(user_id: string, role_id: string): Promise<number | null> {
    const tracking = await role_tracking_model.findOne({ user_id });
    if (!tracking) return null;

    return getRoleDuration(tracking, role_id);
}

export async function setUserInServer(user_id: string, inserver: boolean): Promise<boolean> {
    const result = await role_tracking_model.updateOne(
        { user_id },
        { $set: { inserver } }
    );

    return result.modifiedCount > 0;
}

// New function to get role assignment details including who assigned it
export async function getRoleAssignmentDetails(user_id: string, role_id: string): Promise<{
    assigned_at: Date;
    assigned_by?: string;
    removed_at?: Date;
    removed_by?: string;
    is_active: boolean;
} | null> {
    const tracking = await role_tracking_model.findOne({ user_id });
    if (!tracking) return null;

    const assignment = tracking.role_assignments.find(a => a.role_id === role_id && a.is_active);
    if (!assignment) return null;

    return {
        assigned_at: assignment.assigned_at,
        assigned_by: assignment.assigned_by,
        removed_at: assignment.removed_at,
        removed_by: assignment.removed_by,
        is_active: assignment.is_active
    };
}