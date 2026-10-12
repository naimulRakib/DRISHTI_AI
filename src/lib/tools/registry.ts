import { FeatureStatus, ToolName, ToolResult } from '@/lib/types';
import { detectObjects } from '@/lib/tools/objects';
import { readTextFromImage } from '@/lib/tools/ocr';
import { getCurrentLocation } from '@/lib/tools/location';
import { readProximityTool } from '@/lib/tools/proximity';

export interface ToolDefinition {
  status: FeatureStatus;
  labelBn: string;
  run: (ctx?: unknown) => Promise<ToolResult>;
}

export const toolRegistry: Record<ToolName, ToolDefinition> = {
  describeSurroundings: {
    status: 'LIVE',
    labelBn: 'পরিবেশ পর্যবেক্ষণ',
    run: async (ctx) => detectObjects(ctx as { imageSource?: ImageData | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement }),
  },
  readText: {
    status: 'LIVE',
    labelBn: 'লেখা পড়া',
    run: async (ctx) => readTextFromImage(ctx as { imageSource?: ImageData | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement }),
  },
  recognizePerson: {
    status: 'PLANNED',
    labelBn: 'পরিচিত মুখ চেনা',
    run: async () => ({
      tool: 'recognizePerson',
      status: 'not_implemented',
      source: 'none',
      message_bn: 'এই সুবিধাটি এখনও প্রস্তুত নয়।',
      confidence: null,
    }),
  },
  getLocation: {
    status: 'LIVE',
    labelBn: 'অবস্থান জানা',
    run: async () => getCurrentLocation(),
  },
  readProximity: {
    status: 'SIMULATED',
    labelBn: 'নিকটবর্তী দূরত্ব (SIMULATED)',
    run: async () => readProximityTool(),
  },
  safetyTest: {
    status: 'LIVE',
    labelBn: 'নিরাপত্তা পরীক্ষা (TEST MODE)',
    run: async () => ({
      tool: 'safetyTest',
      status: 'success',
      source: 'simulation',
      message_bn: 'নিরাপত্তা ও পতন সনাক্তকরণ পরীক্ষা মোড সক্রিয় করা হয়েছে।',
      confidence: 1.0,
    }),
  },
  stopSpeaking: {
    status: 'PLANNED',
    labelBn: 'কথা বন্ধ করা',
    run: async () => ({
      tool: 'stopSpeaking',
      status: 'not_implemented',
      source: 'none',
      message_bn: 'এই সুবিধাটি এখনও প্রস্তুত নয়।',
      confidence: null,
    }),
  },
  repeatLast: {
    status: 'PLANNED',
    labelBn: 'পুনরায় বলা',
    run: async () => ({
      tool: 'repeatLast',
      status: 'not_implemented',
      source: 'none',
      message_bn: 'এই সুবিধাটি এখনও প্রস্তুত নয়।',
      confidence: null,
    }),
  },
  unknown: {
    status: 'PLANNED',
    labelBn: 'অজানা কমান্ড',
    run: async () => ({
      tool: 'unknown',
      status: 'not_implemented',
      source: 'none',
      message_bn: 'এই কমান্ডটি বুঝতে পারা যায়নি।',
      confidence: null,
    }),
  },
};

export default toolRegistry;
