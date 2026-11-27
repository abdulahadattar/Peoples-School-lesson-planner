import { CurriculumClass, CurriculumSubject } from '../../types';

function makeArtSubject(): CurriculumSubject {
  return {
    id: 'art',
    name: 'Art',
    chapters: [
      { id: 'ch1', name: 'Elements of Art (Line, Shape & Form)', slos: [] },
      { id: 'ch2', name: 'Color Wheel, Shading & Texture', slos: [] },
      { id: 'ch3', name: 'Still Life, Nature & Landscape Drawing', slos: [] },
      { id: 'ch4', name: 'Islamic Geometric Patterns & Folk Motifs', slos: [] },
      { id: 'ch5', name: 'Craftwork, Origami & Visual Design', slos: [] },
    ],
  };
}

function makePeSubject(): CurriculumSubject {
  return {
    id: 'pe',
    name: 'P.E',
    chapters: [
      { id: 'ch1', name: 'Physical Fitness, Warm-Up & Posture', slos: [] },
      { id: 'ch2', name: 'Athletics, Track & Field Fundamentals', slos: [] },
      { id: 'ch3', name: 'Team Sports Rules (Cricket, Football & Volleyball)', slos: [] },
      { id: 'ch4', name: 'Personal Hygiene, Nutrition & First Aid', slos: [] },
      { id: 'ch5', name: 'Sportsmanship, Safety & Injury Prevention', slos: [] },
    ],
  };
}

function makeLibrarySubject(): CurriculumSubject {
  return {
    id: 'library',
    name: 'Library',
    chapters: [
      { id: 'ch1', name: 'Library Etiquette & Book Care', slos: [] },
      { id: 'ch2', name: 'Parts of a Book & Reference Skills', slos: [] },
      { id: 'ch3', name: 'Reading Comprehension & Summarization', slos: [] },
      { id: 'ch4', name: 'Dictionaries, Encyclopedias & Information Literacy', slos: [] },
    ],
  };
}

const ART_CLASSES = [
  ['class4', 'Class IV', 'IV'],
  ['class5', 'Class V', 'V'],
  ['class6', 'Class VI', 'VI'],
  ['class7', 'Class VII', 'VII'],
  ['class8', 'Class VIII', 'VIII'],
  ['class10', 'Class X', 'X'],
  ['class11', 'Class XI', 'XI'],
] as const;

const PE_CLASSES = [
  ['class4', 'Class IV', 'IV'],
  ['class5', 'Class V', 'V'],
  ['class6', 'Class VI', 'VI'],
  ['class7', 'Class VII', 'VII'],
  ['class8', 'Class VIII', 'VIII'],
  ['class10', 'Class X', 'X'],
  ['class11', 'Class XI', 'XI'],
  ['class12', 'Class XII', 'XII'],
] as const;

const LIBRARY_CLASSES = [
  ['class4', 'Class IV', 'IV'],
  ['class5', 'Class V', 'V'],
  ['class6', 'Class VI', 'VI'],
  ['class7', 'Class VII', 'VII'],
  ['class8', 'Class VIII', 'VIII'],
] as const;

function buildClasses(): CurriculumClass[] {
  const byId = new Map<string, CurriculumClass>();
  const ensureClass = (id: string, name: string, shortName: string) => {
    if (!byId.has(id)) {
      byId.set(id, { id, name, shortName, subjects: [] });
    }
    return byId.get(id)!;
  };

  for (const [id, name, shortName] of ART_CLASSES) {
    ensureClass(id, name, shortName).subjects.push(makeArtSubject());
  }
  for (const [id, name, shortName] of PE_CLASSES) {
    ensureClass(id, name, shortName).subjects.push(makePeSubject());
  }
  for (const [id, name, shortName] of LIBRARY_CLASSES) {
    ensureClass(id, name, shortName).subjects.push(makeLibrarySubject());
  }

  return Array.from(byId.values());
}

export const enrichmentCurriculum: CurriculumClass[] = buildClasses();
