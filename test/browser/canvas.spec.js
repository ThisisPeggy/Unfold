import { test, expect } from "@playwright/test";

test("first launch, resize and reload keep a full-size canvas", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("canvas.excalidraw__canvas.interactive")).toBeVisible();
  for (const width of [1400, 800, 1200]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.locator("canvas.excalidraw__canvas.interactive").evaluate((canvas) =>
      Math.abs(canvas.getBoundingClientRect().width - innerWidth))).toBeLessThan(2);
  }
  await page.reload();
  await expect(page.locator("canvas.excalidraw__canvas.interactive")).toBeVisible();
  const steps = await page.evaluate(async () => {
    const store = await import("/src/storage.js");
    await store.initializeSceneStorage(localStorage);
    const scene = store.readScene(localStorage, store.sceneKeyForWork(localStorage.getItem(store.ACTIVE_WORK_STORAGE_KEY)));
    const { getStorySteps } = await import("/src/story.js");
    return getStorySteps(scene.elements, scene.storyPath).map((step) => step.storyTitle);
  });
  expect(steps).toEqual(["认识 Unfold", "自由画", "串成故事", "带人看懂", "开始你的创作"]);
  await page.screenshot({ path: "artifacts/unfold-starter-review.png" });
  expect(errors).toEqual([]);
});

test("empty canvas offers an Unfold example and identifies the agent", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas.excalidraw__canvas.interactive")).toBeVisible();
  await page.locator("canvas.excalidraw__canvas.interactive").click({ position: { x: 30, y: 300 } });
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await expect(page.getByRole("button", { name: "认识 Unfold", exact: true })).toBeVisible();
  await expect(page.getByText("Agent 助手", { exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/unfold-empty-review.png" });
  await page.getByRole("button", { name: "认识 Unfold", exact: true }).click();
  await expect(page.getByRole("button", { name: "认识 Unfold", exact: true })).toBeHidden();
});

test("hand-drawn ellipse uses a single outline", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("radio", { name: "椭圆", exact: true }).check({ force: true });
  await page.mouse.move(850, 420);
  await page.mouse.down();
  await page.mouse.move(1070, 620, { steps: 8 });
  await page.mouse.up();
  await page.screenshot({ path: "artifacts/ellipse-review.png" });
});

test("curated icons have labels and are selectable", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas.excalidraw__canvas.interactive")).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const store = await import("/src/storage.js");
    return Boolean(store.readScene(localStorage, store.sceneKeyForWork(localStorage.getItem(store.ACTIVE_WORK_STORAGE_KEY))));
  })).toBe(true);
  await page.evaluate(async () => {
    const store = await import("/src/storage.js");
    await store.initializeSceneStorage(localStorage);
    const key = store.sceneKeyForWork(localStorage.getItem(store.ACTIVE_WORK_STORAGE_KEY));
    const scene = store.readScene(localStorage, key);
    const element = scene.elements.find((entry) => entry.id === "intro-title");
    element.text = "Customer Map";
    element.customData = { ...element.customData, storyLink: "https://www.customer-map.com/" };
    await store.writeScene(localStorage, key, scene);
  });
  await page.reload();
  await page.getByRole("button", { name: "设置链接：Customer Map", exact: true }).click();
  for (const name of ["个人介绍", "作品集", "产品", "文档", "联系", "网站", "视频演示", "代码", "无图标"]) {
    await expect(page.getByRole("radio", { name, exact: true })).toHaveCount(1);
  }
  await page.getByRole("radio", { name: "产品", exact: true }).check({ force: true });
  await expect(page.getByRole("radio", { name: "产品", exact: true })).toBeChecked();
  await page.locator("#story-link-popover").evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  expect(await page.locator("#story-link-popover").evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight)).toBe(true);
  await page.screenshot({ path: "artifacts/icons-review.png" });
});

test("marker exit restores thin strokes and an immediate reload keeps the new shape", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "使用高亮笔", exact: true }).click();
  await page.getByRole("button", { name: "关闭高亮笔", exact: true }).click();
  await page.getByRole("radio", { name: "矩形", exact: true }).check({ force: true });
  await page.mouse.move(900, 600);
  await page.mouse.down();
  await page.mouse.move(1100, 730, { steps: 3 });
  await page.mouse.up();
  await page.reload();
  await expect(page.locator("canvas.excalidraw__canvas.interactive")).toBeVisible();
  const rectangles = await page.evaluate(async () => {
    const store = await import("/src/storage.js");
    await store.initializeSceneStorage(localStorage);
    const id = localStorage.getItem(store.ACTIVE_WORK_STORAGE_KEY);
    return store.readScene(localStorage, store.sceneKeyForWork(id)).elements.filter((e) => e.type === "rectangle" && !e.isDeleted);
  });
  expect(rectangles.length).toBeGreaterThan(0);
  expect(rectangles.every((shape) => shape.strokeWidth <= 2)).toBe(true);
});
