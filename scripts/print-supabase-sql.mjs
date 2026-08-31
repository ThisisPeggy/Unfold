import { readFile } from "node:fs/promises";

console.log(await readFile(new URL("../supabase/setup.sql", import.meta.url), "utf8"));
