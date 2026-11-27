import { CurriculumClass } from '../../types';

export const generalKnowledgeCurriculum: CurriculumClass[] = [
  {
    id: 'class1',
    name: 'Class I',
    shortName: 'I',
    subjects: [
      {
        id: 'general_knowledge',
        name: 'General Knowledge',
        chapters: [
          { id: 'ch1', name: 'Our Creator', slos: [{ id: 'gk1_1', text: 'Describe the crucial role of Allah in our lives' }] },
          { id: 'ch2', name: 'The Prophets', slos: [{ id: 'gk1_2', text: 'List the names of Prophets' }] },
          { id: 'ch3', name: 'The Holy Books', slos: [] },
          { id: 'ch4', name: 'Hazrat Muhammad (PBUH)', slos: [] },
          { id: 'ch5', name: 'Prayer', slos: [] },
          { id: 'ch6', name: 'Namaz', slos: [] },
          { id: 'ch7', name: 'The Earth', slos: [] },
          { id: 'ch8', name: 'The Sky', slos: [] },
          { id: 'ch9', name: 'Who Am I?', slos: [] },
          { id: 'ch10', name: 'My Body', slos: [] },
        ]
      }
    ]
  },
  {
    id: 'class2',
    name: 'Class II',
    shortName: 'II',
    subjects: [
      {
        id: 'general_knowledge',
        name: 'General Knowledge',
        chapters: [
          { id: 'ch1', name: 'Village Life', slos: [] },
          { id: 'ch2', name: 'Plants Around Us', slos: [] },
          { id: 'ch3', name: 'Parts of Plants', slos: [] },
          { id: 'ch4', name: 'Animals and Their Homes', slos: [] },
          { id: 'ch5', name: 'Food and Health', slos: [] },
          { id: 'ch6', name: 'Our Body', slos: [] },
          { id: 'ch7', name: 'Good Habits', slos: [] },
          { id: 'ch8', name: 'Safety Rules', slos: [] },
          { id: 'ch9', name: 'Transport', slos: [] },
          { id: 'ch10', name: 'Our Country', slos: [] },
          { id: 'ch11', name: 'Our Festivals', slos: [] },
          { id: 'ch12', name: 'Weather and Seasons', slos: [] },
        ]
      }
    ]
  },
  {
    id: 'class3',
    name: 'Class III',
    shortName: 'III',
    subjects: [
      {
        id: 'general_knowledge',
        name: 'General Knowledge',
        chapters: [
          { id: 'ch1', name: 'Our Country', slos: [] },
          { id: 'ch2', name: 'Our Flag', slos: [] },
          { id: 'ch3', name: 'Famous Places', slos: [] },
          { id: 'ch4', name: 'National Symbols', slos: [] },
          { id: 'ch5', name: 'Our Leaders', slos: [] },
          { id: 'ch6', name: 'Safety and First Aid', slos: [] },
          { id: 'ch7', name: 'Our Environment', slos: [] },
          { id: 'ch8', name: 'Road Safety', slos: [] },
        ]
      }
    ]
  },
];
