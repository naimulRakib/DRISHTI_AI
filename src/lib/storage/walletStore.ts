/**
 * DRISHTI AI — Bangladeshi Currency & Wallet Store
 * Manages running tally and history of scanned banknotes for visually impaired users.
 */

export interface ScannedBill {
  id: string;
  denomination: number;
  denominationBn: string;
  timestamp: number;
}

const STORAGE_KEY = "drishti:wallet_bills_v1";

let inMemoryBills: ScannedBill[] = [];

export const DENOMINATION_NAMES_BN: Record<number, string> = {
  10: "১০ টাকা",
  20: "২০ টাকা",
  50: "৫০ টাকা",
  100: "১০০ টাকা",
  200: "২০০ টাকা",
  500: "৫০০ টাকা",
  1000: "১০০০ টাকা",
};

/**
 * Returns all scanned banknotes in the current tally session.
 */
export function getWalletBills(): ScannedBill[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [...inMemoryBills];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      inMemoryBills = parsed;
      return parsed;
    }
    return [];
  } catch {
    return [...inMemoryBills];
  }
}

/**
 * Calculates total amount of money in Bangladeshi Taka.
 */
export function getWalletTotal(): number {
  const bills = getWalletBills();
  return bills.reduce((sum, b) => sum + b.denomination, 0);
}

/**
 * Formats numbers into Bengali numerals (e.g. 1350 -> ১,৩৫০).
 */
export function formatBengaliNumber(num: number): string {
  const bnDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return num
    .toLocaleString("en-US")
    .replace(/[0-9]/g, (d) => bnDigits[parseInt(d, 10)]);
}

/**
 * Adds a new detected banknote to the running wallet tally.
 */
export function addBillToWallet(denomination: number): {
  bill: ScannedBill;
  totalTaka: number;
} {
  const current = getWalletBills();
  const bill: ScannedBill = {
    id: `bill-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    denomination,
    denominationBn: DENOMINATION_NAMES_BN[denomination] || `${denomination} টাকা`,
    timestamp: Date.now(),
  };

  current.unshift(bill);
  inMemoryBills = current;

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // Ignore quota errors
    }
  }

  const totalTaka = current.reduce((sum, b) => sum + b.denomination, 0);
  return { bill, totalTaka };
}

/**
 * Clears the wallet tally session back to zero.
 */
export function clearWallet(): void {
  inMemoryBills = [];
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Removes a specific bill from the wallet.
 */
export function removeBillFromWallet(billId: string): number {
  const current = getWalletBills();
  const filtered = current.filter((b) => b.id !== billId);
  inMemoryBills = filtered;

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch {
      // Ignore errors
    }
  }

  return filtered.reduce((sum, b) => sum + b.denomination, 0);
}
