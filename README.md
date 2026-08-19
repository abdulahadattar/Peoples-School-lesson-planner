# Lesson Planner - Peoples Higher Secondary School Jamshoro

An intelligent lesson plan and exam paper generator for teachers, aligned with the Sindh Textbook Board (STBB) curriculum from ECCE to Class XII.

## Features

- **General Lesson Planner** — Select any class, subject, and chapter to generate lesson plans
- **4As Template** — Lesson plans follow the Activity, Analysis, Abstraction, Application framework
- **Exam Paper Generator** — Create structured exam papers with MCQs, short, and long questions
- **Mobile-First Design** — Optimized for phones and tablets
- **PDF & DOCX Export** — Download lesson plans and papers in multiple formats
- **AI-Powered** — Uses Google Gemini for content generation

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```
   npm install
   ```
2. Create a `.env.local` file in the project root with your Gemini API key:
   ```
   VITE_API_KEY=your_gemini_api_key_here
   ```
3. Run the app:
   ```
   npm run dev
   ```

## Build

```
npm run build
```

## Tech Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS
- Google Gemini AI
- DOCX + PDF export
