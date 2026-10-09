// One theme per New York calendar day, so everyone is captioning the same thing.
const THEMES = [
  "Midwest vs. New York",
  "Dorm life",
  "The subway",
  "Bodega finds",
  "Weekend side quest",
  "New York prices",
  "Butler at 2 a.m.",
  "Dining hall reviews",
  "Central Park",
  "Things only tourists do",
  "Morningside Heights",
  "Group chat material",
  "Pigeons, rats and other locals",
  "Calling home",
];

export function todaysTheme(now = new Date()) {
  const day = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const index = Math.floor(Date.parse(day) / 86_400_000) % THEMES.length;
  return THEMES[index];
}
