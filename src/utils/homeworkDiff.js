export function buildLineDiff(before, after) {
  const beforeLines = normalizeDiffLines(before);
  const afterLines = normalizeDiffLines(after);
  const table = buildLcsTable(beforeLines, afterLines);
  const rows = [];
  let i = beforeLines.length;
  let j = afterLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && beforeLines[i - 1] === afterLines[j - 1]) {
      rows.unshift({ type: "same", mark: " ", text: beforeLines[i - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
      rows.unshift({ type: "add", mark: "+", text: afterLines[j - 1] });
      j -= 1;
    } else {
      rows.unshift({ type: "remove", mark: "-", text: beforeLines[i - 1] });
      i -= 1;
    }
  }

  return rows.length ? rows : [{ type: "same", mark: " ", text: after }];
}

function normalizeDiffLines(value) {
  return String(value || "").replace(/\r\n?/g, "\n").split("\n");
}

function buildLcsTable(beforeLines, afterLines) {
  const table = Array.from({ length: beforeLines.length + 1 }, () => Array(afterLines.length + 1).fill(0));
  for (let i = 1; i <= beforeLines.length; i += 1) {
    for (let j = 1; j <= afterLines.length; j += 1) {
      table[i][j] =
        beforeLines[i - 1] === afterLines[j - 1]
          ? table[i - 1][j - 1] + 1
          : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  return table;
}
