import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatVisionSummaryBengali } from './smartCaneVision';

describe('Smart Cane Vision Pipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('formats combined Bengali summary when both objects and text are identified', () => {
    const objectsMsg = 'মাঝখানে একটি চেয়ার এবং ডানে একটি টেবিল';
    const textMsg = 'ফার্মেসি খোলা আছে';

    const summary = formatVisionSummaryBengali(objectsMsg, textMsg);

    expect(summary).toContain('আপনার সামনে মাঝখানে একটি চেয়ার এবং ডানে একটি টেবিল');
    expect(summary).toContain('দৃশ্যপটে লেখা রয়েছে: ফার্মেসি খোলা আছে');
  });

  it('formats objects-only summary when no text is found', () => {
    const objectsMsg = 'বামে একটি বোতল';
    const textMsg = 'কোনো লেখা সনাক্ত হয়নি';

    const summary = formatVisionSummaryBengali(objectsMsg, textMsg);

    expect(summary).toContain('আপনার সামনে বামে একটি বোতল দেখতে পাচ্ছি');
    expect(summary).not.toContain('লেখা রয়েছে');
  });

  it('formats text-only summary when no objects are recognized', () => {
    const objectsMsg = 'কিছু চিনতে পারিনি';
    const textMsg = 'জরুরি বহির্গমন (EMERGENCY EXIT)';

    const summary = formatVisionSummaryBengali(objectsMsg, textMsg);

    expect(summary).toContain('লেখা সনাক্ত হয়েছে: জরুরি বহির্গমন');
    expect(summary).not.toContain('দেখতে পাচ্ছি');
  });

  it('handles empty or unrecognized scenes gracefully', () => {
    const objectsMsg = 'কিছু চিনতে পারিনি';
    const textMsg = 'কোনো লেখা সনাক্ত হয়নি';

    const summary = formatVisionSummaryBengali(objectsMsg, textMsg);

    expect(summary).toContain('সামনে কোনো স্পষ্ট পরিচিত বস্তু বা পাঠ্য লেখা সনাক্ত করা যায়নি');
  });
});
