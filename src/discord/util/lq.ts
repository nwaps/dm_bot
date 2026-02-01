import { role_tracking_model } from "../models/lq";

export async function addRoleAssignment(
    user_id: string,
    role_id: string,
    assigned_by?: string | null
): Promise<void> {
    const now = new Date();
    
    const tracking = await role_tracking_model.findOne({ user_id });
    
    if (tracking) {
        // Check if user already has this role active
        const existingActive = tracking.role_assignments.find(
            a => a.role_id === role_id && a.is_active
        );
        
        if (existingActive) {
            // console.log(`User ${user_id} already has role ${role_id} active`);
            return;
        }
        
        tracking.role_assignments.push({
            role_id,
            assigned_at: now,
            is_active: true,
            assigned_by: assigned_by || undefined
        });
        
        await tracking.save();
    } else {
        await role_tracking_model.create({
            user_id,
            role_assignments: [{
                role_id,
                assigned_at: now,
                is_active: true,
                assigned_by: assigned_by || undefined
            }]
        });
    }
}

export async function removeRoleAssignment(
    user_id: string,
    role_id: string,
    removed_by?: string | null
): Promise<void> {
    const now = new Date();
    
    const tracking = await role_tracking_model.findOne({ user_id });
    
    if (!tracking) {
        console.log(`No tracking found for user ${user_id}`);
        return;
    }
    
    const activeAssignment = tracking.role_assignments.find(
        a => a.role_id === role_id && a.is_active
    );
    
    if (!activeAssignment) {
        console.log(`No active assignment found for role ${role_id} and user ${user_id}`);
        return;
    }
    
    activeAssignment.removed_at = now;
    activeAssignment.is_active = false;
    activeAssignment.removed_by = removed_by || undefined;
    
    await tracking.save();
}