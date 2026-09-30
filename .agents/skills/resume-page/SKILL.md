---
name: resume-page
description: Create, update, and verify JD Collector Vue resume pages from Markdown content, including A4 layout, print CSS, page-break quality, and browser PDF export. Use for resume content structure, tailored resume variants, preview/editor rendering, or print/PDF regressions; do not use for DOCX authoring.
---

# Resume Page

Build resumes as semantic Markdown rendered through the shared Vue `ResumePaper` component.

- Markdown is the only editable resume source.
- Vue/CSS owns visual hierarchy and A4 layout.
- Backend blocks are derived search aids, never a second content source.
- Browser print output is the PDF source; do not generate DOCX or screenshot PDFs.

Before changing layout or creating a variant, read [references/visual-system.md](references/visual-system.md).

## Content Contract

Use `#` for the name, a following blockquote for the target role, `##` for major sections, `###` for companies or skill groups, and `####` for projects. Use lists for evidence and keep exact metrics, dates, names, patents, and employment boundaries from authoritative sources. Tailor order and emphasis without inventing experience.

## Workflow

1. Read current Markdown and the target JD or direction.
2. Preserve facts and choose relevant emphasis.
3. Edit through the resume API or editor, keeping H1–H4 semantics valid.
4. Use the shared template; add a template only for a genuinely different visual system.
5. Build and open the actual resume route at desktop and portrait widths.
6. Generate a test PDF with Electron webContents.printToPDF in an isolated test instance and inspect every page.
7. Confirm no application navigation, editor, controls, shadow, or background prints.

## Non-negotiable Checks

- Disable raw Markdown HTML (`html: false`).
- Keep PDF text selectable; do not rasterize the resume.
- Use A4 portrait and exact print colors.
- Avoid headings and company/project bars stranded at a page bottom.
- Never apply `break-inside: avoid` to a long container that can exceed a page.
- Reject an extra page that is mostly blank; rebalance spacing or break rules and recheck.
- Hide download controls under print media.
- Verify saved content by reload and verify derived blocks after changes.

## Completion Evidence

A page is complete only when Markdown reloads from storage, the intended version route renders, frontend build passes, print output is inspected page by page, and the PDF action invokes resume-only print output.
