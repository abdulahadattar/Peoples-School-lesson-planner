import fs from 'fs';
import path from 'path';
import type {
  ArchiveDocument,
  BatchPacket,
  OcrLogEntry,
  StudentRecord,
} from '../src/types.ts';

export interface PersistentStoreData {
  students: StudentRecord[];
  packets: BatchPacket[];
  documents: ArchiveDocument[];
  logs: OcrLogEntry[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
export const FILES_DIR = path.resolve(DATA_DIR, 'files');
const STORE_PATH = path.resolve(DATA_DIR, 'store.json');

function ensureDirs(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(FILES_DIR)) {
    fs.mkdirSync(FILES_DIR, { recursive: true });
  }
}

export function createSeedStudents(): StudentRecord[] {
  const now = new Date().toISOString();
  return [
    {
      grNumber: '1299',
      fullName: 'Muhammad Hamza Tariq',
      fatherName: 'Tariq Mahmood',
      fatherCnic: '35202-4819203-1',
      bFormNumber: '35202-7741209-3',
      dateOfBirth: '2011-04-14',
      className: 'Class 8-A',
      section: 'A',
      gender: 'Male',
      createdAt: now,
    },
    {
      grNumber: '1300',
      fullName: 'Ayesha Tariq',
      fatherName: 'Tariq Mahmood',
      fatherCnic: '35202-4819203-1',
      bFormNumber: '35202-7741210-4',
      dateOfBirth: '2013-09-22',
      className: 'Class 6-B',
      section: 'B',
      gender: 'Female',
      createdAt: now,
    },
    {
      grNumber: '1301',
      fullName: 'Zainab Tariq',
      fatherName: 'Tariq Mahmood',
      fatherCnic: '35202-4819203-1',
      bFormNumber: '35202-7741211-8',
      dateOfBirth: '2016-01-11',
      className: 'Class 3-A',
      section: 'A',
      gender: 'Female',
      createdAt: now,
    },
    {
      grNumber: '1304',
      fullName: 'Ali Hassan Raza',
      fatherName: 'Razaullah Khan',
      fatherCnic: '42101-8839102-5',
      bFormNumber: '42101-6620194-1',
      dateOfBirth: '2010-11-05',
      className: 'Class 9-A',
      section: 'A',
      gender: 'Male',
      createdAt: now,
    },
    {
      grNumber: '1305',
      fullName: 'Fatima Raza',
      fatherName: 'Razaullah Khan',
      fatherCnic: '42101-8839102-5',
      bFormNumber: '42101-6620195-2',
      dateOfBirth: '2014-06-19',
      className: 'Class 5-B',
      section: 'B',
      gender: 'Female',
      createdAt: now,
    },
    {
      grNumber: '1412',
      fullName: 'Bilal Ahmed Siddiqui',
      fatherName: 'Kamran Ahmed Siddiqui',
      fatherCnic: '37405-1928374-9',
      bFormNumber: '37405-5501928-7',
      dateOfBirth: '2009-08-30',
      className: 'Class 10-Science',
      section: 'Science',
      gender: 'Male',
      createdAt: now,
    },
    {
      grNumber: '1418',
      fullName: 'Hira Farooq',
      fatherName: 'Farooq Azam',
      fatherCnic: '61101-9940123-3',
      bFormNumber: '61101-3310294-6',
      dateOfBirth: '2012-02-17',
      className: 'Class 7-A',
      section: 'A',
      gender: 'Female',
      createdAt: now,
    },
    {
      grNumber: '1425',
      fullName: 'Usman Farooq',
      fatherName: 'Farooq Azam',
      fatherCnic: '61101-9940123-3',
      bFormNumber: '61101-3310295-7',
      dateOfBirth: '2015-05-09',
      className: 'Class 4-C',
      section: 'C',
      gender: 'Male',
      createdAt: now,
    },
  ];
}

export function loadStore(): PersistentStoreData {
  ensureDirs();
  if (!fs.existsSync(STORE_PATH)) {
    const initial: PersistentStoreData = {
      students: createSeedStudents(),
      packets: [],
      documents: [],
      logs: [],
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistentStoreData>;
    return {
      students: Array.isArray(parsed.students) ? parsed.students : createSeedStudents(),
      packets: Array.isArray(parsed.packets) ? parsed.packets : [],
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
    };
  } catch {
    const fallback: PersistentStoreData = {
      students: createSeedStudents(),
      packets: [],
      documents: [],
      logs: [],
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(fallback, null, 2), 'utf-8');
    return fallback;
  }
}

export function saveStore(data: PersistentStoreData): void {
  ensureDirs();
  const tempPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, STORE_PATH);
}

export function saveOptimizedImageFile(fileId: string, base64Data: string, ext: 'jpg' | 'png'): string {
  ensureDirs();
  const safeId = fileId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) {
    throw new Error('Invalid file ID');
  }
  const fileName = `${safeId}.${ext}`;
  const targetPath = path.resolve(FILES_DIR, fileName);
  if (!targetPath.startsWith(FILES_DIR + path.sep)) {
    throw new Error('Invalid file storage path');
  }
  const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, '');
  fs.writeFileSync(targetPath, Buffer.from(cleanBase64, 'base64'));
  return fileName;
}

export function clearArchiveStorage(options: { resetStudents?: boolean } = {}): {
  deletedFilesCount: number;
  clearedDocuments: number;
  clearedPackets: number;
  clearedLogs: number;
} {
  ensureDirs();
  const current = loadStore();
  let deletedFilesCount = 0;

  if (fs.existsSync(FILES_DIR)) {
    const entries = fs.readdirSync(FILES_DIR);
    for (const entry of entries) {
      const fullPath = path.resolve(FILES_DIR, entry);
      if (fullPath.startsWith(FILES_DIR + path.sep) && fs.statSync(fullPath).isFile()) {
        fs.unlinkSync(fullPath);
        deletedFilesCount += 1;
      }
    }
  }

  const clearedDocuments = current.documents.length;
  const clearedPackets = current.packets.length;
  const clearedLogs = current.logs.length;

  const cleanedStudents = options.resetStudents
    ? createSeedStudents()
    : current.students.map((s) => ({
        ...s,
        portraitDocumentId: undefined,
      }));

  const nextStore: PersistentStoreData = {
    students: cleanedStudents,
    packets: [],
    documents: [],
    logs: [
      {
        id: `log_reset_${Date.now()}`,
        timestamp: new Date().toISOString(),
        packetId: 'SYSTEM',
        documentId: 'RESET',
        fileName: 'Testing Mode Reset',
        stage: 'admin_reset',
        outcome: 'reset',
        aiCostSaved: false,
        bytesSaved: 0,
        durationMs: 0,
        details: `Admin cleared ${clearedDocuments} archive documents, ${clearedPackets} packets, ${clearedLogs} OCR logs, and ${deletedFilesCount} stored files.`,
      },
    ],
  };

  saveStore(nextStore);
  return {
    deletedFilesCount,
    clearedDocuments,
    clearedPackets,
    clearedLogs,
  };
}
