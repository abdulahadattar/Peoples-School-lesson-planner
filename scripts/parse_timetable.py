#!/usr/bin/env python3
"""
parse_timetable.py — converts the PHSSJ class timetable (.xlsx) into
public/timetable.json consumed by the Live Monitor feature.

Pure Python stdlib only (zipfile + ElementTree). The sheet FILE order inside
the workbook is shuffled, so the authoritative class identity is taken from
each sheet's A1 title ("Time Table IX Sir Abdul Ahad"), never from workbook
sheet names or file order.

Usage:
    python scripts/parse_timetable.py [path-to-xlsx] [output-json]
Defaults: data/timetable.xlsx -> public/timetable.json
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from datetime import date

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

DAY_SHORT = {
    'monday': 'mon', 'tuesday': 'tue', 'wednesday': 'wed',
    'thursday': 'thu', 'friday': 'fri', 'saturday': 'sat',
}


def colnum(ref: str) -> int:
    letters = ''.join(ch for ch in ref if ch.isalpha())
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n


def load_sheet(zf: zipfile.ZipFile, name: str) -> dict:
    with zf.open(name) as f:
        root = ET.parse(f).getroot()
    cells = {}
    for c in root.iter(M + 'c'):
        ref = c.get('r')
        if not ref:
            continue
        t = c.get('t')
        v = c.find(M + 'v')
        if v is None or v.text is None:
            cells[ref] = ''
            continue
        val = v.text
        if t == 's':
            si = int(val)
            # sharedStrings.xml <si> can contain rich runs; join all <t>
            val = ''.join(
                tx.text or ''
                for tx in root.iter(M + 't')  # placeholder, replaced below
            ) if False else _shared_strings[si]
        cells[ref] = val
    return cells


def build_shared_strings(zf: zipfile.ZipFile) -> list:
    with zf.open('xl/sharedStrings.xml') as f:
        root = ET.parse(f).getroot()
    return [
        ''.join(t.text or '' for t in si.iter(M + 't'))
        for si in root.findall(M + 'si')
    ]


_shared_strings: list = []


def sheet_names(zf: zipfile.ZipFile):
    return [n for n in zf.namelist() if re.fullmatch(r'xl/worksheets/sheet\d+\.xml', n)]


def parse_time_range(raw: str):
    """'8:15 AM to 9:00 AM' -> ('8:15 AM', '9:00 AM'); bare '8:15 to 8:55' kept as-is."""
    m = re.match(r'^\s*(.+?)\s+to\s+(.+?)\s*$', raw, re.I)
    if not m:
        return None, None
    return m.group(1).strip(), m.group(2).strip()


def parse_class_teacher(a1: str):
    """'Time Table IX Sir Abdul Ahad' -> ('IX', 'Sir Abdul Ahad'). Returns (None, None) for clash sheet."""
    if not a1.startswith('Time Table'):
        return None, None
    rest = a1[len('Time Table'):].strip()
    rest = re.sub(r'^\s*(?:GRADE|Grade)\s*[- ]?', '', rest).strip()
    m = re.match(r'^(.+?)\s+(Sir|Miss|Ma\'?am|Mrs|Mr)\s+(.+)$', rest, re.I)
    if not m:
        return None, None
    label = m.group(1).strip().upper().replace(' ', '')
    return label, f'{m.group(2)} {m.group(3)}'.strip()


def parse_sheet(zf: zipfile.ZipFile, name: str) -> dict | None:
    cells = load_sheet(zf, name)
    label, class_teacher = parse_class_teacher(cells.get('A1', ''))
    if not label:
        return None  # clash report / anything else

    # Locate the header row: a row whose cells contain 'Time' and 'Monday' etc.
    header_row = None
    day_cols = {}
    fri_time_col = None
    time_col = None
    s_no_col = None
    for r in range(1, 8):
        row_cells = {
            colnum(k): v for k, v in cells.items()
            if re.search(r'\d+$', k) and int(re.search(r'\d+$', k).group()) == r
        }
        has_time = any('time' in str(v).lower() for v in row_cells.values())
        monday_col = next((c for c, v in row_cells.items() if str(v).strip().lower() == 'monday'), None)
        if has_time and monday_col is not None:
            header_row = r
            for c, v in row_cells.items():
                key = str(v).strip().lower()
                if key == 's.no' or key == 's.no.' or key == 'sno':
                    s_no_col = c
                elif key == 'time':
                    time_col = c
                elif key == 'friday time':
                    fri_time_col = c
                elif key in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'):
                    day_cols[key] = c
            break
    if header_row is None or time_col is None:
        raise ValueError(f'{name}: header row not found (A1={cells.get("A1")!r})')
    # Some sheets (e.g. XII) number rows in column A without a 'S.no.' header.
    s_no_col = s_no_col if s_no_col is not None else 1

    periods = []
    for r in range(header_row + 1, header_row + 40):
        t = cells.get(f'{chr(64 + time_col)}{r}', '').strip()
        s_no = cells.get(f'{chr(64 + s_no_col)}{r}', '').strip() if s_no_col else ''
        day_vals = {
            DAY_SHORT[d]: cells.get(f'{chr(64 + c)}{r}', '').strip()
            for d, c in day_cols.items()
        }
        if 'break' in f'{t} {s_no}'.lower():
            continue  # break rows are implicit in the time gaps
        if not t and not s_no and not any(day_vals.values()):
            break
        start, end = parse_time_range(t)
        if start is None:
            continue
        fri_s, fri_e = (parse_time_range(cells.get(f'{chr(64 + fri_time_col)}{r}', ''))
                        if fri_time_col else (None, None))
        period = {
            'no': int(s_no) if s_no.isdigit() else len(periods) + 1,
            'start': start,
            'end': end,
            'friStart': fri_s,
            'friEnd': fri_e,
        }
        for d in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat'):
            period[d] = day_vals.get(d, '')
        periods.append(period)

    # Break rows carry no subjects on any day (e.g. VII's '11:15 to 12:05')
    # while every real period has at least one subject cell — drop the empty ones.
    periods = [
        p for p in periods
        if any(p[d].strip() for d in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat'))
    ]
    return {'label': label, 'classTeacher': class_teacher, 'periods': periods}


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'data/timetable.xlsx'
    out = sys.argv[2] if len(sys.argv) > 2 else 'public/timetable.json'
    global _shared_strings
    with zipfile.ZipFile(src) as zf:
        _shared_strings = build_shared_strings(zf)
        classes = []
        for name in sorted(sheet_names(zf), key=lambda n: int(re.search(r'\d+', n).group())):
            parsed = parse_sheet(zf, name)
            if parsed:
                classes.append(parsed)

    # Deterministic ordering: IV-A, IV-B, V, VI-A, VI-B, VII, VIII, IX, X-A, X-B, XI, XII
    def order_key(c):
        label = c['label']
        m = re.match(r'^(IV|V|VI|VII|VIII|IX|X|XI|XII)(?:-([AB]))?$', label)
        if not m:
            return (99, 0, 0)
        romans = {'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10, 'XI': 11, 'XII': 12}
        suffix = m.group(2) or ''
        return (romans.get(m.group(1), 99), 0 if suffix == 'A' else 1, 0)

    classes.sort(key=order_key)

    data = {'generatedAt': date.today().isoformat(), 'classes': classes}
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'Parsed {len(classes)} classes from {src} -> {out}')
    for c in classes:
        print(f'  {c["label"]:<5} {c["classTeacher"]:<28} {len(c["periods"])} periods')


if __name__ == '__main__':
    main()