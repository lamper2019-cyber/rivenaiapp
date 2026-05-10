/**
 * RIVEN nutrition target calculations.
 * Mifflin-St Jeor formula for BMR, then activity multiplier for maintenance,
 * minus 500 cal for cut target. Protein floor is 0.8g/lb of goal weight, min 130g.
 */

import type { ActivityLevel } from "@prisma/client";

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
};

export type TargetInputs = {
  age: number;
  heightInches: number;
  currentWeight: number; // lbs
  goalWeight: number; // lbs
  activityLevel: ActivityLevel;
  // Female BMR formula is the default (RIVEN serves Black women 35-55)
  sex?: "female" | "male";
};

export type Targets = {
  maintenanceCalories: number;
  cutCalories: number;
  weeklyBudget: number;
  proteinFloor: number;
};

export function calculateTargets(inputs: TargetInputs): Targets {
  const { age, heightInches, currentWeight, goalWeight, activityLevel, sex = "female" } = inputs;

  const weightKg = currentWeight * 0.453592;
  const heightCm = heightInches * 2.54;

  // Mifflin-St Jeor BMR
  const bmr =
    sex === "female"
      ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
      : 10 * weightKg + 6.25 * heightCm - 5 * age + 5;

  const maintenanceCalories = Math.round(bmr * ACTIVITY_MULTIPLIER[activityLevel]);
  const cutCalories = maintenanceCalories - 500;
  const weeklyBudget = cutCalories * 7;
  const proteinFloor = Math.max(Math.round(goalWeight * 0.8), 130);

  return { maintenanceCalories, cutCalories, weeklyBudget, proteinFloor };
}
