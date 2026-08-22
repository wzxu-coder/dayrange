import { ContextTag, Mood, ReadingTiming, Reminder, Symptom } from "@/types/domain";

export const DISCLAIMER =
  "DayRange by WZXU helps you track and organize glucose information. It does not diagnose, treat, or replace medical advice.";

export const timingOptions: ReadingTiming[] = [
  "fasting",
  "before_meal",
  "after_meal",
  "bedtime",
  "other",
];

export const tagOptions: ContextTag[] = [
  "stress",
  "sick",
  "missed_meds",
  "high_carb_meal",
  "low_sleep",
  "walked",
  "exercise",
  "alcohol",
  "hydration",
];

export const symptomOptions: Symptom[] = ["normal", "shaky", "tired", "dizzy", "headache"];

export const moodOptions: Mood[] = ["calm", "anxious", "stressed", "energetic"];

export const defaultReminders: Reminder[] = [
  {
    id: "fasting-check",
    kind: "fasting",
    label: "Check fasting glucose",
    hour: 7,
    minute: 30,
    enabled: false,
    notificationId: null,
  },
  {
    id: "after-dinner-check",
    kind: "after_dinner",
    label: "Check 2 hours after dinner",
    hour: 20,
    minute: 30,
    enabled: false,
    notificationId: null,
  },
  {
    id: "medication",
    kind: "medication",
    label: "Medication reminder",
    hour: 8,
    minute: 0,
    enabled: false,
    notificationId: null,
  },
  {
    id: "appointment-report",
    kind: "appointment_report",
    label: "Export report before appointment",
    hour: 18,
    minute: 0,
    enabled: false,
    notificationId: null,
  },
];
