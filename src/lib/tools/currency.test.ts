import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  addBillToWallet,
  clearWallet,
  getWalletBills,
  getWalletTotal,
  formatBengaliNumber,
} from "@/lib/storage/walletStore";
import {
  detectBanknoteFromTextAndColor,
  calculateDominantRgb,
  readCurrency,
} from "./currency";

describe("Bangladeshi Currency Reader & Counter System", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearWallet();
  });

  describe("Wallet & Tally Store", () => {
    it("formats English numbers into Bengali numerals", () => {
      expect(formatBengaliNumber(10)).toBe("১০");
      expect(formatBengaliNumber(500)).toBe("৫০০");
      expect(formatBengaliNumber(1350)).toBe("১,৩৫০");
      expect(formatBengaliNumber(25000)).toBe("২৫,০০০");
    });

    it("adds bills and computes running total accurately", () => {
      expect(getWalletTotal()).toBe(0);

      const res1 = addBillToWallet(500);
      expect(res1.bill.denomination).toBe(500);
      expect(res1.totalTaka).toBe(500);

      const res2 = addBillToWallet(100);
      expect(res2.totalTaka).toBe(600);

      const res3 = addBillToWallet(20);
      expect(res3.totalTaka).toBe(620);

      expect(getWalletBills()).toHaveLength(3);
    });

    it("resets tally to zero when clearWallet is called", () => {
      addBillToWallet(1000);
      addBillToWallet(500);
      expect(getWalletTotal()).toBe(1500);

      clearWallet();
      expect(getWalletTotal()).toBe(0);
      expect(getWalletBills()).toHaveLength(0);
    });
  });

  describe("Banknote Recognition Logic", () => {
    it("identifies 1000 Taka note from Bengali numeral", () => {
      const text = "বাংলাদেশ ব্যাংক ১০০০ এক হাজার টাকা";
      const det = detectBanknoteFromTextAndColor(text);
      expect(det).not.toBeNull();
      expect(det?.denomination).toBe(1000);
      expect(det?.matchedBy).toBe("numeral");
    });

    it("identifies 500 Taka note from English text and numeral", () => {
      const text = "BANGLADESH BANK 500 FIVE HUNDRED TAKA";
      const det = detectBanknoteFromTextAndColor(text);
      expect(det).not.toBeNull();
      expect(det?.denomination).toBe(500);
    });

    it("identifies 200 Taka Mujib birth centenary note", () => {
      const text = "জাতির পিতা বঙ্গবন্ধু শেখ মুজিবুর রহমান ২০০ টাকা";
      const det = detectBanknoteFromTextAndColor(text);
      expect(det?.denomination).toBe(200);
    });

    it("identifies 50 Taka note", () => {
      const text = "পঞ্চাশ টাকা ৫০";
      const det = detectBanknoteFromTextAndColor(text);
      expect(det?.denomination).toBe(50);
    });

    it("identifies 20 Taka note", () => {
      const text = "বিশ টাকা ২০ বাংলাদেশ ব্যাংক";
      const det = detectBanknoteFromTextAndColor(text);
      expect(det?.denomination).toBe(20);
    });

    it("identifies 10 Taka note", () => {
      const text = "দশ টাকা ১০";
      const det = detectBanknoteFromTextAndColor(text);
      expect(det?.denomination).toBe(10);
    });

    it("identifies 100 Taka note using dominant blue color and watermark text", () => {
      const text = "বাংলাদেশ ব্যাংক";
      const blueRgb = { r: 60, g: 90, b: 180 }; // Distinct Blue
      const det = detectBanknoteFromTextAndColor(text, blueRgb);
      expect(det).not.toBeNull();
      expect(det?.denomination).toBe(100);
      expect(det?.matchedBy).toBe("color");
    });

    it("identifies 20 Taka note using dominant emerald green color and watermark text", () => {
      const text = "বাংলাদেশ ব্যাংক";
      const greenRgb = { r: 70, g: 170, b: 70 }; // Distinct Green
      const det = detectBanknoteFromTextAndColor(text, greenRgb);
      expect(det).not.toBeNull();
      expect(det?.denomination).toBe(20);
      expect(det?.matchedBy).toBe("color");
    });

    it("returns null for non-currency random text", () => {
      const text = "ফার্মেসি খোলা আছে প্রতিদিন সকাল ৯টা থেকে";
      const det = detectBanknoteFromTextAndColor(text);
      expect(det).toBeNull();
    });
  });

  describe("RGB Dominant Color Calculation", () => {
    it("computes average RGB correctly from ImageData", () => {
      const width = 16;
      const height = 16;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 200; // R
        data[i + 1] = 100; // G
        data[i + 2] = 50; // B
        data[i + 3] = 255; // A
      }
      const imgData: ImageData = { width, height, data, colorSpace: "srgb" };

      const rgb = calculateDominantRgb(imgData);
      expect(rgb.r).toBe(200);
      expect(rgb.g).toBe(100);
      expect(rgb.b).toBe(50);
    });
  });

  describe("Error Handling", () => {
    it("returns error result gracefully when no image source is available", async () => {
      const res = await readCurrency({});
      expect(res.tool).toBe("readCurrency");
      expect(res.status).toBe("error");
      expect(res.message_bn).toContain("টাকা চেনার জন্য ক্যামেরা চালু করুন");
    });
  });
});
