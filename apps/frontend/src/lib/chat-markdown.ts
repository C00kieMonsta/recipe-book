import { createElement, Fragment, type ReactNode } from "react";

// Light markdown for assistant answers: paragraphs, line breaks, bullet and numbered lists, **bold**, `code`.
// Everything is built as React nodes from the text, so no HTML in the answer is ever interpreted.

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;
const ORDERED = /^\s*\d+[.)]\s+/;
const HEADING = /^\s*#{1,6}\s+/;

export function renderChatMarkdown(text: string): ReactNode[] {
  return splitBlocks(text).map((block, index) => renderBlock(block, index));
}

function splitBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  // Held in an object so the closure's reset is visible to the narrowing below.
  const open: { block: Block | null } = { block: null };
  const close = () => {
    if (open.block) blocks.push(open.block);
    open.block = null;
  };

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      close();
      continue;
    }
    if (BULLET.test(line)) {
      const kind = ORDERED.test(line) ? "ol" : "ul";
      const item = line.replace(BULLET, "");
      if (open.block?.kind === kind) open.block.items.push(item);
      else {
        close();
        open.block = { kind, items: [item] };
      }
      continue;
    }
    // A list item continued on an indented line stays in the item.
    if (open.block && open.block.kind !== "p" && /^\s{2,}/.test(raw)) {
      open.block.items[open.block.items.length - 1] += `\n${line.trim()}`;
      continue;
    }
    // A heading reads as a bold paragraph; the sheet has no room for a type scale.
    const content = HEADING.test(line) ? `**${line.replace(HEADING, "")}**` : line;
    if (open.block?.kind === "p") open.block.lines.push(content);
    else {
      close();
      open.block = { kind: "p", lines: [content] };
    }
  }
  close();
  return blocks;
}

function renderBlock(block: Block, key: number): ReactNode {
  if (block.kind === "p") {
    return createElement("p", { key, className: "my-1 first:mt-0 last:mb-0" }, ...withBreaks(block.lines));
  }
  const items = block.items.map((item, i) =>
    createElement("li", { key: i }, ...withBreaks(item.split("\n"))),
  );
  return createElement(
    block.kind,
    { key, className: `${block.kind === "ul" ? "list-disc" : "list-decimal"} my-1 space-y-0.5 pl-5 first:mt-0 last:mb-0` },
    ...items,
  );
}

function withBreaks(lines: string[]): ReactNode[] {
  const out: ReactNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0) out.push(createElement("br", { key: `br-${i}` }));
    out.push(createElement(Fragment, { key: `l-${i}` }, ...renderInline(line)));
  });
  return out;
}

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;

export function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return createElement("strong", { key: i, className: "font-semibold" }, part.slice(2, -2));
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return createElement("code", { key: i, className: "rounded bg-muted px-1 font-mono" }, part.slice(1, -1));
    }
    return part;
  });
}
