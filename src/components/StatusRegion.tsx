"use client";

import React from "react";

interface StatusRegionProps {
  message: string | null;
  noBengaliVoice?: boolean;
}

export default function StatusRegion({
  message,
  noBengaliVoice = false,
}: StatusRegionProps) {
  return (
    <section aria-label="বর্তমান স্থিতি ও বার্তা" className="status-container">
      {/* Missing Bengali Voice Warning Banner */}
      {noBengaliVoice && (
        <div className="status-warning" role="alert">
          <strong>সতর্কতা:</strong> আপনার এই ডিভাইসে কোনো বাংলা কণ্ঠস্বর (Bengali Voice) পাওয়া যায়নি। সমস্ত বার্তা এখানে টেক্সট আকারে দেখানো হচ্ছে।
        </div>
      )}

      {/* ONE polite aria-live region used for all status messages */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="status-live-box"
      >
        <span className="status-label">বর্তমান ফলাফল:</span>
        <p className="status-message">
          {message && message.trim() !== ""
            ? message
            : "কোনো নতুন বার্তা নেই। যেকোনো বাটন চাপুন বা মুখে বলুন।"}
        </p>
      </div>
    </section>
  );
}
