// Design QA Assistant — Figma plugin main thread (MVP)
// Three tools: naming linter, contrast checker, CSS snippet exporter.
// Plain JS on purpose for the MVP — no build step required to load in Figma.

figma.showUI(__html__, { width: 360, height: 520 });

// ---------- shared color helpers ----------

function componentToHex(c) {
  // c is 0..1 float from Figma's color model
  const v = Math.round(c * 255);
  return v.toString(16).padStart(2, "0");
}

function rgbToHex({ r, g, b }) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`.toUpperCase();
}

function relativeLuminance({ r, g, b }) {
  const channel = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const R = channel(r);
  const G = channel(g);
  const B = channel(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(colorA, colorB) {
  const lumA = relativeLuminance(colorA);
  const lumB = relativeLuminance(colorB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

function getFirstSolidFillColor(node) {
  if (!node || !("fills" in node)) return null;
  const fills = node.fills;
  if (fills === figma.mixed || !Array.isArray(fills)) return null;
  const solid = fills.find((f) => f.type === "SOLID" && f.visible !== false);
  return solid ? solid.color : null;
}

// ---------- naming linter ----------

function collectNodesForLint() {
  const selection = figma.currentPage.selection;
  if (selection.length > 0) {
    const result = [];
    selection.forEach((node) => {
      result.push(node);
      if ("findAll" in node) {
        result.push(...node.findAll(() => true));
      }
    });
    return result;
  }
  // no selection: scan whole current page
  return figma.currentPage.findAll(() => true);
}

function lintNaming() {
  const nodes = collectNodesForLint();
  const issues = [];

  // group tracking for cross-node consistency checks
  const lowerFirstSegmentMap = new Map(); // lowercased first segment -> Set of raw variants seen

  nodes.forEach((node) => {
    const name = node.name;

    if (name !== name.trim()) {
      issues.push({
        nodeId: node.id,
        name,
        rule: "whitespace",
        message: `이름 앞뒤 공백: "${name}"`,
      });
    }

    if (/\/\//.test(name) || /\/$/.test(name.trim())) {
      issues.push({
        nodeId: node.id,
        name,
        rule: "slash",
        message: `연속되거나 끝에 남은 슬래시: "${name}"`,
      });
    }

    const trimmed = name.trim();
    const segments = trimmed.split("/").filter(Boolean);
    if (segments.length > 0) {
      const first = segments[0];
      const key = first.toLowerCase();
      if (!lowerFirstSegmentMap.has(key)) {
        lowerFirstSegmentMap.set(key, new Map());
      }
      const variants = lowerFirstSegmentMap.get(key);
      variants.set(first, (variants.get(first) || 0) + 1);
    }
  });

  // cross-node: same lowercased first segment, different casing or singular/plural
  lowerFirstSegmentMap.forEach((variants, key) => {
    if (variants.size > 1) {
      const variantList = Array.from(variants.keys());
      const isPluralMismatch = variantList.some(
        (v) => v.toLowerCase() === key && variantList.some((o) => o.toLowerCase() === key + "s")
      );
      variantList.forEach((variant) => {
        issues.push({
          nodeId: null,
          name: variant,
          rule: isPluralMismatch ? "plural-mismatch" : "case-mismatch",
          message: isPluralMismatch
            ? `단수/복수 혼용 감지: "${variantList.join('", "')}" 가 같은 그룹으로 보입니다`
            : `대소문자 혼용 감지: "${variantList.join('", "')}" 가 같은 그룹으로 보입니다`,
        });
      });
    }
  });

  // de-dupe the group-level messages (they get added once per node hit above)
  const seen = new Set();
  const deduped = issues.filter((issue) => {
    if (issue.rule === "case-mismatch" || issue.rule === "plural-mismatch") {
      const dedupeKey = issue.rule + ":" + issue.message;
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
    }
    return true;
  });

  return {
    scannedCount: nodes.length,
    issues: deduped,
  };
}

// ---------- contrast checker ----------

function checkContrast() {
  const selection = figma.currentPage.selection;
  if (selection.length !== 2) {
    return { error: "레이어 2개를 선택해주세요 (예: 텍스트 색상 레이어, 배경 색상 레이어)." };
  }

  const [nodeA, nodeB] = selection;
  const colorA = getFirstSolidFillColor(nodeA);
  const colorB = getFirstSolidFillColor(nodeB);

  if (!colorA || !colorB) {
    return { error: "선택한 레이어 중 하나 이상에 solid fill 색상이 없습니다." };
  }

  const ratio = contrastRatio(colorA, colorB);
  const rounded = Math.round(ratio * 100) / 100;

  return {
    nameA: nodeA.name,
    nameB: nodeB.name,
    hexA: rgbToHex(colorA),
    hexB: rgbToHex(colorB),
    ratio: rounded,
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
  };
}

// ---------- CSS snippet exporter ----------

function exportCss() {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    return { error: "노드를 하나 이상 선택해주세요." };
  }

  const blocks = selection.map((node) => {
    const lines = [];
    const color = getFirstSolidFillColor(node);
    if (color) {
      lines.push(`  background-color: ${rgbToHex(color)};`);
    }

    if (node.type === "TEXT") {
      const fontSize = node.fontSize;
      const fontName = node.fontName;
      const lineHeight = node.lineHeight;
      const letterSpacing = node.letterSpacing;

      if (typeof fontSize === "number") lines.push(`  font-size: ${fontSize}px;`);
      if (fontName && fontName !== figma.mixed && fontName.family) {
        lines.push(`  font-family: "${fontName.family}";`);
      }
      if (fontName && fontName !== figma.mixed && fontName.style) {
        lines.push(`  /* font-style/weight: ${fontName.style} */`);
      }
      if (lineHeight && lineHeight !== figma.mixed && lineHeight.unit === "PIXELS") {
        lines.push(`  line-height: ${lineHeight.value}px;`);
      }
      if (
        letterSpacing &&
        letterSpacing !== figma.mixed &&
        letterSpacing.unit === "PIXELS" &&
        letterSpacing.value !== 0
      ) {
        lines.push(`  letter-spacing: ${letterSpacing.value}px;`);
      }
      if (color) lines.push(`  color: ${rgbToHex(color)};`);
    }

    if ("layoutMode" in node && node.layoutMode !== "NONE") {
      if (typeof node.itemSpacing === "number") lines.push(`  gap: ${node.itemSpacing}px;`);
      const pt = node.paddingTop;
      const pr = node.paddingRight;
      const pb = node.paddingBottom;
      const pl = node.paddingLeft;
      if ([pt, pr, pb, pl].every((v) => typeof v === "number")) {
        lines.push(`  padding: ${pt}px ${pr}px ${pb}px ${pl}px;`);
      }
    }

    if ("cornerRadius" in node && typeof node.cornerRadius === "number") {
      lines.push(`  border-radius: ${node.cornerRadius}px;`);
    }

    const className = node.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "layer";

    return `.${className} {\n${lines.join("\n")}\n}`;
  });

  return { css: blocks.join("\n\n") };
}

// ---------- message router ----------

figma.ui.onmessage = (msg) => {
  if (msg.type === "LINT_NAMING") {
    figma.ui.postMessage({ type: "LINT_NAMING_RESULT", payload: lintNaming() });
  } else if (msg.type === "CHECK_CONTRAST") {
    figma.ui.postMessage({ type: "CHECK_CONTRAST_RESULT", payload: checkContrast() });
  } else if (msg.type === "EXPORT_CSS") {
    figma.ui.postMessage({ type: "EXPORT_CSS_RESULT", payload: exportCss() });
  } else if (msg.type === "SELECT_NODE" && msg.nodeId) {
    const node = figma.getNodeById(msg.nodeId);
    if (node && "type" in node) {
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
    }
  }
};
