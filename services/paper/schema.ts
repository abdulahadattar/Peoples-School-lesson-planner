import { Type } from '@google/genai';

export const paperSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    gradeLevel: { type: Type.STRING },
    subject: { type: Type.STRING },
    chapterName: { type: Type.STRING },
    totalMarks: { type: Type.INTEGER },
    durationMinutes: { type: Type.INTEGER },
    sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          instruction: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                type: { type: Type.STRING, enum: ['mcq', 'short', 'long'] },
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                marks: { type: Type.INTEGER },
                topic: { type: Type.STRING },
              },
              required: ['id', 'type', 'question', 'marks'],
            },
          },
        },
        required: ['title', 'instruction', 'questions'],
      },
    },
  },
  required: [
    'title',
    'gradeLevel',
    'subject',
    'chapterName',
    'totalMarks',
    'durationMinutes',
    'sections',
  ],
};

export const singleQuestionSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    type: { type: Type.STRING, enum: ['mcq', 'short', 'long'] },
    question: { type: Type.STRING },
    options: { type: Type.ARRAY, items: { type: Type.STRING } },
    marks: { type: Type.INTEGER },
    topic: { type: Type.STRING },
  },
  required: ['id', 'type', 'question', 'marks'],
};
