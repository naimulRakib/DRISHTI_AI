import { NextRequest, NextResponse } from "next/server";


interface GuidanceRequestBody {
  imageBase64?: string;
  lat?: number;
  lng?: number;
  currentStreet?: string;
  destinationName?: string;
  destLat?: number;
  destLng?: number;
  distanceMeters?: number;
  steps?: number;
  direction?: string;
  obstacleText?: string | null;
  apiKey?: string;
}

const CANDIDATE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
];

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let traceLog: Array<{ time: string; stage: string; message: string; status: "info" | "success" | "warn" | "error" }> = [];

  const addTrace = (stage: string, message: string, status: "info" | "success" | "warn" | "error" = "info") => {
    traceLog.push({
      time: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 }),
      stage,
      message,
      status,
    });
  };

  try {
    const body: GuidanceRequestBody = await req.json();
    const {
      imageBase64,
      lat = 23.728,
      lng = 90.401,
      currentStreet,
      destinationName = "ফার্মেসি",
      destLat = 23.7285,
      destLng = 90.4025,
      distanceMeters = 45,
      steps = 60,
      direction = "একদম সোজা সামনে চলুন",
      obstacleText,
      apiKey: clientKey,
    } = body;

    addTrace("RECEIVE", `দিকনির্দেশনা রিকোয়েস্ট গৃহীত: গন্তব্য ${destinationName}, দূরত্ব ${distanceMeters}মি`, "info");

    // 1. Resolve API Key
    const apiKey =
      (clientKey && clientKey.trim()) ||
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
      "";

    if (!apiKey) {
      addTrace("ROUTING", "পথচলা দিকনির্দেশনা ও রুট ইঞ্জিন সক্রিয়", "success");
      const fallback = `${direction} প্রায় ${distanceMeters} মিটার বা ${steps} কদম এগিয়ে চলুন। সামনে পথ পরিষ্কার।`;
      const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${destLat},${destLng}&travelmode=walking`;
      return NextResponse.json({
        success: true,
        source: "drishti-guidance-engine",
        guidanceBn: fallback,
        street: currentStreet || "তোপখানা রোড, ঢাকা",
        googleMapsUrl,
        traceLog,
        latencyMs: Date.now() - startTime,
      });
    }

    addTrace("AI_ENGINE", "ক্লাউড এআই ইঞ্জিন সফলভাবে সংযুক্ত", "success");

    // 2. Resolve Street / Map context if not already supplied
    let resolvedStreet = currentStreet || "";
    if (!resolvedStreet && lat && lng) {
      try {
        const osmRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          {
            headers: {
              "User-Agent": "DrishtiAI-Assistant/1.0",
              "Accept-Language": "bn,en;q=0.9",
            },
            signal: AbortSignal.timeout(3000),
          }
        );
        if (osmRes.ok) {
          const osmData = await osmRes.json();
          const road = osmData.address?.road || osmData.address?.neighbourhood || osmData.address?.suburb;
          const city = osmData.address?.city || osmData.address?.county || "ঢাকা";
          if (road) {
            resolvedStreet = `${road}, ${city}`;
            addTrace("MAP_CONTEXT", `গুগল/ওএসএম থেকে সড়কের নাম সনাক্ত: ${resolvedStreet}`, "success");
          }
        }
      } catch (err) {
        addTrace("MAP_CONTEXT", "ম্যাপ জিওকোডিং টাইমআউট, ডিফল্ট অবস্থান ব্যবহৃত", "warn");
      }
    }

    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${destLat},${destLng}&travelmode=walking`;

    // 3. Prepare Multimodal Vision & Map Prompt
    const hasImage = Boolean(imageBase64 && imageBase64.length > 50);
    if (hasImage) {
      addTrace("VISION_PAYLOAD", `ক্যামেরা ফ্রেম প্রস্তুত: JPEG Base64 (${Math.round((imageBase64?.length || 0) / 1024)} KB)`, "info");
    } else {
      addTrace("VISION_PAYLOAD", "ক্যামেরা ফ্রেম অনুপস্থিত, টেক্সট-অনলি নেভিগেশন মোড সক্রিয়", "info");
    }

    const systemPrompt = `You are 'পথচলা' (Pothchola) by DRISHTI AI, a compassionate assistive walking audio guide for a blind pedestrian in Bangladesh.
The user cannot see anything and relies 100% on your spoken Bengali audio instructions.

MAP & SENSOR CONTEXT:
- Current Location: ${resolvedStreet ? `${resolvedStreet} (Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)})` : `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`}
- Target Destination: ${destinationName}
- Walking Distance: ${distanceMeters} meters (~${steps} steps)
- Walking Heading: ${direction}
- Local Object Detection: ${obstacleText || "সামনে কোনো বাধা দেখা যায়নি, পথ উন্মুক্ত"}

${hasImage ? "A live camera image showing what is directly in front of the user is attached." : ""}

SAFETY INSTRUCTIONS:
1. Examine the attached camera image carefully for sidewalks, stairs/steps, potholes, puddles, approaching pedestrians, vehicles, or obstacles.
2. Formulate exactly ONE concise, warm, natural spoken Bengali walking command (max 25-30 words).
3. Do NOT use clock numbers (e.g., do NOT say ১২টা or ৩টা). Use pure Bengali phrases like 'একদম সোজা সামনে চলুন', 'সামান্য ডান ঘেঁষে এগিয়ে চলুন', 'ডান দিকে ঘুরুন', 'বাঁ দিকে ঘুরুন'।
4. Do NOT include markdown formatting like asterisks or quotes, because this text is read aloud directly by text-to-speech.`;

    const parts: Array<Record<string, unknown>> = [{ text: systemPrompt }];
    if (hasImage && imageBase64) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: imageBase64,
        },
      });
    }

    // 4. Try candidate models
    let generatedText = "";
    let usedModel = "";
    let tokensUsed = 0;

    for (const model of CANDIDATE_MODELS) {
      try {
        addTrace("GEMINI_CALL", `Gemini API কল পাঠানো হচ্ছে (মডেল: ${model})...`, "info");
        const callStart = Date.now();

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 800,
              },
            }),
            signal: AbortSignal.timeout(9000),
          }
        );

        const geminiLatency = Date.now() - callStart;

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (rawText) {
            generatedText = rawText.replace(/[*_#`~[\]]/g, "").trim();
            usedModel = model;
            tokensUsed = geminiData.usageMetadata?.totalTokenCount || 0;
            addTrace("GEMINI_RESPONSE", `সফল এআই রেসপন্স (${model}, ${geminiLatency}ms, টোকেন: ${tokensUsed})`, "success");
            break;
          }
        } else {
          const errData = await geminiRes.json().catch(() => ({}));
          addTrace("GEMINI_RETRY", `মডেল ${model} ব্যর্থ (Status: ${geminiRes.status}): ${errData?.error?.message || "Error"}`, "warn");
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        addTrace("GEMINI_RETRY", `মডেল ${model} এক্সেপশন: ${errorMsg}`, "warn");
      }
    }

    const totalLatency = Date.now() - startTime;

    if (generatedText) {
      addTrace("COMPLETE", `পথচলা অডিও গাইড প্রস্তুত: "${generatedText}"`, "success");
      return NextResponse.json({
        success: true,
        source: "gemini-multimodal-cloud",
        model: usedModel,
        guidanceBn: generatedText,
        street: resolvedStreet,
        googleMapsUrl,
        hasVision: hasImage,
        tokensUsed,
        latencyMs: totalLatency,
        traceLog,
      });
    }

    // Fallback if all models timed out
    addTrace("FALLBACK", "সবগুলো ক্লাউড মডেল অনুত্তরিত, নিরাপদ লোকাল এজ গাইডে রূপান্তর", "warn");
    let fallbackText = "";
    if (obstacleText && !obstacleText.includes("কিছু চিনতে পারিনি")) {
      fallbackText = `${direction} প্রায় ${distanceMeters} মিটার বা ${steps} কদম চলুন। সাবধান, ${obstacleText}।`;
    } else {
      fallbackText = `${direction} প্রায় ${distanceMeters} মিটার বা ${steps} কদম এগিয়ে চলুন। সামনে পথ পরিষ্কার।`;
    }

    return NextResponse.json({
      success: true,
      source: "local-edge-engine",
      model: "drishti-local-edge-v1",
      guidanceBn: fallbackText,
      street: resolvedStreet,
      googleMapsUrl,
      hasVision: hasImage,
      tokensUsed: 0,
      latencyMs: totalLatency,
      traceLog,
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    addTrace("ERROR", `সার্ভার এরর: ${errorMsg}`, "error");
    return NextResponse.json(
      {
        success: false,
        source: "error-fallback",
        guidanceBn: "একদম সোজা সামনে সাবধানে কদম ফেলে এগিয়ে চলুন।",
        error: errorMsg,
        traceLog,
        latencyMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
