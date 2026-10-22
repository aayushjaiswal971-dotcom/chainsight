"""
File parsing utilities: CSV and XLSX, with security sanitization.
"""
import csv
import io
import re
import os
import struct

# File limits
MAX_FILE_SIZE = 5 * 1024 * 1024   # 5 MB
MAX_ROWS = 10_000
MAX_COLS = 30

# Magic bytes
XLSX_MAGIC = b'PK\x03\x04'   # ZIP-based format

ALLOWED_EXTENSIONS = {'.csv', '.xlsx'}

# Characters that could turn a cell into a formula in spreadsheet apps
FORMULA_LEADERS = ('=', '+', '-', '@', '\t', '\r')


def _sanitize_cell(value: str, max_len: int = 500) -> str:
    """Strip control chars, cap length, neutralize formula leaders."""
    if not isinstance(value, str):
        value = str(value) if value is not None else ''
    # Remove control characters except normal whitespace
    value = re.sub(r'[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]', '', value)
    value = value.strip()[:max_len]
    # Neutralize formula injection
    if value and value[0] in FORMULA_LEADERS:
        if value[0] == '-' and re.match(r'^-\d+(\.\d+)?$', value):
            pass
        else:
            value = "'" + value
    return value


sanitize_cell = _sanitize_cell


def validate_file_extension(filename: str) -> str:
    """Return lowercased extension or raise ValueError."""
    _, ext = os.path.splitext(filename.lower())
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file type '{ext}'. Only .csv and .xlsx are allowed.")
    return ext


def validate_file_signature(file_bytes: bytes, ext: str) -> None:
    """Check magic bytes match declared extension."""
    if ext == '.xlsx':
        if not file_bytes.startswith(XLSX_MAGIC):
            raise ValueError("File does not appear to be a valid .xlsx file (bad magic bytes).")
    elif ext == '.csv':
        # CSV is text; just verify it's not binary
        try:
            file_bytes[:4096].decode('utf-8-sig')
        except UnicodeDecodeError:
            raise ValueError("CSV file is not valid UTF-8 text.")


def parse_csv_bytes(file_bytes: bytes) -> tuple[list[str], list[list[str]]]:
    """Parse CSV bytes (utf-8 / utf-8-bom, comma or semicolon), return (headers, rows)."""
    text = file_bytes.decode('utf-8-sig', errors='replace')
    # Detect delimiter
    first_line = text.splitlines()[0] if text.strip() else ''
    delimiter = ';' if first_line.count(';') > first_line.count(',') else ','
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows_raw = list(reader)
    if not rows_raw:
        raise ValueError("CSV file is empty.")
    headers = [_sanitize_cell(h) for h in rows_raw[0]]
    if len(headers) > MAX_COLS:
        raise ValueError(f"File has {len(headers)} columns; maximum is {MAX_COLS}.")
    data_rows = []
    for row in rows_raw[1:]:
        if not any(cell.strip() for cell in row):
            continue  # skip blank rows
        sanitized = [_sanitize_cell(cell) for cell in row]
        # Pad short rows
        while len(sanitized) < len(headers):
            sanitized.append('')
        data_rows.append(sanitized[:len(headers)])
        if len(data_rows) >= MAX_ROWS:
            break
    return headers, data_rows


def parse_xlsx_bytes(file_bytes: bytes) -> tuple[list[str], list[list[str]]]:
    """Parse XLSX bytes in read-only mode, first sheet only."""
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows_iter = ws.iter_rows(values_only=True)
    header_row = next(rows_iter, None)
    if header_row is None:
        raise ValueError("Excel file is empty.")
    headers = [_sanitize_cell(str(c) if c is not None else '') for c in header_row]
    if len(headers) > MAX_COLS:
        raise ValueError(f"File has {len(headers)} columns; maximum is {MAX_COLS}.")
    data_rows = []
    for row in rows_iter:
        cells = [_sanitize_cell(str(c) if c is not None else '') for c in row]
        if not any(c.strip() for c in cells):
            continue
        while len(cells) < len(headers):
            cells.append('')
        data_rows.append(cells[:len(headers)])
        if len(data_rows) >= MAX_ROWS:
            break
    wb.close()
    return headers, data_rows


def parse_file(filename: str, file_bytes: bytes) -> tuple[list[str], list[list[str]]]:
    """
    Main entry: validate, detect format, parse and return (headers, rows).
    Raises ValueError with user-friendly message on any problem.
    """
    if len(file_bytes) > MAX_FILE_SIZE:
        mb = len(file_bytes) / 1024 / 1024
        raise ValueError(f"File is {mb:.1f} MB; maximum allowed is 5 MB.")

    ext = validate_file_extension(filename)
    validate_file_signature(file_bytes, ext)

    if ext == '.csv':
        headers, rows = parse_csv_bytes(file_bytes)
    else:
        headers, rows = parse_xlsx_bytes(file_bytes)

    if not headers:
        raise ValueError("File has no header row.")
    if not rows:
        raise ValueError("File has no data rows after the header.")

    return headers, rows
