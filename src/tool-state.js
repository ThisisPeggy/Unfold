export function missingArrowhead(appState) {
  return appState.activeTool?.type === "arrow" && appState.currentItemEndArrowhead == null;
}
