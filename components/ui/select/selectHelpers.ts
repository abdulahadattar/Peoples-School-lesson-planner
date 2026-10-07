import React from 'react';

export interface SelectOptionItem {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export function getTextFromReactChildren(children: React.ReactNode): string {
  if (children === null || children === undefined || typeof children === 'boolean') {
    return '';
  }
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(getTextFromReactChildren).join('');
  }
  if (React.isValidElement(children)) {
    return getTextFromReactChildren((children.props as any)?.children);
  }
  return '';
}

export function parseOptionText(raw: string): { label: string; sublabel?: string; badge?: string } {
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed.startsWith('--') ||
    trimmed.toLowerCase().startsWith('choose') ||
    trimmed.toLowerCase().startsWith('select')
  ) {
    return { label: trimmed.replace(/^--\s*|\s*--$/g, '') };
  }

  const chapterMatch = trimmed.match(/^(?:Chapter|Unit|Ch\.?)\s*(\d+)[:\s–—\-]+(.+)$/i);
  if (chapterMatch) {
    return {
      label: chapterMatch[2].trim(),
      badge: `Ch ${chapterMatch[1]}`,
    };
  }

  if (trimmed.includes('—')) {
    const [main, ...rest] = trimmed.split('—');
    const label = main.trim().replace(/,+$/, '').trim();
    const sublabel = rest.join('—').trim().replace(/^,+/, '').trim();
    return { label, sublabel };
  }
  if (trimmed.includes(' – ')) {
    const [main, ...rest] = trimmed.split(' – ');
    const label = main.trim().replace(/,+$/, '').trim();
    const sublabel = rest.join(' – ').trim().replace(/^,+/, '').trim();
    return { label, sublabel };
  }
  if (trimmed.includes(' - ') && !trimmed.toLowerCase().includes('class') && !trimmed.toLowerCase().includes('grade')) {
    const [main, ...rest] = trimmed.split(' - ');
    const label = main.trim().replace(/,+$/, '').trim();
    const sublabel = rest.join(' - ').trim().replace(/^,+/, '').trim();
    return { label, sublabel };
  }

  const parenMatch = trimmed.match(/^(.+?)\s*\((.+?)\)$/);
  if (parenMatch) {
    return { label: parenMatch[1].trim().replace(/,+$/, '').trim(), badge: parenMatch[2].trim() };
  }

  return { label: trimmed };
}

export function extractOptionsFromChildren(children: React.ReactNode): SelectOptionItem[] {
  const items: SelectOptionItem[] = [];

  const processChild = (child: React.ReactNode) => {
    if (child === null || child === undefined || typeof child === 'boolean') {
      return;
    }
    if (Array.isArray(child)) {
      child.forEach(processChild);
      return;
    }
    if (React.isValidElement(child)) {
      if (child.type === React.Fragment) {
        React.Children.forEach((child.props as any)?.children, processChild);
        return;
      }
      if (
        child.type === 'option' ||
        (typeof child.type === 'string' && child.type.toLowerCase() === 'option')
      ) {
        const { value = '', disabled = false, children: textContent } = child.props as any;
        const rawText = getTextFromReactChildren(textContent) || String(value ?? '');
        const parsed = parseOptionText(rawText);
        items.push({
          value: String(value),
          label: parsed.label,
          sublabel: parsed.sublabel,
          badge: parsed.badge,
          disabled: Boolean(disabled),
        });
      }
    }
  };

  React.Children.forEach(children, processChild);
  return items;
}
