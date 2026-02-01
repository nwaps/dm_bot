// server/models/cycle.ts
import { Schema, model } from "mongoose"

export interface db_cycle {
  cycleId: string;
  startDate: Date;
  applicationDeadline: Date;
  appointmentDate: Date;
  endDate: Date;
  isActive: boolean;
  isArchived: boolean;
}

const cycleSchema = new Schema<db_cycle>({
  cycleId: { type: String, required: true, unique: true },
  startDate: { type: Date, required: true },
  applicationDeadline: { type: Date, required: true },
  appointmentDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isActive: { type: Boolean, required: true, default: true },
  isArchived: { type: Boolean, required: true, default: false }
});

// Helper function to generate cycle ID (e.g., "2025-04")
export function generateCycleId(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Helper function to calculate dates for a cycle
export function calculateCycleDates(baseDate: Date = new Date()): {
  startDate: Date;
  applicationDeadline: Date;
  appointmentDate: Date;
  endDate: Date;
} {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  
  // Create a new date object for the first day of the current month
  const firstDayOfMonth = new Date(year, month, 1);
  
  // Create a new date object for the last day of the current month
  const lastDayOfMonth = new Date(year, month + 1, 0);
  
  // Application start date is 2 weeks before the end of the month
  const startDate = new Date(year, month, lastDayOfMonth.getDate() - 14);
  
  // Application deadline is the last day of the month
  const applicationDeadline = new Date(lastDayOfMonth);
  
  // Appointment date is the first day of the next month
  const appointmentDate = new Date(year, month + 1, 1);
  
  // End date is the last day of the next month
  const endDate = new Date(year, month + 2, 0);
  
  return {
    startDate,
    applicationDeadline,
    appointmentDate,
    endDate
  };
}

// Helper function to find or create the current cycle
export async function getCurrentCycle(): Promise<db_cycle> {
  const now = new Date();
  const currentCycleId = generateCycleId(now);
  
  // Try to find the current cycle
  let cycle = await Cycle.findOne({ cycleId: currentCycleId });
  
  // If the cycle doesn't exist, create it
  if (!cycle) {
    const cycleDates = calculateCycleDates(now);
    cycle = await Cycle.create({
      cycleId: currentCycleId,
      ...cycleDates,
      isActive: true,
      isArchived: false
    });
  } 
  // If cycle exists but is missing date fields, update it
  else if (!cycle.startDate || !cycle.applicationDeadline || !cycle.appointmentDate || !cycle.endDate) {
    const cycleDates = calculateCycleDates(now);
    
    // Update the cycle with the calculated dates
    cycle = await Cycle.findOneAndUpdate(
      { cycleId: currentCycleId },
      { 
        $set: { 
          startDate: cycleDates.startDate,
          applicationDeadline: cycleDates.applicationDeadline,
          appointmentDate: cycleDates.appointmentDate,
          endDate: cycleDates.endDate
        } 
      },
      { new: true }
    );
    
    console.log(`Updated existing cycle ${currentCycleId} with missing date fields`);
  }
  
  return cycle!;
}

// Helper function to get the upcoming cycle
export async function getUpcomingCycle(): Promise<db_cycle> {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const upcomingCycleId = generateCycleId(nextMonth);
  
  // Try to find the upcoming cycle
  let cycle = await Cycle.findOne({ cycleId: upcomingCycleId });
  
  // If the cycle doesn't exist, create it
  if (!cycle) {
    const cycleDates = calculateCycleDates(nextMonth);
    cycle = await Cycle.create({
      cycleId: upcomingCycleId,
      ...cycleDates,
      isActive: false,
      isArchived: false
    });
  }
  
  return cycle;
}

// Helper function to archive previous cycles and activate the current one
export async function manageCycles(): Promise<void> {
  const now = new Date();
  const currentCycleId = generateCycleId(now);
  
  // Update all cycles - archive old ones and activate current one
  await Cycle.updateMany(
    { cycleId: { $ne: currentCycleId } },
    { isActive: false }
  );
  
  await Cycle.updateOne(
    { cycleId: currentCycleId },
    { isActive: true },
    { upsert: true }
  );
  
  // Archive applications from previous cycles
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousCycleId = generateCycleId(previousMonth);
  
  // Find previous cycle
  const previousCycle = await Cycle.findOne({ cycleId: previousCycleId });
  
  if (previousCycle && !previousCycle.isArchived) {
    // Archive the cycle
    await Cycle.updateOne(
      { cycleId: previousCycleId },
      { isArchived: true }
    );
    
    // Archive applications from previous cycle
    const { Application } = require('./application');
    
    // Unapppoint all appointed users from previous cycle
    await Application.updateMany(
      { 
        cycleId: previousCycleId,
        appointed: true 
      },
      { 
        appointed: false,
        archivedAt: now
      }
    );
    
    // Appoint all approved users from current cycle
    await Application.updateMany(
      {
        cycleId: currentCycleId,
        status: 'approved',
        appointed: false
      },
      {
        appointed: true,
        appointedAt: now
      }
    );
  }
}

export const Cycle = model<db_cycle>('Cycles', cycleSchema);