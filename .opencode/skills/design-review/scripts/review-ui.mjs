#!/usr/bin/env node
// Static gate for design-language house rules. Dependency-free on purpose: it runs in any
// scaffolded project with nothing installed. It proves structure and copy hygiene only — the
// visual list in SKILL.md stays with the reviewer.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);
const PLACEHOLDER_IMAGES =
  /(placehold\.(co|it)|via\.placeholder\.com|placeholder\.com|picsum\.photos|loremflickr\.com|dummyimage\.com|placekitten|source\.unsplash\.com\/random)/i;
const VIOLET_HEX =
  /#(?:4c1d95|5b21b6|6d28d9|7c3aed|8b5cf6|9333ea|a78bfa|a855f7|c084fc|d8b4fe|ede9fe|f3e8ff|faf5ff)\b/i;
const VIOLET_NAME = /\b(violet|lavender|indigo|purple)\b/i;

function help() {
  console.log(`usage: review-ui.mjs <file-or-dir> [--json]

Checks HTML (and the local stylesheets it links) against design-language house rules.
Exit 1 when a failure is found, 0 when only warnings remain.`);
}

function collect(target) {
  const stat = statSync(target);
  if (stat.isFile()) return [target];
  const out = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) out.push(...collect(join(target, entry.name)));
    } else if (extname(entry.name).toLowerCase() === ".html") {
      out.push(join(target, entry.name));
    }
  }
  return out.sort();
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function cssSources(file, html) {
  const sources = [];
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    sources.push({ file, text: match[1], offset: lineAt(html, match.index) - 1 });
  }
  for (const match of html.matchAll(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi)) {
    const href = match[0].match(/href\s*=\s*["']([^"']+)["']/i);
    if (!href || /^(https?:)?\/\//i.test(href[1]) || href[1].startsWith("data:")) continue;
    const path = resolve(join(file, ".."), href[1]);
    try {
      sources.push({ file: path, text: readFileSync(path, "utf8"), offset: 0 });
    } catch {
      sources.push({ file, text: "", offset: lineAt(html, match.index) - 1 });
    }
  }
  return sources;
}

function review(file) {
  const html = readFileSync(file, "utf8");
  const findings = [];
  const add = (severity, rule, line, message, where = file) =>
    findings.push({ severity, rule: `ui/${rule}`, file: where, line, message });
  const each = (re, fn) => {
    for (const match of html.matchAll(re)) fn(match, lineAt(html, match.index));
  };

  if (!/<html\b[^>]*\blang\s*=\s*["'][^"']+["']/i.test(html)) add("fail", "H1", 1, "html element has no lang");
  if (!/<meta\b[^>]*name=["']viewport["'][^>]*content=["'][^"']*width=device-width/i.test(html))
    add("fail", "H2", 1, "no viewport meta with width=device-width");
  if (!/<title\b[^>]*>[\s\S]*?\S[\s\S]*?<\/title>/i.test(html)) add("fail", "H3", 1, "missing or empty title");
  if (!/<meta\b[^>]*name=["']description["'][^>]*content=["'][^"']{20,}["']/i.test(html))
    add("warn", "H4", 1, "no meta description of at least 20 characters");

  const headings = [];
  each(/<h([1-6])\b/gi, (m, line) => headings.push({ level: Number(m[1]), line }));
  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length !== 1) add("fail", "H5", h1s[1]?.line ?? 1, `expected exactly one h1, found ${h1s.length}`);
  let previous = 0;
  for (const heading of headings) {
    if (previous === 0 && heading.level > 1) add("fail", "H6", heading.line, `first heading is h${heading.level}`);
    else if (previous && heading.level - previous > 1)
      add("fail", "H6", heading.line, `heading jumps h${previous} to h${heading.level}`);
    previous = heading.level;
  }

  each(/<img\b[^>]*>/gi, (m, line) => {
    const tag = m[0];
    if (!/\balt\s*=/i.test(tag)) add("fail", "H7", line, "img without alt attribute");
    else if (/\balt\s*=\s*["'][^"']*\b(image|photo|picture) of\b/i.test(tag))
      add("warn", "H7", line, "alt text starts with 'image of'");
    if (PLACEHOLDER_IMAGES.test(tag)) add("fail", "H9", line, "placeholder image host");
  });
  if (/<figcaption\b/i.test(html)) add("fail", "H8", lineAt(html, html.search(/<figcaption\b/i)), "figcaption is a caption under a visual");
  for (const source of cssSources(file, html)) {
    const hit = source.text.match(PLACEHOLDER_IMAGES);
    if (hit) add("fail", "H9", source.offset + lineAt(source.text, hit.index), "placeholder image host in CSS", source.file);
  }

  for (const [pattern, rule, message] of [
    [/\blorem ipsum\b/gi, "H10", "lorem ipsum copy"],
    [/\b(TODO|FIXME)\b/g, "H10", "TODO/FIXME left in the page"],
    [/\bsample text\b/gi, "H10", "placeholder copy"],
  ]) {
    each(pattern, (m, line) => add("fail", rule, line, message));
  }

  each(/href\s*=\s*["']#["']/gi, (m, line) => add("fail", "H11", line, "href=\"#\" goes nowhere"));
  each(/href\s*=\s*["']javascript:/gi, (m, line) => add("fail", "H11", line, "javascript: link"));

  const ids = new Map();
  each(/\bid\s*=\s*["']([^"']+)["']/gi, (m, line) => {
    const id = m[1];
    if (ids.has(id)) add("fail", "H12", line, `duplicate id "${id}"`);
    else ids.set(id, line);
  });

  for (const match of html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
    const tag = match[0];
    if (/^<input\b/i.test(tag) && /\btype\s*=\s*["'](hidden|submit|button|reset|image)["']/i.test(tag)) continue;
    const line = lineAt(html, match.index);
    if (/\b(aria-label|aria-labelledby|title)\s*=/i.test(tag)) continue;
    const id = tag.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
    if (id && new RegExp(`<label\\b[^>]*\\bfor\\s*=\\s*["']${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(html)) continue;
    const before = html.slice(0, match.index);
    if (before.lastIndexOf("<label") > before.lastIndexOf("</label>")) continue;
    add("fail", "H13", line, `${tag.slice(1, 7).trim()} without a label`);
  }

  for (const match of html.matchAll(/href\s*=\s*["']mailto:([^"']+)["']/gi)) {
    if (!/\.example\b/i.test(match[1])) add("fail", "H14", lineAt(html, match.index), "mailto address is not on .example");
  }
  for (const match of html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)) {
    if (!/example/i.test(match[1])) add("warn", "H14", lineAt(html, match.index), "phone number in a real format");
  }
  if (!/<main\b/i.test(html)) add("warn", "H15", 1, "no main landmark");

  const sources = cssSources(file, html);
  const css = sources.map((s) => s.text).join("\n");
  const cssAdd = (severity, rule, index, message) => {
    let offset = 0;
    for (const source of sources) {
      if (index < offset + source.text.length) {
        add(severity, rule, source.offset + lineAt(source.text, index - offset), message, source.file);
        return;
      }
      offset += source.text.length + 1;
    }
  };
  if (VIOLET_HEX.test(css) || VIOLET_NAME.test(css)) cssAdd("fail", "C1", Math.max(0, css.search(VIOLET_HEX) >= 0 ? css.search(VIOLET_HEX) : css.search(VIOLET_NAME)), "violet or lavender in the page's own design");
  if (!/@media\b/.test(css)) add("fail", "C2", 1, "no @media rule — the page does not respond");
  if (!/prefers-reduced-motion/.test(css)) add("warn", "C3", 1, "no prefers-reduced-motion block");

  for (const match of css.matchAll(/font-size\s*:\s*([\d.]+)(px|rem|em|pt)/gi)) {
    const size = Number(match[1]);
    const unit = match[2].toLowerCase();
    const tooSmall =
      (unit === "px" && size < 13) ||
      ((unit === "rem" || unit === "em") && size < 0.8125) ||
      (unit === "pt" && size < 10);
    if (tooSmall) cssAdd("fail", "C4", match.index, `font-size ${match[1]}${match[2]} is below 13px`);
  }
  if (/text-transform\s*:\s*uppercase/i.test(css) && /letter-spacing/i.test(css))
    add("warn", "C5", 1, "tracked capitals — house rule says sentence case");

  each(/tabindex\s*=\s*["']?([1-9][0-9]*)/gi, (m, line) => add("fail", "C6", line, `positive tabindex="${m[1]}"`));
  for (const match of html.matchAll(/<video\b[^>]*>/gi)) {
    if (/\bautoplay\b/i.test(match[0]) && !/\bmuted\b/i.test(match[0]))
      add("fail", "C7", lineAt(html, match.index), "autoplay video without muted");
  }

  return findings;
}

function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) return help();
  const json = args.includes("--json");
  const target = args.find((arg) => !arg.startsWith("--"));
  if (!target) return help();

  const files = collect(resolve(target));
  if (files.length === 0) {
    console.error(`no .html files under ${target}`);
    return 1;
  }

  const findings = files.flatMap(review).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const fails = findings.filter((f) => f.severity === "fail");
  const warns = findings.filter((f) => f.severity === "warn");
  const gate = fails.length === 0 ? "PASS" : "OPEN";

  if (json) {
    console.log(JSON.stringify({ files, gate, fails: fails.length, warns: warns.length, findings }, null, 2));
  } else {
    for (const f of findings) {
      console.log(`${f.severity === "fail" ? "FAIL" : "WARN"} ${f.rule.padEnd(6)} ${f.file}:${f.line}  ${f.message}`);
    }
    console.log(`\n${files.length} page(s), ${fails.length} failure(s), ${warns.length} warning(s)`);
    console.log(`GATE: ${gate}`);
  }
  return fails.length === 0 ? 0 : 1;
}

process.exitCode = main(process.argv);
