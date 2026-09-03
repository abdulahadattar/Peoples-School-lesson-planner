/**
 * Shared JSON parsing helpers used by both geminiService and paperService.
 */

/**
 * Fix control characters inside JSON string values.
 * Walks the string tracking whether we're inside quotes, and escapes
 * any literal newlines/tabs/carriage returns found inside strings.
 */
export function fixJsonControlChars(json: string): string {
  const result: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];

    if (escaped) {
      result.push(ch);
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      result.push(ch);
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result.push(ch);
      continue;
    }

    if (inString) {
      if (ch === '\n') { result.push('\\n'); continue; }
      if (ch === '\r') { result.push('\\r'); continue; }
      if (ch === '\t') { result.push('\\t'); continue; }
      // Replace other control characters (U+0000 to U+001F)
      if (ch.charCodeAt(0) < 0x20) { result.push(' '); continue; }
    }

    result.push(ch);
  }

  return result.join('');
}

/**
 * Clean and parse a JSON response from the AI.
 * Handles markdown code blocks, extracts JSON object, fixes control characters.
 */
export function cleanAndParseJson(text: string): any {
  let cleanText = text.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleanText = cleanText.substring(firstBrace, lastBrace + 1);
  }
  cleanText = fixJsonControlChars(cleanText);
  return JSON.parse(cleanText);
}
