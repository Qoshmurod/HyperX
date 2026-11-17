"""Hujjatdan matn ajratish (sahifalar bilan) va bo'laklarga bo'lish."""

from __future__ import annotations

import io
import re
from dataclasses import dataclass


@dataclass
class Page:
    number: int | None
    text: str


def extract(data: bytes, mime: str, filename: str = "") -> list[Page]:
    name = filename.lower()
    if mime == "application/pdf" or name.endswith(".pdf"):
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        # Skanerlangan PDF uchun OCR alohida servisda (tesseract) — bu yerda matn qatlami o'qiladi.
        return [Page(i + 1, p.extract_text() or "") for i, p in enumerate(reader.pages)]
    if "wordprocessingml" in mime or name.endswith(".docx"):
        from docx import Document

        doc = Document(io.BytesIO(data))
        text = "\n".join(p.text for p in doc.paragraphs)
        return [Page(None, text)]
    return [Page(None, data.decode("utf-8", errors="replace"))]


def chunk(pages: list[Page], size: int = 900, overlap: int = 150) -> list[tuple[int | None, str]]:
    out: list[tuple[int | None, str]] = []
    for page in pages:
        text = re.sub(r"[ \t]+", " ", page.text).strip()
        if not text:
            continue
        paras = [p.strip() for p in re.split(r"\n\s*\n|\n", text) if p.strip()]
        buf = ""
        for para in paras:
            if len(buf) + len(para) + 1 <= size:
                buf = f"{buf}\n{para}".strip()
                continue
            if buf:
                out.append((page.number, buf))
            while len(para) > size:
                out.append((page.number, para[:size]))
                para = para[size - overlap :]
            buf = (buf[-overlap:] + "\n" + para).strip() if buf else para
        if buf:
            out.append((page.number, buf))
    return out
