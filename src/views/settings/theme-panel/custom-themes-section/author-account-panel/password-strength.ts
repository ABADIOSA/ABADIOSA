export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: string };

const COMMON = new Set([
  "password",
  "password1",
  "12345678",
  "123456789",
  "qwertyui",
  "qwerty123",
  "letmein",
  "iloveyou",
  "admin123",
  "welcome1",
  "harbor123",
]);

export function passwordStrength(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: "" };
  if (pw.length < 8) return { score: 1, label: "Too short" };
  if (COMMON.has(pw.toLowerCase())) return { score: 1, label: "Too common" };

  let variety = 0;
  if (/[a-z]/.test(pw)) variety++;
  if (/[A-Z]/.test(pw)) variety++;
  if (/[0-9]/.test(pw)) variety++;
  if (/[^a-zA-Z0-9]/.test(pw)) variety++;

  let score = 1;
  if (pw.length >= 10 && variety >= 2) score = 2;
  if (pw.length >= 12 && variety >= 3) score = 3;
  if (pw.length >= 14 && variety >= 3) score = 4;
  if (/(.)\1\1/.test(pw) && score > 1) score--;

  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  return { score: score as PasswordStrength["score"], label: labels[score] };
}

export function strengthColor(score: number): string {
  if (score >= 4) return "#34d399";
  if (score === 3) return "var(--color-accent)";
  if (score === 2) return "#f0b23c";
  return "var(--color-danger)";
}
