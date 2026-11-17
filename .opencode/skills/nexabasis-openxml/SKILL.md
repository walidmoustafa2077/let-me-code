---
name: nexabasis-openxml
description: Use when generating, reading, or templating Word .docx files or PDFs for NexaCV (or any Nexabasis export) in ASP.NET Core. Covers the OpenXML SDK approach for ATS-friendly .docx generation from JSON resume data.
---

# Nexabasis OpenXML (.docx) Generation

NexaCV turns structured JSON (from strict web forms) into **ATS-friendly Word documents** and standard PDFs.
PDF generation is often a separate library; **.docx is generated with the OpenXML SDK** in ASP.NET Core.

## Approach

1. **Data is JSON-first.** Forms produce a strict, validated resume model. Templates are predefined — users do not free-form design.
2. **Template injection.** Map the JSON model onto a predefined .docx template (content controls / placeholders), then fill and save.
3. **Prefer template + merge** over hand-building the whole document. Hand-building is acceptable for simple, fully-controlled layouts.
4. **ATS-friendly rules:** real text (never images of text), no text boxes/strictly decorative columns for key content, standard headings, simple bullet lists, embedded fonts avoided, tables used sparingly and logically.

## Implementation notes

- Use `DocumentFormat.OpenXml` (and `DocumentFormat.OpenXml.Packaging`). Keep templates in a versioned `templates/` folder.
- Use **content controls** (`StructuredDocumentTag`) or `SdtBlock`/`SdtRun` as merge points so templates can change without code changes.
- Validate the incoming JSON model before rendering; reject or default missing fields — never render `null`.
- Escape/sanitize all user text before insertion to avoid corrupting the document.
- For bulk/again-and-again generation, reuse the template part; do not rebuild the package per byte of output.
- Stream the result to the HTTP response (do not buffer large files in memory unnecessarily).

## Minimal pattern

```csharp
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

public byte[] RenderResume(ResumeModel model, string templatePath)
{
    using var ms = new MemoryStream();
    File.Copy(templatePath, ms is var _ ? ms : ms, overwrite: true); // or read template bytes into ms
    // open with MemoryStream, locate content controls, set Text, save
    using (var doc = WordprocessingDocument.Open(ms, true))
    {
        var body = doc.MainDocumentPart!.Document.Body!;
        SetControl(body, "FullName", model.FullName);
        SetControl(body, "Summary", model.Summary);
        // bullets, experience, education...
        doc.MainDocumentPart.Document.Save();
    }
    return ms.ToArray();
}
```

## Monetization hook
- NexaCV is **pay-per-download + AI credits**. Do not finalize a download before entitlement is verified server-side.
- Never expose AI provider keys client-side; AI bullet refinement is backend-mediated and decrements credits.

## Checklist
- [ ] Output opens cleanly in Word and Google Docs
- [ ] All key content is real text (ATS-parseable)
- [ ] No `null`/`undefined` placed into documents
- [ ] Entitlement checked before serving the file
- [ ] Large files streamed, not buffered
