import { CurriculumClass } from '../../types';

const BASIC_URDU_CHAPTERS = [
  { id: 'ch1', name: 'Hamd, Naat & Moral Stories', slos: [] },
  { id: 'ch2', name: 'Prose & Comprehension (Nasr)', slos: [] },
  { id: 'ch3', name: 'Urdu Poetry (Nazm)', slos: [] },
  { id: 'ch4', name: 'Urdu Grammar & Sentence Building', slos: [] },
  { id: 'ch5', name: 'Letters, Applications & Essays', slos: [] },
];

const ASAN_URDU_CHAPTERS = [
  { id: 'ch1', name: 'Selected Prose & Everyday Reading', slos: [] },
  { id: 'ch2', name: 'Simple Poetry & Moral Verse', slos: [] },
  { id: 'ch3', name: 'Applied Grammar & Idioms', slos: [] },
  { id: 'ch4', name: 'Paragraph, Letter & Essay Writing', slos: [] },
];

export const urduCurriculum: CurriculumClass[] = [
  {
    id: 'class4',
    name: 'Class IV',
    shortName: 'IV',
    subjects: [{ id: 'urdu', name: 'Urdu', chapters: BASIC_URDU_CHAPTERS }],
  },
  {
    id: 'class5',
    name: 'Class V',
    shortName: 'V',
    subjects: [{ id: 'urdu', name: 'Urdu', chapters: BASIC_URDU_CHAPTERS }],
  },
  {
    id: 'class6',
    name: 'Class VI',
    shortName: 'VI',
    subjects: [{ id: 'urdu', name: 'Urdu', chapters: BASIC_URDU_CHAPTERS }],
  },
  {
    id: 'class7',
    name: 'Class VII',
    shortName: 'VII',
    subjects: [{ id: 'urdu', name: 'Urdu', chapters: BASIC_URDU_CHAPTERS }],
  },
  {
    id: 'class8',
    name: 'Class VIII',
    shortName: 'VIII',
    subjects: [{ id: 'urdu', name: 'Urdu', chapters: BASIC_URDU_CHAPTERS }],
  },
  {
    id: 'class9',
    name: 'Class IX',
    shortName: 'IX',
    subjects: [
      {
        id: 'urdu',
        name: 'Urdu',
        chapters: [
          { id: 'ch1', name: 'Urdu Literature', slos: [] },
          { id: 'ch2', name: 'Poetry', slos: [] },
          { id: 'ch3', name: 'Grammar', slos: [] },
          { id: 'ch4', name: 'Writing Skills', slos: [] },
        ],
      },
    ],
  },
  {
    id: 'class10',
    name: 'Class X',
    shortName: 'X',
    subjects: [
      {
        id: 'urdu',
        name: 'Urdu',
        chapters: [
          { id: 'ch1', name: 'Urdu Literature', slos: [] },
          { id: 'ch2', name: 'Poetry', slos: [] },
          { id: 'ch3', name: 'Grammar', slos: [] },
          { id: 'ch4', name: 'Writing Skills', slos: [] },
        ],
      },
      {
        id: 'asan_urdu',
        name: 'Asan Urdu',
        chapters: ASAN_URDU_CHAPTERS,
      },
    ],
  },
  {
    id: 'class11',
    name: 'Class XI',
    shortName: 'XI',
    subjects: [
      {
        id: 'urdu',
        name: 'Urdu (Compulsory)',
        chapters: [
          { id: 'ch1', name: 'Urdu Literature', slos: [] },
          { id: 'ch2', name: 'Poetry', slos: [] },
          { id: 'ch3', name: 'Grammar', slos: [] },
          { id: 'ch4', name: 'Writing Skills', slos: [] },
        ],
      },
      {
        id: 'asan_urdu',
        name: 'Asan Urdu',
        chapters: ASAN_URDU_CHAPTERS,
      },
    ],
  },
  {
    id: 'class12',
    name: 'Class XII',
    shortName: 'XII',
    subjects: [
      {
        id: 'urdu',
        name: 'Urdu (Compulsory)',
        chapters: [
          { id: 'ch1', name: 'Urdu Literature', slos: [] },
          { id: 'ch2', name: 'Poetry', slos: [] },
          { id: 'ch3', name: 'Grammar', slos: [] },
          { id: 'ch4', name: 'Writing Skills', slos: [] },
        ],
      },
    ],
  },
];
