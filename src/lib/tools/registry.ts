import { FeatureStatus, ToolName, ToolResult } from '@/lib/types';

export interface ToolDefinition {
  status: FeatureStatus;
  labelBn: string;
  run: (ctx?: unknown) => Promise<ToolResult>;
}

export const toolRegistry: Record<ToolName, ToolDefinition> = {
  describeSurroundings: {
    status: 'PLANNED',
    labelBn: 'পরিবেশ পর্যবেক্ষণ',
    run: async () => ({
      tool: 'describeSurroundings',
      status: 'not_implemented',
      source: 'none',
      message_bn: 'এই সুবিধাটি এখনও প্রস্তুত নয়।',
      confidence: null,
    }),
  },
  readText: {
    status: 'PLANNED',
    labelBn: 'লেখা পড়া',
    run: async () => ({
      tool: 'readText',
      status: 'not_implemented',
      source: 'none',
      message_bn: 'এই সুবিধাটি এখনও প্রস্তুত নয়।',
      confidence: null,
    }),
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
    status: 'PLANNED',
    labelBn: 'অবস্থান জানা',
    run: async () => ({
      tool: 'getLocation',
      status: 'not_implemented',
      source: 'none',
      message_bn: 'এই সুবিধাটি এখনও প্রস্তুত নয়।',
      confidence: null,
    }),
  },
  readProximity: {
    status: 'SIMULATED',
    labelBn: 'নিকটবর্তী দূরত্ব',
    run: async () => ({
      tool: 'readProximity',
      status: 'not_implemented',
      source: 'simulation',
      message_bn: 'এই সুবিধাটি এখনও প্রস্তুত নয়।',
      confidence: null,
    }),
  },
  safetyTest: {
    status: 'PLANNED',
    labelBn: 'নিরাপত্তা পরীক্ষা',
    run: async () => ({
      tool: 'safetyTest',
      status: 'not_implemented',
      source: 'none',
      message_bn: 'এই সুবিধাটি এখনও প্রস্তুত নয়।',
      confidence: null,
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
